/**
 * effectsRegistry.js — src/data/effectsRegistry.js
 *
 * Maps card IDs to player-activated effects (hand click or field click).
 * Triggered effects (on destroy, on battle damage, on attack declared)
 * live in triggerRegistry.js instead.
 *
 * Mix of styles is intentional — factory style for most cards,
 * hand-written for cards that need custom logic beyond what the factory covers.
 */

import { ENVIRONMENT, SIDE, CARD_TYPE, CARD_POS } from '../Components/Card/utils/constant';
import { CARD_SELECT_TYPE } from '../Components/PlayerGround/utils/constant';
import { TOOL_TYPE } from '../Store/actions/actionTypes';
import { show_tool } from '../Store/actions/toolActions';
import store from '../Store/store';
import { update_environment } from '../Store/actions/environmentActions';
import { get_unique_id_from_ennvironment } from '../Components/PlayerGround/utils/utils';
import { logEvent, LOG_TYPE } from './duelLog';
import { fireTrigger, TRIGGER_TYPE } from './triggerRegistry';
import { choosePosition } from './positionChooser';
import { chooseLevel } from './levelChooser';

import {
    // Operations
    searchDeck, drawCards, discardFromHand, gainLP, payLP, dealDamage,
    destroyMonsters, destroySpellsTraps, specialSummonFromDeck,
    specialSummonFromHand, specialSummonFromGY, passiveBoost, sequence, when,
    // Wrappers
    onActivate, continuous, onSummon, oncePerTurn, onDestroy,
    onBattleDamage, onAttackDeclared, whileOnField,
    // Shortcuts
    floater, recruiter, drawSpell, nuke, raigeki, burn, collectiveBoost,
} from './effectFactory';

// ─── INTERNAL HELPERS ────────────────────────────────────────────────────────

const openSelector = (info) =>
    new Promise((resolve, reject) =>
        store.dispatch(show_tool({
            tool_type: TOOL_TYPE.CARD_SELECTOR,
            info: { ...info, resolve, reject }
        }))
    );

const getMonsters = (env, side) =>
    (env[side][ENVIRONMENT.MONSTER_FIELD] || [])
        .filter(c => c !== CARD_TYPE.PLACEHOLDER && c?.card);

const dispatchEnv = (env) => store.dispatch(update_environment(env));

// ─── FUSION MATERIAL MATCHING ─────────────────────────────────────────────────
// fusion_materials entries support two formats:
//   number[]         → specific card key IDs  (e.g. [46986414, 78193831])
//   RequirementObj[] → flexible matchers       (e.g. [{ attribute:'DARK' }, { nameIncludes:'Predaplant' }])
// RequirementObj fields: key, attribute, nameIncludes, type, level_min, level_max, custom

const matchesReq = (cardEnv, req) => {
    if (!cardEnv?.card) return false;
    if (typeof req === 'number') return cardEnv.card.key === req;
    const c = cardEnv.card;
    if (req.key       !== undefined && c.key !== req.key) return false;
    if (req.attribute !== undefined && c.attribute?.toUpperCase() !== req.attribute.toUpperCase()) return false;
    if (req.nameIncludes !== undefined && !c.name?.toLowerCase().includes(req.nameIncludes.toLowerCase())) return false;
    if (req.type      !== undefined && !c.card_type?.startsWith(req.type)) return false;
    if (req.level_min !== undefined && (c.level ?? 0) < req.level_min) return false;
    if (req.level_max !== undefined && (c.level ?? 0) > req.level_max) return false;
    if (req.custom    !== undefined && !req.custom(cardEnv)) return false;
    return true;
};

/**
 * Greedy check: can the requirement list be satisfied by the available cards?
 * Each card can only be used for one requirement slot.
 * If reqs is empty, returns true only if 2+ generic monsters are available.
 */
const canFuseSummon = (reqs, available) => {
    if (!reqs || !reqs.length) return available.length >= 2;
    const used = new Set();
    for (const req of reqs) {
        const idx = available.findIndex((c, i) => !used.has(i) && matchesReq(c, req));
        if (idx === -1) return false;
        used.add(idx);
    }
    return true;
};

// ─── EFFECTS REGISTRY ────────────────────────────────────────────────────────

