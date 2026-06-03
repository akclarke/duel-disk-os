/**
 * effectAutoGen.js — src/data/effectAutoGen.js
 *
 * Pattern-matches a card's description text to produce effect entries
 * when no hand-written entry exists in effectsRegistry.js.
 *
 * Priority order for auto-generation:
 *   1. On-summon triggered effects ("When this card is Summoned: …")
 *   2. Once-per-turn field effects ("Once per turn: You can …")
 *   3. Plain activated effects (draw / gainLP / damage / destroy / search / SS)
 *   4. Fallback for unrecognized "Once per turn" — creates a log-only entry so
 *      the "✦ Activate" button still appears and the player sees the effect text.
 *
 * Called by cardLoader.js after EFFECTS_REGISTRY lookup.
 */

import { ENVIRONMENT, SIDE, CARD_TYPE, CARD_POS } from '../Components/Card/utils/constant';
import { CARD_SELECT_TYPE } from '../Components/PlayerGround/utils/constant';
import { TOOL_TYPE } from '../Store/actions/actionTypes';
import { show_tool } from '../Store/actions/toolActions';
import store from '../Store/store';
import { update_environment } from '../Store/actions/environmentActions';
import { logEvent, LOG_TYPE } from './duelLog';
import { fireTrigger, TRIGGER_TYPE } from './triggerRegistry';

// ─── SHARED HELPERS ───────────────────────────────────────────────────────────

const dispatchEnv = (env) => store.dispatch(update_environment(env));

const openSelector = (info) =>
    new Promise((resolve, reject) =>
        store.dispatch(show_tool({ tool_type: TOOL_TYPE.CARD_SELECTOR, info: { ...info, resolve, reject } }))
    );

const getUid = (c) =>
    c?.unique_count !== undefined ? `${c.card?.key}_${c.unique_count}` : c?.card?.key?.toString();

// ─── PATTERN MATCHERS ─────────────────────────────────────────────────────────

const matchDraw = (desc) => {
    const m = desc.match(/draw\s+(a|\d+)\s+card/i);
    if (!m) return null;
    const n = m[1].toLowerCase() === 'a' ? 1 : parseInt(m[1], 10);
    return (!n || n > 5) ? null : n;
};

const matchGainLP = (desc) => {
    const m = desc.match(/gain\s+([\d,]+)\s*(lp|life\s*points?)/i);
    if (!m) return null;
    const n = parseInt(m[1].replace(',', ''), 10);
    return isNaN(n) ? null : n;
};

const matchDealDamage = (desc) => {
    const m = desc.match(/(?:inflict|deal|take|takes?)\s+([\d,]+)\s*(?:damage|points?\s*of\s*damage)/i);
    if (!m) return null;
    const n = parseInt(m[1].replace(',', ''), 10);
    return isNaN(n) ? null : n;
};

const matchSearch = (desc) => {
    if (!/add.{1,60}deck.{1,30}hand/i.test(desc)) return null;
    const filter = { type: 'MONSTER' };
    const atkM = desc.match(/(?:atk\s*[\d,]+\s*or\s*less|([\d,]+)\s*or\s*less\s*atk)/i);
    if (atkM) filter.atk = { max: parseInt((atkM[1] || '1500').replace(',', ''), 10) };
    // Archetype hints in quotes, e.g. add 1 "Gagaga" monster
    const nameM = desc.match(/"([^"]+)"/);
    if (nameM) filter.nameIncludes = nameM[1];
    return filter;
};

const matchDestroyAll = (desc) =>
    /destroy\s+all\s+(?:monsters?\s+on\s+(?:the\s+)?(?:field|both\s+fields?)|(?:face[- ]?up\s+)?monsters?\s+(?:your\s+opponent\s+controls|on\s+(?:the\s+)?field))/i.test(desc);

const matchDestroyOpponent = (desc) =>
    /destroy\s+all\s+(?:face[- ]?up\s+)?monsters?\s+(?:your\s+opponent\s+controls|on\s+your\s+opponent.{0,10}field)/i.test(desc);

const matchDestroy1 = (desc) =>
    /destroy\s+1\s+(?:monster|spell|trap|card)/i.test(desc);

