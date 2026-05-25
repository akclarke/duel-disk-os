/**
 * effectAutoGen.js — src/data/effectAutoGen.js
 *
 * Pattern-matches a card's description text to produce a basic effect entry
 * when no hand-written entry exists in effectsRegistry.js.
 *
 * This is intentionally conservative — it only generates effects whose text
 * has an unambiguous one-to-one mapping to a known operation (draw, gain LP,
 * damage, search, destroy). Cards with complex conditional logic still need
 * manual entries in effectsRegistry.js.
 *
 * Called by cardLoader.js as a fallback after EFFECTS_REGISTRY lookup.
 */

import { ENVIRONMENT, SIDE, CARD_TYPE, CARD_POS } from '../Components/Card/utils/constant';
import { CARD_SELECT_TYPE } from '../Components/PlayerGround/utils/constant';
import { TOOL_TYPE } from '../Store/actions/actionTypes';
import { show_tool } from '../Store/actions/toolActions';
import store from '../Store/store';
import { update_environment } from '../Store/actions/environmentActions';
import { logEvent, LOG_TYPE } from './duelLog';

// ─── SHARED HELPERS ───────────────────────────────────────────────────────────

const dispatchEnv = (env) => store.dispatch(update_environment(env));

const openSelector = (info) =>
    new Promise((resolve, reject) =>
        store.dispatch(show_tool({ tool_type: TOOL_TYPE.CARD_SELECTOR, info: { ...info, resolve, reject } }))
    );

// ─── PATTERN MATCHERS ─────────────────────────────────────────────────────────

/**
 * Detect "draw N card(s)" patterns.
 * Handles: "draw 1 card", "draw 2 cards", "draw a card"
 */
const matchDraw = (desc) => {
    const m = desc.match(/draw\s+(a|\d+)\s+card/i);
    if (!m) return null;
    const n = m[1].toLowerCase() === 'a' ? 1 : parseInt(m[1], 10);
    if (!n || n > 5) return null; // sanity cap
    return n;
};

/**
 * Detect "gain N LP" / "gain N life points" patterns.
 */
const matchGainLP = (desc) => {
    const m = desc.match(/gain\s+([\d,]+)\s*(lp|life\s*points?)/i);
    if (!m) return null;
    const n = parseInt(m[1].replace(',', ''), 10);
    return isNaN(n) ? null : n;
};

/**
 * Detect "take N damage" / "inflict N damage" patterns (opponent takes damage).
 */
const matchDealDamage = (desc) => {
    const m = desc.match(/(?:inflict|deal|take|takes?)\s+([\d,]+)\s*(?:damage|points?\s*of\s*damage)/i);
    if (!m) return null;
    const n = parseInt(m[1].replace(',', ''), 10);
    return isNaN(n) ? null : n;
};

/**
 * Detect "add 1 [type] monster from your Deck to your hand" (search effects).
 * Returns a filter object for openSelector.
 */
const matchSearch = (desc) => {
    if (!/add.{1,40}deck.{1,20}hand/i.test(desc)) return null;
    const atkMatch = desc.match(/atk\s*[\d,]+\s*or\s*less|atk\s*of\s*([\d,]+)\s*or\s*less|([\d,]+)\s*or\s*less\s*atk/i);
    const filter = { type: 'MONSTER' };
    if (atkMatch) {
        const raw = atkMatch[1] || atkMatch[2] || '1500';
        filter.atk = { max: parseInt(raw.replace(',', ''), 10) };
    }
    return filter;
};

/**
 * Detect "destroy all monsters on the field" (field nuke).
 */
const matchDestroyAll = (desc) =>
    /destroy\s+all\s+(?:monsters?\s+on\s+(?:the\s+)?(?:field|both\s+fields?)|(?:face[- ]?up\s+)?monsters?\s+(?:your\s+opponent\s+controls|on\s+(?:the\s+)?field))/i.test(desc);

/**
 * Detect "destroy all monsters your opponent controls".
 */
const matchDestroyOpponent = (desc) =>
    /destroy\s+all\s+(?:face[- ]?up\s+)?monsters?\s+(?:your\s+opponent\s+controls|on\s+your\s+opponent.{0,10}field)/i.test(desc);