export const EFFECTS_REGISTRY = {

    // ════════════════════════════════════════════════════════════════════════
    // ── UNIVERSAL SPELLS ──────────────────────────────────────────────────
    // ════════════════════════════════════════════════════════════════════════

    // ════════════════════════════════════════════════════════════════════════
    // ── FUSION MATERIAL REQUIREMENTS ─────────────────────────────────────────
    // Entries keyed as `${fusionId}_materials` — array of requirement objects or key IDs.
    // Read by cardLoader.js and used below by Polymerization's canFuseSummon check.
    // ════════════════════════════════════════════════════════════════════════

    // ── Elemental HERO fusions ────────────────────────────────────────────────
    '35809262_materials': [ // Flame Wingman: Avian + Burstinatrix
        { nameIncludes: 'Avian'        },
        { nameIncludes: 'Burstinatrix' },
    ],
    '83121692_materials': [ // Tempest: Avian + Sparkman + Bubbleman
        { nameIncludes: 'Avian'    },
        { nameIncludes: 'Sparkman' },
        { nameIncludes: 'Bubbleman' },
    ],
    '73937442_materials': [ // Wildedge: Wildheart + Bladedge
        { nameIncludes: 'Wildheart' },
        { nameIncludes: 'Bladedge'  },
    ],
    '78734613_materials': [ // Dark Paladin: Dark Magician + Buster Blader
        { key: 46986414 },  // Dark Magician
        { nameIncludes: 'Buster Blader' },
    ],
    '38247752_materials': [ // Elemental HERO Gaia: 1 Earth HERO + 1 monster
        { nameIncludes: 'HERO', attribute: 'EARTH' },
        { type: 'MONSTER' },
    ],

    // ── Predaplant fusions ────────────────────────────────────────────────────
    '66309175_materials': [ // Predaplant Ambulomelides: 2 Predaplant monsters
        { nameIncludes: 'Predaplant' },
        { nameIncludes: 'Predaplant' },
    ],
    '25586143_materials': [ // Predaplant Chimerafflesia: 2 Predaplant monsters
        { nameIncludes: 'Predaplant' },
        { nameIncludes: 'Predaplant' },
    ],
    '69946549_materials': [ // Predaplant Dragostapelia: 1 Predaplant + 1 DARK
        { nameIncludes: 'Predaplant' },
        { attribute: 'DARK', type: 'MONSTER' },
    ],
    '79864860_materials': [ // Predaplant Triphyoverutum: 1 Predaplant + 1 DARK Level 8+
        { nameIncludes: 'Predaplant' },
        { attribute: 'DARK', type: 'MONSTER', level_min: 8 },
    ],

    // ── Starving Venom / Greedy Venom ─────────────────────────────────────────
    '41209827_materials': [ // Starving Venom Fusion Dragon: 2 DARK monsters on field
        { attribute: 'DARK', type: 'MONSTER' },
        { attribute: 'DARK', type: 'MONSTER' },
    ],
    '51570882_materials': [ // Greedy Venom Fusion Dragon: 1 Predaplant + 1 DARK Level 8+
        { nameIncludes: 'Predaplant' },
        { attribute: 'DARK', type: 'MONSTER', level_min: 8 },
    ],
    '39915560_materials': [ // Starving Venom Predapower: 2 DARK monsters
        { attribute: 'DARK', type: 'MONSTER' },
        { attribute: 'DARK', type: 'MONSTER' },
    ],
    '27118421_materials': [ // Starving Venom of the Four Heavenly Dragons: 2 DARK monsters
        { attribute: 'DARK', type: 'MONSTER' },
        { attribute: 'DARK', type: 'MONSTER' },
    ],

    // ════════════════════════════════════════════════════════════════════════
    // ── UNIVERSAL SPELLS ──────────────────────────────────────────────────
    // ════════════════════════════════════════════════════════════════════════

    // Polymerization (24094653) — Fusion Summon using hand + field materials
    // Replaces legacy SpellData implementation; reads fusion_materials requirement objects.
    24094653: onActivate(async (env) => {
        const extraDeck = env[SIDE.MINE][ENVIRONMENT.EXTRA_DECK] || [];
        const hand  = (env[SIDE.MINE][ENVIRONMENT.HAND]  || []).filter(c => c?.card?.card_type?.startsWith('MONSTER'));
        const field = (env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD] || []).filter(c => c !== CARD_TYPE.PLACEHOLDER && c?.card);
        const available = [...hand, ...field];

        // Only show Fusion Monsters that can be summoned with current materials
        const viable = extraDeck.filter(c =>
            c?.card?.card_type === 'MONSTER_FUSION' &&
            canFuseSummon(c.card.fusion_materials, available)
        );
        if (!viable.length) {
            logEvent(LOG_TYPE.EFFECT, 'Polymerization: no Fusion Monsters can be summoned with available materials');
            return;
        }

        try {
            // Step 1: select the Fusion Monster to summon
            const targetResult = await openSelector({
                type: CARD_SELECT_TYPE.CARD_SELECT_FROM_HAND,
                label: 'Polymerization — select Fusion Monster to summon',
                sourceList: viable,
                numToSelect: 1,
            });
            if (!targetResult?.cardEnvs?.length) return;

            const freshEnv = store.getState().environmentReducer.environment;
            const target = (freshEnv[SIDE.MINE][ENVIRONMENT.EXTRA_DECK] || []).find(c =>
                get_unique_id_from_ennvironment(c) === targetResult.cardEnvs[0]
            );
            if (!target) return;

            // Step 2: build the material pool valid for this specific fusion monster
            const hand2  = (freshEnv[SIDE.MINE][ENVIRONMENT.HAND] || []).filter(c => c?.card?.card_type?.startsWith('MONSTER'));
            const field2 = (freshEnv[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD] || []).filter(c => c !== CARD_TYPE.PLACEHOLDER && c?.card);
            const allAvail = [...hand2, ...field2];
            const reqs = target.card.fusion_materials || [];
            // Show only cards that match at least one requirement slot
            const validPool = reqs.length
                ? allAvail.filter(c => reqs.some(r => matchesReq(c, r)))
                : allAvail;
            const needed = reqs.length || 2;

            const matResult = await openSelector({
                type: CARD_SELECT_TYPE.CARD_SELECT_FROM_HAND,
                label: `Polymerization — select ${needed} material(s) for ${target.card?.name} (hand or field)`,
                sourceList: validPool,
                numToSelect: needed,
            });
            if (!matResult?.cardEnvs || matResult.cardEnvs.length < needed) return;

            // Step 3: remove materials from hand / field → GY
            const after = store.getState().environmentReducer.environment;
            for (const uid of matResult.cardEnvs) {
                let removed = false;
                // Try hand first
                const h = after[SIDE.MINE][ENVIRONMENT.HAND];
                const hi = h.findIndex(c => get_unique_id_from_ennvironment(c) === uid);
                if (hi !== -1) { after[SIDE.MINE][ENVIRONMENT.GRAVEYARD].push(h.splice(hi, 1)[0]); removed = true; }
                if (!removed) {
                    // Try field
                    const mf = after[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD];
                    for (let i = 0; i < mf.length; i++) {
                        if (mf[i] !== CARD_TYPE.PLACEHOLDER && mf[i]?.card && get_unique_id_from_ennvironment(mf[i]) === uid) {
                            after[SIDE.MINE][ENVIRONMENT.GRAVEYARD].push(mf[i]);
                            mf[i] = CARD_TYPE.PLACEHOLDER;
                            break;
                        }
                    }
                }
            }

            // Step 4: remove target from Extra Deck
            const ed = after[SIDE.MINE][ENVIRONMENT.EXTRA_DECK];
            const ei = ed.findIndex(c => get_unique_id_from_ennvironment(c) === targetResult.cardEnvs[0]);
            if (ei !== -1) ed.splice(ei, 1);

            // Step 5: choose position and place on field
            const pos = await choosePosition(target.card?.name || 'Monster');
            target.current_pos = pos;
            target.summoned_this_turn = true;
            const priorities = [2, 3, 1, 4, 0];
            for (const slot of priorities) {
                if (after[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD][slot] === CARD_TYPE.PLACEHOLDER) {
                    after[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD][slot] = target;
                    break;
                }
            }

            logEvent(LOG_TYPE.SPECIAL, `Polymerization: Fusion Summoned ${target.card?.name}`);
            // Fire on_summon if the fusion monster has one
            const onSummonFn = target.card?.on_summon;
            dispatchEnv(after);
            if (onSummonFn) {
                setTimeout(() => {
                    const fresh = store.getState().environmentReducer.environment;
                    const result = onSummonFn(fresh, 'SPECIAL_SUMMON');
                    if (result && typeof result.then === 'function') result.catch(() => {});
                    else dispatchEnv(fresh);
                }, 350);
            }
        } catch { /* cancelled */ }
    }, (env) => {
        const extra = (env[SIDE.MINE][ENVIRONMENT.EXTRA_DECK] || []).filter(c => c?.card?.card_type === 'MONSTER_FUSION');
        const hand  = (env[SIDE.MINE][ENVIRONMENT.HAND] || []).filter(c => c?.card?.card_type?.startsWith('MONSTER'));
        const field = (env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD] || []).filter(c => c !== CARD_TYPE.PLACEHOLDER && c?.card);
        return extra.some(c => canFuseSummon(c.card.fusion_materials, [...hand, ...field]));
    }),

    // Dark Hole (53129443) — destroy ALL monsters
    53129443: nuke(),

    // Raigeki (12580477) — destroy all OPPONENT monsters
    12580477: raigeki(),

    // Pot of Greed (55144522) — draw 2 cards
    55144522: drawSpell(2),

    // Graceful Charity (74137509 — draw 3, discard 2
    74137509: onActivate(sequence(drawCards(3), discardFromHand(2,
        {}, 'Graceful Charity — discard 2 cards'))),

    // Heavy Storm (19613556) — destroy all spells/traps
    19613556: onActivate(destroySpellsTraps({ side: 'BOTH' }),
        (env) => [SIDE.MINE, SIDE.OPPONENT].some(s =>
            (env[s][ENVIRONMENT.SPELL_FIELD] || []).some(c => c?.card)
        )
    ),

    // Mystical Space Typhoon (5318639) — Quick-Play: target ANY Spell/Trap on the field; destroy it
    5318639: onActivate(async (env) => {
        const allST = [
            ...(env[SIDE.MINE][ENVIRONMENT.SPELL_FIELD]     || []).filter(c => c?.card),
            ...(env[SIDE.OPPONENT][ENVIRONMENT.SPELL_FIELD] || []).filter(c => c?.card),
        ];
        if (!allST.length) return;
        try {
            const result = await openSelector({
                type: CARD_SELECT_TYPE.CARD_SELECT_FROM_HAND,
                label: 'Mystical Space Typhoon — target 1 Spell/Trap on the field',
                sourceList: allST, numToSelect: 1,
            });
            if (!result?.cardEnvs?.length) return;
            const freshEnv = store.getState().environmentReducer.environment;
            for (const s of [SIDE.MINE, SIDE.OPPONENT]) {
                const sf = freshEnv[s][ENVIRONMENT.SPELL_FIELD];
                for (let i = 0; i < sf.length; i++) {
                    if (sf[i]?.card && get_unique_id_from_ennvironment(sf[i]) === result.cardEnvs[0]) {
                        const destroyed = sf[i];
                        freshEnv[s][ENVIRONMENT.GRAVEYARD].push(destroyed);
                        sf[i] = CARD_TYPE.PLACEHOLDER;
                        logEvent(LOG_TYPE.EFFECT, `MST: destroyed ${destroyed.card?.name}`);
                        dispatchEnv(freshEnv);
                        return;
                    }
                }
            }
        } catch { /* cancelled */ }
    }, (env) =>
        (env[SIDE.MINE][ENVIRONMENT.SPELL_FIELD]     || []).some(c => c?.card) ||
        (env[SIDE.OPPONENT][ENVIRONMENT.SPELL_FIELD] || []).some(c => c?.card)
    ),

    // Dian Keto the Cure Master (84257639) — gain 1000 LP
    84257639: onActivate(gainLP(1000)),

    // Monster Reborn (83764718) — revive from EITHER graveyard
    // Hand-written: needs both-GY selector logic
    83764718: onActivate((env) => {
        const myGY  = (env[SIDE.MINE][ENVIRONMENT.GRAVEYARD]     || []).filter(c => c?.card?.card_type?.startsWith('MONSTER'));
        const oppGY = (env[SIDE.OPPONENT][ENVIRONMENT.GRAVEYARD] || []).filter(c => c?.card?.card_type?.startsWith('MONSTER'));
        const allGY = [...myGY, ...oppGY];
        if (!allGY.length) return Promise.resolve();

        return openSelector({
            type: CARD_SELECT_TYPE.CARD_SELECT_FROM_HAND,
            label: 'Monster Reborn — select a monster from either GY',
            sourceList: allGY,
        }).then(({ cardEnvs: [uid] }) => {
            for (const s of [SIDE.MINE, SIDE.OPPONENT]) {
                const gy = env[s][ENVIRONMENT.GRAVEYARD];
                const idx = gy.findIndex(c => get_unique_id_from_ennvironment(c) === uid);
                if (idx === -1) continue;
                const [card] = gy.splice(idx, 1);
                const field = env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD];
                const priorities = [2, 3, 1, 4, 0];
                for (const slot of priorities) {
                    if (field[slot] === CARD_TYPE.PLACEHOLDER) {
                        card.current_pos = CARD_POS.FACE;
                        field[slot] = card;
                        break;
                    }
                }
                    break;
            }
        }).catch(() => {});
    }, (env) => {
        const myGY  = (env[SIDE.MINE][ENVIRONMENT.GRAVEYARD]     || []).some(c => c?.card?.card_type?.startsWith('MONSTER'));
        const oppGY = (env[SIDE.OPPONENT][ENVIRONMENT.GRAVEYARD] || []).some(c => c?.card?.card_type?.startsWith('MONSTER'));
        return myGY || oppGY;
    }),

    // Call of the Haunted (97077563) — revive 1 monster from YOUR GY
    97077563: onActivate(
        specialSummonFromGY({ type: 'MONSTER' }, 'Call of the Haunted — select monster to revive'),
        (env) => (env[SIDE.MINE][ENVIRONMENT.GRAVEYARD] || []).some(c => c?.card?.card_type?.startsWith('MONSTER'))
    ),

    // ════════════════════════════════════════════════════════════════════════
    // ── WARRIOR SPELLS ──────────────────────────────────────────────────────
    // ════════════════════════════════════════════════════════════════════════

    // E - Emergency Call (213326) — add 1 HERO monster from deck to hand
    213326: onActivate(
        searchDeck({ nameIncludes: 'HERO', type: 'MONSTER' }, 'E - Emergency Call — add 1 HERO to hand'),
        (env) => (env[SIDE.MINE][ENVIRONMENT.DECK] || []).some(c => c?.card?.name?.toLowerCase().includes('hero'))
    ),

    // Reinforcement of the Army (32807846) — add 1 Warrior Lv4 or lower from deck
    32807846: onActivate(
        searchDeck({ race: 'Warrior', level: 4, type: 'MONSTER' }, 'ROTA — add 1 Warrior (Lv ≤ 4) to hand'),
        (env) => (env[SIDE.MINE][ENVIRONMENT.DECK] || []).some(c =>
            c?.card?.race?.toLowerCase().includes('warrior') && (c?.card?.level || 0) <= 4)
    ),

    // The A. Forces (403847) — continuous; Warriors gain 200 ATK per Warrior on field
    403847: continuous(
        (env, side) => {
            const myField = env[side][ENVIRONMENT.MONSTER_FIELD];
            const isActive = myField.some(c => c !== CARD_TYPE.PLACEHOLDER && c?.card?.key === 403847);
            if (!isActive) return;
            const count = myField.filter(c => c !== CARD_TYPE.PLACEHOLDER && c?.card?.race?.toLowerCase().includes('warrior')).length;
            if (!count) return;
            for (const m of myField) {
                if (m !== CARD_TYPE.PLACEHOLDER && m?.card?.race?.toLowerCase().includes('warrior'))
                    m.current_atk = (m.current_atk ?? m.card.atk ?? 0) + count * 200;
            }
        }
    ),

    // ════════════════════════════════════════════════════════════════════════
    // ── DARK MAGICIAN SPELLS ────────────────────────────────────────────────
    // ════════════════════════════════════════════════════════════════════════

    // Dark Magic Curtain (99789342) — pay half LP, summon DM from deck
    99789342: onActivate((env) => {
        const cost = Math.floor(env[SIDE.MINE].hp / 2);
        env[SIDE.MINE].hp -= cost;
        return specialSummonFromDeck(
            { key: 46986414 },
            'Dark Magic Curtain — Summon Dark Magician from Deck'
        )(env, SIDE.MINE);
    }, (env) => env[SIDE.MINE].hp > 0 &&
        (env[SIDE.MINE][ENVIRONMENT.DECK] || []).some(c => c?.card?.key === 46986414)),

    // Dark Magic Attack (2314238) — if DM on field, destroy all opp S/T
    2314238: onActivate(
        destroySpellsTraps({ side: 'OPPONENT' }),
        (env) => getMonsters(env, SIDE.MINE).some(c => c?.card?.key === 46986414) &&
                 (env[SIDE.OPPONENT][ENVIRONMENT.SPELL_FIELD] || []).some(c => c?.card)
    ),

    // Thousand Knives (63391643) — if DM on field, destroy highest ATK opp monster
    63391643: onActivate((env) => {
        const field = env[SIDE.OPPONENT][ENVIRONMENT.MONSTER_FIELD];
        let highIdx = -1, highAtk = -1;
        for (let i = 0; i < field.length; i++) {
            if (field[i]?.card) {
                const atk = field[i].current_atk ?? field[i].card.atk ?? 0;
                if (atk > highAtk) { highAtk = atk; highIdx = i; }
            }
        }
        if (highIdx !== -1) {
            const destroyed = field[highIdx];
            const isPendulum = destroyed?.card?.card_type === 'MONSTER_PENDULUM';
            const dest = isPendulum ? ENVIRONMENT.EXTRA_DECK : ENVIRONMENT.GRAVEYARD;
            env[SIDE.OPPONENT][dest].push(destroyed);
            field[highIdx] = CARD_TYPE.PLACEHOLDER;
            fireTrigger(TRIGGER_TYPE.ON_DESTROY, destroyed, env, SIDE.OPPONENT);
        }
    }, (env) => getMonsters(env, SIDE.MINE).some(c => c?.card?.key === 46986414) &&
               getMonsters(env, SIDE.OPPONENT).length > 0),

    // ════════════════════════════════════════════════════════════════════════
    // ── HERO SPELLS ─────────────────────────────────────────────────────────
    // ════════════════════════════════════════════════════════════════════════

    // Skyscraper (37120512) — continuous; HEROs gain 1000 ATK
    37120512: continuous(
        (env, side) => {
            const isActive = (env[side][ENVIRONMENT.SPELL_FIELD] || [])
                .some(c => c?.card?.key === 37120512);
            if (!isActive) return;
            for (const m of (env[side][ENVIRONMENT.MONSTER_FIELD] || [])) {
                if (m !== CARD_TYPE.PLACEHOLDER && m?.card?.name?.toLowerCase().includes('hero'))
                    m.current_atk = (m.current_atk ?? m.card.atk ?? 0) + 1000;
            }
        }
    ),

    // Miracle Fusion (45906428) — banish HERO materials, Fusion Summon
    // Hand-written: complex multi-step selection
    45906428: onActivate((env) => {
        const extra = (env[SIDE.MINE][ENVIRONMENT.EXTRA_DECK] || [])
            .filter(c => c?.card?.card_type === 'MONSTER_FUSION' && c?.card?.fusion_materials?.length > 0);
        if (!extra.length) return Promise.resolve();

        return openSelector({
            type: CARD_SELECT_TYPE.CARD_SELECT_SPECIAL_SUMMON_TARGET,
            label: 'Miracle Fusion — select HERO Fusion Monster',
        }).then(async ({ cardEnvs: [targetUid] }) => {
            const target = extra.find(c => get_unique_id_from_ennvironment(c) === targetUid);
            if (!target) return;
            const fieldM = getMonsters(env, SIDE.MINE).filter(m => target.card.fusion_materials?.includes(m.card.key));
            const gyM    = (env[SIDE.MINE][ENVIRONMENT.GRAVEYARD] || []).filter(c => target.card.fusion_materials?.includes(c?.card?.key));
            const avail  = [...fieldM, ...gyM];
            const needed = target.card.fusion_materials?.length || 2;
            if (avail.length < needed) return;
            for (const mat of avail.slice(0, needed)) {
                const fIdx = (env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD] || []).findIndex(c => c === mat);
                if (fIdx !== -1) { env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD][fIdx] = CARD_TYPE.PLACEHOLDER; }
                else {
                    const gIdx = (env[SIDE.MINE][ENVIRONMENT.GRAVEYARD] || []).indexOf(mat);
                    if (gIdx !== -1) env[SIDE.MINE][ENVIRONMENT.GRAVEYARD].splice(gIdx, 1);
                }
                env[SIDE.MINE][ENVIRONMENT.GRAVEYARD].push(mat);
            }
            const edIdx = (env[SIDE.MINE][ENVIRONMENT.EXTRA_DECK] || [])
                .findIndex(c => get_unique_id_from_ennvironment(c) === targetUid);
            if (edIdx !== -1) env[SIDE.MINE][ENVIRONMENT.EXTRA_DECK].splice(edIdx, 1);
            const pos = await choosePosition(target.card?.name || 'Monster');
            const field = env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD];
            const priorities = [2, 3, 1, 4, 0];
            for (const slot of priorities) {
                if (field[slot] === CARD_TYPE.PLACEHOLDER) {
                    target.current_pos = pos;
                    field[slot] = target;
                    break;
                }
            }
        }).catch(() => {});
    }, (env) => (env[SIDE.MINE][ENVIRONMENT.EXTRA_DECK] || [])
        .some(c => c?.card?.card_type === 'MONSTER_FUSION')),

    // ════════════════════════════════════════════════════════════════════════
    // ── TOON SPELLS ─────────────────────────────────────────────────────────
    // ════════════════════════════════════════════════════════════════════════

    // Toon World (15259703) — pay 1000 LP; continuous
    15259703: continuous(
        null, // no passive effect needed — Toon World just enables Toon monsters
        payLP(1000),
        (env) => env[SIDE.MINE].hp > 1000
    ),

    // Toon Kingdom (43175858) — banish top 3 from deck; continuous
    43175858: continuous(
        null,
        (env) => {
            const deck = env[SIDE.MINE][ENVIRONMENT.DECK];
            const banished = deck.splice(0, Math.min(3, deck.length));
            env[SIDE.MINE][ENVIRONMENT.GRAVEYARD].push(...banished); // simplified: no banish zone yet
        },
        (env) => (env[SIDE.MINE][ENVIRONMENT.DECK] || []).length >= 3
    ),

    // Toon Table of Contents (89997728) — search any Toon card
    89997728: onActivate(
        searchDeck({ nameIncludes: 'toon' }, 'Toon Table of Contents — add 1 Toon card to hand'),
        (env) => (env[SIDE.MINE][ENVIRONMENT.DECK] || []).some(c => c?.card?.name?.toLowerCase().includes('toon'))
    ),

    // Toon Bookmark (91500017) — add Toon World from deck or GY to hand
    91500017: onActivate((env) => {
        const deckCopies = (env[SIDE.MINE][ENVIRONMENT.DECK]      || []).filter(c => c?.card?.key === 15259703);
        const gyCopies   = (env[SIDE.MINE][ENVIRONMENT.GRAVEYARD] || []).filter(c => c?.card?.key === 15259703);
        const pool = [...deckCopies, ...gyCopies];
        if (!pool.length) return Promise.resolve();

        return openSelector({
            type: CARD_SELECT_TYPE.CARD_SELECT_FROM_HAND,
            label: 'Toon Bookmark — add Toon World to hand',
            sourceList: pool,
        }).then(({ cardEnvs: [uid] }) => {
            for (const loc of [ENVIRONMENT.DECK, ENVIRONMENT.GRAVEYARD]) {
                const arr = env[SIDE.MINE][loc];
                const idx = arr.findIndex(c => get_unique_id_from_ennvironment(c) === uid);
                if (idx !== -1) {
                    env[SIDE.MINE][ENVIRONMENT.HAND].push(arr.splice(idx, 1)[0]);
                            return;
                }
            }
        }).catch(() => {});
    }, (env) => {
        const inDeck = (env[SIDE.MINE][ENVIRONMENT.DECK]      || []).some(c => c?.card?.key === 15259703);
        const inGY   = (env[SIDE.MINE][ENVIRONMENT.GRAVEYARD] || []).some(c => c?.card?.key === 15259703);
        return inDeck || inGY;
    }),

    // ════════════════════════════════════════════════════════════════════════
    // ── TOON MONSTERS (on-summon / field effects) ────────────────────────────
    // ════════════════════════════════════════════════════════════════════════

    // Red-Eyes Toon Dragon (31733941) — once per turn: SS 1 Toon from hand
    31733941: oncePerTurn(
        specialSummonFromHand({ nameIncludes: 'toon' }, 'Red-Eyes Toon Dragon — Special Summon 1 Toon from hand'),
        (env) => {
            const hasToonField = (env[SIDE.MINE][ENVIRONMENT.SPELL_FIELD] || [])
                .some(c => c?.card?.key === 15259703 || c?.card?.key === 43175858);
            const hasToonHand = (env[SIDE.MINE][ENVIRONMENT.HAND] || [])
                .some(c => c?.card?.name?.toLowerCase().includes('toon'));
            return hasToonField && hasToonHand;
        }
    ),

    // Toon Dark Magician (21296502) — on summon: add 1 Toon S/T from deck
    21296502: onSummon(
        searchDeck(
            { nameIncludes: 'toon', custom: (c) => !c?.card?.card_type?.startsWith('MONSTER') },
            'Toon Dark Magician — add 1 Toon Spell/Trap from Deck to hand'
        ),
        (env) => (env[SIDE.MINE][ENVIRONMENT.SPELL_FIELD] || [])
            .some(c => c?.card?.key === 15259703 || c?.card?.key === 43175858)
    ),

    // Toon Dark Magician Girl (90960358) — on summon: gains 300 ATK per DM/DMG in field+GY
    90960358: onSummon((env) => {
        const dmKeys = new Set([46986414, 70903634]);
        let count = 0;
        for (const s of [SIDE.MINE, SIDE.OPPONENT]) {
            for (const loc of [ENVIRONMENT.MONSTER_FIELD, ENVIRONMENT.GRAVEYARD]) {
                for (const c of (env[s][loc] || [])) {
                    if (c !== CARD_TYPE.PLACEHOLDER && dmKeys.has(c?.card?.key)) count++;
                }
            }
        }
        if (!count) return;
        const field = env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD];
        for (const m of field) {
            if (m?.card?.key === 90960358) {
                m.current_atk = (m.current_atk ?? m.card.atk ?? 2000) + count * 300;
                console.log(`[Toon DMG] +${count * 300} ATK → ${m.current_atk}`);
            }
        }
    }),

    // ════════════════════════════════════════════════════════════════════════
    // ── ON-SUMMON TEST CARDS ──────────────────────────────────────────────
    // ════════════════════════════════════════════════════════════════════════

    // Elemental HERO Stratos (40044918) — on summon: search 1 HERO monster from deck
    40044918: onSummon(
        searchDeck({ nameIncludes: 'HERO', type: 'MONSTER' }, 'Stratos — add 1 HERO monster to hand')
    ),

    // ════════════════════════════════════════════════════════════════════════
    // ── PASSIVE FIELD MONSTER EFFECTS ────────────────────────────────────────
    // ════════════════════════════════════════════════════════════════════════

    // Command Knight (10375182) — all Warriors (except itself) gain 200 ATK
    10375182: whileOnField(10375182, (env, side) => {
        for (const m of (env[side][ENVIRONMENT.MONSTER_FIELD] || [])) {
            if (m !== CARD_TYPE.PLACEHOLDER &&
                m?.card?.race?.toLowerCase().includes('warrior') &&
                m?.card?.key !== 10375182) {
                m.current_atk = (m.current_atk ?? m.card.atk ?? 0) + 200;
            }
        }
    }),

    // Marauding Captain (2460565) — Warriors gain 200 ATK
    2460565: whileOnField(2460565, (env, side) => {
        for (const m of (env[side][ENVIRONMENT.MONSTER_FIELD] || [])) {
            if (m !== CARD_TYPE.PLACEHOLDER &&
                m?.card?.race?.toLowerCase().includes('warrior')) {
                m.current_atk = (m.current_atk ?? m.card.atk ?? 0) + 200;
            }
        }
    }),

    // ─── FUSION MATERIALS ────────────────────────────────────────────────────
    // Elemental HERO Flame Wingman — Avian + Burstinatrix
    // Elemental HERO Tempest — Avian + Sparkman + Bubbleman (3-material)
    // Elemental HERO Wildedge — Wildheart + Bladedge
    // Dark Paladin — Dark Magician + Buster Blader
    // (handled by Polymerization / Miracle Fusion logic — no effect entry needed)

    // ════════════════════════════════════════════════════════════════════════
    // ── PENDULUM MONSTERS ────────────────────────────────────────────────
    // ════════════════════════════════════════════════════════════════════════

    // Performapal Skullcrobat Joker (40318957)
    // Monster Effect: "When this card is Normal or Special Summoned: You can add 1
    // 'Performapal', 'Odd-Eyes', or 'Magician' card from your Deck to your hand,
    // except 'Performapal Skullcrobat Joker'."
    40318957: [{
        on_summon: async (env) => {
            const deck = env[SIDE.MINE][ENVIRONMENT.DECK];
            const valid = deck.filter(c => {
                const name = c?.card?.name || '';
                return name.includes('Performapal') || name.includes('Odd-Eyes') || name.includes('Magician');
            }).filter(c => c?.card?.key !== 40318957);
            if (!valid.length) return;
            logEvent(LOG_TYPE.EFFECT, 'Skullcrobat Joker: searching for Performapal/Odd-Eyes/Magician');
            try {
                const result = await openSelector({
                    type: CARD_SELECT_TYPE.CARD_SELECT_FROM_DECK,
                    label: 'Skullcrobat Joker — add 1 Performapal/Odd-Eyes/Magician from Deck to Hand',
                    numToSelect: 1,
                    sourceList: valid,
                });
                if (!result?.cardEnvs?.length) return;
                const freshEnv = store.getState().environmentReducer.environment;
                const freshDeck = freshEnv[SIDE.MINE][ENVIRONMENT.DECK];
                for (const uid of result.cardEnvs) {
                    const idx = freshDeck.findIndex(c => get_unique_id_from_ennvironment(c) === uid);
                    if (idx !== -1) {
                        const [found] = freshDeck.splice(idx, 1);
                        freshEnv[SIDE.MINE][ENVIRONMENT.HAND].push(found);
                        logEvent(LOG_TYPE.EFFECT, `Skullcrobat Joker: added ${found.card?.name} to hand`);
                    }
                }
                dispatchEnv(freshEnv);
            } catch { /* cancelled */ }
        }
    }],

    // Performapal Pendulum Sorcerer (47075569)
    // Monster Effect: "When this card is Special Summoned: You can target up to 2
    // 'Performapal' cards in your Graveyard; add them to your hand."
    47075569: [{
        on_summon: async (env, summonType) => {
            if (summonType !== 'SPECIAL_SUMMON') return;
            const gy = env[SIDE.MINE][ENVIRONMENT.GRAVEYARD];
            const valid = gy.filter(c => c?.card?.name?.includes('Performapal'));
            if (!valid.length) {
                logEvent(LOG_TYPE.EFFECT, 'Pendulum Sorcerer: no Performapals in GY — effect cannot activate');
                return;
            }
            logEvent(LOG_TYPE.EFFECT, 'Pendulum Sorcerer: add up to 2 Performapals from GY to hand');
            try {
                const result = await openSelector({
                    type: CARD_SELECT_TYPE.CARD_SELECT_FROM_GY,
                    label: 'Pendulum Sorcerer — add up to 2 Performapals from GY to Hand',
                    numToSelect: Math.min(2, valid.length),
                    sourceList: valid,
                });
                if (!result?.cardEnvs?.length) return;
                const freshEnv = store.getState().environmentReducer.environment;
                const freshGY = freshEnv[SIDE.MINE][ENVIRONMENT.GRAVEYARD];
                for (const uid of result.cardEnvs) {
                    const idx = freshGY.findIndex(c => get_unique_id_from_ennvironment(c) === uid);
                    if (idx !== -1) {
                        const [found] = freshGY.splice(idx, 1);
                        freshEnv[SIDE.MINE][ENVIRONMENT.HAND].push(found);
                        logEvent(LOG_TYPE.EFFECT, `Pendulum Sorcerer: returned ${found.card?.name} to hand`);
                    }
                }
                dispatchEnv(freshEnv);
            } catch { /* cancelled */ }
        }
    }],

    // ════════════════════════════════════════════════════════════════════════
    // ── PREDAPLANT ────────────────────────────────────────────────────────────
    // Core mechanic: Predator Counters on opponent monsters
    //   cardEnv.predator_counter = number (stored on the cardEnv wrapper)
    // ════════════════════════════════════════════════════════════════════════

    // ── HELPER (used across effects below) ───────────────────────────────────
    // placePredatorCounter: place 1 Predator Counter on target monster
    // checkPredatorCounter: checks if a cardEnv has at least 1 counter

    // ── FUSION MATERIALS ─────────────────────────────────────────────────────
    // Starving Venom Fusion Dragon: 2 DARK monsters on field
    // Greedy Venom Fusion Dragon: 1 Predaplant + 1 DARK Level 8+
    // (Polymerization handles these generically via the existing Fusion flow)

    // ── MAIN DECK MONSTERS ───────────────────────────────────────────────────

    // Predaplant Ophrys Scorpio (approx ID from API — user will add via deck builder)
    // When NS/SS: send 1 monster from hand to GY; SS 1 Predaplant from Deck in DEF
    35272499: [{
        on_summon: async (env) => {
            const hand = env[SIDE.MINE][ENVIRONMENT.HAND];
            if (!hand.length) return;
            const deck = env[SIDE.MINE][ENVIRONMENT.DECK];
            const predaplants = deck.filter(c => c?.card?.name?.toLowerCase().includes('predaplant'));
            if (!predaplants.length) return;
            logEvent(LOG_TYPE.EFFECT, 'Ophrys Scorpio: send from hand, SS Predaplant from Deck');
            try {
                const discard = await openSelector({
                    type: CARD_SELECT_TYPE.CARD_SELECT_FROM_HAND,
                    label: 'Ophrys Scorpio — send 1 monster from hand to GY',
                    sourceList: hand.filter(c => c?.card?.card_type?.startsWith('MONSTER')),
                    numToSelect: 1,
                });
                if (!discard?.cardEnvs?.length) return;
                const freshEnv = store.getState().environmentReducer.environment;
                const h = freshEnv[SIDE.MINE][ENVIRONMENT.HAND];
                const hi = h.findIndex(c => get_unique_id_from_ennvironment(c) === discard.cardEnvs[0]);
                if (hi !== -1) freshEnv[SIDE.MINE][ENVIRONMENT.GRAVEYARD].push(h.splice(hi, 1)[0]);

                const pool = freshEnv[SIDE.MINE][ENVIRONMENT.DECK].filter(c =>
                    c?.card?.name?.toLowerCase().includes('predaplant')
                );
                if (!pool.length) { dispatchEnv(freshEnv); return; }
                const pick = await openSelector({
                    type: CARD_SELECT_TYPE.CARD_SELECT_FROM_DECK,
                    label: 'Ophrys Scorpio — SS 1 Predaplant from Deck (DEF)',
                    sourceList: pool, numToSelect: 1,
                });
                if (!pick?.cardEnvs?.length) { dispatchEnv(freshEnv); return; }
                const after = store.getState().environmentReducer.environment;
                const d = after[SIDE.MINE][ENVIRONMENT.DECK];
                const di = d.findIndex(c => get_unique_id_from_ennvironment(c) === pick.cardEnvs[0]);
                if (di !== -1) {
                    const [card] = d.splice(di, 1);
                    const field = after[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD];
                    for (const slot of [2, 3, 1, 4, 0]) {
                        if (field[slot] === CARD_TYPE.PLACEHOLDER) {
                            card.current_pos = CARD_POS.DEFENSE;
                            card.summoned_this_turn = true;
                            field[slot] = card;
                            break;
                        }
                    }
                    logEvent(LOG_TYPE.SPECIAL, `Ophrys Scorpio: SS ${card.card?.name} in DEF`);
                }
                dispatchEnv(after);
            } catch { /* cancelled */ }
        },
    }],

    // Predaplant Darlingtonia Cobra (61677004)
    // When SS by a Predaplant effect: search 1 Polymerization or Fusion Spell
    61677004: [{
        on_summon: async (env, summonType) => {
            if (summonType !== 'SPECIAL_SUMMON') return;
            const deck = env[SIDE.MINE][ENVIRONMENT.DECK];
            const valid = deck.filter(c => {
                const n = c?.card?.name?.toLowerCase() || '';
                return n.includes('polymerization') || c?.card?.card_type?.toLowerCase().includes('spell');
            });
            if (!valid.length) return;
            logEvent(LOG_TYPE.EFFECT, 'Darlingtonia Cobra: searching Polymerization/Fusion Spell');
            try {
                const result = await openSelector({
                    type: CARD_SELECT_TYPE.CARD_SELECT_FROM_DECK,
                    label: 'Darlingtonia Cobra — add 1 Polymerization or Fusion Spell to hand',
                    sourceList: deck.filter(c => {
                        const n = c?.card?.name?.toLowerCase() || '';
                        return n.includes('polymerization') || n.includes('fusion');
                    }),
                    numToSelect: 1,
                });
                if (!result?.cardEnvs?.length) return;
                const freshEnv = store.getState().environmentReducer.environment;
                const d = freshEnv[SIDE.MINE][ENVIRONMENT.DECK];
                const idx = d.findIndex(c => get_unique_id_from_ennvironment(c) === result.cardEnvs[0]);
                if (idx !== -1) {
                    freshEnv[SIDE.MINE][ENVIRONMENT.HAND].push(d.splice(idx, 1)[0]);
                    logEvent(LOG_TYPE.EFFECT, 'Darlingtonia Cobra: added Fusion Spell to hand');
                }
                dispatchEnv(freshEnv);
            } catch { /* cancelled */ }
        },
    }],

    // Predaplant Spinodionaea (52792430)
    // On NS/SS: place 1 Predator Counter on opponent's monster
    // When destroys opponent's monster with Predator Counter by battle: SS Predaplant from Deck
    52792430: [{
        on_summon: async (env) => {
            const oppField = (env[SIDE.OPPONENT][ENVIRONMENT.MONSTER_FIELD] || []).filter(c =>
                c !== CARD_TYPE.PLACEHOLDER && c?.card
            );
            if (!oppField.length) return;
            logEvent(LOG_TYPE.EFFECT, 'Spinodionaea: placing Predator Counter on opponent monster');
            try {
                const result = await openSelector({
                    type: CARD_SELECT_TYPE.CARD_SELECT_BATTLE_SELECT,
                    label: 'Spinodionaea — place 1 Predator Counter on 1 opponent monster',
                    sourceList: oppField, numToSelect: 1,
                });
                if (!result?.cardEnvs?.length) return;
                const freshEnv = store.getState().environmentReducer.environment;
                const mf = freshEnv[SIDE.OPPONENT][ENVIRONMENT.MONSTER_FIELD];
                for (const m of mf) {
                    if (m !== CARD_TYPE.PLACEHOLDER && m?.card && get_unique_id_from_ennvironment(m) === result.cardEnvs[0]) {
                        m.predator_counter = (m.predator_counter || 0) + 1;
                        logEvent(LOG_TYPE.EFFECT, `Spinodionaea: Predator Counter on ${m.card.name}`);
                        break;
                    }
                }
                dispatchEnv(freshEnv);
            } catch { /* cancelled */ }
        },
    }],

    // Predaplant Flytrap (96622984)
    // Once per turn: place 1 Predator Counter on 1 opponent face-up monster
    96622984: oncePerTurn(
        async (env) => {
            const targets = (env[SIDE.OPPONENT][ENVIRONMENT.MONSTER_FIELD] || []).filter(c =>
                c !== CARD_TYPE.PLACEHOLDER && c?.card && c.current_pos !== CARD_POS.SET
            );
            if (!targets.length) return;
            try {
                const result = await openSelector({
                    type: CARD_SELECT_TYPE.CARD_SELECT_BATTLE_SELECT,
                    label: 'Predaplant Flytrap — place 1 Predator Counter on opponent monster',
                    sourceList: targets, numToSelect: 1,
                });
                if (!result?.cardEnvs?.length) return;
                const freshEnv = store.getState().environmentReducer.environment;
                for (const m of freshEnv[SIDE.OPPONENT][ENVIRONMENT.MONSTER_FIELD]) {
                    if (m !== CARD_TYPE.PLACEHOLDER && m?.card && get_unique_id_from_ennvironment(m) === result.cardEnvs[0]) {
                        m.predator_counter = (m.predator_counter || 0) + 1;
                        logEvent(LOG_TYPE.EFFECT, `Flytrap: Predator Counter on ${m.card.name}`);
                        break;
                    }
                }
                dispatchEnv(freshEnv);
            } catch { /* cancelled */ }
        },
        (env) => {
            const onField = (env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD] || []).some(c =>
                c !== CARD_TYPE.PLACEHOLDER && c?.card?.key === 96622984
            );
            return onField && (env[SIDE.OPPONENT][ENVIRONMENT.MONSTER_FIELD] || []).some(c =>
                c !== CARD_TYPE.PLACEHOLDER && c?.card && c.current_pos !== CARD_POS.SET
            );
        }
    ),

    // Predaplant Moray Nepenthes (22011689)
    // Passive: gains 200 ATK per Predator Counter on field
    22011689: [{
        passive_effect: (env, side) => {
            const mf = env[side][ENVIRONMENT.MONSTER_FIELD];
            const isOnField = mf.some(c => c !== CARD_TYPE.PLACEHOLDER && c?.card?.key === 22011689);
            if (!isOnField) return;
            let totalCounters = 0;
            for (const s of [SIDE.MINE, SIDE.OPPONENT]) {
                for (const m of env[s][ENVIRONMENT.MONSTER_FIELD]) {
                    if (m !== CARD_TYPE.PLACEHOLDER && m?.card) totalCounters += m.predator_counter || 0;
                }
            }
            if (!totalCounters) return;
            for (const m of mf) {
                if (m !== CARD_TYPE.PLACEHOLDER && m?.card?.key === 22011689) {
                    m.current_atk = (m.current_atk ?? m.card.atk ?? 1600) + totalCounters * 200;
                }
            }
        },
    }],

    // Predaplant Byblisp (44932065)
    // On sent to GY: add 1 Predaplant from Deck to hand
    44932065: [{
        // on_summon not needed; this fires when sent to GY (triggerRegistry ON_DESTROY)
    }],

    // Predaplant Longinephila (44994712) — Tuner
    // On NS/SS: add 1 'Predap' card from Deck to hand
    44994712: [{
        on_summon: async (env) => {
            const deck = env[SIDE.MINE][ENVIRONMENT.DECK];
            const valid = deck.filter(c => c?.card?.name?.toLowerCase().startsWith('predap'));
            if (!valid.length) return;
            try {
                const result = await openSelector({
                    type: CARD_SELECT_TYPE.CARD_SELECT_FROM_DECK,
                    label: 'Predaplant Longinephila — add 1 "Predap" card from Deck to hand',
                    sourceList: valid, numToSelect: 1,
                });
                if (!result?.cardEnvs?.length) return;
                const freshEnv = store.getState().environmentReducer.environment;
                const d = freshEnv[SIDE.MINE][ENVIRONMENT.DECK];
                const idx = d.findIndex(c => get_unique_id_from_ennvironment(c) === result.cardEnvs[0]);
                if (idx !== -1) {
                    freshEnv[SIDE.MINE][ENVIRONMENT.HAND].push(d.splice(idx, 1)[0]);
                    logEvent(LOG_TYPE.EFFECT, 'Longinephila: added Predap card to hand');
                }
                dispatchEnv(freshEnv);
            } catch { /* cancelled */ }
        },
    }],

    // ── SPELL CARDS ───────────────────────────────────────────────────────────

    // Predapractice (31643613) — SS Predaplant from hand; add Predap card from Deck
    31643613: onActivate(
        async (env) => {
            const hand = env[SIDE.MINE][ENVIRONMENT.HAND];
            const predaplants = hand.filter(c => c?.card?.name?.toLowerCase().includes('predaplant'));
            if (!predaplants.length) return;
            try {
                const ss = await openSelector({
                    type: CARD_SELECT_TYPE.CARD_SELECT_FROM_HAND,
                    label: 'Predapractice — SS 1 Predaplant from hand',
                    sourceList: predaplants, numToSelect: 1,
                });
                if (!ss?.cardEnvs?.length) return;
                const freshEnv = store.getState().environmentReducer.environment;
                const h = freshEnv[SIDE.MINE][ENVIRONMENT.HAND];
                const hi = h.findIndex(c => get_unique_id_from_ennvironment(c) === ss.cardEnvs[0]);
                if (hi !== -1) {
                    const [card] = h.splice(hi, 1);
                    const field = freshEnv[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD];
                    for (const slot of [2, 3, 1, 4, 0]) {
                        if (field[slot] === CARD_TYPE.PLACEHOLDER) {
                            card.current_pos = CARD_POS.FACE;
                            card.summoned_this_turn = true;
                            field[slot] = card;
                            break;
                        }
                    }
                    logEvent(LOG_TYPE.SPECIAL, `Predapractice: SS ${card.card?.name}`);
                }
                // Add Predap card from Deck
                const deck = freshEnv[SIDE.MINE][ENVIRONMENT.DECK];
                const predapPool = deck.filter(c => c?.card?.name?.toLowerCase().startsWith('predap'));
                if (!predapPool.length) { dispatchEnv(freshEnv); return; }
                const addResult = await openSelector({
                    type: CARD_SELECT_TYPE.CARD_SELECT_FROM_DECK,
                    label: 'Predapractice — add 1 "Predap" card from Deck to hand',
                    sourceList: predapPool, numToSelect: 1,
                });
                if (!addResult?.cardEnvs?.length) { dispatchEnv(freshEnv); return; }
                const after = store.getState().environmentReducer.environment;
                const d = after[SIDE.MINE][ENVIRONMENT.DECK];
                const di = d.findIndex(c => get_unique_id_from_ennvironment(c) === addResult.cardEnvs[0]);
                if (di !== -1) {
                    after[SIDE.MINE][ENVIRONMENT.HAND].push(d.splice(di, 1)[0]);
                    logEvent(LOG_TYPE.EFFECT, 'Predapractice: added Predap card to hand');
                }
                dispatchEnv(after);
            } catch { /* cancelled */ }
        },
        (env) => (env[SIDE.MINE][ENVIRONMENT.HAND] || []).some(c =>
            c?.card?.name?.toLowerCase().includes('predaplant')
        )
    ),

    // Predaprimitive (89176044) — mill 1 Predap from Deck to GY; add 1 Predaplant from Deck to hand
    89176044: onActivate(
        async (env) => {
            const deck = env[SIDE.MINE][ENVIRONMENT.DECK];
            const predapCards = deck.filter(c =>
                c?.card?.name?.toLowerCase().startsWith('predap') && c.card.key !== 89176044
            );
            const predaplantCards = deck.filter(c => c?.card?.name?.toLowerCase().includes('predaplant'));
            if (!predapCards.length && !predaplantCards.length) return;
            try {
                // Step 1: mill a Predap card
                if (predapCards.length) {
                    const millResult = await openSelector({
                        type: CARD_SELECT_TYPE.CARD_SELECT_FROM_DECK,
                        label: 'Predaprimitive — send 1 "Predap" card from Deck to GY',
                        sourceList: predapCards, numToSelect: 1,
                    });
                    if (!millResult?.cardEnvs?.length) return;
                    const freshEnv = store.getState().environmentReducer.environment;
                    const d = freshEnv[SIDE.MINE][ENVIRONMENT.DECK];
                    const idx = d.findIndex(c => get_unique_id_from_ennvironment(c) === millResult.cardEnvs[0]);
                    if (idx !== -1) freshEnv[SIDE.MINE][ENVIRONMENT.GRAVEYARD].push(d.splice(idx, 1)[0]);
                    dispatchEnv(freshEnv);
                }
                // Step 2: add Predaplant from Deck
                const after = store.getState().environmentReducer.environment;
                const pool = after[SIDE.MINE][ENVIRONMENT.DECK].filter(c =>
                    c?.card?.name?.toLowerCase().includes('predaplant')
                );
                if (!pool.length) return;
                const addResult = await openSelector({
                    type: CARD_SELECT_TYPE.CARD_SELECT_FROM_DECK,
                    label: 'Predaprimitive — add 1 Predaplant monster from Deck to hand',
                    sourceList: pool, numToSelect: 1,
                });
                if (!addResult?.cardEnvs?.length) return;
                const fresh2 = store.getState().environmentReducer.environment;
                const d2 = fresh2[SIDE.MINE][ENVIRONMENT.DECK];
                const di = d2.findIndex(c => get_unique_id_from_ennvironment(c) === addResult.cardEnvs[0]);
                if (di !== -1) {
                    fresh2[SIDE.MINE][ENVIRONMENT.HAND].push(d2.splice(di, 1)[0]);
                    logEvent(LOG_TYPE.EFFECT, 'Predaprimitive: added Predaplant to hand');
                }
                dispatchEnv(fresh2);
            } catch { /* cancelled */ }
        },
        (env) => (env[SIDE.MINE][ENVIRONMENT.DECK] || []).some(c =>
            c?.card?.name?.toLowerCase().startsWith('predap') && c.card.key !== 89176044
        )
    ),

    // Predaplast (72129804) — reveal Predap cards in hand; banish that many opponent face-up S/T
    72129804: onActivate(
        async (env) => {
            const hand = env[SIDE.MINE][ENVIRONMENT.HAND];
            const predapHand = hand.filter(c => c?.card?.name?.toLowerCase().startsWith('predap'));
            if (!predapHand.length) return;
            const oppST = (env[SIDE.OPPONENT][ENVIRONMENT.SPELL_FIELD] || []).filter(c => c?.card);
            if (!oppST.length) return;
            try {
                const reveal = await openSelector({
                    type: CARD_SELECT_TYPE.CARD_SELECT_FROM_HAND,
                    label: `Predaplast — reveal "Predap" cards (may banish up to that many opponent S/T)`,
                    sourceList: predapHand,
                    numToSelect: Math.min(predapHand.length, oppST.length),
                });
                if (!reveal?.cardEnvs?.length) return;
                const count = reveal.cardEnvs.length;
                const freshEnv = store.getState().environmentReducer.environment;
                const targets = (freshEnv[SIDE.OPPONENT][ENVIRONMENT.SPELL_FIELD] || []).filter(c => c?.card);
                for (let i = 0; i < Math.min(count, targets.length); i++) {
                    const sf = freshEnv[SIDE.OPPONENT][ENVIRONMENT.SPELL_FIELD];
                    const idx = sf.indexOf(targets[i]);
                    if (idx !== -1) { sf[idx] = CARD_TYPE.PLACEHOLDER; /* banished */ }
                }
                logEvent(LOG_TYPE.EFFECT, `Predaplast: banished ${Math.min(count, targets.length)} opponent S/T`);
                dispatchEnv(freshEnv);
            } catch { /* cancelled */ }
        },
        (env) => {
            const hasReveal = (env[SIDE.MINE][ENVIRONMENT.HAND] || []).some(c =>
                c?.card?.name?.toLowerCase().startsWith('predap')
            );
            return hasReveal && (env[SIDE.OPPONENT][ENVIRONMENT.SPELL_FIELD] || []).some(c => c?.card);
        }
    ),

    // Predaprime Fusion (8148322) — Quick-Play: Fusion Summon DARK Fusion using hand/field/GY/banished
    // Simplified: works like Polymerization for DARK Fusion monsters
    8148322: onActivate(
        async (env) => {
            const extra = (env[SIDE.MINE][ENVIRONMENT.EXTRA_DECK] || []).filter(c =>
                c?.card?.card_type === 'MONSTER_FUSION' && c?.card?.attribute === 'DARK'
            );
            if (!extra.length) return;
            try {
                const { cardEnvs: [targetUid] } = await openSelector({
                    type: CARD_SELECT_TYPE.CARD_SELECT_SPECIAL_SUMMON_TARGET,
                    label: 'Predaprime Fusion — select DARK Fusion Monster to summon',
                });
                const target = extra.find(c => get_unique_id_from_ennvironment(c) === targetUid);
                if (!target) return;

                // Use field + GY as material pool
                const fieldPool = (env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD] || []).filter(c =>
                    c !== CARD_TYPE.PLACEHOLDER && c?.card
                );
                const gyPool = (env[SIDE.MINE][ENVIRONMENT.GRAVEYARD] || []).filter(c =>
                    c?.card?.card_type?.startsWith('MONSTER')
                );
                const handPool = (env[SIDE.MINE][ENVIRONMENT.HAND] || []).filter(c =>
                    c?.card?.card_type?.startsWith('MONSTER')
                );
                const needed = target.card.fusion_materials?.length || 2;
                const allPool = [...fieldPool, ...gyPool, ...handPool];
                if (allPool.length < needed) return;

                const { cardEnvs: matIds } = await openSelector({
                    type: CARD_SELECT_TYPE.CARD_SELECT_FROM_HAND,
                    label: `Predaprime Fusion — select ${needed} materials (hand/field/GY)`,
                    sourceList: allPool, numToSelect: needed,
                });
                if (!matIds || matIds.length < needed) return;

                const freshEnv = store.getState().environmentReducer.environment;
                // Remove materials from their locations
                for (const uid of matIds) {
                    for (const loc of [ENVIRONMENT.MONSTER_FIELD, ENVIRONMENT.HAND, ENVIRONMENT.GRAVEYARD]) {
                        const arr = freshEnv[SIDE.MINE][loc];
                        const idx = arr.findIndex(c => c !== CARD_TYPE.PLACEHOLDER && c?.card &&
                            get_unique_id_from_ennvironment(c) === uid);
                        if (idx !== -1) {
                            const [mat] = loc === ENVIRONMENT.MONSTER_FIELD
                                ? (() => { const m = arr[idx]; arr[idx] = CARD_TYPE.PLACEHOLDER; return [m]; })()
                                : arr.splice(idx, 1);
                            freshEnv[SIDE.MINE][ENVIRONMENT.GRAVEYARD].push(mat);
                            break;
                        }
                    }
                }
                // Remove target from Extra Deck and place on field
                const ed = freshEnv[SIDE.MINE][ENVIRONMENT.EXTRA_DECK];
                const ei = ed.findIndex(c => get_unique_id_from_ennvironment(c) === targetUid);
                if (ei !== -1) ed.splice(ei, 1);
                const { choosePosition } = require('./positionChooser');
                const pos = await choosePosition(target.card?.name || 'Monster');
                target.current_pos = pos;
                target.summoned_this_turn = true;
                const field = freshEnv[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD];
                for (const slot of [2, 3, 1, 4, 0]) {
                    if (field[slot] === CARD_TYPE.PLACEHOLDER) { field[slot] = target; break; }
                }
                logEvent(LOG_TYPE.SPECIAL, `Predaprime Fusion: Fusion Summoned ${target.card?.name}`);
                dispatchEnv(freshEnv);
            } catch { /* cancelled */ }
        },
        (env) => (env[SIDE.MINE][ENVIRONMENT.EXTRA_DECK] || []).some(c =>
            c?.card?.card_type === 'MONSTER_FUSION' && c?.card?.attribute === 'DARK'
        )
    ),

    // Predapruning (14463695) — Equip Spell: SS target Predaplant from GY
    14463695: onActivate(
        async (env) => {
            const gy = env[SIDE.MINE][ENVIRONMENT.GRAVEYARD];
            const valid = gy.filter(c => c?.card?.name?.toLowerCase().includes('predaplant'));
            if (!valid.length) return;
            try {
                const result = await openSelector({
                    type: CARD_SELECT_TYPE.CARD_SELECT_FROM_HAND,
                    label: 'Predapruning — SS 1 Predaplant from GY',
                    sourceList: valid, numToSelect: 1,
                });
                if (!result?.cardEnvs?.length) return;
                const freshEnv = store.getState().environmentReducer.environment;
                const g = freshEnv[SIDE.MINE][ENVIRONMENT.GRAVEYARD];
                const idx = g.findIndex(c => get_unique_id_from_ennvironment(c) === result.cardEnvs[0]);
                if (idx !== -1) {
                    const [card] = g.splice(idx, 1);
                    const field = freshEnv[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD];
                    for (const slot of [2, 3, 1, 4, 0]) {
                        if (field[slot] === CARD_TYPE.PLACEHOLDER) {
                            card.current_pos = CARD_POS.FACE;
                            card.summoned_this_turn = true;
                            field[slot] = card;
                            break;
                        }
                    }
                    logEvent(LOG_TYPE.SPECIAL, `Predapruning: SS ${card.card?.name} from GY`);
                }
                dispatchEnv(freshEnv);
            } catch { /* cancelled */ }
        },
        (env) => (env[SIDE.MINE][ENVIRONMENT.GRAVEYARD] || []).some(c =>
            c?.card?.name?.toLowerCase().includes('predaplant')
        )
    ),

    // Predaponics (88069597) — Continuous: once per turn SS Lv4 or lower Predaplant (pay 1000 LP)
    88069597: [{
        condition: (_env) => false, target: null, operation: (_env) => {}, is_continuous: true,
        once_per_turn: true,
        field_activate: async (env, cardEnv) => {
            if ((env[SIDE.MINE].hp || 0) <= 1000) {
                logEvent(LOG_TYPE.EFFECT, 'Predaponics: not enough LP (need >1000)');
                return;
            }
            const deck = env[SIDE.MINE][ENVIRONMENT.DECK];
            const valid = deck.filter(c =>
                c?.card?.name?.toLowerCase().includes('predaplant') && (c.card.level || 0) <= 4
            );
            if (!valid.length) return;
            try {
                const result = await openSelector({
                    type: CARD_SELECT_TYPE.CARD_SELECT_FROM_DECK,
                    label: 'Predaponics — SS 1 Level 4 or lower Predaplant from Deck (DEF, pay 1000 LP)',
                    sourceList: valid, numToSelect: 1,
                });
                if (!result?.cardEnvs?.length) return;
                const freshEnv = store.getState().environmentReducer.environment;
                freshEnv[SIDE.MINE].hp = Math.max(0, freshEnv[SIDE.MINE].hp - 1000);
                const d = freshEnv[SIDE.MINE][ENVIRONMENT.DECK];
                const idx = d.findIndex(c => get_unique_id_from_ennvironment(c) === result.cardEnvs[0]);
                if (idx !== -1) {
                    const [card] = d.splice(idx, 1);
                    const field = freshEnv[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD];
                    for (const slot of [2, 3, 1, 4, 0]) {
                        if (field[slot] === CARD_TYPE.PLACEHOLDER) {
                            card.current_pos = CARD_POS.DEFENSE;
                            card.summoned_this_turn = true;
                            field[slot] = card;
                            break;
                        }
                    }
                    logEvent(LOG_TYPE.SPECIAL, `Predaponics: SS ${card.card?.name} in DEF`);
                }
                dispatchEnv(freshEnv);
            } catch { /* cancelled */ }
        },
    }],

    // ── TRAP CARDS ────────────────────────────────────────────────────────────

    // Predaplanning (44536921) — mill Predaplant; place Predator Counter on all field monsters
    44536921: [{
        condition: (env) => (env[SIDE.MINE][ENVIRONMENT.DECK] || []).some(c =>
            c?.card?.name?.toLowerCase().includes('predaplant')
        ),
        operation: async (env) => {
            const deck = env[SIDE.MINE][ENVIRONMENT.DECK];
            const valid = deck.filter(c => c?.card?.name?.toLowerCase().includes('predaplant'));
            try {
                const mill = await openSelector({
                    type: CARD_SELECT_TYPE.CARD_SELECT_FROM_DECK,
                    label: 'Predaplanning — send 1 Predaplant from Deck to GY',
                    sourceList: valid, numToSelect: 1,
                });
                if (!mill?.cardEnvs?.length) return;
                const freshEnv = store.getState().environmentReducer.environment;
                const d = freshEnv[SIDE.MINE][ENVIRONMENT.DECK];
                const idx = d.findIndex(c => get_unique_id_from_ennvironment(c) === mill.cardEnvs[0]);
                if (idx !== -1) freshEnv[SIDE.MINE][ENVIRONMENT.GRAVEYARD].push(d.splice(idx, 1)[0]);
                // Place Predator Counter on all face-up monsters
                for (const s of [SIDE.MINE, SIDE.OPPONENT]) {
                    for (const m of freshEnv[s][ENVIRONMENT.MONSTER_FIELD]) {
                        if (m !== CARD_TYPE.PLACEHOLDER && m?.card && m.current_pos !== CARD_POS.SET) {
                            m.predator_counter = (m.predator_counter || 0) + 1;
                        }
                    }
                }
                logEvent(LOG_TYPE.EFFECT, 'Predaplanning: placed Predator Counters on all face-up monsters');
                dispatchEnv(freshEnv);
            } catch { /* cancelled */ }
        },
    }],

    // Apex Predation (25573115) — destroy all SS monsters if you control a Normal Summoned monster
    25573115: [{
        condition: (env) => (env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD] || []).some(c =>
            c !== CARD_TYPE.PLACEHOLDER && c?.card
        ),
        operation: (env) => {
            const toDestroy = [];
            for (const s of [SIDE.MINE, SIDE.OPPONENT]) {
                const mf = env[s][ENVIRONMENT.MONSTER_FIELD];
                for (let i = 0; i < mf.length; i++) {
                    if (mf[i] !== CARD_TYPE.PLACEHOLDER && mf[i]?.card) {
                        env[s][ENVIRONMENT.GRAVEYARD].push(mf[i]);
                        mf[i] = CARD_TYPE.PLACEHOLDER;
                        toDestroy.push(mf[i]);
                    }
                }
            }
            logEvent(LOG_TYPE.EFFECT, `Apex Predation: destroyed ${toDestroy.length} Special Summoned monsters`);
            dispatchEnv(env);
        },
    }],

    // ── EXTRA DECK ────────────────────────────────────────────────────────────

    // Predaplant Chimerafflesia (25586143) — Fusion Level 7
    // Once per turn: target 1 monster (level ≤ this card's level); banish it + discard 1
    25586143: oncePerTurn(
        async (env) => {
            const oppField = (env[SIDE.OPPONENT][ENVIRONMENT.MONSTER_FIELD] || []).filter(c =>
                c !== CARD_TYPE.PLACEHOLDER && c?.card && (c.card.level || 0) <= 7
            );
            if (!oppField.length) return;
            try {
                const target = await openSelector({
                    type: CARD_SELECT_TYPE.CARD_SELECT_BATTLE_SELECT,
                    label: 'Chimerafflesia — banish 1 monster (Lv ≤ 7) + discard 1 from hand',
                    sourceList: oppField, numToSelect: 1,
                });
                if (!target?.cardEnvs?.length) return;
                const freshEnv = store.getState().environmentReducer.environment;
                const mf = freshEnv[SIDE.OPPONENT][ENVIRONMENT.MONSTER_FIELD];
                for (let i = 0; i < mf.length; i++) {
                    if (mf[i] !== CARD_TYPE.PLACEHOLDER && mf[i]?.card &&
                        get_unique_id_from_ennvironment(mf[i]) === target.cardEnvs[0]) {
                        mf[i] = CARD_TYPE.PLACEHOLDER; // banish (simplified: remove)
                        logEvent(LOG_TYPE.EFFECT, 'Chimerafflesia: banished a monster');
                        break;
                    }
                }
                // Discard 1 from hand
                const hand = freshEnv[SIDE.MINE][ENVIRONMENT.HAND];
                if (hand.length) {
                    const discard = await openSelector({
                        type: CARD_SELECT_TYPE.CARD_SELECT_FROM_HAND,
                        label: 'Chimerafflesia — discard 1 card',
                        sourceList: hand, numToSelect: 1,
                    });
                    if (discard?.cardEnvs?.length) {
                        const after = store.getState().environmentReducer.environment;
                        const h = after[SIDE.MINE][ENVIRONMENT.HAND];
                        const hi = h.findIndex(c => get_unique_id_from_ennvironment(c) === discard.cardEnvs[0]);
                        if (hi !== -1) after[SIDE.MINE][ENVIRONMENT.GRAVEYARD].push(h.splice(hi, 1)[0]);
                        dispatchEnv(after);
                        return;
                    }
                }
                dispatchEnv(freshEnv);
            } catch { /* cancelled */ }
        },
        (env) => (env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD] || []).some(c =>
            c !== CARD_TYPE.PLACEHOLDER && c?.card?.key === 25586143
        ) && (env[SIDE.OPPONENT][ENVIRONMENT.MONSTER_FIELD] || []).some(c =>
            c !== CARD_TYPE.PLACEHOLDER && c?.card && (c.card.level || 0) <= 7
        )
    ),

    // Predaplant Dragostapelia (69946549) — Fusion Level 8
    // Once per turn (Quick Effect): place 1 Predator Counter on opponent monster
    69946549: oncePerTurn(
        async (env) => {
            const targets = (env[SIDE.OPPONENT][ENVIRONMENT.MONSTER_FIELD] || []).filter(c =>
                c !== CARD_TYPE.PLACEHOLDER && c?.card && c.current_pos !== CARD_POS.SET
            );
            if (!targets.length) return;
            try {
                const result = await openSelector({
                    type: CARD_SELECT_TYPE.CARD_SELECT_BATTLE_SELECT,
                    label: 'Predaplant Dragostapelia — place 1 Predator Counter on 1 opponent monster',
                    sourceList: targets, numToSelect: 1,
                });
                if (!result?.cardEnvs?.length) return;
                const freshEnv = store.getState().environmentReducer.environment;
                for (const m of freshEnv[SIDE.OPPONENT][ENVIRONMENT.MONSTER_FIELD]) {
                    if (m !== CARD_TYPE.PLACEHOLDER && m?.card && get_unique_id_from_ennvironment(m) === result.cardEnvs[0]) {
                        m.predator_counter = (m.predator_counter || 0) + 1;
                        logEvent(LOG_TYPE.EFFECT, `Dragostapelia: Predator Counter on ${m.card.name}`);
                        break;
                    }
                }
                dispatchEnv(freshEnv);
            } catch { /* cancelled */ }
        },
        (env) => (env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD] || []).some(c =>
            c !== CARD_TYPE.PLACEHOLDER && c?.card?.key === 69946549
        ) && (env[SIDE.OPPONENT][ENVIRONMENT.MONSTER_FIELD] || []).some(c =>
            c !== CARD_TYPE.PLACEHOLDER && c?.card
        )
    ),

    // Predaplant Triphyoverutum (79864860) — Fusion Level 9
    // Passive: gains ATK equal to total ATK of opponent monsters with Predator Counters
    79864860: [{
        passive_effect: (env, side) => {
            const mf = env[side][ENVIRONMENT.MONSTER_FIELD];
            const isOnField = mf.some(c => c !== CARD_TYPE.PLACEHOLDER && c?.card?.key === 79864860);
            if (!isOnField) return;
            let boost = 0;
            for (const m of env[SIDE.OPPONENT][ENVIRONMENT.MONSTER_FIELD]) {
                if (m !== CARD_TYPE.PLACEHOLDER && m?.card && (m.predator_counter || 0) > 0) {
                    boost += m.card.atk || 0;
                }
            }
            if (!boost) return;
            for (const m of mf) {
                if (m !== CARD_TYPE.PLACEHOLDER && m?.card?.key === 79864860) {
                    m.current_atk = (m.current_atk ?? m.card.atk ?? 3000) + boost;
                }
            }
        },
    }],

    // Predaplant Ambulomelides (66309175) — Fusion Level 5
    // On Fusion Summon: add 1 Predaplant or Predap Spell/Trap from Deck/GY to hand
    66309175: [{
        on_summon: async (env, summonType) => {
            if (summonType !== 'SPECIAL_SUMMON') return;
            const deck = env[SIDE.MINE][ENVIRONMENT.DECK];
            const gy   = env[SIDE.MINE][ENVIRONMENT.GRAVEYARD];
            const deckPool = deck.filter(c => c?.card?.name?.toLowerCase().startsWith('predap'));
            const gyPool   = gy.filter(c => c?.card?.name?.toLowerCase().startsWith('predap'));
            const pool = [...deckPool, ...gyPool];
            if (!pool.length) return;
            try {
                const result = await openSelector({
                    type: CARD_SELECT_TYPE.CARD_SELECT_FROM_DECK,
                    label: 'Ambulomelides — add 1 Predaplant or Predap S/T from Deck/GY to hand',
                    sourceList: pool, numToSelect: 1,
                });
                if (!result?.cardEnvs?.length) return;
                const freshEnv = store.getState().environmentReducer.environment;
                for (const loc of [ENVIRONMENT.DECK, ENVIRONMENT.GRAVEYARD]) {
                    const arr = freshEnv[SIDE.MINE][loc];
                    const idx = arr.findIndex(c => get_unique_id_from_ennvironment(c) === result.cardEnvs[0]);
                    if (idx !== -1) {
                        freshEnv[SIDE.MINE][ENVIRONMENT.HAND].push(arr.splice(idx, 1)[0]);
                        logEvent(LOG_TYPE.EFFECT, 'Ambulomelides: added card to hand');
                        dispatchEnv(freshEnv);
                        return;
                    }
                }
            } catch { /* cancelled */ }
        },
    }],

    // Starving Venom Fusion Dragon (41209827) — Fusion Level 8
    // On Fusion Summon: gains ATK equal to 1 opponent's SS monster until end of turn
    // On destroy: destroy all opponent's SS monsters
    41209827: [{
        on_summon: (env, summonType) => {
            if (summonType !== 'SPECIAL_SUMMON') return;
            const oppMonsters = (env[SIDE.OPPONENT][ENVIRONMENT.MONSTER_FIELD] || []).filter(c =>
                c !== CARD_TYPE.PLACEHOLDER && c?.card
            );
            if (!oppMonsters.length) return;
            // Gain ATK equal to highest ATK opponent monster
            const maxAtk = Math.max(...oppMonsters.map(c => c.current_atk ?? c.card.atk ?? 0));
            const mf = env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD];
            for (const m of mf) {
                if (m !== CARD_TYPE.PLACEHOLDER && m?.card?.key === 41209827) {
                    m.current_atk = (m.current_atk ?? m.card.atk ?? 2800) + maxAtk;
                    logEvent(LOG_TYPE.EFFECT, `Starving Venom: gains ${maxAtk} ATK (total ${m.current_atk})`);
                    break;
                }
            }
            dispatchEnv(env);
        },
    }],

    // Greedy Venom Fusion Dragon (51570882) — Fusion Level 10
    // Once per turn: target face-up monster → ATK becomes 0, negate effects
    // On destroy: wipe field + SS self from GY
    51570882: oncePerTurn(
        async (env) => {
            const allFaceUp = [
                ...(env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD]     || []),
                ...(env[SIDE.OPPONENT][ENVIRONMENT.MONSTER_FIELD] || []),
            ].filter(c => c !== CARD_TYPE.PLACEHOLDER && c?.card && c.current_pos === CARD_POS.FACE);
            if (!allFaceUp.length) return;
            try {
                const result = await openSelector({
                    type: CARD_SELECT_TYPE.CARD_SELECT_BATTLE_SELECT,
                    label: 'Greedy Venom — target 1 face-up monster: ATK → 0, negate effects',
                    sourceList: allFaceUp, numToSelect: 1,
                });
                if (!result?.cardEnvs?.length) return;
                const freshEnv = store.getState().environmentReducer.environment;
                for (const s of [SIDE.MINE, SIDE.OPPONENT]) {
                    for (const m of freshEnv[s][ENVIRONMENT.MONSTER_FIELD]) {
                        if (m !== CARD_TYPE.PLACEHOLDER && m?.card && get_unique_id_from_ennvironment(m) === result.cardEnvs[0]) {
                            m.current_atk = 0;
                            m.effects_negated = true;
                            logEvent(LOG_TYPE.EFFECT, `Greedy Venom: ${m.card.name} ATK 0, effects negated`);
                            break;
                        }
                    }
                }
                dispatchEnv(freshEnv);
            } catch { /* cancelled */ }
        },
        (env) => (env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD] || []).some(c =>
            c !== CARD_TYPE.PLACEHOLDER && c?.card?.key === 51570882
        ) && [...(env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD]||[]), ...(env[SIDE.OPPONENT][ENVIRONMENT.MONSTER_FIELD]||[])].some(c =>
            c !== CARD_TYPE.PLACEHOLDER && c?.card && c.current_pos === CARD_POS.FACE
        )
    ),

    // ════════════════════════════════════════════════════════════════════════
    // ── SIX SAMURAI EXTRA DECK ───────────────────────────────────────────────
    // ════════════════════════════════════════════════════════════════════════

    // Shadow of the Six Samurai - Shien (1828513) — XYZ Rank 4
    // Once per turn: detach 1 material, target Six Samurai with <2000 ATK; its original ATK becomes 2000
    1828513: oncePerTurn(
        async (env, side = SIDE.MINE) => {
            const mf = env[side][ENVIRONMENT.MONSTER_FIELD];
            const shien = mf.find(c => c !== CARD_TYPE.PLACEHOLDER && c?.card?.key === 1828513);
            if (!shien?.xyz_materials?.length) return;
            const targets = mf.filter(c =>
                c !== CARD_TYPE.PLACEHOLDER && c?.card?.name?.toLowerCase().includes('samurai') &&
                (c.current_atk ?? c.card.atk ?? 0) < 2000
            );
            if (!targets.length) return;
            try {
                const result = await openSelector({
                    type: CARD_SELECT_TYPE.CARD_SELECT_FROM_HAND,
                    label: 'Shadow of Shien — target Six Samurai with less than 2000 ATK',
                    sourceList: targets, numToSelect: 1,
                });
                if (!result?.cardEnvs?.length) return;
                const freshEnv = store.getState().environmentReducer.environment;
                const s = freshEnv[side][ENVIRONMENT.MONSTER_FIELD].find(c =>
                    c !== CARD_TYPE.PLACEHOLDER && c?.card && get_unique_id_from_ennvironment(c) === result.cardEnvs[0]
                );
                const shienFresh = freshEnv[side][ENVIRONMENT.MONSTER_FIELD].find(c =>
                    c !== CARD_TYPE.PLACEHOLDER && c?.card?.key === 1828513
                );
                if (s && shienFresh?.xyz_materials?.length) {
                    shienFresh.xyz_materials.splice(0, 1); // detach
                    s.current_atk = 2000;
                    logEvent(LOG_TYPE.EFFECT, `Shadow of Shien: ${s.card.name} ATK set to 2000`);
                }
                dispatchEnv(freshEnv);
            } catch { /* cancelled */ }
        },
        (env) => {
            const mf = env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD] || [];
            const shien = mf.find(c => c !== CARD_TYPE.PLACEHOLDER && c?.card?.key === 1828513);
            return !!(shien?.xyz_materials?.length) &&
                mf.some(c => c !== CARD_TYPE.PLACEHOLDER && c?.card?.name?.toLowerCase().includes('samurai') && (c.current_atk ?? c.card.atk ?? 0) < 2000);
        }
    ),

    // Legendary Six Samurai - Shi En (29981921) — Synchro Level 5
    // Once per turn (simplified Quick Effect): destroy 1 opponent face-up Spell/Trap
    // Full Quick Effect negate fires during opponent's activation — implemented as manual activation
    29981921: oncePerTurn(
        async (env, side = SIDE.MINE) => {
            const oppST = (env[SIDE.OPPONENT][ENVIRONMENT.SPELL_FIELD] || []).filter(c => c?.card);
            if (!oppST.length) return;
            try {
                const result = await openSelector({
                    type: CARD_SELECT_TYPE.CARD_SELECT_FROM_HAND,
                    label: 'Legendary Shi En — negate & destroy 1 opponent Spell/Trap',
                    sourceList: oppST, numToSelect: 1,
                });
                if (!result?.cardEnvs?.length) return;
                const freshEnv = store.getState().environmentReducer.environment;
                const sf = freshEnv[SIDE.OPPONENT][ENVIRONMENT.SPELL_FIELD];
                for (let i = 0; i < sf.length; i++) {
                    if (sf[i]?.card && get_unique_id_from_ennvironment(sf[i]) === result.cardEnvs[0]) {
                        freshEnv[SIDE.OPPONENT][ENVIRONMENT.GRAVEYARD].push(sf[i]);
                        sf[i] = CARD_TYPE.PLACEHOLDER;
                        logEvent(LOG_TYPE.EFFECT, 'Legendary Shi En: negated and destroyed a Spell/Trap');
                        break;
                    }
                }
                dispatchEnv(freshEnv);
            } catch { /* cancelled */ }
        },
        (env) => {
            const onField = (env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD] || []).some(c =>
                c !== CARD_TYPE.PLACEHOLDER && c?.card?.key === 29981921
            );
            return onField && (env[SIDE.OPPONENT][ENVIRONMENT.SPELL_FIELD] || []).some(c => c?.card);
        }
    ),

    // Legendary Lord Six Samurai - Shi En (34235530) — Synchro Level 6
    // On Synchro Summon: add 1 Six Samurai or Shien from Deck or GY to hand
    // Once per turn: negate & destroy 1 opponent face-up monster effect (simplified: destroy it)
    34235530: [{
        on_summon: async (env) => {
            const deck = env[SIDE.MINE][ENVIRONMENT.DECK];
            const gy   = env[SIDE.MINE][ENVIRONMENT.GRAVEYARD];
            const deckPool = deck.filter(c => {
                const n = c?.card?.name?.toLowerCase() || '';
                return n.includes('samurai') || n.includes('shien');
            });
            const gyPool = gy.filter(c => {
                const n = c?.card?.name?.toLowerCase() || '';
                return n.includes('samurai') || n.includes('shien');
            });
            const pool = [...deckPool, ...gyPool];
            if (!pool.length) return;
            logEvent(LOG_TYPE.EFFECT, 'Legendary Lord Shi En: searching for Six Samurai/Shien');
            try {
                const result = await openSelector({
                    type: CARD_SELECT_TYPE.CARD_SELECT_FROM_DECK,
                    label: 'Legendary Lord Shi En — add 1 Six Samurai or Shien from Deck/GY to hand',
                    sourceList: pool, numToSelect: 1,
                });
                if (!result?.cardEnvs?.length) return;
                const freshEnv = store.getState().environmentReducer.environment;
                for (const loc of [ENVIRONMENT.DECK, ENVIRONMENT.GRAVEYARD]) {
                    const arr = freshEnv[SIDE.MINE][loc];
                    const idx = arr.findIndex(c => get_unique_id_from_ennvironment(c) === result.cardEnvs[0]);
                    if (idx !== -1) {
                        freshEnv[SIDE.MINE][ENVIRONMENT.HAND].push(arr.splice(idx, 1)[0]);
                        logEvent(LOG_TYPE.EFFECT, 'Legendary Lord Shi En: added a card to hand');
                        dispatchEnv(freshEnv);
                        return;
                    }
                }
            } catch { /* cancelled */ }
        },
    }, {
        once_per_turn: true,
        condition: (env) => {
            const onField = (env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD] || []).some(c =>
                c !== CARD_TYPE.PLACEHOLDER && c?.card?.key === 34235530
            );
            return onField && (env[SIDE.OPPONENT][ENVIRONMENT.MONSTER_FIELD] || []).some(c =>
                c !== CARD_TYPE.PLACEHOLDER && c?.card
            );
        },
        operation: async (env) => {
            const targets = (env[SIDE.OPPONENT][ENVIRONMENT.MONSTER_FIELD] || []).filter(c =>
                c !== CARD_TYPE.PLACEHOLDER && c?.card
            );
            try {
                const result = await openSelector({
                    type: CARD_SELECT_TYPE.CARD_SELECT_BATTLE_SELECT,
                    label: 'Legendary Lord Shi En — negate & destroy 1 opponent monster',
                    sourceList: targets, numToSelect: 1,
                });
                if (!result?.cardEnvs?.length) return;
                const freshEnv = store.getState().environmentReducer.environment;
                const mf = freshEnv[SIDE.OPPONENT][ENVIRONMENT.MONSTER_FIELD];
                for (let i = 0; i < mf.length; i++) {
                    if (mf[i] !== CARD_TYPE.PLACEHOLDER && mf[i]?.card &&
                        get_unique_id_from_ennvironment(mf[i]) === result.cardEnvs[0]) {
                        freshEnv[SIDE.OPPONENT][ENVIRONMENT.GRAVEYARD].push(mf[i]);
                        mf[i] = CARD_TYPE.PLACEHOLDER;
                        logEvent(LOG_TYPE.EFFECT, 'Legendary Lord Shi En: negated a monster effect');
                        break;
                    }
                }
                dispatchEnv(freshEnv);
            } catch { /* cancelled */ }
        },
    }],

    // Legendary Lord Six Samurai - Enishi (70634245) — Synchro Level 6
    // Passive: Warriors +500 ATK/DEF (approximated as always-on)
    // On Synchro Summon: banish X Six Samurai from GY → bounce X opponent monsters to hand
    // On sent to GY: SS Six Samurai (handled in triggerRegistry ON_DESTROY)
    70634245: [{
        passive_effect: (env, side) => {
            const mf = env[side][ENVIRONMENT.MONSTER_FIELD];
            const isOnField = mf.some(c => c !== CARD_TYPE.PLACEHOLDER && c?.card?.key === 70634245);
            if (!isOnField) return;
            for (const m of mf) {
                if (m !== CARD_TYPE.PLACEHOLDER && m?.card?.race?.toLowerCase().includes('warrior')) {
                    m.current_atk = (m.current_atk ?? m.card.atk ?? 0) + 500;
                    m.current_def = (m.current_def ?? m.card.def ?? 0) + 500;
                }
            }
        },
        on_summon: async (env) => {
            const gy = env[SIDE.MINE][ENVIRONMENT.GRAVEYARD];
            const samuraiGY = gy.filter(c => c?.card?.name?.toLowerCase().includes('samurai'));
            if (!samuraiGY.length) return;
            const oppField = (env[SIDE.OPPONENT][ENVIRONMENT.MONSTER_FIELD] || []).filter(c =>
                c !== CARD_TYPE.PLACEHOLDER && c?.card
            );
            if (!oppField.length) return;
            try {
                const banishResult = await openSelector({
                    type: CARD_SELECT_TYPE.CARD_SELECT_FROM_HAND,
                    label: 'Legendary Lord Enishi: banish Six Samurai from GY (selects bounce targets)',
                    sourceList: samuraiGY,
                    numToSelect: Math.min(samuraiGY.length, oppField.length),
                });
                if (!banishResult?.cardEnvs?.length) return;
                const freshEnv = store.getState().environmentReducer.environment;
                const g = freshEnv[SIDE.MINE][ENVIRONMENT.GRAVEYARD];
                const count = banishResult.cardEnvs.length;
                for (const uid of banishResult.cardEnvs) {
                    const i = g.findIndex(c => get_unique_id_from_ennvironment(c) === uid);
                    if (i !== -1) g.splice(i, 1); // banish (simplified: remove from GY)
                }
                // Bounce that many opponent monsters to hand
                const opp = freshEnv[SIDE.OPPONENT][ENVIRONMENT.MONSTER_FIELD].filter(c =>
                    c !== CARD_TYPE.PLACEHOLDER && c?.card
                );
                const toReturn = opp.slice(0, count);
                const mf = freshEnv[SIDE.OPPONENT][ENVIRONMENT.MONSTER_FIELD];
                for (const target of toReturn) {
                    const idx = mf.indexOf(target);
                    if (idx !== -1) {
                        freshEnv[SIDE.OPPONENT][ENVIRONMENT.HAND].push(mf[idx]);
                        mf[idx] = CARD_TYPE.PLACEHOLDER;
                    }
                }
                logEvent(LOG_TYPE.EFFECT, `Legendary Lord Enishi: bounced ${toReturn.length} opponent monster(s)`);
                dispatchEnv(freshEnv);
            } catch { /* cancelled */ }
        },
    }],

    // Legendary Lord Six Samurai - Kizan (42209438) — Synchro Level 6
    // Passive: Six Samurai +600 ATK/DEF
    // Once per turn from GY: SS this card if you control 2+ Six Samurai
    // (Quick Effect during opp's Main Phase: banish Six Strike to destroy — skipped; no Six Strike in deck)
    42209438: [{
        passive_effect: (env, side) => {
            const mf = env[side][ENVIRONMENT.MONSTER_FIELD];
            const isOnField = mf.some(c => c !== CARD_TYPE.PLACEHOLDER && c?.card?.key === 42209438);
            if (!isOnField) return;
            for (const m of mf) {
                if (m !== CARD_TYPE.PLACEHOLDER && m?.card?.name?.toLowerCase().includes('samurai') &&
                    m.card.key !== 42209438) {
                    m.current_atk = (m.current_atk ?? m.card.atk ?? 0) + 600;
                    m.current_def = (m.current_def ?? m.card.def ?? 0) + 600;
                }
            }
        },
    }],

    // Secret Six Samurai - Rihan (33964637) — Fusion Level 5
    // Contact Fusion: 3 Six Samurai with different Attributes on field → send to GY → SS from Extra Deck
    // Once per turn: banish Six Samurai from hand/field/GY → banish 1 opponent card
    // If Six Samurai you control would be destroyed: banish this card from GY instead (not enforced)
    33964637: oncePerTurn(
        async (env, side = SIDE.MINE) => {
            const fieldSamurai = (env[side][ENVIRONMENT.MONSTER_FIELD] || []).filter(c =>
                c !== CARD_TYPE.PLACEHOLDER && c?.card?.name?.toLowerCase().includes('samurai')
            );
            const handSamurai = (env[side][ENVIRONMENT.HAND] || []).filter(c =>
                c?.card?.name?.toLowerCase().includes('samurai')
            );
            const gySamurai = (env[side][ENVIRONMENT.GRAVEYARD] || []).filter(c =>
                c?.card?.name?.toLowerCase().includes('samurai')
            );
            const pool = [...fieldSamurai, ...handSamurai, ...gySamurai];
            if (!pool.length) return;
            const oppCards = [
                ...(env[SIDE.OPPONENT][ENVIRONMENT.MONSTER_FIELD] || []).filter(c => c !== CARD_TYPE.PLACEHOLDER && c?.card),
                ...(env[SIDE.OPPONENT][ENVIRONMENT.SPELL_FIELD]   || []).filter(c => c?.card),
            ];
            if (!oppCards.length) return;
            try {
                // Select which Six Samurai to banish as cost
                const costResult = await openSelector({
                    type: CARD_SELECT_TYPE.CARD_SELECT_FROM_HAND,
                    label: 'Rihan — banish 1 Six Samurai (hand/field/GY) as cost',
                    sourceList: pool, numToSelect: 1,
                });
                if (!costResult?.cardEnvs?.length) return;
                const freshEnv = store.getState().environmentReducer.environment;
                // Remove the cost card from wherever it is
                for (const loc of [ENVIRONMENT.MONSTER_FIELD, ENVIRONMENT.HAND, ENVIRONMENT.GRAVEYARD]) {
                    const arr = freshEnv[side][loc];
                    for (let i = 0; i < arr.length; i++) {
                        if (arr[i] !== CARD_TYPE.PLACEHOLDER && arr[i]?.card &&
                            get_unique_id_from_ennvironment(arr[i]) === costResult.cardEnvs[0]) {
                            arr[i] = CARD_TYPE.PLACEHOLDER; // banish (simplified: remove)
                            break;
                        }
                    }
                }
                // Select opponent card to banish
                const opp = [
                    ...(freshEnv[SIDE.OPPONENT][ENVIRONMENT.MONSTER_FIELD] || []).filter(c => c !== CARD_TYPE.PLACEHOLDER && c?.card),
                    ...(freshEnv[SIDE.OPPONENT][ENVIRONMENT.SPELL_FIELD]   || []).filter(c => c?.card),
                ];
                if (!opp.length) { dispatchEnv(freshEnv); return; }
                const banishResult = await openSelector({
                    type: CARD_SELECT_TYPE.CARD_SELECT_BATTLE_SELECT,
                    label: 'Rihan — banish 1 opponent card',
                    sourceList: opp, numToSelect: 1,
                });
                if (!banishResult?.cardEnvs?.length) { dispatchEnv(freshEnv); return; }
                const after = store.getState().environmentReducer.environment;
                for (const s of [SIDE.OPPONENT]) {
                    for (const z of [ENVIRONMENT.MONSTER_FIELD, ENVIRONMENT.SPELL_FIELD]) {
                        const arr = after[s][z];
                        for (let i = 0; i < arr.length; i++) {
                            if (arr[i] !== CARD_TYPE.PLACEHOLDER && arr[i]?.card &&
                                get_unique_id_from_ennvironment(arr[i]) === banishResult.cardEnvs[0]) {
                                arr[i] = CARD_TYPE.PLACEHOLDER; // banish
                                logEvent(LOG_TYPE.EFFECT, 'Rihan: banished an opponent card');
                                break;
                            }
                        }
                    }
                }
                dispatchEnv(after);
            } catch { /* cancelled */ }
        },
        (env) => {
            const onField = (env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD] || []).some(c =>
                c !== CARD_TYPE.PLACEHOLDER && c?.card?.key === 33964637
            );
            return onField;
        }
    ),

    // ════════════════════════════════════════════════════════════════════════
    // ── WIND-UP EXTRA DECK ────────────────────────────────────────────────────
    // ════════════════════════════════════════════════════════════════════════

    // Wind-Up Carrier Zenmaity (81122844) — XYZ Rank 3 (Machine)
    // Once per turn: detach 1 material → SS Wind-Up from hand or Deck
    // Reactive ON_ALLY_DESTROYED: handled in triggerRegistry
    81122844: oncePerTurn(
        async (env, side = SIDE.MINE) => {
            const mf = env[side][ENVIRONMENT.MONSTER_FIELD];
            const zenmaity = mf.find(c => c !== CARD_TYPE.PLACEHOLDER && c?.card?.key === 81122844);
            if (!zenmaity?.xyz_materials?.length) return;
            const handPool = (env[side][ENVIRONMENT.HAND] || []).filter(c => c?.card?.name?.toLowerCase().includes('wind-up'));
            const deckPool = (env[side][ENVIRONMENT.DECK] || []).filter(c => c?.card?.name?.toLowerCase().includes('wind-up'));
            const pool = [...handPool, ...deckPool];
            if (!pool.length) return;
            try {
                const result = await openSelector({
                    type: CARD_SELECT_TYPE.CARD_SELECT_FROM_HAND,
                    label: 'Zenmaity — SS 1 Wind-Up from hand or Deck',
                    sourceList: pool, numToSelect: 1,
                });
                if (!result?.cardEnvs?.length) return;
                const freshEnv = store.getState().environmentReducer.environment;
                const zen = freshEnv[side][ENVIRONMENT.MONSTER_FIELD].find(c =>
                    c !== CARD_TYPE.PLACEHOLDER && c?.card?.key === 81122844
                );
                if (zen?.xyz_materials?.length) zen.xyz_materials.splice(0, 1);
                for (const loc of [ENVIRONMENT.HAND, ENVIRONMENT.DECK]) {
                    const arr = freshEnv[side][loc];
                    const idx = arr.findIndex(c => get_unique_id_from_ennvironment(c) === result.cardEnvs[0]);
                    if (idx !== -1) {
                        const [card] = arr.splice(idx, 1);
                        const f = freshEnv[side][ENVIRONMENT.MONSTER_FIELD];
                        const priorities = [2, 3, 1, 4, 0];
                        for (const slot of priorities) {
                            if (f[slot] === CARD_TYPE.PLACEHOLDER) {
                                card.current_pos = CARD_POS.FACE;
                                card.summoned_this_turn = true;
                                f[slot] = card;
                                break;
                            }
                        }
                        logEvent(LOG_TYPE.SPECIAL, `Zenmaity: SS ${card.card?.name}`);
                        dispatchEnv(freshEnv);
                        return;
                    }
                }
            } catch { /* cancelled */ }
        },
        (env) => {
            const mf = env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD] || [];
            const zen = mf.find(c => c !== CARD_TYPE.PLACEHOLDER && c?.card?.key === 81122844);
            if (!zen?.xyz_materials?.length) return false;
            return (env[SIDE.MINE][ENVIRONMENT.HAND] || []).some(c => c?.card?.name?.toLowerCase().includes('wind-up')) ||
                   (env[SIDE.MINE][ENVIRONMENT.DECK] || []).some(c => c?.card?.name?.toLowerCase().includes('wind-up'));
        }
    ),

    // Wind-Up Arsenal Zenmaioh (77334267) — XYZ Rank 5 (Machine)
    // Once per turn: detach 1 material → destroy 2 Set cards on field
    77334267: oncePerTurn(
        async (env, side = SIDE.MINE) => {
            const mf = env[side][ENVIRONMENT.MONSTER_FIELD];
            const zenmaioh = mf.find(c => c !== CARD_TYPE.PLACEHOLDER && c?.card?.key === 77334267);
            if (!zenmaioh?.xyz_materials?.length) return;
            const setCards = [
                ...(env[SIDE.MINE][ENVIRONMENT.SPELL_FIELD]     || []).filter(c => c?.card && c.current_pos === CARD_POS.SET),
                ...(env[SIDE.OPPONENT][ENVIRONMENT.SPELL_FIELD] || []).filter(c => c?.card && c.current_pos === CARD_POS.SET),
            ];
            if (setCards.length < 2) return;
            try {
                const result = await openSelector({
                    type: CARD_SELECT_TYPE.CARD_SELECT_FROM_HAND,
                    label: 'Wind-Up Arsenal Zenmaioh — target 2 Set cards to destroy',
                    sourceList: setCards, numToSelect: 2,
                });
                if (!result?.cardEnvs || result.cardEnvs.length < 2) return;
                const freshEnv = store.getState().environmentReducer.environment;
                const z = freshEnv[side][ENVIRONMENT.MONSTER_FIELD].find(c =>
                    c !== CARD_TYPE.PLACEHOLDER && c?.card?.key === 77334267
                );
                if (z?.xyz_materials?.length) z.xyz_materials.splice(0, 1);
                for (const s of [SIDE.MINE, SIDE.OPPONENT]) {
                    const sf = freshEnv[s][ENVIRONMENT.SPELL_FIELD];
                    for (let i = 0; i < sf.length; i++) {
                        if (sf[i]?.card && result.cardEnvs.includes(get_unique_id_from_ennvironment(sf[i]))) {
                            freshEnv[s][ENVIRONMENT.GRAVEYARD].push(sf[i]);
                            sf[i] = CARD_TYPE.PLACEHOLDER;
                        }
                    }
                }
                logEvent(LOG_TYPE.EFFECT, 'Zenmaioh: destroyed 2 Set cards');
                dispatchEnv(freshEnv);
            } catch { /* cancelled */ }
        },
        (env) => {
            const mf = env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD] || [];
            const z = mf.find(c => c !== CARD_TYPE.PLACEHOLDER && c?.card?.key === 77334267);
            if (!z?.xyz_materials?.length) return false;
            const setCount = [
                ...(env[SIDE.MINE][ENVIRONMENT.SPELL_FIELD]     || []),
                ...(env[SIDE.OPPONENT][ENVIRONMENT.SPELL_FIELD] || []),
            ].filter(c => c?.card && c.current_pos === CARD_POS.SET).length;
            return setCount >= 2;
        }
    ),

    // Wind-Up Zenmaines (78156759) — XYZ Rank 3 (Machine)
    // Protection: if would be destroyed, detach 1 material instead (handled via can_protect_from_destroy)
    // End Phase after protection: destroy 1 card on field (handled in Game.jsx)
    78156759: [{
        can_protect_from_destroy: (cardEnv) => (cardEnv?.xyz_materials?.length || 0) > 0,
        protect_from_destroy: (cardEnv, env, side) => {
            const [mat] = cardEnv.xyz_materials.splice(0, 1);
            env[side][ENVIRONMENT.GRAVEYARD].push(mat);
            cardEnv.zenmaines_protection_used = true;
            logEvent(LOG_TYPE.EFFECT, 'Wind-Up Zenmaines: detached material instead of being destroyed');
            const storeModule = require('../Store/store');
            storeModule.default.dispatch(require('../Store/actions/environmentActions').update_environment(env));
            return env;
        },
    }],

    // Wind-Up Zenmaister (68597372) — XYZ Rank 4 (Machine)
    // Passive: +300 ATK per material attached
    // Once per turn: detach 1 material → flip a monster you control to face-down DEF; return to ATK at End Phase
    68597372: [{
        passive_effect: (env, side) => {
            const mf = env[side][ENVIRONMENT.MONSTER_FIELD];
            for (const m of mf) {
                if (m !== CARD_TYPE.PLACEHOLDER && m?.card?.key === 68597372) {
                    const matCount = m.xyz_materials?.length || 0;
                    if (matCount > 0) {
                        m.current_atk = (m.current_atk ?? m.card.atk ?? 1900) + matCount * 300;
                    }
                }
            }
        },
        once_per_turn: true,
        condition: (env) => {
            const mf = env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD] || [];
            const zenmaister = mf.find(c => c !== CARD_TYPE.PLACEHOLDER && c?.card?.key === 68597372);
            if (!zenmaister?.xyz_materials?.length) return false;
            return mf.some(c => c !== CARD_TYPE.PLACEHOLDER && c?.card && c.current_pos === CARD_POS.FACE);
        },
        operation: async (env) => {
            const mf = env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD];
            const zenmaister = mf.find(c => c !== CARD_TYPE.PLACEHOLDER && c?.card?.key === 68597372);
            if (!zenmaister?.xyz_materials?.length) return;
            const targets = mf.filter(c =>
                c !== CARD_TYPE.PLACEHOLDER && c?.card && c.current_pos === CARD_POS.FACE
            );
            try {
                const result = await openSelector({
                    type: CARD_SELECT_TYPE.CARD_SELECT_FROM_HAND,
                    label: 'Zenmaister — flip 1 face-up monster to face-down DEF (returns to ATK at End Phase)',
                    sourceList: targets, numToSelect: 1,
                });
                if (!result?.cardEnvs?.length) return;
                const freshEnv = store.getState().environmentReducer.environment;
                const fm = freshEnv[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD];
                const zen = fm.find(c => c !== CARD_TYPE.PLACEHOLDER && c?.card?.key === 68597372);
                if (zen?.xyz_materials?.length) zen.xyz_materials.splice(0, 1);
                for (const m of fm) {
                    if (m !== CARD_TYPE.PLACEHOLDER && m?.card &&
                        get_unique_id_from_ennvironment(m) === result.cardEnvs[0]) {
                        m.current_pos = CARD_POS.SET;
                        m.zenmaister_flip_target = true; // mark for End Phase restore
                        logEvent(LOG_TYPE.EFFECT, `Zenmaister: flipped ${m.card.name} face-down`);
                        break;
                    }
                }
                dispatchEnv(freshEnv);
            } catch { /* cancelled */ }
        },
    }],

    // ════════════════════════════════════════════════════════════════════════
    // ── WIND-UP ───────────────────────────────────────────────────────────────
    // All Wind-Up monster effects are "single use" (wind_up: true).
    // Triggering Magician / Factory is handled via ON_WINDUP_EFFECT in triggerRegistry.
    // ════════════════════════════════════════════════════════════════════════

    // ── SHARED HELPER ─────────────────────────────────────────────────────────
    // isWindUp: name check used in conditions below

    // Wind-Up Warrior (53540729) — target Wind-Up you control: +1 Level, +600 ATK. Single use.
    53540729: [{
        wind_up: true,
        once_per_turn: true,
        condition: (env) => (env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD] || []).some(c =>
            c !== CARD_TYPE.PLACEHOLDER && c?.card?.name?.toLowerCase().includes('wind-up')
        ),
        operation: async (env) => {
            const field = (env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD] || []).filter(c =>
                c !== CARD_TYPE.PLACEHOLDER && c?.card?.name?.toLowerCase().includes('wind-up')
            );
            try {
                const result = await openSelector({
                    type: CARD_SELECT_TYPE.CARD_SELECT_FROM_HAND,
                    label: 'Wind-Up Warrior — target 1 Wind-Up: +1 Level, +600 ATK',
                    sourceList: field, numToSelect: 1,
                });
                if (!result?.cardEnvs?.length) return;
                const freshEnv = store.getState().environmentReducer.environment;
                const mf = freshEnv[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD];
                for (const m of mf) {
                    if (m !== CARD_TYPE.PLACEHOLDER && m?.card && get_unique_id_from_ennvironment(m) === result.cardEnvs[0]) {
                        m.current_level = (m.current_level ?? m.card.level ?? 1) + 1;
                        m.current_atk   = (m.current_atk   ?? m.card.atk   ?? 0)  + 600;
                        logEvent(LOG_TYPE.EFFECT, `Wind-Up Warrior: ${m.card.name} is now Lv${m.current_level}, ATK ${m.current_atk}`);
                        break;
                    }
                }
                dispatchEnv(freshEnv);
            } catch { /* cancelled */ }
        },
    }],

    // Wind-Up Soldier (12299841) — self: +1 Level, +400 ATK. Single use.
    12299841: [{
        wind_up: true,
        once_per_turn: true,
        condition: (env) => (env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD] || []).some(c =>
            c !== CARD_TYPE.PLACEHOLDER && c?.card?.key === 12299841
        ),
        operation: (env) => {
            const mf = env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD];
            for (const m of mf) {
                if (m !== CARD_TYPE.PLACEHOLDER && m?.card?.key === 12299841) {
                    m.current_level = (m.current_level ?? m.card.level ?? 4) + 1;
                    m.current_atk   = (m.current_atk   ?? m.card.atk   ?? 1800) + 400;
                    logEvent(LOG_TYPE.EFFECT, `Wind-Up Soldier: Lv${m.current_level}, ATK ${m.current_atk}`);
                    break;
                }
            }
            dispatchEnv(env);
        },
    }],

    // Wind-Up Snail (58475908) — target Set card: return to hand. Single use.
    58475908: [{
        wind_up: true,
        once_per_turn: true,
        condition: (env) => (env[SIDE.OPPONENT][ENVIRONMENT.SPELL_FIELD] || []).some(c =>
            c?.card && c.current_pos === CARD_POS.SET
        ),
        operation: async (env) => {
            const valid = (env[SIDE.OPPONENT][ENVIRONMENT.SPELL_FIELD] || []).filter(c =>
                c?.card && c.current_pos === CARD_POS.SET
            );
            if (!valid.length) return;
            try {
                const result = await openSelector({
                    type: CARD_SELECT_TYPE.CARD_SELECT_FROM_HAND,
                    label: 'Wind-Up Snail — return 1 Set card to hand',
                    sourceList: valid, numToSelect: 1,
                });
                if (!result?.cardEnvs?.length) return;
                const freshEnv = store.getState().environmentReducer.environment;
                const sf = freshEnv[SIDE.OPPONENT][ENVIRONMENT.SPELL_FIELD];
                for (let i = 0; i < sf.length; i++) {
                    if (sf[i]?.card && get_unique_id_from_ennvironment(sf[i]) === result.cardEnvs[0]) {
                        freshEnv[SIDE.OPPONENT][ENVIRONMENT.HAND].push(sf[i]);
                        sf[i] = CARD_TYPE.PLACEHOLDER;
                        logEvent(LOG_TYPE.EFFECT, 'Wind-Up Snail: returned Set card to hand');
                        break;
                    }
                }
                dispatchEnv(freshEnv);
            } catch { /* cancelled */ }
        },
    }],

    // Wind-Up Shark (25484449) — once per turn: adjust own Level by ±1. (SS reaction is in triggerRegistry)
    25484449: [{
        wind_up: true,
        once_per_turn: true,
        condition: (env) => (env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD] || []).some(c =>
            c !== CARD_TYPE.PLACEHOLDER && c?.card?.key === 25484449
        ),
        operation: async (env) => {
            const mf = env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD];
            const shark = mf.find(c => c !== CARD_TYPE.PLACEHOLDER && c?.card?.key === 25484449);
            if (!shark) return;
            const { chooseLevel } = require('./levelChooser');
            const newLevel = await chooseLevel('Wind-Up Shark — choose new Level (current: ' + (shark.current_level ?? shark.card.level ?? 4) + ')');
            if (!newLevel) return;
            const freshEnv = store.getState().environmentReducer.environment;
            const s = (freshEnv[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD] || []).find(c =>
                c !== CARD_TYPE.PLACEHOLDER && c?.card?.key === 25484449
            );
            if (s) {
                s.current_level = newLevel;
                logEvent(LOG_TYPE.EFFECT, `Wind-Up Shark: Level changed to ${newLevel}`);
            }
            dispatchEnv(freshEnv);
        },
    }],

    // Wind-Up Rat (57962537) — target Wind-Up in GY: change self to DEF, SS target. Single use.
    57962537: [{
        wind_up: true,
        once_per_turn: true,
        condition: (env) => (env[SIDE.MINE][ENVIRONMENT.GRAVEYARD] || []).some(c =>
            c?.card?.name?.toLowerCase().includes('wind-up')
        ),
        operation: async (env) => {
            const gy = env[SIDE.MINE][ENVIRONMENT.GRAVEYARD];
            const valid = gy.filter(c => c?.card?.name?.toLowerCase().includes('wind-up'));
            if (!valid.length) return;
            try {
                const result = await openSelector({
                    type: CARD_SELECT_TYPE.CARD_SELECT_FROM_HAND,
                    label: 'Wind-Up Rat — SS 1 Wind-Up from GY; Rat changes to DEF',
                    sourceList: valid, numToSelect: 1,
                });
                if (!result?.cardEnvs?.length) return;
                const freshEnv = store.getState().environmentReducer.environment;
                const g = freshEnv[SIDE.MINE][ENVIRONMENT.GRAVEYARD];
                const idx = g.findIndex(c => get_unique_id_from_ennvironment(c) === result.cardEnvs[0]);
                if (idx === -1) return;
                const [card] = g.splice(idx, 1);
                const field = freshEnv[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD];
                const priorities = [2, 3, 1, 4, 0];
                for (const slot of priorities) {
                    if (field[slot] === CARD_TYPE.PLACEHOLDER) {
                        card.current_pos = CARD_POS.DEFENSE;
                        card.summoned_this_turn = true;
                        field[slot] = card;
                        break;
                    }
                }
                // Change Rat to DEF
                for (const m of field) {
                    if (m !== CARD_TYPE.PLACEHOLDER && m?.card?.key === 57962537) {
                        m.current_pos = CARD_POS.DEFENSE;
                        break;
                    }
                }
                logEvent(LOG_TYPE.SPECIAL, `Wind-Up Rat: SS ${card.card?.name} from GY`);
                dispatchEnv(freshEnv);
            } catch { /* cancelled */ }
        },
    }],

    // Wind-Up Rabbit (42874792) — Quick Effect: banish a Wind-Up until End Phase. Single use.
    // Simplified: temporarily remove from field (returned at draw phase)
    42874792: [{
        wind_up: true,
        once_per_turn: true,
        condition: (env) => (env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD] || []).some(c =>
            c !== CARD_TYPE.PLACEHOLDER && c?.card?.name?.toLowerCase().includes('wind-up')
        ),
        operation: async (env) => {
            const valid = (env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD] || []).filter(c =>
                c !== CARD_TYPE.PLACEHOLDER && c?.card?.name?.toLowerCase().includes('wind-up')
            );
            try {
                const result = await openSelector({
                    type: CARD_SELECT_TYPE.CARD_SELECT_FROM_HAND,
                    label: 'Wind-Up Rabbit — banish 1 Wind-Up until End Phase (returns at draw phase)',
                    sourceList: valid, numToSelect: 1,
                });
                if (!result?.cardEnvs?.length) return;
                const freshEnv = store.getState().environmentReducer.environment;
                const mf = freshEnv[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD];
                for (let i = 0; i < mf.length; i++) {
                    if (mf[i] !== CARD_TYPE.PLACEHOLDER && mf[i]?.card &&
                        get_unique_id_from_ennvironment(mf[i]) === result.cardEnvs[0]) {
                        // Mark banished; return at next draw phase (Game.jsx handles this)
                        mf[i].banished_return = true;
                        freshEnv[SIDE.MINE][ENVIRONMENT.GRAVEYARD].push({ ...mf[i], banished_return: true });
                        mf[i] = CARD_TYPE.PLACEHOLDER;
                        logEvent(LOG_TYPE.EFFECT, 'Wind-Up Rabbit: banished a Wind-Up (returns at draw phase)');
                        break;
                    }
                }
                dispatchEnv(freshEnv);
            } catch { /* cancelled */ }
        },
    }],

    // Wind-Up Dog (12076263) — self: +2 Levels, +600 ATK. Single use.
    12076263: [{
        wind_up: true,
        once_per_turn: true,
        condition: (env) => (env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD] || []).some(c =>
            c !== CARD_TYPE.PLACEHOLDER && c?.card?.key === 12076263
        ),
        operation: (env) => {
            for (const m of env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD]) {
                if (m !== CARD_TYPE.PLACEHOLDER && m?.card?.key === 12076263) {
                    m.current_level = (m.current_level ?? m.card.level ?? 3) + 2;
                    m.current_atk   = (m.current_atk   ?? m.card.atk   ?? 1200) + 600;
                    logEvent(LOG_TYPE.EFFECT, `Wind-Up Dog: Lv${m.current_level}, ATK ${m.current_atk}`);
                    break;
                }
            }
            dispatchEnv(env);
        },
    }],

    // Wind-Up Bat (42328171) — target Wind-Up in GY: add to hand; change self to DEF. Single use.
    42328171: [{
        wind_up: true,
        once_per_turn: true,
        condition: (env) => (env[SIDE.MINE][ENVIRONMENT.GRAVEYARD] || []).some(c =>
            c?.card?.name?.toLowerCase().includes('wind-up')
        ),
        operation: async (env) => {
            const gy = env[SIDE.MINE][ENVIRONMENT.GRAVEYARD];
            const valid = gy.filter(c => c?.card?.name?.toLowerCase().includes('wind-up'));
            try {
                const result = await openSelector({
                    type: CARD_SELECT_TYPE.CARD_SELECT_FROM_HAND,
                    label: 'Wind-Up Bat — add 1 Wind-Up from GY to hand; Bat → DEF',
                    sourceList: valid, numToSelect: 1,
                });
                if (!result?.cardEnvs?.length) return;
                const freshEnv = store.getState().environmentReducer.environment;
                const g = freshEnv[SIDE.MINE][ENVIRONMENT.GRAVEYARD];
                const idx = g.findIndex(c => get_unique_id_from_ennvironment(c) === result.cardEnvs[0]);
                if (idx !== -1) {
                    freshEnv[SIDE.MINE][ENVIRONMENT.HAND].push(g.splice(idx, 1)[0]);
                }
                for (const m of freshEnv[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD]) {
                    if (m !== CARD_TYPE.PLACEHOLDER && m?.card?.key === 42328171) {
                        m.current_pos = CARD_POS.DEFENSE;
                        break;
                    }
                }
                logEvent(LOG_TYPE.EFFECT, 'Wind-Up Bat: added Wind-Up from GY to hand');
                dispatchEnv(freshEnv);
            } catch { /* cancelled */ }
        },
    }],

    // Wind-Up Factory (95714077) — Continuous Spell; reaction handled by triggerRegistry ON_WINDUP_EFFECT.
    // The Bushido-counter-style activation is handled there; nothing extra needed here.

    // Wind-Up Hunter (16923472) — tribute Wind-Up: discard random card from opponent's hand. Single use.
    16923472: [{
        wind_up: true,
        once_per_turn: true,
        condition: (env) => {
            const field = env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD] || [];
            const hasOther = field.some(c =>
                c !== CARD_TYPE.PLACEHOLDER && c?.card?.name?.toLowerCase().includes('wind-up') &&
                c.card.key !== 16923472
            );
            return hasOther && (env[SIDE.OPPONENT][ENVIRONMENT.HAND] || []).length > 0;
        },
        operation: async (env) => {
            const samurai = (env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD] || []).filter(c =>
                c !== CARD_TYPE.PLACEHOLDER && c?.card?.name?.toLowerCase().includes('wind-up') &&
                c.card.key !== 16923472
            );
            if (!samurai.length) return;
            try {
                const trib = await openSelector({
                    type: CARD_SELECT_TYPE.CARD_SELECT_FROM_HAND,
                    label: 'Wind-Up Hunter — tribute 1 Wind-Up',
                    sourceList: samurai, numToSelect: 1,
                });
                if (!trib?.cardEnvs?.length) return;
                const freshEnv = store.getState().environmentReducer.environment;
                const mf = freshEnv[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD];
                const ti = mf.findIndex(c => get_unique_id_from_ennvironment(c) === trib.cardEnvs[0]);
                if (ti !== -1) {
                    freshEnv[SIDE.MINE][ENVIRONMENT.GRAVEYARD].push(mf[ti]);
                    mf[ti] = CARD_TYPE.PLACEHOLDER;
                }
                // Discard random card from opponent's hand
                const oppHand = freshEnv[SIDE.OPPONENT][ENVIRONMENT.HAND];
                if (oppHand.length) {
                    const ri = Math.floor(Math.random() * oppHand.length);
                    const [discarded] = oppHand.splice(ri, 1);
                    freshEnv[SIDE.OPPONENT][ENVIRONMENT.GRAVEYARD].push(discarded);
                    logEvent(LOG_TYPE.EFFECT, `Wind-Up Hunter: opponent discarded ${discarded.card?.name || 'a card'}`);
                }
                dispatchEnv(freshEnv);
            } catch { /* cancelled */ }
        },
    }],

    // Wind-Up Juggler (85682655) — after battle: destroy the battled monster. Single use.
    // Simplified: once per turn destroy 1 opponent face-up monster (player activates after battle)
    85682655: [{
        wind_up: true,
        once_per_turn: true,
        condition: (env) => {
            const field = env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD] || [];
            const juggler = field.find(c => c !== CARD_TYPE.PLACEHOLDER && c?.card?.key === 85682655);
            if (!juggler) return false;
            return (env[SIDE.OPPONENT][ENVIRONMENT.MONSTER_FIELD] || []).some(c =>
                c !== CARD_TYPE.PLACEHOLDER && c?.card
            );
        },
        operation: async (env) => {
            const targets = (env[SIDE.OPPONENT][ENVIRONMENT.MONSTER_FIELD] || []).filter(c =>
                c !== CARD_TYPE.PLACEHOLDER && c?.card
            );
            try {
                const result = await openSelector({
                    type: CARD_SELECT_TYPE.CARD_SELECT_BATTLE_SELECT,
                    label: 'Wind-Up Juggler — destroy 1 opponent monster',
                    sourceList: targets, numToSelect: 1,
                });
                if (!result?.cardEnvs?.length) return;
                const freshEnv = store.getState().environmentReducer.environment;
                const om = freshEnv[SIDE.OPPONENT][ENVIRONMENT.MONSTER_FIELD];
                for (let i = 0; i < om.length; i++) {
                    if (om[i] !== CARD_TYPE.PLACEHOLDER && om[i]?.card &&
                        get_unique_id_from_ennvironment(om[i]) === result.cardEnvs[0]) {
                        freshEnv[SIDE.OPPONENT][ENVIRONMENT.GRAVEYARD].push(om[i]);
                        om[i] = CARD_TYPE.PLACEHOLDER;
                        logEvent(LOG_TYPE.EFFECT, 'Wind-Up Juggler: destroyed a monster');
                        break;
                    }
                }
                dispatchEnv(freshEnv);
            } catch { /* cancelled */ }
        },
    }],

    // Wind-Up Kitten (25716180) — target opponent's monster: return to hand. Single use.
    25716180: [{
        wind_up: true,
        once_per_turn: true,
        condition: (env) => (env[SIDE.OPPONENT][ENVIRONMENT.MONSTER_FIELD] || []).some(c =>
            c !== CARD_TYPE.PLACEHOLDER && c?.card
        ),
        operation: async (env) => {
            const targets = (env[SIDE.OPPONENT][ENVIRONMENT.MONSTER_FIELD] || []).filter(c =>
                c !== CARD_TYPE.PLACEHOLDER && c?.card
            );
            try {
                const result = await openSelector({
                    type: CARD_SELECT_TYPE.CARD_SELECT_BATTLE_SELECT,
                    label: 'Wind-Up Kitten — return 1 opponent monster to hand',
                    sourceList: targets, numToSelect: 1,
                });
                if (!result?.cardEnvs?.length) return;
                const freshEnv = store.getState().environmentReducer.environment;
                const om = freshEnv[SIDE.OPPONENT][ENVIRONMENT.MONSTER_FIELD];
                for (let i = 0; i < om.length; i++) {
                    if (om[i] !== CARD_TYPE.PLACEHOLDER && om[i]?.card &&
                        get_unique_id_from_ennvironment(om[i]) === result.cardEnvs[0]) {
                        freshEnv[SIDE.OPPONENT][ENVIRONMENT.HAND].push(om[i]);
                        om[i] = CARD_TYPE.PLACEHOLDER;
                        logEvent(LOG_TYPE.EFFECT, 'Wind-Up Kitten: returned a monster to opponent\'s hand');
                        break;
                    }
                }
                dispatchEnv(freshEnv);
            } catch { /* cancelled */ }
        },
    }],

    // Wind-Up Knight (80538728) — attack negate is handled in triggerRegistry ON_ATTACK_DECLARED.
    // No activated effects needed here.

    // ── ZENMAIL SPELLS / TRAPS ────────────────────────────────────────────────

    // Zenmailfunction (61011311) — SS 1 Wind-Up from GY in DEF (effects negated)
    61011311: onActivate(
        async (env) => {
            const gy = env[SIDE.MINE][ENVIRONMENT.GRAVEYARD];
            const valid = gy.filter(c => c?.card?.name?.toLowerCase().includes('wind-up'));
            if (!valid.length) return;
            try {
                const result = await openSelector({
                    type: CARD_SELECT_TYPE.CARD_SELECT_FROM_HAND,
                    label: 'Zenmailfunction — SS 1 Wind-Up from GY (DEF, effects negated)',
                    sourceList: valid, numToSelect: 1,
                });
                if (!result?.cardEnvs?.length) return;
                const freshEnv = store.getState().environmentReducer.environment;
                const g = freshEnv[SIDE.MINE][ENVIRONMENT.GRAVEYARD];
                const idx = g.findIndex(c => get_unique_id_from_ennvironment(c) === result.cardEnvs[0]);
                if (idx === -1) return;
                const [card] = g.splice(idx, 1);
                card.effects_negated = true; // flag for future enforcement
                const field = freshEnv[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD];
                const priorities = [2, 3, 1, 4, 0];
                for (const slot of priorities) {
                    if (field[slot] === CARD_TYPE.PLACEHOLDER) {
                        card.current_pos = CARD_POS.DEFENSE;
                        card.summoned_this_turn = true;
                        field[slot] = card;
                        break;
                    }
                }
                logEvent(LOG_TYPE.SPECIAL, `Zenmailfunction: SS ${card.card?.name} in DEF`);
                dispatchEnv(freshEnv);
            } catch { /* cancelled */ }
        },
        (env) => (env[SIDE.MINE][ENVIRONMENT.GRAVEYARD] || []).some(c =>
            c?.card?.name?.toLowerCase().includes('wind-up')
        )
    ),

    // Weights & Zenmaisures (42548470) — target 2 Wind-Ups with different Levels; equalize
    42548470: onActivate(
        async (env) => {
            const field = (env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD] || []).filter(c =>
                c !== CARD_TYPE.PLACEHOLDER && c?.card?.name?.toLowerCase().includes('wind-up')
            );
            // Need 2 with different levels
            const levels = field.map(c => c.current_level ?? c.card.level ?? 0);
            const hasTwo = levels.some((l, i) => levels.some((l2, j) => j > i && l !== l2));
            if (!hasTwo) return;
            try {
                const result = await openSelector({
                    type: CARD_SELECT_TYPE.CARD_SELECT_FROM_HAND,
                    label: 'Weights & Zenmaisures — select 2 Wind-Ups with different Levels',
                    sourceList: field, numToSelect: 2,
                });
                if (!result?.cardEnvs || result.cardEnvs.length < 2) return;
                const freshEnv = store.getState().environmentReducer.environment;
                const mf = freshEnv[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD];
                const targets = result.cardEnvs.map(uid =>
                    mf.find(c => c !== CARD_TYPE.PLACEHOLDER && c?.card && get_unique_id_from_ennvironment(c) === uid)
                ).filter(Boolean);
                if (targets.length < 2) return;
                const lvA = targets[0].current_level ?? targets[0].card.level ?? 0;
                const lvB = targets[1].current_level ?? targets[1].card.level ?? 0;
                // Make the higher-level monster's level match the lower (player-selected equalize)
                const lower = lvA < lvB ? lvA : lvB;
                const higher = lvA < lvB ? lvB : lvA;
                // Opponent would choose which — simplified: apply lower to both, draw if needed
                targets[0].current_level = lower;
                targets[1].current_level = lower;
                // Draw 1 card (opponent "chose" the lower level monster, so we draw)
                const deck = freshEnv[SIDE.MINE][ENVIRONMENT.DECK];
                if (deck.length) freshEnv[SIDE.MINE][ENVIRONMENT.HAND].push(deck.pop());
                logEvent(LOG_TYPE.EFFECT, `Weights & Zenmaisures: both monsters now Lv${lower}; drew 1 card`);
                dispatchEnv(freshEnv);
            } catch { /* cancelled */ }
        },
        (env) => {
            const field = (env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD] || []).filter(c =>
                c !== CARD_TYPE.PLACEHOLDER && c?.card?.name?.toLowerCase().includes('wind-up')
            );
            const levels = field.map(c => c.current_level ?? c.card.level ?? 0);
            return levels.some((l, i) => levels.some((l2, j) => j > i && l !== l2));
        }
    ),

    // Zenmailstrom (91422370) — tribute Wind-Up (1500+ ATK); SS from hand, then from Deck (same ATK)
    91422370: onActivate(
        async (env) => {
            const field = (env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD] || []).filter(c =>
                c !== CARD_TYPE.PLACEHOLDER && c?.card?.name?.toLowerCase().includes('wind-up') &&
                (c.current_atk ?? c.card.atk ?? 0) >= 1500
            );
            if (!field.length) return;
            try {
                const trib = await openSelector({
                    type: CARD_SELECT_TYPE.CARD_SELECT_FROM_HAND,
                    label: 'Zenmailstrom — tribute 1 Wind-Up with 1500+ ATK',
                    sourceList: field, numToSelect: 1,
                });
                if (!trib?.cardEnvs?.length) return;
                const freshEnv = store.getState().environmentReducer.environment;
                const mf = freshEnv[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD];
                const ti = mf.findIndex(c => get_unique_id_from_ennvironment(c) === trib.cardEnvs[0]);
                let targetAtk = 0;
                if (ti !== -1) {
                    targetAtk = mf[ti].current_atk ?? mf[ti].card.atk ?? 0;
                    freshEnv[SIDE.MINE][ENVIRONMENT.GRAVEYARD].push(mf[ti]);
                    mf[ti] = CARD_TYPE.PLACEHOLDER;
                }
                // SS from hand with same ATK
                const handTargets = (freshEnv[SIDE.MINE][ENVIRONMENT.HAND] || []).filter(c =>
                    c?.card?.name?.toLowerCase().includes('wind-up') && (c.card.atk ?? 0) === targetAtk
                );
                if (handTargets.length) {
                    const ssH = await openSelector({
                        type: CARD_SELECT_TYPE.CARD_SELECT_FROM_HAND,
                        label: `Zenmailstrom — SS 1 Wind-Up (ATK ${targetAtk}) from hand`,
                        sourceList: handTargets, numToSelect: 1,
                    });
                    if (ssH?.cardEnvs?.length) {
                        const after = store.getState().environmentReducer.environment;
                        const h = after[SIDE.MINE][ENVIRONMENT.HAND];
                        const hi = h.findIndex(c => get_unique_id_from_ennvironment(c) === ssH.cardEnvs[0]);
                        if (hi !== -1) {
                            const [card] = h.splice(hi, 1);
                            const f2 = after[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD];
                            const priorities = [2, 3, 1, 4, 0];
                            for (const slot of priorities) {
                                if (f2[slot] === CARD_TYPE.PLACEHOLDER) {
                                    card.current_pos = CARD_POS.FACE;
                                    card.summoned_this_turn = true;
                                    f2[slot] = card;
                                    break;
                                }
                            }
                            logEvent(LOG_TYPE.SPECIAL, `Zenmailstrom: SS ${card.card?.name} from hand`);
                            dispatchEnv(after);
                        }
                    }
                }
                // SS from Deck with same ATK
                const after2 = store.getState().environmentReducer.environment;
                const deckTargets = (after2[SIDE.MINE][ENVIRONMENT.DECK] || []).filter(c =>
                    c?.card?.name?.toLowerCase().includes('wind-up') && (c.card.atk ?? 0) === targetAtk
                );
                if (deckTargets.length) {
                    const ssD = await openSelector({
                        type: CARD_SELECT_TYPE.CARD_SELECT_FROM_DECK,
                        label: `Zenmailstrom — SS 1 Wind-Up (ATK ${targetAtk}) from Deck`,
                        sourceList: deckTargets, numToSelect: 1,
                    });
                    if (ssD?.cardEnvs?.length) {
                        const fresh2 = store.getState().environmentReducer.environment;
                        const d = fresh2[SIDE.MINE][ENVIRONMENT.DECK];
                        const di = d.findIndex(c => get_unique_id_from_ennvironment(c) === ssD.cardEnvs[0]);
                        if (di !== -1) {
                            const [card] = d.splice(di, 1);
                            const f3 = fresh2[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD];
                            const priorities = [2, 3, 1, 4, 0];
                            for (const slot of priorities) {
                                if (f3[slot] === CARD_TYPE.PLACEHOLDER) {
                                    card.current_pos = CARD_POS.FACE;
                                    card.summoned_this_turn = true;
                                    f3[slot] = card;
                                    break;
                                }
                            }
                            logEvent(LOG_TYPE.SPECIAL, `Zenmailstrom: SS ${card.card?.name} from Deck`);
                            dispatchEnv(fresh2);
                        }
                    }
                }
            } catch { /* cancelled */ }
        },
        (env) => (env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD] || []).some(c =>
            c !== CARD_TYPE.PLACEHOLDER && c?.card?.name?.toLowerCase().includes('wind-up') &&
            (c.current_atk ?? c.card.atk ?? 0) >= 1500
        )
    ),

    // Zenmairch (29999161) — return face-up Lv4 or lower Wind-Up to hand; SS same-Level from hand
    29999161: onActivate(
        async (env) => {
            const field = (env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD] || []).filter(c =>
                c !== CARD_TYPE.PLACEHOLDER && c?.card?.name?.toLowerCase().includes('wind-up') &&
                (c.current_level ?? c.card.level ?? 0) <= 4 &&
                c.current_pos !== CARD_POS.SET
            );
            if (!field.length) return;
            try {
                const ret = await openSelector({
                    type: CARD_SELECT_TYPE.CARD_SELECT_FROM_HAND,
                    label: 'Zenmairch — return 1 face-up Lv4 or lower Wind-Up to hand',
                    sourceList: field, numToSelect: 1,
                });
                if (!ret?.cardEnvs?.length) return;
                const freshEnv = store.getState().environmentReducer.environment;
                const mf = freshEnv[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD];
                let returnedLevel = 0;
                for (let i = 0; i < mf.length; i++) {
                    if (mf[i] !== CARD_TYPE.PLACEHOLDER && mf[i]?.card &&
                        get_unique_id_from_ennvironment(mf[i]) === ret.cardEnvs[0]) {
                        returnedLevel = mf[i].current_level ?? mf[i].card.level ?? 0;
                        freshEnv[SIDE.MINE][ENVIRONMENT.HAND].push(mf[i]);
                        mf[i] = CARD_TYPE.PLACEHOLDER;
                        break;
                    }
                }
                // SS from hand with same Level
                const handTargets = (freshEnv[SIDE.MINE][ENVIRONMENT.HAND] || []).filter(c =>
                    c?.card?.name?.toLowerCase().includes('wind-up') &&
                    (c.current_level ?? c.card.level ?? 0) === returnedLevel
                );
                if (!handTargets.length) { dispatchEnv(freshEnv); return; }
                const ss = await openSelector({
                    type: CARD_SELECT_TYPE.CARD_SELECT_FROM_HAND,
                    label: `Zenmairch — SS 1 Level ${returnedLevel} Wind-Up from hand`,
                    sourceList: handTargets, numToSelect: 1,
                });
                if (!ss?.cardEnvs?.length) { dispatchEnv(freshEnv); return; }
                const after = store.getState().environmentReducer.environment;
                const h = after[SIDE.MINE][ENVIRONMENT.HAND];
                const hi = h.findIndex(c => get_unique_id_from_ennvironment(c) === ss.cardEnvs[0]);
                if (hi !== -1) {
                    const [card] = h.splice(hi, 1);
                    const f2 = after[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD];
                    const priorities = [2, 3, 1, 4, 0];
                    for (const slot of priorities) {
                        if (f2[slot] === CARD_TYPE.PLACEHOLDER) {
                            card.current_pos = CARD_POS.FACE;
                            card.summoned_this_turn = true;
                            f2[slot] = card;
                            break;
                        }
                    }
                    logEvent(LOG_TYPE.SPECIAL, `Zenmairch: SS ${card.card?.name} from hand`);
                    dispatchEnv(after);
                }
            } catch { /* cancelled */ }
        },
        (env) => {
            const hasRetarget = (env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD] || []).some(c =>
                c !== CARD_TYPE.PLACEHOLDER && c?.card?.name?.toLowerCase().includes('wind-up') &&
                (c.current_level ?? c.card.level ?? 0) <= 4 && c.current_pos !== CARD_POS.SET
            );
            const hasHand = (env[SIDE.MINE][ENVIRONMENT.HAND] || []).some(c =>
                c?.card?.name?.toLowerCase().includes('wind-up')
            );
            return hasRetarget && hasHand;
        }
    ),

    // Zenmaiday (83319610) — Continuous Trap
    // Effect 1 (once per turn): target Machine-type XYZ you control; attach 1 Wind-Up from hand/field as material.
    // Effect 2 (send this to GY): Rank-Up a Wind-Up XYZ you control using the next Rank from Extra Deck.
    // Cannot use both effects in the same Chain (naturally enforced — player picks one per activation).
    83319610: [
        {
            // Effect 1 — attach Wind-Up as XYZ Material
            effect_label: 'Attach Wind-Up as XYZ Material',
            effect_desc: 'Target 1 Machine-type XYZ you control; attach 1 Wind-Up from hand/field as material.',
            once_per_turn: true,
            is_continuous: true,
            condition: (env) => {
                const field = env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD] || [];
                const hasMachineXyz = field.some(c =>
                    c !== CARD_TYPE.PLACEHOLDER && c?.card?.card_type === 'MONSTER_XYZ' &&
                    c.card.race?.toLowerCase().includes('machine')
                );
                const hasWindUp =
                    (env[SIDE.MINE][ENVIRONMENT.HAND] || []).some(c => c?.card?.name?.toLowerCase().includes('wind-up')) ||
                    field.some(c => c !== CARD_TYPE.PLACEHOLDER && c?.card?.name?.toLowerCase().includes('wind-up'));
                return hasMachineXyz && hasWindUp;
            },
            operation: async (env) => {
                const field = env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD] || [];
                const machineXyz = field.filter(c =>
                    c !== CARD_TYPE.PLACEHOLDER && c?.card?.card_type === 'MONSTER_XYZ' &&
                    c.card.race?.toLowerCase().includes('machine')
                );
                if (!machineXyz.length) return;

                // Step 1: select target XYZ monster
                const targetResult = await openSelector({
                    type: CARD_SELECT_TYPE.CARD_SELECT_FROM_HAND,
                    label: 'Zenmaiday — target 1 Machine-type XYZ Monster',
                    sourceList: machineXyz, numToSelect: 1,
                });
                if (!targetResult?.cardEnvs?.length) return;

                const freshEnv = store.getState().environmentReducer.environment;
                const mf = freshEnv[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD];
                const targetUid = targetResult.cardEnvs[0];
                const target = mf.find(c =>
                    c !== CARD_TYPE.PLACEHOLDER && c?.card &&
                    get_unique_id_from_ennvironment(c) === targetUid
                );
                if (!target) return;

                // Step 2: select Wind-Up from hand OR field (not the target itself)
                const handWindUps  = (freshEnv[SIDE.MINE][ENVIRONMENT.HAND] || []).filter(c =>
                    c?.card?.name?.toLowerCase().includes('wind-up')
                );
                const fieldWindUps = mf.filter(c =>
                    c !== CARD_TYPE.PLACEHOLDER && c?.card?.name?.toLowerCase().includes('wind-up') &&
                    get_unique_id_from_ennvironment(c) !== targetUid
                );
                const attachPool = [...handWindUps, ...fieldWindUps];
                if (!attachPool.length) return;

                const attachResult = await openSelector({
                    type: CARD_SELECT_TYPE.CARD_SELECT_FROM_HAND,
                    label: 'Zenmaiday — attach 1 Wind-Up as XYZ Material',
                    sourceList: attachPool, numToSelect: 1,
                });
                if (!attachResult?.cardEnvs?.length) return;

                const after = store.getState().environmentReducer.environment;
                const uid = attachResult.cardEnvs[0];

                // Remove from hand first, then field
                const h = after[SIDE.MINE][ENVIRONMENT.HAND];
                const hi = h.findIndex(c => get_unique_id_from_ennvironment(c) === uid);
                if (hi !== -1) {
                    const [card] = h.splice(hi, 1);
                    if (!target.xyz_materials) target.xyz_materials = [];
                    target.xyz_materials.push(card);
                    logEvent(LOG_TYPE.EFFECT, `Zenmaiday: attached ${card.card?.name} from hand as XYZ Material`);
                } else {
                    const f = after[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD];
                    const fi = f.findIndex(c =>
                        c !== CARD_TYPE.PLACEHOLDER && c?.card && get_unique_id_from_ennvironment(c) === uid
                    );
                    if (fi !== -1) {
                        const card = f[fi];
                        f[fi] = CARD_TYPE.PLACEHOLDER;
                        if (!target.xyz_materials) target.xyz_materials = [];
                        target.xyz_materials.push(card);
                        logEvent(LOG_TYPE.EFFECT, `Zenmaiday: attached ${card.card?.name} from field as XYZ Material`);
                    }
                }
                dispatchEnv(after);
            },
        },
        {
            // Effect 2 — Rank-Up XYZ Summon (sends Zenmaiday to GY as cost)
            effect_label: 'Rank-Up XYZ Summon',
            effect_desc: 'Send this card to GY; Rank-Up a Wind-Up XYZ you control using the next Rank from Extra Deck.',
            field_activate: async (env, zenmaidayCardEnv) => {
                const mf = env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD] || [];
                const windUpXyz = mf.filter(c =>
                    c !== CARD_TYPE.PLACEHOLDER && c?.card?.card_type === 'MONSTER_XYZ' &&
                    c.card.name?.toLowerCase().includes('wind-up')
                );
                if (!windUpXyz.length) {
                    logEvent(LOG_TYPE.EFFECT, 'Zenmaiday: no Wind-Up XYZ Monster on field');
                    return;
                }

                // Select the Wind-Up XYZ to Rank-Up
                const targetResult = await openSelector({
                    type: CARD_SELECT_TYPE.CARD_SELECT_FROM_HAND,
                    label: 'Zenmaiday — target 1 Wind-Up XYZ Monster to Rank-Up',
                    sourceList: windUpXyz, numToSelect: 1,
                });
                if (!targetResult?.cardEnvs?.length) return;

                const freshEnv = store.getState().environmentReducer.environment;
                const fmf = freshEnv[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD];
                const targetUid = targetResult.cardEnvs[0];
                const target = fmf.find(c =>
                    c !== CARD_TYPE.PLACEHOLDER && c?.card && get_unique_id_from_ennvironment(c) === targetUid
                );
                if (!target) return;

                const targetRank = target.card.rank || target.card.level || 0;
                const neededRank = targetRank + 1;

                // Find Wind-Up XYZ monsters in Extra Deck with the next rank
                const ed = freshEnv[SIDE.MINE][ENVIRONMENT.EXTRA_DECK] || [];
                const rankUpTargets = ed.filter(c =>
                    c?.card?.card_type === 'MONSTER_XYZ' &&
                    c.card.name?.toLowerCase().includes('wind-up') &&
                    (c.card.rank || c.card.level || 0) === neededRank
                );

                if (!rankUpTargets.length) {
                    logEvent(LOG_TYPE.EFFECT, `Zenmaiday: no Wind-Up Rank ${neededRank} in Extra Deck`);
                    return;
                }

                // Select new monster if multiple choices
                let newMonster = rankUpTargets[0];
                if (rankUpTargets.length > 1) {
                    const selectResult = await openSelector({
                        type: CARD_SELECT_TYPE.CARD_SELECT_SPECIAL_SUMMON_TARGET,
                        label: `Zenmaiday — select Rank ${neededRank} Wind-Up XYZ to summon`,
                    });
                    if (!selectResult?.cardEnvs?.length) return;
                    const after = store.getState().environmentReducer.environment;
                    newMonster = (after[SIDE.MINE][ENVIRONMENT.EXTRA_DECK] || []).find(c =>
                        get_unique_id_from_ennvironment(c) === selectResult.cardEnvs[0]
                    );
                    if (!newMonster) return;
                }

                // Perform Rank-Up
                const finalEnv = store.getState().environmentReducer.environment;
                const finalMF = finalEnv[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD];
                const targetIdx = finalMF.findIndex(c =>
                    c !== CARD_TYPE.PLACEHOLDER && c?.card && get_unique_id_from_ennvironment(c) === targetUid
                );
                if (targetIdx === -1) return;

                const oldTarget = finalMF[targetIdx];

                // All materials from old monster carry over, plus the old monster itself becomes a material
                const carryOverMaterials = [...(oldTarget.xyz_materials || []), oldTarget];

                // Remove old monster from field
                finalMF[targetIdx] = CARD_TYPE.PLACEHOLDER;

                // Remove new monster from Extra Deck
                const edIdx = (finalEnv[SIDE.MINE][ENVIRONMENT.EXTRA_DECK] || []).findIndex(c =>
                    get_unique_id_from_ennvironment(c) === get_unique_id_from_ennvironment(newMonster)
                );
                if (edIdx !== -1) finalEnv[SIDE.MINE][ENVIRONMENT.EXTRA_DECK].splice(edIdx, 1);

                // Place new monster on field in the same slot
                const pos = await (require('./positionChooser').choosePosition)(newMonster.card?.name || 'Monster');
                newMonster.current_pos = pos;
                newMonster.summoned_this_turn = true;
                newMonster.xyz_materials = carryOverMaterials;
                finalMF[targetIdx] = newMonster;

                // Send Zenmaiday to GY
                const sf = finalEnv[SIDE.MINE][ENVIRONMENT.SPELL_FIELD];
                const sfIdx = sf.findIndex(c => c?.card?.key === 83319610);
                if (sfIdx !== -1) {
                    finalEnv[SIDE.MINE][ENVIRONMENT.GRAVEYARD].push(sf[sfIdx]);
                    sf[sfIdx] = CARD_TYPE.PLACEHOLDER;
                }

                logEvent(LOG_TYPE.SPECIAL,
                    `Zenmaiday: Rank-Up XYZ Summoned ${newMonster.card?.name} (Rank ${neededRank})`);
                dispatchEnv(finalEnv);
            },
        },
    ],

    // ════════════════════════════════════════════════════════════════════════
    // ── SIX SAMURAI ──────────────────────────────────────────────────────────
    // ════════════════════════════════════════════════════════════════════════

    // ── Helper: is card a Six Samurai? (name check) ──────────────────────────
    // (Inline in conditions below — not exported)

    // ── SPELLS ───────────────────────────────────────────────────────────────

    // Shien's Smoke Signal (54031490) — add 1 Level 3 or lower Six Samurai from Deck
    54031490: onActivate(
        searchDeck(
            { type: 'MONSTER', nameIncludes: 'Samurai', custom: c => (c.card.level || 0) <= 3 },
            "Shien's Smoke Signal — add 1 Lv 3 or lower Six Samurai from Deck to hand"
        ),
        (env) => (env[SIDE.MINE][ENVIRONMENT.DECK] || []).some(
            c => c?.card?.name?.toLowerCase().includes('samurai') && (c.card.level || 0) <= 3
        )
    ),

    // Six Samurai United (72345736) — Continuous: Bushido counter (max 2), send to GY to draw
    72345736: [{
        condition: (_env) => false,
        target: null,
        operation: (_env) => {},
        is_continuous: true,
        // Activated from field: send this to GY, draw X cards (X = bushido_counters)
        once_per_turn: true,
        once_per_turn_cond: (env, cardEnv) => (cardEnv?.bushido_counters || 0) > 0,
        field_activate: (env, cardEnv) => {
            const counters = cardEnv?.bushido_counters || 0;
            if (!counters) return;
            const spellField = env[SIDE.MINE][ENVIRONMENT.SPELL_FIELD];
            const idx = spellField.findIndex(c => c === cardEnv);
            if (idx !== -1) {
                env[SIDE.MINE][ENVIRONMENT.GRAVEYARD].push(spellField[idx]);
                spellField[idx] = CARD_TYPE.PLACEHOLDER;
            }
            const deck = env[SIDE.MINE][ENVIRONMENT.DECK];
            for (let i = 0; i < counters; i++) {
                if (!deck.length) break;
                env[SIDE.MINE][ENVIRONMENT.HAND].push(deck.pop());
            }
            logEvent(LOG_TYPE.EFFECT, `Six Samurai United: drew ${counters} card(s)`);
            dispatchEnv(env);
        },
    }, {
        // Bushido counter increment via ON_MONSTER_SUMMONED (handled in triggerRegistry)
        trigger_type: 'ON_MONSTER_SUMMONED_FIELD', // marker for triggerRegistry
    }],

    // Shien's Dojo (47436247) — Continuous: Bushido counter; send to GY to SS Six Samurai/Shien from Deck
    47436247: [{
        condition: (_env) => false,
        target: null,
        operation: (_env) => {},
        is_continuous: true,
        once_per_turn: true,
        field_activate: async (env, cardEnv) => {
            const counters = cardEnv?.bushido_counters || 0;
            if (!counters) return;
            const deck = env[SIDE.MINE][ENVIRONMENT.DECK];
            const valid = deck.filter(c =>
                (c?.card?.name?.toLowerCase().includes('samurai') || c?.card?.name?.toLowerCase().includes('shien')) &&
                c?.card?.card_type?.startsWith('MONSTER') &&
                (c.card.level || 0) <= counters
            );
            if (!valid.length) return;
            try {
                const result = await openSelector({
                    type: CARD_SELECT_TYPE.CARD_SELECT_FROM_DECK,
                    label: `Shien's Dojo — SS 1 Six Samurai/Shien (Lv≤${counters}) from Deck`,
                    sourceList: valid,
                    numToSelect: 1,
                });
                if (!result?.cardEnvs?.length) return;
                const freshEnv = store.getState().environmentReducer.environment;
                const d = freshEnv[SIDE.MINE][ENVIRONMENT.DECK];
                const idx = d.findIndex(c => get_unique_id_from_ennvironment(c) === result.cardEnvs[0]);
                if (idx === -1) return;
                const [card] = d.splice(idx, 1);
                const field = freshEnv[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD];
                const priorities = [2, 3, 1, 4, 0];
                for (const slot of priorities) {
                    if (field[slot] === CARD_TYPE.PLACEHOLDER) {
                        card.current_pos = CARD_POS.FACE;
                        card.summoned_this_turn = true;
                        field[slot] = card;
                        break;
                    }
                }
                // Remove Dojo from spell field
                const sf = freshEnv[SIDE.MINE][ENVIRONMENT.SPELL_FIELD];
                const sfIdx = sf.findIndex(c => c?.card?.key === 47436247);
                if (sfIdx !== -1) {
                    freshEnv[SIDE.MINE][ENVIRONMENT.GRAVEYARD].push(sf[sfIdx]);
                    sf[sfIdx] = CARD_TYPE.PLACEHOLDER;
                }
                logEvent(LOG_TYPE.SPECIAL, `Shien's Dojo: Special Summoned ${card.card?.name}`);
                dispatchEnv(freshEnv);
            } catch { /* cancelled */ }
        },
    }],

    // Cunning of the Six Samurai (27178262) — Quick-Play: send Six Samurai from field, SS one from GY
    27178262: onActivate(async (env) => {
        const fieldMonsters = (env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD] || []).filter(c =>
            c !== CARD_TYPE.PLACEHOLDER && c?.card?.name?.toLowerCase().includes('samurai')
        );
        if (!fieldMonsters.length) return;
        try {
            const sendResult = await openSelector({
                type: CARD_SELECT_TYPE.CARD_SELECT_FROM_HAND,
                label: 'Cunning — send 1 Six Samurai from field to GY',
                sourceList: fieldMonsters,
                numToSelect: 1,
            });
            if (!sendResult?.cardEnvs?.length) return;
            const freshEnv = store.getState().environmentReducer.environment;
            const mf = freshEnv[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD];
            const fi = mf.findIndex(c => get_unique_id_from_ennvironment(c) === sendResult.cardEnvs[0]);
            if (fi !== -1) {
                freshEnv[SIDE.MINE][ENVIRONMENT.GRAVEYARD].push(mf[fi]);
                mf[fi] = CARD_TYPE.PLACEHOLDER;
            }
            // Now select a Six Samurai from either GY to SS
            const myGY  = (freshEnv[SIDE.MINE][ENVIRONMENT.GRAVEYARD]     || []).filter(c => c?.card?.name?.toLowerCase().includes('samurai'));
            const oppGY = (freshEnv[SIDE.OPPONENT][ENVIRONMENT.GRAVEYARD] || []).filter(c => c?.card?.name?.toLowerCase().includes('samurai'));
            const gyPool = [...myGY, ...oppGY];
            if (!gyPool.length) { dispatchEnv(freshEnv); return; }
            const ssResult = await openSelector({
                type: CARD_SELECT_TYPE.CARD_SELECT_FROM_HAND,
                label: 'Cunning — Special Summon 1 Six Samurai from either GY',
                sourceList: gyPool,
                numToSelect: 1,
            });
            if (!ssResult?.cardEnvs?.length) { dispatchEnv(freshEnv); return; }
            const after = store.getState().environmentReducer.environment;
            for (const s of [SIDE.MINE, SIDE.OPPONENT]) {
                const gy = after[s][ENVIRONMENT.GRAVEYARD];
                const gi = gy.findIndex(c => get_unique_id_from_ennvironment(c) === ssResult.cardEnvs[0]);
                if (gi !== -1) {
                    const [card] = gy.splice(gi, 1);
                    const field = after[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD];
                    const priorities = [2, 3, 1, 4, 0];
                    for (const slot of priorities) {
                        if (field[slot] === CARD_TYPE.PLACEHOLDER) {
                            card.current_pos = CARD_POS.FACE;
                            card.summoned_this_turn = true;
                            field[slot] = card;
                            break;
                        }
                    }
                    logEvent(LOG_TYPE.SPECIAL, `Cunning of the Six Samurai: SS ${card.card?.name}`);
                    dispatchEnv(after);
                    return;
                }
            }
        } catch { /* cancelled */ }
    }, (env) => {
        const hasField = (env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD] || []).some(c =>
            c !== CARD_TYPE.PLACEHOLDER && c?.card?.name?.toLowerCase().includes('samurai')
        );
        const hasGY = [...(env[SIDE.MINE][ENVIRONMENT.GRAVEYARD]||[]), ...(env[SIDE.OPPONENT][ENVIRONMENT.GRAVEYARD]||[])].some(c =>
            c?.card?.name?.toLowerCase().includes('samurai')
        );
        return hasField && hasGY;
    }),

    // Shien's Scheme (77847678) — Trap: if Six Samurai destroyed by battle, SS up to 2 from hand
    77847678: [{
        trigger_type: 'TRAP_NORMAL',
        condition: (env) => (env[SIDE.MINE][ENVIRONMENT.HAND] || []).some(c =>
            c?.card?.name?.toLowerCase().includes('samurai')
        ),
        operation: async (env) => {
            const hand = env[SIDE.MINE][ENVIRONMENT.HAND];
            const valid = hand.filter(c => c?.card?.name?.toLowerCase().includes('samurai'));
            if (!valid.length) return;
            try {
                const result = await openSelector({
                    type: CARD_SELECT_TYPE.CARD_SELECT_FROM_HAND,
                    label: "Shien's Scheme — Special Summon up to 2 Six Samurai from hand",
                    sourceList: valid,
                    numToSelect: Math.min(2, valid.length),
                });
                if (!result?.cardEnvs?.length) return;
                const freshEnv = store.getState().environmentReducer.environment;
                const h = freshEnv[SIDE.MINE][ENVIRONMENT.HAND];
                const field = freshEnv[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD];
                const priorities = [2, 3, 1, 4, 0];
                for (const uid of result.cardEnvs) {
                    const hi = h.findIndex(c => get_unique_id_from_ennvironment(c) === uid);
                    if (hi === -1) continue;
                    const [card] = h.splice(hi, 1);
                    for (const slot of priorities) {
                        if (field[slot] === CARD_TYPE.PLACEHOLDER) {
                            card.current_pos = CARD_POS.FACE;
                            card.summoned_this_turn = true;
                            field[slot] = card;
                            break;
                        }
                    }
                }
                logEvent(LOG_TYPE.SPECIAL, "Shien's Scheme: SS Six Samurai from hand");
                dispatchEnv(freshEnv);
            } catch { /* cancelled */ }
        },
    }],

    // ── MONSTERS ─────────────────────────────────────────────────────────────

    // ── Self-SS conditions (shared helper) ────────────────────────────────────
    // Cards that can SS from hand when another Six Samurai is on field:

    // Legendary Six Samurai - Kageki (2511717)
    // NS: SS 1 Lv4 or lower Six Samurai from hand. Passive: +1500 ATK while another Six Samurai on field.
    2511717: [{
        on_summon: async (env, summonType) => {
            if (summonType !== 'NORMAL_SUMMON') return;
            const hand = env[SIDE.MINE][ENVIRONMENT.HAND];
            const valid = hand.filter(c =>
                c?.card?.name?.toLowerCase().includes('samurai') &&
                (c.card.level || 0) <= 4
            );
            if (!valid.length) return;
            logEvent(LOG_TYPE.EFFECT, 'Kageki: SS 1 Level 4 or lower Six Samurai from hand');
            try {
                const result = await openSelector({
                    type: CARD_SELECT_TYPE.CARD_SELECT_FROM_HAND,
                    label: 'Kageki — Special Summon 1 Level 4 or lower Six Samurai from hand',
                    sourceList: valid,
                    numToSelect: 1,
                });
                if (!result?.cardEnvs?.length) return;
                const freshEnv = store.getState().environmentReducer.environment;
                const h = freshEnv[SIDE.MINE][ENVIRONMENT.HAND];
                const idx = h.findIndex(c => get_unique_id_from_ennvironment(c) === result.cardEnvs[0]);
                if (idx === -1) return;
                const [card] = h.splice(idx, 1);
                const field = freshEnv[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD];
                const priorities = [2, 3, 1, 4, 0];
                for (const slot of priorities) {
                    if (field[slot] === CARD_TYPE.PLACEHOLDER) {
                        card.current_pos = CARD_POS.FACE;
                        card.summoned_this_turn = true;
                        field[slot] = card;
                        break;
                    }
                }
                logEvent(LOG_TYPE.SPECIAL, `Kageki: Special Summoned ${card.card?.name}`);
                dispatchEnv(freshEnv);
            } catch { /* cancelled */ }
        },
        passive_effect: (env, side) => {
            const field = env[side][ENVIRONMENT.MONSTER_FIELD];
            const hasOtherSamurai = field.some(c =>
                c !== CARD_TYPE.PLACEHOLDER && c?.card && c.card.key !== 2511717 &&
                c.card.name?.toLowerCase().includes('samurai')
            );
            if (!hasOtherSamurai) return;
            for (const m of field) {
                if (m !== CARD_TYPE.PLACEHOLDER && m?.card?.key === 2511717) {
                    m.current_atk = (m.current_atk ?? m.card.atk ?? 200) + 1500;
                }
            }
        },
    }],

    // Legendary Six Samurai - Kizan (49721904)
    // SS from hand if other Six Samurai on field. +300 ATK/DEF with 2+ other Six Samurai.
    49721904: [{
        can_hand_ss: (_card, env) => (env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD] || []).some(c =>
            c !== CARD_TYPE.PLACEHOLDER && c?.card && c.card.key !== 49721904 &&
            c.card.name?.toLowerCase().includes('samurai')
        ),
        passive_effect: (env, side) => {
            const field = env[side][ENVIRONMENT.MONSTER_FIELD];
            const otherSamurai = field.filter(c =>
                c !== CARD_TYPE.PLACEHOLDER && c?.card && c.card.key !== 49721904 &&
                c.card.name?.toLowerCase().includes('samurai')
            ).length;
            if (otherSamurai < 2) return;
            for (const m of field) {
                if (m !== CARD_TYPE.PLACEHOLDER && m?.card?.key === 49721904) {
                    m.current_atk = (m.current_atk ?? m.card.atk ?? 1800) + 300;
                    m.current_def = (m.current_def ?? m.card.def ?? 500)  + 300;
                }
            }
        },
    }],

    // Legendary Six Samurai - Shinai (48505422) — SS if Mizuho on field
    48505422: [{
        can_hand_ss: (_card, env) => (env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD] || []).some(c =>
            c !== CARD_TYPE.PLACEHOLDER && c?.card?.key === 74094021
        ),
    }],

    // Legendary Six Samurai - Mizuho (74094021) — SS if Shinai on field; tribute Six Samurai to destroy
    74094021: [{
        can_hand_ss: (_card, env) => (env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD] || []).some(c =>
            c !== CARD_TYPE.PLACEHOLDER && c?.card?.key === 48505422
        ),
        once_per_turn: true,
        condition: (env) => {
            const field = env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD];
            const hasMizuho = field.some(c => c !== CARD_TYPE.PLACEHOLDER && c?.card?.key === 74094021);
            const hasOtherSamurai = field.some(c =>
                c !== CARD_TYPE.PLACEHOLDER && c?.card && c.card.key !== 74094021 &&
                c.card.name?.toLowerCase().includes('samurai')
            );
            return hasMizuho && hasOtherSamurai;
        },
        operation: async (env) => {
            const field = env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD];
            const samurai = field.filter(c =>
                c !== CARD_TYPE.PLACEHOLDER && c?.card && c.card.key !== 74094021 &&
                c.card.name?.toLowerCase().includes('samurai')
            );
            try {
                const trib = await openSelector({
                    type: CARD_SELECT_TYPE.CARD_SELECT_FROM_HAND,
                    label: 'Mizuho — tribute 1 Six Samurai to destroy a field card',
                    sourceList: samurai,
                    numToSelect: 1,
                });
                if (!trib?.cardEnvs?.length) return;
                const freshEnv = store.getState().environmentReducer.environment;
                const mf = freshEnv[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD];
                const ti = mf.findIndex(c => get_unique_id_from_ennvironment(c) === trib.cardEnvs[0]);
                if (ti !== -1) {
                    freshEnv[SIDE.MINE][ENVIRONMENT.GRAVEYARD].push(mf[ti]);
                    mf[ti] = CARD_TYPE.PLACEHOLDER;
                }
                // Select target to destroy (any face-up card)
                const oppField = [
                    ...(freshEnv[SIDE.OPPONENT][ENVIRONMENT.MONSTER_FIELD] || []).filter(c => c !== CARD_TYPE.PLACEHOLDER && c?.card),
                    ...(freshEnv[SIDE.OPPONENT][ENVIRONMENT.SPELL_FIELD]   || []).filter(c => c?.card),
                    ...(freshEnv[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD]     || []).filter(c => c !== CARD_TYPE.PLACEHOLDER && c?.card),
                    ...(freshEnv[SIDE.MINE][ENVIRONMENT.SPELL_FIELD]       || []).filter(c => c?.card),
                ];
                if (!oppField.length) { dispatchEnv(freshEnv); return; }
                const dest = await openSelector({
                    type: CARD_SELECT_TYPE.CARD_SELECT_BATTLE_SELECT,
                    label: 'Mizuho — select 1 card to destroy',
                    sourceList: oppField,
                    numToSelect: 1,
                });
                if (!dest?.cardEnvs?.length) { dispatchEnv(freshEnv); return; }
                const after = store.getState().environmentReducer.environment;
                for (const s of [SIDE.MINE, SIDE.OPPONENT]) {
                    for (const zone of [ENVIRONMENT.MONSTER_FIELD, ENVIRONMENT.SPELL_FIELD]) {
                        const arr = after[s][zone];
                        for (let i = 0; i < arr.length; i++) {
                            if (arr[i] !== CARD_TYPE.PLACEHOLDER && arr[i]?.card &&
                                get_unique_id_from_ennvironment(arr[i]) === dest.cardEnvs[0]) {
                                after[s][ENVIRONMENT.GRAVEYARD].push(arr[i]);
                                arr[i] = CARD_TYPE.PLACEHOLDER;
                                logEvent(LOG_TYPE.EFFECT, `Mizuho: destroyed ${arr[i-1]?.card?.name || 'a card'}`);
                                dispatchEnv(after);
                                return;
                            }
                        }
                    }
                }
                dispatchEnv(after);
            } catch { /* cancelled */ }
        },
    }],

    // Legendary Six Samurai - Enishi (75116619) — Once per turn: banish 2 Six Samurai from GY, bounce 1 monster
    75116619: oncePerTurn(
        async (env, side = SIDE.MINE) => {
            const gy = env[side][ENVIRONMENT.GRAVEYARD];
            const samuraiInGY = gy.filter(c => c?.card?.name?.toLowerCase().includes('samurai'));
            if (samuraiInGY.length < 2) return;
            const oppField = (env[SIDE.OPPONENT][ENVIRONMENT.MONSTER_FIELD] || []).filter(c =>
                c !== CARD_TYPE.PLACEHOLDER && c?.card
            );
            if (!oppField.length) return;
            try {
                const banishResult = await openSelector({
                    type: CARD_SELECT_TYPE.CARD_SELECT_FROM_HAND,
                    label: 'Enishi — banish 2 Six Samurai from GY',
                    sourceList: samuraiInGY,
                    numToSelect: 2,
                });
                if (!banishResult?.cardEnvs || banishResult.cardEnvs.length < 2) return;
                const freshEnv = store.getState().environmentReducer.environment;
                const g = freshEnv[side][ENVIRONMENT.GRAVEYARD];
                for (const uid of banishResult.cardEnvs) {
                    const bi = g.findIndex(c => get_unique_id_from_ennvironment(c) === uid);
                    if (bi !== -1) g.splice(bi, 1); // banish (simplified: remove from GY)
                }
                const targets = (freshEnv[SIDE.OPPONENT][ENVIRONMENT.MONSTER_FIELD] || []).filter(c =>
                    c !== CARD_TYPE.PLACEHOLDER && c?.card
                );
                if (!targets.length) { dispatchEnv(freshEnv); return; }
                const bounce = await openSelector({
                    type: CARD_SELECT_TYPE.CARD_SELECT_BATTLE_SELECT,
                    label: 'Enishi — return 1 monster to hand',
                    sourceList: targets,
                    numToSelect: 1,
                });
                if (!bounce?.cardEnvs?.length) { dispatchEnv(freshEnv); return; }
                const after = store.getState().environmentReducer.environment;
                const om = after[SIDE.OPPONENT][ENVIRONMENT.MONSTER_FIELD];
                for (let i = 0; i < om.length; i++) {
                    if (om[i] !== CARD_TYPE.PLACEHOLDER && om[i]?.card &&
                        get_unique_id_from_ennvironment(om[i]) === bounce.cardEnvs[0]) {
                        after[SIDE.OPPONENT][ENVIRONMENT.HAND].push(om[i]);
                        om[i] = CARD_TYPE.PLACEHOLDER;
                        logEvent(LOG_TYPE.EFFECT, `Enishi: returned ${om[i+1]?.card?.name || 'a monster'} to hand`);
                        break;
                    }
                }
                dispatchEnv(after);
            } catch { /* cancelled */ }
        },
        (env) => {
            const gy = env[SIDE.MINE][ENVIRONMENT.GRAVEYARD] || [];
            const twoSamuraiInGY = gy.filter(c => c?.card?.name?.toLowerCase().includes('samurai')).length >= 2;
            const oppHasMonster = (env[SIDE.OPPONENT][ENVIRONMENT.MONSTER_FIELD] || []).some(c =>
                c !== CARD_TYPE.PLACEHOLDER && c?.card
            );
            return twoSamuraiInGY && oppHasMonster;
        }
    ),

    // Grandmaster of the Six Samurai (83039729) — SS from hand if other Six Samurai on field (only 1 allowed)
    // On destroyed by opponent's effect: add 1 Six Samurai from GY to hand
    83039729: [{
        can_hand_ss: (_card, env) => {
            const field = env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD] || [];
            const alreadyOnField = field.some(c => c !== CARD_TYPE.PLACEHOLDER && c?.card?.key === 83039729);
            const hasOtherSamurai = field.some(c =>
                c !== CARD_TYPE.PLACEHOLDER && c?.card && c.card.name?.toLowerCase().includes('samurai')
            );
            return !alreadyOnField && hasOtherSamurai;
        },
    }],

    // Hand of the Six Samurai (78792195) — tribute 1 Six Samurai to destroy 1 monster (if another on field)
    78792195: oncePerTurn(
        async (env, side = SIDE.MINE) => {
            const field = env[side][ENVIRONMENT.MONSTER_FIELD];
            const samurai = field.filter(c =>
                c !== CARD_TYPE.PLACEHOLDER && c?.card?.name?.toLowerCase().includes('samurai') &&
                c.card.key !== 78792195
            );
            if (!samurai.length) return;
            const oppMonsters = (env[SIDE.OPPONENT][ENVIRONMENT.MONSTER_FIELD] || []).filter(c =>
                c !== CARD_TYPE.PLACEHOLDER && c?.card
            );
            if (!oppMonsters.length) return;
            try {
                const trib = await openSelector({
                    type: CARD_SELECT_TYPE.CARD_SELECT_FROM_HAND,
                    label: 'Hand of the Six Samurai — tribute 1 Six Samurai',
                    sourceList: samurai,
                    numToSelect: 1,
                });
                if (!trib?.cardEnvs?.length) return;
                const freshEnv = store.getState().environmentReducer.environment;
                const mf = freshEnv[side][ENVIRONMENT.MONSTER_FIELD];
                const ti = mf.findIndex(c => get_unique_id_from_ennvironment(c) === trib.cardEnvs[0]);
                if (ti !== -1) {
                    freshEnv[side][ENVIRONMENT.GRAVEYARD].push(mf[ti]);
                    mf[ti] = CARD_TYPE.PLACEHOLDER;
                }
                const targets = (freshEnv[SIDE.OPPONENT][ENVIRONMENT.MONSTER_FIELD] || []).filter(c =>
                    c !== CARD_TYPE.PLACEHOLDER && c?.card
                );
                if (!targets.length) { dispatchEnv(freshEnv); return; }
                const dest = await openSelector({
                    type: CARD_SELECT_TYPE.CARD_SELECT_BATTLE_SELECT,
                    label: 'Hand of the Six Samurai — destroy 1 monster',
                    sourceList: targets,
                    numToSelect: 1,
                });
                if (!dest?.cardEnvs?.length) { dispatchEnv(freshEnv); return; }
                const after = store.getState().environmentReducer.environment;
                const om = after[SIDE.OPPONENT][ENVIRONMENT.MONSTER_FIELD];
                for (let i = 0; i < om.length; i++) {
                    if (om[i] !== CARD_TYPE.PLACEHOLDER && om[i]?.card &&
                        get_unique_id_from_ennvironment(om[i]) === dest.cardEnvs[0]) {
                        const isPend = om[i].card?.card_type === 'MONSTER_PENDULUM';
                        after[SIDE.OPPONENT][isPend ? ENVIRONMENT.EXTRA_DECK : ENVIRONMENT.GRAVEYARD].push(om[i]);
                        om[i] = CARD_TYPE.PLACEHOLDER;
                        logEvent(LOG_TYPE.EFFECT, 'Hand of the Six Samurai: destroyed a monster');
                        break;
                    }
                }
                dispatchEnv(after);
            } catch { /* cancelled */ }
        },
        (env) => {
            const field = env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD] || [];
            const handOnField = field.some(c => c !== CARD_TYPE.PLACEHOLDER && c?.card?.key === 78792195);
            const otherSamurai = field.some(c =>
                c !== CARD_TYPE.PLACEHOLDER && c?.card && c.card.key !== 78792195 &&
                c.card.name?.toLowerCase().includes('samurai')
            );
            return handOnField && otherSamurai;
        }
    ),

    // The Six Samurai - Kamon (90397998) — once per turn: destroy 1 face-up S/T (cannot attack that turn)
    90397998: oncePerTurn(
        async (env, side = SIDE.MINE) => {
            const oppST = (env[SIDE.OPPONENT][ENVIRONMENT.SPELL_FIELD] || []).filter(c =>
                c?.card && c.current_pos === CARD_POS.FACE
            );
            if (!oppST.length) return;
            try {
                const result = await openSelector({
                    type: CARD_SELECT_TYPE.CARD_SELECT_FROM_HAND,
                    label: 'Kamon — destroy 1 face-up Spell/Trap',
                    sourceList: oppST,
                    numToSelect: 1,
                });
                if (!result?.cardEnvs?.length) return;
                const freshEnv = store.getState().environmentReducer.environment;
                const sf = freshEnv[SIDE.OPPONENT][ENVIRONMENT.SPELL_FIELD];
                for (let i = 0; i < sf.length; i++) {
                    if (sf[i]?.card && get_unique_id_from_ennvironment(sf[i]) === result.cardEnvs[0]) {
                        freshEnv[SIDE.OPPONENT][ENVIRONMENT.GRAVEYARD].push(sf[i]);
                        sf[i] = CARD_TYPE.PLACEHOLDER;
                        logEvent(LOG_TYPE.EFFECT, 'Kamon: destroyed a face-up Spell/Trap');
                        break;
                    }
                }
                // Mark Kamon as having used effect (cannot attack)
                const mf = freshEnv[side][ENVIRONMENT.MONSTER_FIELD];
                const ki = mf.findIndex(c => c?.card?.key === 90397998);
                if (ki !== -1) mf[ki].attacked_this_turn = true;
                dispatchEnv(freshEnv);
            } catch { /* cancelled */ }
        },
        (env) => {
            const field = env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD] || [];
            const kamonOnField = field.some(c => c !== CARD_TYPE.PLACEHOLDER && c?.card?.key === 90397998);
            const hasOtherSamurai = field.some(c =>
                c !== CARD_TYPE.PLACEHOLDER && c?.card && c.card.key !== 90397998 &&
                c.card.name?.toLowerCase().includes('samurai')
            );
            const oppHasFaceUpST = (env[SIDE.OPPONENT][ENVIRONMENT.SPELL_FIELD] || []).some(c =>
                c?.card && c.current_pos === CARD_POS.FACE
            );
            return kamonOnField && hasOtherSamurai && oppHasFaceUpST;
        }
    ),

    // The Six Samurai - Yaichi (64398890) — once per turn: destroy 1 set S/T (cannot attack that turn)
    64398890: oncePerTurn(
        async (env, side = SIDE.MINE) => {
            const oppST = (env[SIDE.OPPONENT][ENVIRONMENT.SPELL_FIELD] || []).filter(c =>
                c?.card && c.current_pos === CARD_POS.SET
            );
            if (!oppST.length) return;
            try {
                const result = await openSelector({
                    type: CARD_SELECT_TYPE.CARD_SELECT_FROM_HAND,
                    label: 'Yaichi — destroy 1 face-down Spell/Trap',
                    sourceList: oppST,
                    numToSelect: 1,
                });
                if (!result?.cardEnvs?.length) return;
                const freshEnv = store.getState().environmentReducer.environment;
                const sf = freshEnv[SIDE.OPPONENT][ENVIRONMENT.SPELL_FIELD];
                for (let i = 0; i < sf.length; i++) {
                    if (sf[i]?.card && get_unique_id_from_ennvironment(sf[i]) === result.cardEnvs[0]) {
                        freshEnv[SIDE.OPPONENT][ENVIRONMENT.GRAVEYARD].push(sf[i]);
                        sf[i] = CARD_TYPE.PLACEHOLDER;
                        logEvent(LOG_TYPE.EFFECT, 'Yaichi: destroyed a face-down Spell/Trap');
                        break;
                    }
                }
                const mf = freshEnv[side][ENVIRONMENT.MONSTER_FIELD];
                const yi = mf.findIndex(c => c?.card?.key === 64398890);
                if (yi !== -1) mf[yi].attacked_this_turn = true;
                dispatchEnv(freshEnv);
            } catch { /* cancelled */ }
        },
        (env) => {
            const field = env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD] || [];
            const yaichiOnField = field.some(c => c !== CARD_TYPE.PLACEHOLDER && c?.card?.key === 64398890);
            const hasOtherSamurai = field.some(c =>
                c !== CARD_TYPE.PLACEHOLDER && c?.card && c.card.key !== 64398890 &&
                c.card.name?.toLowerCase().includes('samurai')
            );
            const oppHasSetST = (env[SIDE.OPPONENT][ENVIRONMENT.SPELL_FIELD] || []).some(c =>
                c?.card && c.current_pos === CARD_POS.SET
            );
            return yaichiOnField && hasOtherSamurai && oppHasSetST;
        }
    ),

    // Secret Six Samurai - Doji (70180284) — SS from hand if other Six Samurai on field
    // When another Six Samurai is NS/SS: mill 1 Six Samurai card from Deck to GY
    70180284: [{
        can_hand_ss: (_card, env) => (env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD] || []).some(c =>
            c !== CARD_TYPE.PLACEHOLDER && c?.card && c.card.key !== 70180284 &&
            c.card.name?.toLowerCase().includes('samurai')
        ),
    }],

    // Anarchist Monk (80570228) — SS from hand if other Six Samurai on field
    // On sent to GY: add 1 Six Samurai Quick-Play Spell from Deck to hand
    80570228: [{
        can_hand_ss: (_card, env) => (env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD] || []).some(c =>
            c !== CARD_TYPE.PLACEHOLDER && c?.card && c.card.key !== 80570228 &&
            c.card.name?.toLowerCase().includes('samurai')
        ),
    }],

    // Tactical Trainer (16968936) — SS from hand if other Six Samurai on field
    16968936: [{
        can_hand_ss: (_card, env) => (env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD] || []).some(c =>
            c !== CARD_TYPE.PLACEHOLDER && c?.card && c.card.key !== 16968936 &&
            c.card.name?.toLowerCase().includes('samurai')
        ),
    }],

    // Elder of the Six Samurai (61737116) — SS from hand if opp has monsters and you have none
    61737116: [{
        can_hand_ss: (_card, env) => {
            const myField  = env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD]     || [];
            const oppField = env[SIDE.OPPONENT][ENVIRONMENT.MONSTER_FIELD] || [];
            return !myField.some(c => c !== CARD_TYPE.PLACEHOLDER && c?.card) &&
                    oppField.some(c => c !== CARD_TYPE.PLACEHOLDER && c?.card);
        },
    }],

    // Great Shogun Shien (63176202) — SS from hand if 2+ Six Samurai on field
    63176202: [{
        can_hand_ss: (_card, env) => {
            const field = env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD] || [];
            return field.filter(c =>
                c !== CARD_TYPE.PLACEHOLDER && c?.card?.name?.toLowerCase().includes('samurai')
            ).length >= 2;
        },
    }],

    // Enishi, Shien's Chancellor (38280762) — SS by banishing 2 Six Samurai from GY
    // Once per turn: destroy 1 face-up monster (cannot attack that turn)
    38280762: [{
        can_hand_ss: (_card, env) => {
            const gy = env[SIDE.MINE][ENVIRONMENT.GRAVEYARD] || [];
            return gy.filter(c => c?.card?.name?.toLowerCase().includes('samurai')).length >= 2;
        },
        pre_summon_cost: async (env, _cardEnv) => {
            const gy = env[SIDE.MINE][ENVIRONMENT.GRAVEYARD] || [];
            const samuraiGY = gy.filter(c => c?.card?.name?.toLowerCase().includes('samurai'));
            if (samuraiGY.length < 2) return false;
            try {
                const result = await openSelector({
                    type: CARD_SELECT_TYPE.CARD_SELECT_FROM_HAND,
                    label: "Enishi, Shien's Chancellor — banish 2 Six Samurai from GY",
                    sourceList: samuraiGY,
                    numToSelect: 2,
                });
                if (!result?.cardEnvs || result.cardEnvs.length < 2) return false;
                const freshEnv = store.getState().environmentReducer.environment;
                const g = freshEnv[SIDE.MINE][ENVIRONMENT.GRAVEYARD];
                for (const uid of result.cardEnvs) {
                    const i = g.findIndex(c => get_unique_id_from_ennvironment(c) === uid);
                    if (i !== -1) g.splice(i, 1);
                }
                dispatchEnv(freshEnv);
                return true;
            } catch { return false; }
        },
        once_per_turn: true,
        condition: (env) => {
            const field = env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD] || [];
            const enishiOnField = field.some(c => c !== CARD_TYPE.PLACEHOLDER && c?.card?.key === 38280762);
            const hasTarget = [...(env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD]||[]),
                              ...(env[SIDE.OPPONENT][ENVIRONMENT.MONSTER_FIELD]||[])].some(c =>
                c !== CARD_TYPE.PLACEHOLDER && c?.card && c.current_pos === CARD_POS.FACE
            );
            return enishiOnField && hasTarget;
        },
        operation: async (env) => {
            const allFaceUp = [
                ...(env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD]||[]),
                ...(env[SIDE.OPPONENT][ENVIRONMENT.MONSTER_FIELD]||[])
            ].filter(c => c !== CARD_TYPE.PLACEHOLDER && c?.card && c.current_pos === CARD_POS.FACE);
            try {
                const result = await openSelector({
                    type: CARD_SELECT_TYPE.CARD_SELECT_BATTLE_SELECT,
                    label: "Enishi, Shien's Chancellor — destroy 1 face-up monster",
                    sourceList: allFaceUp,
                    numToSelect: 1,
                });
                if (!result?.cardEnvs?.length) return;
                const freshEnv = store.getState().environmentReducer.environment;
                for (const s of [SIDE.MINE, SIDE.OPPONENT]) {
                    const mf = freshEnv[s][ENVIRONMENT.MONSTER_FIELD];
                    for (let i = 0; i < mf.length; i++) {
                        if (mf[i] !== CARD_TYPE.PLACEHOLDER && mf[i]?.card &&
                            get_unique_id_from_ennvironment(mf[i]) === result.cardEnvs[0]) {
                            freshEnv[s][ENVIRONMENT.GRAVEYARD].push(mf[i]);
                            mf[i] = CARD_TYPE.PLACEHOLDER;
                            logEvent(LOG_TYPE.EFFECT, "Enishi, Shien's Chancellor: destroyed a monster");
                            // Mark as cannot attack this turn
                            const myMF = freshEnv[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD];
                            const ei = myMF.findIndex(c => c?.card?.key === 38280762);
                            if (ei !== -1) myMF[ei].attacked_this_turn = true;
                            break;
                        }
                    }
                }
                dispatchEnv(freshEnv);
            } catch { /* cancelled */ }
        },
    }],

    // ════════════════════════════════════════════════════════════════════════
    // ── PERFORMAPAL ODD-EYES SYNCHRON ────────────────────────────────────────
    // ════════════════════════════════════════════════════════════════════════

    // Performapal Odd-Eyes Synchron (82224646) — Pendulum Tuner Lv2
    // Monster Effect 1 (on Normal Summon): SS 1 Lv3 or lower Performapal/Odd-Eyes from GY (negated)
    // Monster Effect 2 (once per turn): SS 1 monster from your Pendulum Zone → can then Synchro Summon
    82224646: [{
        on_summon: async (env, summonType) => {
            if (summonType !== 'NORMAL_SUMMON') return;
            const gy = env[SIDE.MINE][ENVIRONMENT.GRAVEYARD];
            const valid = gy.filter(c => {
                if (!c?.card?.card_type?.startsWith('MONSTER')) return false;
                const n = c.card.name?.toLowerCase() || '';
                if (!n.includes('performapal') && !n.includes('odd-eyes')) return false;
                return (c.card.level || 0) <= 3;
            });
            if (!valid.length) return;
            logEvent(LOG_TYPE.EFFECT, 'Odd-Eyes Synchron: SS Lv3 or lower Performapal/Odd-Eyes from GY');
            try {
                const result = await openSelector({
                    type: CARD_SELECT_TYPE.CARD_SELECT_FROM_HAND,
                    label: 'Odd-Eyes Synchron — SS 1 Lv3 or lower Performapal/Odd-Eyes from GY (effects negated)',
                    sourceList: valid, numToSelect: 1,
                });
                if (!result?.cardEnvs?.length) return;
                const freshEnv = store.getState().environmentReducer.environment;
                const g = freshEnv[SIDE.MINE][ENVIRONMENT.GRAVEYARD];
                const idx = g.findIndex(c => get_unique_id_from_ennvironment(c) === result.cardEnvs[0]);
                if (idx === -1) return;
                const [card] = g.splice(idx, 1);
                card.current_pos = CARD_POS.DEFENSE;
                card.summoned_this_turn = true;
                card.effects_negated = true;
                const field = freshEnv[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD];
                for (const slot of [2, 3, 1, 4, 0]) {
                    if (field[slot] === CARD_TYPE.PLACEHOLDER) { field[slot] = card; break; }
                }
                logEvent(LOG_TYPE.SPECIAL, `Odd-Eyes Synchron: SS ${card.card?.name} from GY (negated)`);
                dispatchEnv(freshEnv);
            } catch { /* cancelled */ }
        },
        // Once per turn: SS a monster from your Pendulum Zone → Synchro Summon becomes available
        once_per_turn: true,
        condition: (env) => {
            const onField = (env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD] || []).some(c =>
                c !== CARD_TYPE.PLACEHOLDER && c?.card?.key === 82224646
            );
            const hasPendZone = (env[SIDE.MINE][ENVIRONMENT.PENDULUM_ZONE] || []).some(c => c?.card);
            return onField && hasPendZone;
        },
        operation: async (env) => {
            const pendZone = env[SIDE.MINE][ENVIRONMENT.PENDULUM_ZONE] || [];
            const valid = pendZone.filter(c => c?.card);
            if (!valid.length) return;
            try {
                const result = await openSelector({
                    type: CARD_SELECT_TYPE.CARD_SELECT_FROM_HAND,
                    label: 'Odd-Eyes Synchron — SS 1 monster from your Pendulum Zone',
                    sourceList: valid, numToSelect: 1,
                });
                if (!result?.cardEnvs?.length) return;
                const freshEnv = store.getState().environmentReducer.environment;
                const pz = freshEnv[SIDE.MINE][ENVIRONMENT.PENDULUM_ZONE];
                for (let i = 0; i < pz.length; i++) {
                    if (!pz[i]?.card) continue;
                    if (get_unique_id_from_ennvironment(pz[i]) !== result.cardEnvs[0]) continue;
                    const card = pz[i];
                    pz[i] = null;
                    card.current_pos = CARD_POS.FACE;
                    card.summoned_this_turn = true;
                    const field = freshEnv[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD];
                    for (const slot of [2, 3, 1, 4, 0]) {
                        if (field[slot] === CARD_TYPE.PLACEHOLDER) { field[slot] = card; break; }
                    }
                    logEvent(LOG_TYPE.SPECIAL, `Odd-Eyes Synchron: SS ${card.card?.name} from Pendulum Zone — Synchro Summon now available`);
                    break;
                }
                dispatchEnv(freshEnv);
            } catch { /* cancelled */ }
        },
    }],

    // ════════════════════════════════════════════════════════════════════════
    // ── SUPREME KING DRAGONS ─────────────────────────────────────────────────
    // ════════════════════════════════════════════════════════════════════════

    // Supreme King Dragon Darkwurm (69610326) — Pendulum Lv4, DARK Dragon
    // Pendulum Scale 0. Monster: on NS/SS → add Supreme King Gate from Deck to hand.
    //                           If in GY and no monsters: SS itself (banish when it leaves).
    // can_hand_ss: if you control no monsters.
    69610326: [{
        // SS from hand if you control no monsters
        can_hand_ss: (_card, env) => !(env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD] || []).some(
            c => c !== CARD_TYPE.PLACEHOLDER && c?.card
        ),
        // On NS/SS: search Supreme King Gate monster from Deck
        on_summon: async (env) => {
            const deck = env[SIDE.MINE][ENVIRONMENT.DECK];
            const valid = deck.filter(c => c?.card?.name?.toLowerCase().includes('supreme king gate'));
            if (!valid.length) return;
            logEvent(LOG_TYPE.EFFECT, 'Supreme King Dragon Darkwurm: add 1 Supreme King Gate from Deck to hand');
            try {
                const result = await openSelector({
                    type: CARD_SELECT_TYPE.CARD_SELECT_FROM_DECK,
                    label: 'Darkwurm — add 1 Supreme King Gate monster from Deck to hand',
                    sourceList: valid, numToSelect: 1,
                });
                if (!result?.cardEnvs?.length) return;
                const freshEnv = store.getState().environmentReducer.environment;
                const d = freshEnv[SIDE.MINE][ENVIRONMENT.DECK];
                const idx = d.findIndex(c => get_unique_id_from_ennvironment(c) === result.cardEnvs[0]);
                if (idx !== -1) {
                    freshEnv[SIDE.MINE][ENVIRONMENT.HAND].push(d.splice(idx, 1)[0]);
                    logEvent(LOG_TYPE.EFFECT, 'Darkwurm: added Supreme King Gate to hand');
                }
                dispatchEnv(freshEnv);
            } catch { /* cancelled */ }
        },
        // Once per turn from GY: SS itself if you control no monsters
        once_per_turn: true,
        condition: (env) => {
            const inGY = (env[SIDE.MINE][ENVIRONMENT.GRAVEYARD] || []).some(c => c?.card?.key === 69610326);
            const noMonsters = !(env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD] || []).some(c =>
                c !== CARD_TYPE.PLACEHOLDER && c?.card
            );
            return inGY && noMonsters;
        },
        operation: (env) => {
            const gy = env[SIDE.MINE][ENVIRONMENT.GRAVEYARD];
            const idx = gy.findIndex(c => c?.card?.key === 69610326);
            if (idx === -1) return;
            const [card] = gy.splice(idx, 1);
            card.current_pos = CARD_POS.FACE;
            card.summoned_this_turn = true;
            card.banish_on_leave = true; // flag for future enforcement
            const field = env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD];
            for (const slot of [2, 3, 1, 4, 0]) {
                if (field[slot] === CARD_TYPE.PLACEHOLDER) { field[slot] = card; break; }
            }
            logEvent(LOG_TYPE.SPECIAL, 'Supreme King Dragon Darkwurm: SS itself from GY');
            dispatchEnv(env);
        },
    }],

    // Supreme King Dragon Lightwurm (41908872) — Pendulum Tuner Lv4, LIGHT Dragon
    // Monster Effect 1 (on NS/SS): add 1 Supreme King Gate from Deck/Extra Deck face-up to hand/Pendulum Zone
    // Monster Effect 2 (once per turn): if a Pendulum Monster is destroyed, SS 1 Supreme King Dragon from Extra Deck
    41908872: [{
        on_summon: async (env) => {
            // Search Supreme King Gate pendulum monsters from Deck or face-up Extra Deck
            const deck = env[SIDE.MINE][ENVIRONMENT.DECK];
            const extra = (env[SIDE.MINE][ENVIRONMENT.EXTRA_DECK] || []).filter(c =>
                c?.card?.card_type === 'MONSTER_PENDULUM' && c?.card?.name?.toLowerCase().includes('supreme king gate')
            );
            const deckGates = deck.filter(c => c?.card?.name?.toLowerCase().includes('supreme king gate'));
            const pool = [...deckGates, ...extra];
            if (!pool.length) return;
            logEvent(LOG_TYPE.EFFECT, 'Supreme King Dragon Lightwurm: searching Supreme King Gate');
            try {
                const result = await openSelector({
                    type: CARD_SELECT_TYPE.CARD_SELECT_FROM_DECK,
                    label: 'Lightwurm — add 1 Supreme King Gate from Deck/Extra Deck to hand',
                    sourceList: pool, numToSelect: 1,
                });
                if (!result?.cardEnvs?.length) return;
                const freshEnv = store.getState().environmentReducer.environment;
                for (const loc of [ENVIRONMENT.DECK, ENVIRONMENT.EXTRA_DECK]) {
                    const arr = freshEnv[SIDE.MINE][loc];
                    const idx = arr.findIndex(c => get_unique_id_from_ennvironment(c) === result.cardEnvs[0]);
                    if (idx !== -1) {
                        freshEnv[SIDE.MINE][ENVIRONMENT.HAND].push(arr.splice(idx, 1)[0]);
                        logEvent(LOG_TYPE.EFFECT, 'Lightwurm: added Supreme King Gate to hand');
                        dispatchEnv(freshEnv);
                        return;
                    }
                }
            } catch { /* cancelled */ }
        },
        // Once per turn: if a Pendulum Monster was destroyed this turn, SS 1 Supreme King Dragon from Extra Deck
        once_per_turn: true,
        condition: (env) => {
            const onField = (env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD] || []).some(c =>
                c !== CARD_TYPE.PLACEHOLDER && c?.card?.key === 41908872
            );
            const hasSkTarget = (env[SIDE.MINE][ENVIRONMENT.EXTRA_DECK] || []).some(c =>
                c?.card?.card_type?.startsWith('MONSTER') && c?.card?.name?.toLowerCase().includes('supreme king dragon')
            );
            return onField && hasSkTarget;
        },
        operation: async (env) => {
            const valid = (env[SIDE.MINE][ENVIRONMENT.EXTRA_DECK] || []).filter(c =>
                c?.card?.card_type?.startsWith('MONSTER') && c?.card?.name?.toLowerCase().includes('supreme king dragon')
            );
            if (!valid.length) return;
            try {
                const result = await openSelector({
                    type: CARD_SELECT_TYPE.CARD_SELECT_FROM_HAND,
                    label: 'Lightwurm — SS 1 Supreme King Dragon from Extra Deck',
                    sourceList: valid, numToSelect: 1,
                });
                if (!result?.cardEnvs?.length) return;
                const freshEnv = store.getState().environmentReducer.environment;
                const ed = freshEnv[SIDE.MINE][ENVIRONMENT.EXTRA_DECK];
                const idx = ed.findIndex(c => get_unique_id_from_ennvironment(c) === result.cardEnvs[0]);
                if (idx === -1) return;
                const [card] = ed.splice(idx, 1);
                card.current_pos = CARD_POS.FACE;
                card.summoned_this_turn = true;
                const field = freshEnv[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD];
                for (const slot of [2, 3, 1, 4, 0]) {
                    if (field[slot] === CARD_TYPE.PLACEHOLDER) { field[slot] = card; break; }
                }
                logEvent(LOG_TYPE.SPECIAL, `Lightwurm: SS ${card.card?.name} from Extra Deck`);
                dispatchEnv(freshEnv);
            } catch { /* cancelled */ }
        },
    }],

    // Supreme King Dragon Odd-Eyes (96733134) — Pendulum Lv8, DARK Dragon
    // Pendulum Effect (once per turn): Tribute 1 Supreme King Dragon → destroy this card,
    //   add 1 Pendulum Monster with 1500 or less ATK from Deck to hand
    // Monster Effect 1: Tribute 2 Supreme King Dragon monsters → SS from hand
    // Monster Effect 2 (passive): Pendulum Monster battles → battle damage doubled
    // Monster Effect 3 (Quick Effect, Battle Phase): Tribute this card → SS up to 2 SK Dragon/Gate from Extra Deck in DEF
    96733134: [{
        battle_damage_multiplier: 2, // Pendulum Monsters you control deal double battle damage
        can_hand_ss: (_card, env) => {
            const mf = env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD] || [];
            const skDragons = mf.filter(c =>
                c !== CARD_TYPE.PLACEHOLDER && c?.card?.name?.toLowerCase().includes('supreme king dragon')
            );
            return skDragons.length >= 2;
        },
        pre_summon_cost: async (env, _cardEnv) => {
            const mf = env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD];
            const skDragons = mf.filter(c =>
                c !== CARD_TYPE.PLACEHOLDER && c?.card?.name?.toLowerCase().includes('supreme king dragon')
            );
            if (skDragons.length < 2) return false;
            try {
                const result = await openSelector({
                    type: CARD_SELECT_TYPE.CARD_SELECT_FROM_HAND,
                    label: 'SK Dragon Odd-Eyes — tribute 2 Supreme King Dragon monsters',
                    sourceList: skDragons, numToSelect: 2,
                });
                if (!result?.cardEnvs || result.cardEnvs.length < 2) return false;
                const freshEnv = store.getState().environmentReducer.environment;
                const fm = freshEnv[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD];
                for (const uid of result.cardEnvs) {
                    for (let i = 0; i < fm.length; i++) {
                        if (fm[i] !== CARD_TYPE.PLACEHOLDER && fm[i]?.card &&
                            get_unique_id_from_ennvironment(fm[i]) === uid) {
                            freshEnv[SIDE.MINE][ENVIRONMENT.GRAVEYARD].push(fm[i]);
                            fm[i] = CARD_TYPE.PLACEHOLDER;
                            break;
                        }
                    }
                }
                dispatchEnv(freshEnv);
                return true;
            } catch { return false; }
        },
        // Once per turn (Battle Phase Quick Effect): tribute this card → SS 2 SK monsters from Extra Deck in DEF
        once_per_turn: true,
        condition: (env) => {
            const mf = env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD] || [];
            const onField = mf.some(c => c !== CARD_TYPE.PLACEHOLDER && c?.card?.key === 96733134);
            const hasSKInExtra = (env[SIDE.MINE][ENVIRONMENT.EXTRA_DECK] || []).some(c =>
                c?.card?.card_type === 'MONSTER_PENDULUM' && (
                    c?.card?.name?.toLowerCase().includes('supreme king dragon') ||
                    c?.card?.name?.toLowerCase().includes('supreme king gate')
                )
            );
            return onField && hasSKInExtra;
        },
        operation: async (env) => {
            const validED = (env[SIDE.MINE][ENVIRONMENT.EXTRA_DECK] || []).filter(c =>
                c?.card?.card_type === 'MONSTER_PENDULUM' && (
                    c?.card?.name?.toLowerCase().includes('supreme king dragon') ||
                    c?.card?.name?.toLowerCase().includes('supreme king gate')
                ) && c?.card?.key !== 96733134
            );
            if (!validED.length) return;
            try {
                const result = await openSelector({
                    type: CARD_SELECT_TYPE.CARD_SELECT_FROM_HAND,
                    label: 'SK Dragon Odd-Eyes — SS up to 2 SK Dragon/Gate Pendulums from Extra Deck (DEF)',
                    sourceList: validED,
                    numToSelect: Math.min(2, validED.length),
                });
                if (!result?.cardEnvs?.length) return;
                const freshEnv = store.getState().environmentReducer.environment;
                // Tribute SK Odd-Eyes itself
                const fm = freshEnv[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD];
                const si = fm.findIndex(c => c !== CARD_TYPE.PLACEHOLDER && c?.card?.key === 96733134);
                if (si !== -1) { freshEnv[SIDE.MINE][ENVIRONMENT.GRAVEYARD].push(fm[si]); fm[si] = CARD_TYPE.PLACEHOLDER; }
                // SS chosen monsters
                const ed = freshEnv[SIDE.MINE][ENVIRONMENT.EXTRA_DECK];
                for (const uid of result.cardEnvs) {
                    const idx = ed.findIndex(c => get_unique_id_from_ennvironment(c) === uid);
                    if (idx === -1) continue;
                    const [card] = ed.splice(idx, 1);
                    card.current_pos = CARD_POS.DEFENSE;
                    card.summoned_this_turn = true;
                    for (const slot of [2, 3, 1, 4, 0]) {
                        if (fm[slot] === CARD_TYPE.PLACEHOLDER) { fm[slot] = card; break; }
                    }
                    logEvent(LOG_TYPE.SPECIAL, `SK Odd-Eyes: SS ${card.card?.name} in DEF`);
                }
                dispatchEnv(freshEnv);
            } catch { /* cancelled */ }
        },
    }],

    // Supreme King Gate Zero (96227613) — Pendulum Fiend, Scale 0
    // Monster Effect: destroy itself + 1 other face-up card you control → SS Dragon Fusion/Synchro from Extra Deck
    // If destroyed in Monster Zone: place in Pendulum Zone
    96227613: oncePerTurn(
        async (env, side = SIDE.MINE) => {
            const mf = env[side][ENVIRONMENT.MONSTER_FIELD];
            const gateZero = mf.find(c => c !== CARD_TYPE.PLACEHOLDER && c?.card?.key === 96227613);
            if (!gateZero) return;
            const others = mf.filter(c =>
                c !== CARD_TYPE.PLACEHOLDER && c?.card && c.card.key !== 96227613
            );
            if (!others.length) return;
            const valid = (env[side][ENVIRONMENT.EXTRA_DECK] || []).filter(c =>
                c?.card?.card_type === 'MONSTER_FUSION' || c?.card?.card_type === 'MONSTER_SYNCHRO'
            ).filter(c => c?.card?.race?.toLowerCase().includes('dragon'));
            if (!valid.length) return;
            try {
                const target = await openSelector({
                    type: CARD_SELECT_TYPE.CARD_SELECT_FROM_HAND,
                    label: 'Gate Zero — destroy 1 other face-up card you control',
                    sourceList: others, numToSelect: 1,
                });
                if (!target?.cardEnvs?.length) return;
                const freshEnv = store.getState().environmentReducer.environment;
                const fm = freshEnv[side][ENVIRONMENT.MONSTER_FIELD];
                // Destroy the selected target
                for (let i = 0; i < fm.length; i++) {
                    if (fm[i] !== CARD_TYPE.PLACEHOLDER && fm[i]?.card &&
                        get_unique_id_from_ennvironment(fm[i]) === target.cardEnvs[0]) {
                        freshEnv[side][ENVIRONMENT.GRAVEYARD].push(fm[i]);
                        fm[i] = CARD_TYPE.PLACEHOLDER;
                        break;
                    }
                }
                // Destroy Gate Zero itself
                const gi = fm.findIndex(c => c !== CARD_TYPE.PLACEHOLDER && c?.card?.key === 96227613);
                if (gi !== -1) { freshEnv[side][ENVIRONMENT.GRAVEYARD].push(fm[gi]); fm[gi] = CARD_TYPE.PLACEHOLDER; }

                const pick = await openSelector({
                    type: CARD_SELECT_TYPE.CARD_SELECT_FROM_HAND,
                    label: 'Gate Zero — SS 1 Dragon Fusion/Synchro from Extra Deck (ATK 0, effects negated)',
                    sourceList: (freshEnv[side][ENVIRONMENT.EXTRA_DECK] || []).filter(c =>
                        (c?.card?.card_type === 'MONSTER_FUSION' || c?.card?.card_type === 'MONSTER_SYNCHRO') &&
                        c?.card?.race?.toLowerCase().includes('dragon')
                    ), numToSelect: 1,
                });
                if (!pick?.cardEnvs?.length) { dispatchEnv(freshEnv); return; }
                const after = store.getState().environmentReducer.environment;
                const ed = after[side][ENVIRONMENT.EXTRA_DECK];
                const ei = ed.findIndex(c => get_unique_id_from_ennvironment(c) === pick.cardEnvs[0]);
                if (ei !== -1) {
                    const [card] = ed.splice(ei, 1);
                    card.current_pos = CARD_POS.FACE;
                    card.current_atk = 0;
                    card.current_def = 0;
                    card.effects_negated = true;
                    const f2 = after[side][ENVIRONMENT.MONSTER_FIELD];
                    for (const slot of [2, 3, 1, 4, 0]) {
                        if (f2[slot] === CARD_TYPE.PLACEHOLDER) { f2[slot] = card; break; }
                    }
                    logEvent(LOG_TYPE.SPECIAL, `Gate Zero: SS ${card.card?.name} (ATK 0, negated)`);
                }
                dispatchEnv(after);
            } catch { /* cancelled */ }
        },
        (env) => {
            const mf = env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD] || [];
            const gateOnField = mf.some(c => c !== CARD_TYPE.PLACEHOLDER && c?.card?.key === 96227613);
            const hasOther = mf.some(c => c !== CARD_TYPE.PLACEHOLDER && c?.card && c.card.key !== 96227613);
            const hasDragon = (env[SIDE.MINE][ENVIRONMENT.EXTRA_DECK] || []).some(c =>
                (c?.card?.card_type === 'MONSTER_FUSION' || c?.card?.card_type === 'MONSTER_SYNCHRO') &&
                c?.card?.race?.toLowerCase().includes('dragon')
            );
            return gateOnField && hasOther && hasDragon;
        }
    ),

    // Supreme King Gate Infinity (22211622) — Pendulum Fiend, Scale 13
    // Monster Effect: destroy itself + 1 other → SS Dragon XYZ/Pendulum from Extra Deck (ATK 0, negated)
    22211622: oncePerTurn(
        async (env, side = SIDE.MINE) => {
            const mf = env[side][ENVIRONMENT.MONSTER_FIELD];
            const gateInf = mf.find(c => c !== CARD_TYPE.PLACEHOLDER && c?.card?.key === 22211622);
            if (!gateInf) return;
            const others = mf.filter(c => c !== CARD_TYPE.PLACEHOLDER && c?.card && c.card.key !== 22211622);
            if (!others.length) return;
            const validED = (env[side][ENVIRONMENT.EXTRA_DECK] || []).filter(c =>
                c?.card?.card_type === 'MONSTER_XYZ' || c?.card?.card_type === 'MONSTER_PENDULUM'
            ).filter(c => c?.card?.race?.toLowerCase().includes('dragon'));
            if (!validED.length) return;
            try {
                const target = await openSelector({
                    type: CARD_SELECT_TYPE.CARD_SELECT_FROM_HAND,
                    label: 'Gate Infinity — destroy 1 other face-up card you control',
                    sourceList: others, numToSelect: 1,
                });
                if (!target?.cardEnvs?.length) return;
                const freshEnv = store.getState().environmentReducer.environment;
                const fm = freshEnv[side][ENVIRONMENT.MONSTER_FIELD];
                for (let i = 0; i < fm.length; i++) {
                    if (fm[i] !== CARD_TYPE.PLACEHOLDER && fm[i]?.card &&
                        get_unique_id_from_ennvironment(fm[i]) === target.cardEnvs[0]) {
                        freshEnv[side][ENVIRONMENT.GRAVEYARD].push(fm[i]);
                        fm[i] = CARD_TYPE.PLACEHOLDER;
                        break;
                    }
                }
                const gi = fm.findIndex(c => c !== CARD_TYPE.PLACEHOLDER && c?.card?.key === 22211622);
                if (gi !== -1) { freshEnv[side][ENVIRONMENT.GRAVEYARD].push(fm[gi]); fm[gi] = CARD_TYPE.PLACEHOLDER; }
                const pool = (freshEnv[side][ENVIRONMENT.EXTRA_DECK] || []).filter(c =>
                    (c?.card?.card_type === 'MONSTER_XYZ' || c?.card?.card_type === 'MONSTER_PENDULUM') &&
                    c?.card?.race?.toLowerCase().includes('dragon')
                );
                if (!pool.length) { dispatchEnv(freshEnv); return; }
                const pick = await openSelector({
                    type: CARD_SELECT_TYPE.CARD_SELECT_FROM_HAND,
                    label: 'Gate Infinity — SS 1 Dragon XYZ/Pendulum from Extra Deck (ATK 0, negated)',
                    sourceList: pool, numToSelect: 1,
                });
                if (!pick?.cardEnvs?.length) { dispatchEnv(freshEnv); return; }
                const after = store.getState().environmentReducer.environment;
                const ed = after[side][ENVIRONMENT.EXTRA_DECK];
                const ei = ed.findIndex(c => get_unique_id_from_ennvironment(c) === pick.cardEnvs[0]);
                if (ei !== -1) {
                    const [card] = ed.splice(ei, 1);
                    card.current_pos = CARD_POS.FACE;
                    card.current_atk = 0; card.current_def = 0;
                    card.effects_negated = true;
                    const f2 = after[side][ENVIRONMENT.MONSTER_FIELD];
                    for (const slot of [2, 3, 1, 4, 0]) {
                        if (f2[slot] === CARD_TYPE.PLACEHOLDER) { f2[slot] = card; break; }
                    }
                    logEvent(LOG_TYPE.SPECIAL, `Gate Infinity: SS ${card.card?.name} (ATK 0, negated)`);
                }
                dispatchEnv(after);
            } catch { /* cancelled */ }
        },
        (env) => {
            const mf = env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD] || [];
            return mf.some(c => c !== CARD_TYPE.PLACEHOLDER && c?.card?.key === 22211622) &&
                   mf.some(c => c !== CARD_TYPE.PLACEHOLDER && c?.card && c.card.key !== 22211622) &&
                   (env[SIDE.MINE][ENVIRONMENT.EXTRA_DECK] || []).some(c =>
                       (c?.card?.card_type === 'MONSTER_XYZ' || c?.card?.card_type === 'MONSTER_PENDULUM') &&
                       c?.card?.race?.toLowerCase().includes('dragon')
                   );
        }
    ),

    // Achacha Archer (98865920) — When Normal or Special Summoned: inflict 500 damage
    98865920: onSummon(dealDamage(500)),

    // Goblindbergh (25259669) — When Normal Summoned: SS 1 Level 4 or lower from hand (DEF)
    // XYZ/Synchro/Fusion/Link monsters cannot be special summoned this way (they have no Level)
    25259669: [{
        on_summon: async (env, summonType) => {
            if (summonType !== 'NORMAL_SUMMON') return;
            const EXTRA_DECK_TYPES = ['MONSTER_XYZ', 'MONSTER_FUSION', 'MONSTER_SYNCHRO', 'MONSTER_LINK'];
            const hand = env[SIDE.MINE][ENVIRONMENT.HAND];
            const valid = hand.filter(c =>
                c?.card?.card_type?.startsWith('MONSTER') &&
                !EXTRA_DECK_TYPES.includes(c?.card?.card_type) &&
                (c.card.level ?? 99) <= 4
            );
            if (!valid.length) return;
            logEvent(LOG_TYPE.EFFECT, 'Goblindbergh: Special Summon 1 Level 4 or lower from hand (DEF)');
            try {
                const result = await openSelector({
                    type: CARD_SELECT_TYPE.CARD_SELECT_FROM_HAND,
                    label: 'Goblindbergh — Special Summon 1 Level 4 or lower monster (DEF position)',
                    numToSelect: 1,
                    sourceList: valid,
                });
                if (!result?.cardEnvs?.length) return;
                const freshEnv = store.getState().environmentReducer.environment;
                const freshHand = freshEnv[SIDE.MINE][ENVIRONMENT.HAND];
                const idx = freshHand.findIndex(c => get_unique_id_from_ennvironment(c) === result.cardEnvs[0]);
                if (idx === -1) return;
                const [card] = freshHand.splice(idx, 1);
                const field = freshEnv[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD];
                const priorities = [2, 3, 1, 4, 0];
                for (const slot of priorities) {
                    if (field[slot] === CARD_TYPE.PLACEHOLDER) {
                        card.current_pos = CARD_POS.DEFENSE;
                        card.summoned_this_turn = true;
                        field[slot] = card;
                        break;
                    }
                }
                logEvent(LOG_TYPE.SPECIAL, `Goblindbergh: Special Summoned ${card.card?.name} in DEF`);
                dispatchEnv(freshEnv);
            } catch { /* cancelled */ }
        }
    }],

    // Gagaga Magician (26082117) — Once per turn: declare a Level 1-8, this card becomes that Level until End Phase
    26082117: oncePerTurn(
        async (env, side = SIDE.MINE) => {
            const field = env[side][ENVIRONMENT.MONSTER_FIELD];
            const magician = field.find(c => c?.card?.key === 26082117);
            if (!magician) return;
            const newLevel = await chooseLevel('Gagaga Magician — declare a Level (1-8)');
            if (!newLevel) return;
            magician.current_level = newLevel;
            logEvent(LOG_TYPE.EFFECT, `Gagaga Magician: Level changed to ${newLevel} until End Phase`);
            dispatchEnv(env);
        },
        (env) => env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD].some(
            c => c?.card?.key === 26082117 &&
                 (c.current_pos === CARD_POS.FACE || c.current_pos === CARD_POS.DEFENSE)
        )
    ),

    // Gagaga Cowboy (12014404) — Once per turn: detach 1 XYZ Material;
    // if ATK: deal 800 damage to opponent; if DEF: gain 1000 LP
    12014404: oncePerTurn(
        async (env, side = SIDE.MINE) => {
            const field = env[side][ENVIRONMENT.MONSTER_FIELD];
            const cowboy = field.find(c => c?.card?.key === 12014404);
            if (!cowboy) return;
            const materials = cowboy.xyz_materials || [];
            if (!materials.length) return;

            let detachUid;
            if (materials.length === 1) {
                detachUid = get_unique_id_from_ennvironment(materials[0]);
            } else {
                try {
                    const result = await openSelector({
                        type: CARD_SELECT_TYPE.CARD_SELECT_FROM_HAND,
                        label: 'Gagaga Cowboy — detach 1 XYZ Material',
                        numToSelect: 1,
                        sourceList: materials,
                    });
                    if (!result?.cardEnvs?.length) return;
                    detachUid = result.cardEnvs[0];
                } catch { return; }
            }

            const idx = materials.findIndex(c => get_unique_id_from_ennvironment(c) === detachUid);
            if (idx === -1) return;
            const [detached] = materials.splice(idx, 1);
            env[side][ENVIRONMENT.GRAVEYARD].push(detached);
            logEvent(LOG_TYPE.EFFECT, `Gagaga Cowboy: detached ${detached.card?.name}`);

            const opp = side === SIDE.MINE ? SIDE.OPPONENT : SIDE.MINE;
            if (cowboy.current_pos === CARD_POS.FACE) {
                env[opp].hp = Math.max(0, (env[opp].hp || 0) - 800);
                logEvent(LOG_TYPE.DAMAGE, 'Gagaga Cowboy (ATK): dealt 800 damage to opponent');
            } else {
                env[side].hp = (env[side].hp || 0) + 1000;
                logEvent(LOG_TYPE.EFFECT, 'Gagaga Cowboy (DEF): gained 1000 LP');
            }
            dispatchEnv(env);
        },
        (env) => env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD].some(
            c => c?.card?.key === 12014404 && (c?.xyz_materials?.length > 0)
        )
    ),

    // Odd-Eyes Dragon (53025096) — Level 7 DARK Dragon
    // Monster Effect: doubles battle damage (passive on the card object via battle_damage_multiplier)
    // The ON_BATTLE_DESTROY trigger in triggerRegistry handles the extra damage.
    53025096: [{
        battle_damage_multiplier: 2, // doubles battle damage this card inflicts
    }],

    // Odd-Eyes Pendulum Dragon (16178681)
    // Monster Effect: "If this card battles an opponent's monster, any battle damage it inflicts is doubled."
    // Pendulum Effect: "Once per turn, during your End Phase: You can destroy this card,
    // and if you do, add 1 Pendulum Monster with 1500 or less ATK from your Deck to your hand."
    16178681: [{
        battle_damage_multiplier: 2, // passive — doubles battle damage via Core/Battle multiplier hook
        pendulumEffect: async (env, cardEnv) => {
            const deckPendulums = (env[SIDE.MINE][ENVIRONMENT.DECK] || [])
                .filter(c => c?.card?.card_type === 'MONSTER_PENDULUM' && (c.card.atk ?? 9999) <= 1500);

            if (deckPendulums.length === 0) {
                alert('No Pendulum Monsters with 1500 or less ATK in your Deck.');
                return;
            }

            let result;
            try {
                result = await openSelector({
                    type: CARD_SELECT_TYPE.CARD_SELECT_FROM_DECK,
                    label: 'Odd-Eyes: Add 1 Pendulum Monster (≤1500 ATK) from Deck to Hand',
                    numToSelect: 1,
                    filterFn: c => c?.card?.card_type === 'MONSTER_PENDULUM' && (c.card.atk ?? 9999) <= 1500,
                });
            } catch {
                return; // player cancelled
            }

            if (!result?.cardEnvs?.length) return;

            const freshEnv = store.getState().environmentReducer.environment;

            // Move chosen card from deck to hand
            const deck = freshEnv[SIDE.MINE][ENVIRONMENT.DECK];
            for (const uid of result.cardEnvs) {
                const idx = deck.findIndex(c => get_unique_id_from_ennvironment(c) === uid);
                if (idx !== -1) {
                    const [found] = deck.splice(idx, 1);
                    freshEnv[SIDE.MINE][ENVIRONMENT.HAND].push(found);
                    logEvent(LOG_TYPE.EFFECT, `Odd-Eyes Pendulum Dragon: added ${found.card?.name} to hand`);
                }
            }

            // Remove Odd-Eyes from pendulum zone — pendulum cards go face-up to Extra Deck
            const pendZone = freshEnv[SIDE.MINE][ENVIRONMENT.PENDULUM_ZONE];
            for (let i = 0; i < pendZone.length; i++) {
                if (pendZone[i]?.card?.key === 16178681) {
                    freshEnv[SIDE.MINE][ENVIRONMENT.EXTRA_DECK].push(pendZone[i]);
                    pendZone[i] = null;
                    logEvent(LOG_TYPE.EFFECT, 'Odd-Eyes Pendulum Dragon: moved to Extra Deck face-up');
                    break;
                }
            }

            store.dispatch(update_environment(freshEnv));
        },
    }],

    // Performapal Lizardraw (73130445) — pendulum effect: draw 1, then discard 1 (once per turn)
    73130445: [{
        condition: (_env) => false,
        target: null,
        operation: (_env) => {},
        pendulumEffect: async (_env) => {
            const freshEnv = store.getState().environmentReducer.environment;
            const deck = freshEnv[SIDE.MINE][ENVIRONMENT.DECK];
            if (!deck.length) { alert('No cards in Deck to draw!'); return; }
            const [drawn] = deck.splice(0, 1);
            freshEnv[SIDE.MINE][ENVIRONMENT.HAND].push(drawn);
            logEvent(LOG_TYPE.EFFECT, `Lizardraw: drew ${drawn.card?.name}`);
            store.dispatch(update_environment(freshEnv));

            const hand = freshEnv[SIDE.MINE][ENVIRONMENT.HAND];
            if (!hand.length) return;
            try {
                const { cardEnvs: [uid] } = await openSelector({
                    type: CARD_SELECT_TYPE.CARD_SELECT_FROM_HAND,
                    label: 'Lizardraw — discard 1 card',
                    numToSelect: 1,
                    sourceList: hand,
                });
                const afterEnv = store.getState().environmentReducer.environment;
                const h = afterEnv[SIDE.MINE][ENVIRONMENT.HAND];
                const idx = h.findIndex(c => get_unique_id_from_ennvironment(c) === uid);
                if (idx !== -1) {
                    const [discarded] = h.splice(idx, 1);
                    afterEnv[SIDE.MINE][ENVIRONMENT.GRAVEYARD].push(discarded);
                    logEvent(LOG_TYPE.EFFECT, `Lizardraw: discarded ${discarded.card?.name}`);
                    store.dispatch(update_environment(afterEnv));
                }
            } catch { /* cancelled */ }
        },
    }],
};