/** "Special Summon 1 [Level X or lower] monster from your hand" */
const matchSSFromHand = (desc) => {
    const lvM = desc.match(/special\s+summon\s+1\s+level\s+(\d+)\s+or\s+lower\s+(?:\S+\s+)*?monster\s+from\s+(?:your\s+)?hand/i);
    if (lvM) return { maxLevel: parseInt(lvM[1], 10) };
    if (/special\s+summon\s+1\s+(?:\S+\s+)*?monster\s+from\s+(?:your\s+)?hand/i.test(desc)) return {};
    return null;
};

/** "Special Summon 1 monster from your Graveyard" */
const matchSSFromGY = (desc) =>
    /special\s+summon\s+1\s+(?:\S+\s+)*?monster\s+from\s+(?:your\s+)?(?:graveyard|gy)\b/i.test(desc) ? {} : null;

/** "Special Summon 1 monster from your Deck" */
const matchSSFromDeck = (desc) =>
    /special\s+summon\s+1\s+(?:\S+\s+)*?monster\s+from\s+(?:your\s+)?deck\b/i.test(desc) ? {} : null;

/**
 * Detect "When this card is [Normal/Special] Summoned" trigger prefix.
 */
const matchOnSummonTrigger = (desc) =>
    /when\s+this\s+card\s+is\s+(?:normal(?:ly)?\s+or\s+special(?:ly)?\s+)?summon(?:ed)?/i.test(desc);

/**
 * Detect "Once per turn: You can" prefix.
 * Returns the sub-effect text after "You can" if found, otherwise null.
 */
const matchOncePerTurn = (desc) => {
    const m = desc.match(/once\s+per\s+turn(?:[^:]*)?:\s*you\s+can\s+(.{10,})/i);
    return m ? m[1] : null;
};

// ─── EFFECT BUILDERS ─────────────────────────────────────────────────────────

const makeDrawEffect = (n, oncePer = false) => ({
    condition: (env) => (env?.[SIDE.MINE]?.[ENVIRONMENT.DECK] || []).length >= n,
    operation: (env) => {
        for (let i = 0; i < n; i++) {
            const deck = env[SIDE.MINE][ENVIRONMENT.DECK];
            if (!deck.length) break;
            env[SIDE.MINE][ENVIRONMENT.HAND].push(deck.pop());
        }
        dispatchEnv(env);
    },
    ...(oncePer ? { once_per_turn: true } : {}),
});

const makeGainLPEffect = (amount, oncePer = false) => ({
    condition: () => true,
    operation: (env) => {
        env[SIDE.MINE].hp = (env[SIDE.MINE].hp || 0) + amount;
        dispatchEnv(env);
    },
    ...(oncePer ? { once_per_turn: true } : {}),
});

const makeDealDamageEffect = (amount, oncePer = false) => ({
    condition: () => true,
    operation: (env) => {
        env[SIDE.OPPONENT].hp = Math.max(0, (env[SIDE.OPPONENT].hp || 0) - amount);
        dispatchEnv(env);
    },
    ...(oncePer ? { once_per_turn: true } : {}),
});

const makeSearchEffect = (filter, oncePer = false) => ({
    condition: (env) => {
        const deck = env?.[SIDE.MINE]?.[ENVIRONMENT.DECK] || [];
        return deck.some(c => {
            if (!c?.card?.card_type?.startsWith('MONSTER')) return false;
            if (filter.atk?.max !== undefined && (c.card.atk ?? 0) > filter.atk.max) return false;
            if (filter.nameIncludes && !c.card.name?.toLowerCase().includes(filter.nameIncludes.toLowerCase())) return false;
            return true;
        });
    },
    operation: async (env) => {
        const deck = env[SIDE.MINE][ENVIRONMENT.DECK];
        const valid = deck.filter(c => {
            if (!c?.card?.card_type?.startsWith('MONSTER')) return false;
            if (filter.atk?.max !== undefined && (c.card.atk ?? 0) > filter.atk.max) return false;
            if (filter.nameIncludes && !c.card.name?.toLowerCase().includes(filter.nameIncludes.toLowerCase())) return false;
            return true;
        });
        if (!valid.length) return;
        try {
            const { cardEnvs: [uid] } = await openSelector({
                type: CARD_SELECT_TYPE.CARD_SELECT_FROM_DECK,
                sourceList: valid,
                numToSelect: 1,
                label: filter.nameIncludes
                    ? `Add 1 "${filter.nameIncludes}" card from Deck to hand`
                    : filter.atk
                        ? `Add 1 monster (ATK ≤ ${filter.atk.max}) from Deck to hand`
                        : 'Add 1 monster from Deck to hand',
            });
            const idx = deck.findIndex(c => getUid(c) === uid);
            if (idx === -1) return;
            env[SIDE.MINE][ENVIRONMENT.HAND].push(deck.splice(idx, 1)[0]);
            dispatchEnv(env);
        } catch { /* cancelled */ }
    },
    ...(oncePer ? { once_per_turn: true } : {}),
});