/**
 * Detect "destroy 1 monster" (target destroy).
 */
const matchDestroy1 = (desc) =>
    /destroy\s+1\s+(?:monster|spell|trap|card)/i.test(desc);

/**
 * Detect on-summon triggered effects.
 * Matches: "When this card is Normal or Special Summoned",
 *          "When this card is Summoned", etc.
 */
const matchOnSummonTrigger = (desc) =>
    /when\s+this\s+card\s+is\s+(?:normal(?:ly)?\s+or\s+special(?:ly)?\s+)?summon(?:ed)?/i.test(desc);

// ─── EFFECT BUILDERS ─────────────────────────────────────────────────────────

const makeDrawEffect = (n) => ({
    condition: (env) => {
        const deck = env?.[SIDE.MINE]?.[ENVIRONMENT.DECK] || [];
        return deck.length >= n;
    },
    operation: (env) => {
        for (let i = 0; i < n; i++) {
            const deck = env[SIDE.MINE][ENVIRONMENT.DECK];
            if (!deck.length) break;
            const card = deck.pop();
            env[SIDE.MINE][ENVIRONMENT.HAND].push(card);
        }
        dispatchEnv(env);
    }
});

const makeGainLPEffect = (amount) => ({
    condition: () => true,
    operation: (env) => {
        env[SIDE.MINE].hp = (env[SIDE.MINE].hp || 0) + amount;
        dispatchEnv(env);
    }
});

const makeDealDamageEffect = (amount) => ({
    condition: () => true,
    operation: (env) => {
        env[SIDE.OPPONENT].hp = Math.max(0, (env[SIDE.OPPONENT].hp || 0) - amount);
        dispatchEnv(env);
    }
});

const makeSearchEffect = (filter) => ({
    condition: (env) => {
        const deck = env?.[SIDE.MINE]?.[ENVIRONMENT.DECK] || [];
        return deck.some(c => {
            if (!c?.card) return false;
            if (!c.card.card_type?.startsWith('MONSTER')) return false;
            if (filter.atk?.max !== undefined && (c.card.atk ?? 0) > filter.atk.max) return false;
            return true;
        });
    },
    operation: async (env) => {
        const deck = env[SIDE.MINE][ENVIRONMENT.DECK];
        const valid = deck.filter(c => {
            if (!c?.card?.card_type?.startsWith('MONSTER')) return false;
            if (filter.atk?.max !== undefined && (c.card.atk ?? 0) > filter.atk.max) return false;
            return true;
        });
        if (!valid.length) return;
        try {
            const { cardEnvs: [uid] } = await openSelector({
                type: CARD_SELECT_TYPE.CARD_SELECT_FROM_DECK,
                sourceList: valid,
                numToSelect: 1,
                label: filter.atk
                    ? `Add 1 monster (ATK ≤ ${filter.atk.max}) from Deck to hand`
                    : 'Add 1 monster from Deck to hand'
            });
            const idx = deck.findIndex(c => {
                const id = c?.unique_count !== undefined
                    ? `${c.card?.key}_${c.unique_count}`
                    : c?.card?.key?.toString();
                return id === uid;
            });
            if (idx === -1) return;
            const [found] = deck.splice(idx, 1);
            env[SIDE.MINE][ENVIRONMENT.HAND].push(found);
            dispatchEnv(env);
        } catch (e) { /* cancelled */ }
    }
});

const makeDestroyAllMonstersEffect = (opponentOnly) => ({
    condition: (env) => {
        const side = opponentOnly ? SIDE.OPPONENT : SIDE.MINE;
        const field = env?.[SIDE.OPPONENT]?.[ENVIRONMENT.MONSTER_FIELD] || [];
        return field.some(c => c !== CARD_TYPE.PLACEHOLDER && c?.card);
    },
    operation: (env) => {
        const sides = opponentOnly ? [SIDE.OPPONENT] : [SIDE.MINE, SIDE.OPPONENT];
        for (const s of sides) {
            const field = env[s][ENVIRONMENT.MONSTER_FIELD];
            for (let i = 0; i < field.length; i++) {
                if (field[i] !== CARD_TYPE.PLACEHOLDER && field[i]?.card) {
                    env[s][ENVIRONMENT.GRAVEYARD].push(field[i]);
                    field[i] = CARD_TYPE.PLACEHOLDER;
                }
            }
        }
        dispatchEnv(env);
    }
});