const makeDestroyAllMonstersEffect = (opponentOnly, oncePer = false) => ({
    condition: (env) =>
        (env?.[SIDE.OPPONENT]?.[ENVIRONMENT.MONSTER_FIELD] || []).some(c => c !== CARD_TYPE.PLACEHOLDER && c?.card),
    operation: (env) => {
        const sides = opponentOnly ? [SIDE.OPPONENT] : [SIDE.MINE, SIDE.OPPONENT];
        const destroyed = [];
        for (const s of sides) {
            const field = env[s][ENVIRONMENT.MONSTER_FIELD];
            for (let i = 0; i < field.length; i++) {
                if (field[i] !== CARD_TYPE.PLACEHOLDER && field[i]?.card) {
                    const cardEnv = field[i];
                    const dest = cardEnv.card?.card_type === 'MONSTER_PENDULUM'
                        ? ENVIRONMENT.EXTRA_DECK : ENVIRONMENT.GRAVEYARD;
                    env[s][dest].push(cardEnv);
                    field[i] = CARD_TYPE.PLACEHOLDER;
                    destroyed.push({ cardEnv, destroyedSide: s });
                }
            }
        }
        dispatchEnv(env);
        for (const { cardEnv, destroyedSide } of destroyed) {
            fireTrigger(TRIGGER_TYPE.ON_DESTROY, cardEnv, env, destroyedSide);
        }
    },
    ...(oncePer ? { once_per_turn: true } : {}),
});

const makeDestroy1Effect = (oncePer = false) => ({
    condition: (env) =>
        (env?.[SIDE.OPPONENT]?.[ENVIRONMENT.MONSTER_FIELD] || []).some(c => c !== CARD_TYPE.PLACEHOLDER && c?.card),
    operation: async (env) => {
        const field = env[SIDE.OPPONENT][ENVIRONMENT.MONSTER_FIELD];
        const valid = field.filter(c => c !== CARD_TYPE.PLACEHOLDER && c?.card);
        if (!valid.length) return;
        try {
            const { cardEnvs: [uid] } = await openSelector({
                type: CARD_SELECT_TYPE.CARD_SELECT_BATTLE_SELECT,
                label: 'Select 1 monster to destroy',
                sourceList: valid,
                numToSelect: 1,
            });
            const idx = field.findIndex(c => getUid(c) === uid);
            if (idx === -1) return;
            const destroyed = field[idx];
            const dest = destroyed?.card?.card_type === 'MONSTER_PENDULUM'
                ? ENVIRONMENT.EXTRA_DECK : ENVIRONMENT.GRAVEYARD;
            env[SIDE.OPPONENT][dest].push(destroyed);
            field[idx] = CARD_TYPE.PLACEHOLDER;
            dispatchEnv(env);
            fireTrigger(TRIGGER_TYPE.ON_DESTROY, destroyed, env, SIDE.OPPONENT);
        } catch { /* cancelled */ }
    },
    ...(oncePer ? { once_per_turn: true } : {}),
});

const EXTRA_DECK_TYPES = ['MONSTER_XYZ', 'MONSTER_FUSION', 'MONSTER_SYNCHRO', 'MONSTER_LINK'];

const makeSSFromHandEffect = (opts = {}, oncePer = false) => ({
    condition: (env) =>
        (env?.[SIDE.MINE]?.[ENVIRONMENT.HAND] || []).some(c => {
            if (!c?.card?.card_type?.startsWith('MONSTER')) return false;
            if (EXTRA_DECK_TYPES.includes(c.card.card_type)) return false;
            if (opts.maxLevel !== undefined && (c.card.level ?? 99) > opts.maxLevel) return false;
            return true;
        }),
    operation: async (env) => {
        const hand = env[SIDE.MINE][ENVIRONMENT.HAND];
        const valid = hand.filter(c => {
            if (!c?.card?.card_type?.startsWith('MONSTER')) return false;
            if (EXTRA_DECK_TYPES.includes(c.card.card_type)) return false;
            if (opts.maxLevel !== undefined && (c.card.level ?? 99) > opts.maxLevel) return false;
            return true;
        });
        if (!valid.length) return;
        try {
            const { cardEnvs: [uid] } = await openSelector({
                type: CARD_SELECT_TYPE.CARD_SELECT_FROM_HAND,
                label: opts.maxLevel !== undefined
                    ? `Special Summon 1 Level ${opts.maxLevel} or lower monster from hand`
                    : 'Special Summon 1 monster from hand',
                sourceList: valid,
                numToSelect: 1,
            });
            const idx = hand.findIndex(c => getUid(c) === uid);
            if (idx === -1) return;
            const [card] = hand.splice(idx, 1);
            const field = env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD];
            const priorities = [2, 3, 1, 4, 0];
            for (const slot of priorities) {
                if (field[slot] === CARD_TYPE.PLACEHOLDER) {
                    card.current_pos = CARD_POS.FACE;
                    card.summoned_this_turn = true;
                    field[slot] = card;
                    break;
                }
            }
            dispatchEnv(env);
        } catch { /* cancelled */ }
    },
    ...(oncePer ? { once_per_turn: true } : {}),
});

const makeSSFromGYEffect = (oncePer = false) => ({
    condition: (env) =>
        (env?.[SIDE.MINE]?.[ENVIRONMENT.GRAVEYARD] || []).some(c => c?.card?.card_type?.startsWith('MONSTER')),
    operation: async (env) => {
        const gy = env[SIDE.MINE][ENVIRONMENT.GRAVEYARD];
        const valid = gy.filter(c => c?.card?.card_type?.startsWith('MONSTER'));
        if (!valid.length) return;
        try {
            const { cardEnvs: [uid] } = await openSelector({
                type: CARD_SELECT_TYPE.CARD_SELECT_FROM_HAND,
                label: 'Special Summon 1 monster from your Graveyard',
                sourceList: valid,
                numToSelect: 1,
            });
            const idx = gy.findIndex(c => getUid(c) === uid);
            if (idx === -1) return;
            const [card] = gy.splice(idx, 1);
            const field = env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD];
            const priorities = [2, 3, 1, 4, 0];
            for (const slot of priorities) {
                if (field[slot] === CARD_TYPE.PLACEHOLDER) {
                    card.current_pos = CARD_POS.FACE;
                    card.summoned_this_turn = true;
                    field[slot] = card;
                    break;
                }
            }
            dispatchEnv(env);
        } catch { /* cancelled */ }
    },
    ...(oncePer ? { once_per_turn: true } : {}),
});

/**
 * Fallback for unrecognized "Once per turn" effects.
 * Shows the card's effect text in the duel log so the player can resolve it manually.
 */
const makeLogOncePerTurnEffect = (cardName, effectText) => ({
    condition: () => true,
    operation: (env) => {
        logEvent(LOG_TYPE.EFFECT, `${cardName} (Once per turn): ${effectText.slice(0, 200)}`);
        dispatchEnv(env);
    },
    once_per_turn: true,
});

// ─── ON-SUMMON BUILDERS ───────────────────────────────────────────────────────