const makeDestroy1Effect = () => ({
    condition: (env) => {
        const opp = env?.[SIDE.OPPONENT]?.[ENVIRONMENT.MONSTER_FIELD] || [];
        return opp.some(c => c !== CARD_TYPE.PLACEHOLDER && c?.card);
    },
    operation: async (env) => {
        const field = env[SIDE.OPPONENT][ENVIRONMENT.MONSTER_FIELD];
        const valid = field.filter(c => c !== CARD_TYPE.PLACEHOLDER && c?.card);
        if (!valid.length) return;
        try {
            const { cardEnvs: [uid] } = await openSelector({
                type: CARD_SELECT_TYPE.CARD_SELECT_BATTLE_SELECT,
                label: 'Select 1 monster to destroy',
                sourceList: valid,
                numToSelect: 1
            });
            const idx = field.findIndex(c => {
                const id = c?.unique_count !== undefined
                    ? `${c.card?.key}_${c.unique_count}`
                    : c?.card?.key?.toString();
                return id === uid;
            });
            if (idx === -1) return;
            env[SIDE.OPPONENT][ENVIRONMENT.GRAVEYARD].push(field[idx]);
            field[idx] = CARD_TYPE.PLACEHOLDER;
            dispatchEnv(env);
        } catch (e) { /* cancelled */ }
    }
});

// ─── MAIN EXPORT ─────────────────────────────────────────────────────────────

/**
 * Build an on_summon handler for a card whose description matches an
 * on-summon trigger pattern. Returns null if no effect matches.
 */
const makeOnSummonEffect = (desc, cardName) => {
    const dmg = matchDealDamage(desc);
    if (dmg) {
        return (env) => {
            logEvent(LOG_TYPE.EFFECT, `${cardName}: on-summon effect — inflict ${dmg} damage`, { cardName });
            env[SIDE.OPPONENT].hp = Math.max(0, (env[SIDE.OPPONENT].hp || 0) - dmg);
            dispatchEnv(env);
        };
    }
    const gainLP = matchGainLP(desc);
    if (gainLP) {
        return (env) => {
            logEvent(LOG_TYPE.EFFECT, `${cardName}: on-summon effect — gain ${gainLP} LP`, { cardName });
            env[SIDE.MINE].hp = (env[SIDE.MINE].hp || 0) + gainLP;
            dispatchEnv(env);
        };
    }
    const drawN = matchDraw(desc);
    if (drawN) {
        return (env) => {
            logEvent(LOG_TYPE.EFFECT, `${cardName}: on-summon effect — draw ${drawN}`, { cardName });
            for (let i = 0; i < drawN; i++) {
                const deck = env[SIDE.MINE][ENVIRONMENT.DECK];
                if (!deck.length) break;
                env[SIDE.MINE][ENVIRONMENT.HAND].push(deck.pop());
            }
            dispatchEnv(env);
        };
    }
    return null;
};

/**
 * Try to auto-generate an effect for a card from its description.
 * Returns an effects array (same shape as EFFECTS_REGISTRY values) or null.
 *
 * On-summon triggered effects (detected via "When this card is ... Summoned:")
 * are returned as { on_summon: fn } so Core/Summon fires them automatically.
 *
 * Activated effects priority: draw > gain LP > deal damage > destroy all >
 *   destroy opp > destroy 1 > search.
 */
export const autoGenEffect = (id, card) => {
    const desc = card?.description || card?.desc || '';
    if (!desc) return null;
    const name = card?.name || String(id);

    // ── On-summon triggered effects ───────────────────────────────────────────
    if (matchOnSummonTrigger(desc)) {
        const fn = makeOnSummonEffect(desc, name);
        if (fn) {
            return [{ on_summon: fn }];
        }
        // Matched trigger text but no recognised effect — log for debugging
        logEvent(LOG_TYPE.EFFECT_FAIL,
            `${name}: on-summon trigger detected but effect not auto-generated (needs manual entry)`,
            { cardName: name });
        return null;
    }

    // ── Activated effects ─────────────────────────────────────────────────────
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

    return null;
};