const makeOnSummonEffect = (desc, cardName) => {
    // Try SS from hand first (e.g. Goblindbergh-like)
    const ssHand = matchSSFromHand(desc);
    if (ssHand) {
        return (env) => {
            logEvent(LOG_TYPE.EFFECT, `${cardName}: on-summon SS from hand`, { cardName });
            return makeSSFromHandEffect(ssHand).operation(env);
        };
    }
    // Search from deck (e.g. Stratos-like)
    const searchF = matchSearch(desc);
    if (searchF) {
        return (env) => {
            logEvent(LOG_TYPE.EFFECT, `${cardName}: on-summon search`, { cardName });
            return makeSearchEffect(searchF).operation(env);
        };
    }
    // SS from GY
    if (matchSSFromGY(desc)) {
        return (env) => {
            logEvent(LOG_TYPE.EFFECT, `${cardName}: on-summon SS from GY`, { cardName });
            return makeSSFromGYEffect().operation(env);
        };
    }
    const dmg = matchDealDamage(desc);
    if (dmg) {
        return (env) => {
            logEvent(LOG_TYPE.EFFECT, `${cardName}: on-summon — inflict ${dmg} damage`, { cardName });
            env[SIDE.OPPONENT].hp = Math.max(0, (env[SIDE.OPPONENT].hp || 0) - dmg);
            dispatchEnv(env);
        };
    }
    const lp = matchGainLP(desc);
    if (lp) {
        return (env) => {
            logEvent(LOG_TYPE.EFFECT, `${cardName}: on-summon — gain ${lp} LP`, { cardName });
            env[SIDE.MINE].hp = (env[SIDE.MINE].hp || 0) + lp;
            dispatchEnv(env);
        };
    }
    const n = matchDraw(desc);
    if (n) {
        return (env) => {
            logEvent(LOG_TYPE.EFFECT, `${cardName}: on-summon — draw ${n}`, { cardName });
            for (let i = 0; i < n; i++) {
                const deck = env[SIDE.MINE][ENVIRONMENT.DECK];
                if (!deck.length) break;
                env[SIDE.MINE][ENVIRONMENT.HAND].push(deck.pop());
            }
            dispatchEnv(env);
        };
    }
    return null;
};

// ─── MAIN EXPORT ─────────────────────────────────────────────────────────────

export const autoGenEffect = (id, card) => {
    const desc = card?.description || card?.desc || '';
    if (!desc) return null;
    const name = card?.name || String(id);

    // ── 1. On-summon triggered effects ────────────────────────────────────────
    if (matchOnSummonTrigger(desc)) {
        const fn = makeOnSummonEffect(desc, name);
        if (fn) return [{ on_summon: fn }];
        // Unrecognised on-summon: log for debugging, no effect entry
        logEvent(LOG_TYPE.EFFECT_FAIL,
            `${name}: on-summon trigger detected but effect not auto-generated`,
            { cardName: name });
        return null;
    }

    // ── 2. Once-per-turn field effects ────────────────────────────────────────
    const subEffText = matchOncePerTurn(desc);
    if (subEffText) {
        const n = matchDraw(subEffText);
        if (n) return [makeDrawEffect(n, true)];

        const lp = matchGainLP(subEffText);
        if (lp) return [makeGainLPEffect(lp, true)];

        const dmg = matchDealDamage(subEffText);
        if (dmg) return [makeDealDamageEffect(dmg, true)];

        const ssHand = matchSSFromHand(subEffText);
        if (ssHand) return [makeSSFromHandEffect(ssHand, true)];

        if (matchSSFromGY(subEffText)) return [makeSSFromGYEffect(true)];

        const searchF = matchSearch(subEffText);
        if (searchF) return [makeSearchEffect(searchF, true)];

        if (matchDestroyAll(subEffText)) return [makeDestroyAllMonstersEffect(false, true)];
        if (matchDestroyOpponent(subEffText)) return [makeDestroyAllMonstersEffect(true, true)];
        if (matchDestroy1(subEffText)) return [makeDestroy1Effect(true)];

        // Fallback: show effect text in duel log so player can manually resolve
        return [makeLogOncePerTurnEffect(name, subEffText)];
    }

    // ── 3. Plain activated effects ────────────────────────────────────────────
    const drawN = matchDraw(desc);
    if (drawN) return [makeDrawEffect(drawN)];

    const gainLP = matchGainLP(desc);
    if (gainLP) return [makeGainLPEffect(gainLP)];

    const dmg = matchDealDamage(desc);
    if (dmg) return [makeDealDamageEffect(dmg)];

    if (matchDestroyAll(desc)) return [makeDestroyAllMonstersEffect(false)];
    if (matchDestroyOpponent(desc)) return [makeDestroyAllMonstersEffect(true)];
    if (matchDestroy1(desc)) return [makeDestroy1Effect()];

    const searchFilter = matchSearch(desc);
    if (searchFilter) return [makeSearchEffect(searchFilter)];

    if (matchSSFromHand(desc)) return [makeSSFromHandEffect(matchSSFromHand(desc))];
    if (matchSSFromGY(desc)) return [makeSSFromGYEffect()];
    if (matchSSFromDeck(desc)) return [makeSSFromGYEffect()]; // same UI pattern, src differs visually

    return null;
};
