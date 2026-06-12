/**
 * effectFactory.js — src/data/effectFactory.js
 *
 * Factory functions that generate effect/trigger registry entries.
 * Each function returns the exact array shape that effectsRegistry.js
 * and triggerRegistry.js already expect — so existing hand-written
 * entries and factory-generated entries coexist with no changes elsewhere.
 *
 * USAGE IN effectsRegistry.js:
 *   import { onActivate, onSummon, searchDeck, drawCards, ... } from './effectFactory';
 *
 *   // Old hand-written style (still works, no need to change):
 *   55144522: [{ condition: ..., operation: ... }]
 *
 *   // New factory style (same output shape, less code):
 *   55144522: onActivate(drawCards(2))
 *   26202165: onDestroy(searchDeck({ atk: { max: 1500 }, type: 'MONSTER' }))
 *   40044918: onSummon(searchDeck({ nameIncludes: 'HERO', type: 'MONSTER' }))
 */

import { ENVIRONMENT, SIDE, CARD_TYPE, CARD_POS } from '../Components/Card/utils/constant';
import { CARD_SELECT_TYPE, PHASE } from '../Components/PlayerGround/utils/constant';
import PhaseEvents from '../Core/PhaseEvents';
import { TRIGGER_TYPE } from './triggerRegistry';
import { TOOL_TYPE } from '../Store/actions/actionTypes';
import { show_tool } from '../Store/actions/toolActions';
import store from '../Store/store';
import { update_environment } from '../Store/actions/environmentActions';
import { get_unique_id_from_ennvironment } from '../Components/PlayerGround/utils/utils';

// ─── INTERNAL HELPERS ─────────────────────────────────────────────────────────

const openSelector = (info) =>
    new Promise((resolve, reject) =>
        store.dispatch(show_tool({
            tool_type: TOOL_TYPE.CARD_SELECTOR,
            info: { ...info, resolve, reject }
        }))
    );

const getField = (env, side) =>
    (env[side][ENVIRONMENT.MONSTER_FIELD] || [])
        .filter(c => c !== CARD_TYPE.PLACEHOLDER && c?.card);

const getSpellField = (env, side) =>
    (env[side][ENVIRONMENT.SPELL_FIELD] || [])
        .filter(c => c?.card);

const getGY = (env, side) =>
    (env[side][ENVIRONMENT.GRAVEYARD] || [])
        .filter(c => c?.card);

const getDeck = (env, side) =>
    (env[side][ENVIRONMENT.DECK] || [])
        .filter(c => c?.card);

const getHand = (env, side) =>
    (env[side][ENVIRONMENT.HAND] || [])
        .filter(c => c?.card);

// Place a card into the first open monster slot
const placeOnField = (cardEnv, env, side) => {
    const field = env[side][ENVIRONMENT.MONSTER_FIELD];
    const priorities = [2, 3, 1, 4, 0];
    for (const slot of priorities) {
        if (field[slot] === CARD_TYPE.PLACEHOLDER) {
            cardEnv.current_pos = CARD_POS.FACE;
            field[slot] = cardEnv;
            return true;
        }
    }
    return false; // field full
};

// Build a deck filter function from a plain options object
const buildFilter = (opts = {}) => (cardEnv) => {
    const c = cardEnv?.card;
    if (!c) return false;
    if (opts.type === 'MONSTER'  && !c.card_type?.startsWith('MONSTER')) return false;
    if (opts.type === 'SPELL'    && !c.card_type?.startsWith('SPELL'))   return false;
    if (opts.type === 'TRAP'     && !c.card_type?.startsWith('TRAP'))    return false;
    if (opts.nameIncludes && !c.name?.toLowerCase().includes(opts.nameIncludes.toLowerCase())) return false;
    if (opts.nameExcludes && c.name?.toLowerCase().includes(opts.nameExcludes.toLowerCase())) return false;
    if (opts.atk?.max  !== undefined && (c.atk ?? 9999) > opts.atk.max)  return false;
    if (opts.atk?.min  !== undefined && (c.atk ?? 0)    < opts.atk.min)  return false;
    if (opts.def?.max  !== undefined && (c.def ?? 9999) > opts.def.max)  return false;
    if (opts.def?.min  !== undefined && (c.def ?? 0)    < opts.def.min)  return false;
    if (opts.level     !== undefined && (c.level ?? 0)  !== opts.level)  return false;
    if (opts.attribute && c.attribute?.toLowerCase() !== opts.attribute.toLowerCase()) return false;
    if (opts.race      && !c.race?.toLowerCase().includes(opts.race.toLowerCase())) return false;
    if (opts.key       !== undefined && c.key !== opts.key) return false;
    if (opts.custom    && !opts.custom(cardEnv)) return false;
    return true;
};

// dispatch a fresh env snapshot
const dispatchEnv = (env) =>
    store.dispatch(update_environment(env));

// ─────────────────────────────────────────────────────────────────────────────
// ── OPERATION FACTORIES ───────────────────────────────────────────────────────
// These return an `operation` function (env) => void|Promise
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Search deck for 1 card matching filter, show selector, add to hand.
 * opts: { atk, def, level, nameIncludes, nameExcludes, type, attribute, race, custom }
 */
export const searchDeck = (opts = {}, label) => (env, side = SIDE.MINE) => {
    const filter = buildFilter(opts);
    const pool = getDeck(env, side).filter(filter);
    if (!pool.length) return Promise.resolve();

    return openSelector({
        type: CARD_SELECT_TYPE.CARD_SELECT_FROM_DECK,
        label: label || `Search — add 1 card to hand`,
        filterFn: filter,
    }).then(({ cardEnvs: [uid] }) => {
        const deck = env[side][ENVIRONMENT.DECK];
        const idx = deck.findIndex(c => get_unique_id_from_ennvironment(c) === uid);
        if (idx === -1) return;
        const [card] = deck.splice(idx, 1);
        env[side][ENVIRONMENT.HAND].push(card);
        }).catch(() => {});
};

/**
 * Draw N cards from the top of your deck.
 */
export const drawCards = (n = 1) => (env, side = SIDE.MINE) => {
    const deck = env[side][ENVIRONMENT.DECK];
    const drawn = deck.splice(0, Math.min(n, deck.length));
    env[side][ENVIRONMENT.HAND].push(...drawn);
};

/**
 * Discard N cards from hand — player selects which ones.
 */
export const discardFromHand = (n = 1, opts = {}, label) => (env, side = SIDE.MINE) => {
    const filter = buildFilter(opts);
    const pool = getHand(env, side).filter(filter);
    if (!pool.length) return Promise.resolve();

    return openSelector({
        type: CARD_SELECT_TYPE.CARD_SELECT_FROM_HAND,
        label: label || `Discard ${n} card(s)`,
        numToSelect: n,
        sourceList: pool,
    }).then(({ cardEnvs: uids }) => {
        for (const uid of uids) {
            const hand = env[side][ENVIRONMENT.HAND];
            const idx = hand.findIndex(c => get_unique_id_from_ennvironment(c) === uid);
            if (idx !== -1) {
                env[side][ENVIRONMENT.GRAVEYARD].push(hand.splice(idx, 1)[0]);
            }
        }
        }).catch(() => {});
};

/**
 * Gain LP.
 */
export const gainLP = (amount) => (env, side = SIDE.MINE) => {
    env[side].hp = (env[side].hp || 0) + amount;
};

/**
 * Pay LP.
 */
export const payLP = (amount) => (env, side = SIDE.MINE) => {
    env[side].hp = Math.max(0, (env[side].hp || 0) - amount);
};

/**
 * Deal damage to opponent.
 * amount can be a number or a function (env, side) => number
 */
export const dealDamage = (amount) => (env, side = SIDE.MINE) => {
    const opp = side === SIDE.MINE ? SIDE.OPPONENT : SIDE.MINE;
    const dmg = typeof amount === 'function' ? amount(env, side) : amount;
    env[opp].hp = Math.max(0, (env[opp].hp || 0) - dmg);
};

/**
 * Destroy all monsters matching filter on one or both sides.
 * opts.side: 'MINE' | 'OPPONENT' | 'BOTH'  (default 'BOTH')
 */
export const destroyMonsters = (opts = {}) => (env, side = SIDE.MINE) => {
    const targets = opts.side === 'MINE'     ? [side]
                  : opts.side === 'OPPONENT' ? [side === SIDE.MINE ? SIDE.OPPONENT : SIDE.MINE]
                  : [SIDE.MINE, SIDE.OPPONENT];
    const filter = buildFilter(opts.filter || {});
    const destroyed = [];
    for (const s of targets) {
        const field = env[s][ENVIRONMENT.MONSTER_FIELD];
        for (let i = 0; i < field.length; i++) {
            if (field[i] !== CARD_TYPE.PLACEHOLDER && field[i]?.card && filter(field[i])) {
                const cardEnv = field[i];
                const isPendulum = cardEnv.card?.card_type === 'MONSTER_PENDULUM';
                const dest = isPendulum ? ENVIRONMENT.EXTRA_DECK : ENVIRONMENT.GRAVEYARD;
                env[s][dest].push(cardEnv);
                field[i] = CARD_TYPE.PLACEHOLDER;
                destroyed.push({ cardEnv, destroyedSide: s });
            }
        }
    }
    if (destroyed.length) {
        // Lazy require breaks the circular dep timing issue (effectFactory ↔ triggerRegistry)
        const { fireTrigger, fireFieldWatchTriggers } = require('./triggerRegistry');
        for (const { cardEnv, destroyedSide } of destroyed) {
            fireTrigger(TRIGGER_TYPE.ON_DESTROY, cardEnv, env, destroyedSide);
            fireFieldWatchTriggers(TRIGGER_TYPE.ON_ALLY_DESTROYED, cardEnv, env, destroyedSide, true);
        }
    }
};

/**
 * Destroy all spells/traps on one or both sides.
 */
export const destroySpellsTraps = (opts = {}) => (env, side = SIDE.MINE) => {
    const targets = opts.side === 'MINE'     ? [side]
                  : opts.side === 'OPPONENT' ? [side === SIDE.MINE ? SIDE.OPPONENT : SIDE.MINE]
                  : [SIDE.MINE, SIDE.OPPONENT];
    for (const s of targets) {
        const field = env[s][ENVIRONMENT.SPELL_FIELD];
        for (let i = 0; i < field.length; i++) {
            if (field[i]?.card) {
                env[s][ENVIRONMENT.GRAVEYARD].push(field[i]);
                field[i] = CARD_TYPE.PLACEHOLDER;
            }
        }
    }
};

/**
 * Special summon from deck — player selects target.
 */
export const specialSummonFromDeck = (opts = {}, label) => (env, side = SIDE.MINE) => {
    const filter = buildFilter(opts);
    const pool = getDeck(env, side).filter(filter);
    if (!pool.length) return Promise.resolve();

    return openSelector({
        type: CARD_SELECT_TYPE.CARD_SELECT_FROM_DECK,
        label: label || 'Special Summon 1 monster from Deck',
        filterFn: filter,
    }).then(({ cardEnvs: [uid] }) => {
        const deck = env[side][ENVIRONMENT.DECK];
        const idx = deck.findIndex(c => get_unique_id_from_ennvironment(c) === uid);
        if (idx === -1) return;
        const [card] = deck.splice(idx, 1);
        placeOnField(card, env, side);
        }).catch(() => {});
};

/**
 * Special summon from hand — player selects target.
 */
export const specialSummonFromHand = (opts = {}, label) => (env, side = SIDE.MINE) => {
    const filter = buildFilter(opts);
    const pool = getHand(env, side).filter(filter);
    if (!pool.length) return Promise.resolve();

    return openSelector({
        type: CARD_SELECT_TYPE.CARD_SELECT_FROM_HAND,
        label: label || 'Special Summon 1 monster from hand',
        sourceList: pool,
    }).then(({ cardEnvs: [uid] }) => {
        const hand = env[side][ENVIRONMENT.HAND];
        const idx = hand.findIndex(c => get_unique_id_from_ennvironment(c) === uid);
        if (idx === -1) return;
        const [card] = hand.splice(idx, 1);
        placeOnField(card, env, side);
        }).catch(() => {});
};

/**
 * Special summon from GY — player selects target.
 * opts.sourceSide: 'MINE' | 'OPPONENT' | 'BOTH'
 */
export const specialSummonFromGY = (opts = {}, label) => (env, side = SIDE.MINE) => {
    const opp = side === SIDE.MINE ? SIDE.OPPONENT : SIDE.MINE;
    const filter = buildFilter({ type: 'MONSTER', ...opts });
    let pool = [];
    if (!opts.sourceSide || opts.sourceSide === 'MINE' || opts.sourceSide === 'BOTH')
        pool.push(...getGY(env, side).filter(filter));
    if (opts.sourceSide === 'OPPONENT' || opts.sourceSide === 'BOTH')
        pool.push(...getGY(env, opp).filter(filter));
    if (!pool.length) return Promise.resolve();

    return openSelector({
        type: CARD_SELECT_TYPE.CARD_SELECT_FROM_HAND,
        label: label || 'Special Summon 1 monster from Graveyard',
        sourceList: pool,
    }).then(({ cardEnvs: [uid] }) => {
        for (const s of [side, opp]) {
            const gy = env[s][ENVIRONMENT.GRAVEYARD];
            const idx = gy.findIndex(c => get_unique_id_from_ennvironment(c) === uid);
            if (idx !== -1) {
                const [card] = gy.splice(idx, 1);
                placeOnField(card, env, side); // always summon to YOUR field
                            return;
            }
        }
    }).catch(() => {});
};

/**
 * Passive ATK/DEF boost for monsters matching filter while this card is on field.
 * amount can be a fixed number or a function (env, side) => number
 * stat: 'atk' | 'def' | 'both'
 */
export const passiveBoost = (amount, opts = {}, stat = 'atk') => (env, side) => {
    const filter = buildFilter(opts);
    const boost = typeof amount === 'function' ? amount(env, side) : amount;
    const field = env[side][ENVIRONMENT.MONSTER_FIELD];
    for (const m of field) {
        if (m === CARD_TYPE.PLACEHOLDER || !m?.card) continue;
        if (!filter(m)) continue;
        if (stat === 'atk' || stat === 'both')
            m.current_atk = (m.current_atk ?? m.card.atk ?? 0) + boost;
        if (stat === 'def' || stat === 'both')
            m.current_def = (m.current_def ?? m.card.def ?? 0) + boost;
    }
};

/**
 * Run two operations in sequence (first must complete before second starts).
 * e.g. sequence(drawCards(3), discardFromHand(2))
 */
export const sequence = (...operations) => (env, side = SIDE.MINE) => {
    return operations.reduce((chain, op) => {
        return chain.then(() => {
            const result = op(env, side);
            return result && typeof result.then === 'function' ? result : Promise.resolve();
        });
    }, Promise.resolve());
};

/**
 * Conditional operation — only runs if condition is met.
 */
export const when = (conditionFn, operation) => (env, side = SIDE.MINE) => {
    if (conditionFn(env, side)) {
        return operation(env, side);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// ── TRIGGER/EFFECT WRAPPERS ───────────────────────────────────────────────────
// These wrap operations into the registry entry shape.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Standard hand/field activated effect (Normal Spell pattern).
 * conditionFn: (env) => bool — when can this be activated?
 */
export const onActivate = (operation, conditionFn = () => true, opts = {}) => [{
    condition: conditionFn,
    target: null,
    operation: (env) => operation(env, SIDE.MINE),
    ...opts,
}];

/**
 * Continuous spell/trap — stays on field, uses passive_effect for ongoing boost.
 * activateOp: runs once when card is activated (optional, e.g. pay LP, banish deck)
 * passiveOp: runs every state update while on field
 */
export const continuous = (passiveOp, activateOp = null, conditionFn = () => true) => [{
    condition: conditionFn,
    target: null,
    operation: activateOp ? (env) => activateOp(env, SIDE.MINE) : (_env) => {},
    is_continuous: true,
    passive_effect: passiveOp,
}];

/**
 * On-summon effect — fires when this monster is summoned.
 * conditionFn: optional additional condition check on summon
 */
export const onSummon = (operation, conditionFn = null) => [{
    condition: (_env) => false, // not hand-activatable
    target: null,
    operation: (_env) => {},
    on_summon: conditionFn
        ? (env) => { if (conditionFn(env)) return operation(env, SIDE.MINE); }
        : (env) => operation(env, SIDE.MINE),
}];

/**
 * Once-per-turn field effect — click the monster on the field to activate.
 */
export const oncePerTurn = (operation, conditionFn = () => true) => [{
    condition: conditionFn,
    target: null,
    operation: (env) => operation(env, SIDE.MINE),
    once_per_turn: true,
}];

/**
 * On-destroy trigger — fires when this card is sent to GY by any means.
 */
export const onDestroy = (operation, conditionFn = null) => [{
    trigger_type: TRIGGER_TYPE.ON_DESTROY,
    condition: conditionFn || ((env, side) => true),
    operation: (env, side) => operation(env, side),
}];

/**
 * On-battle-damage trigger — fires when this monster inflicts battle damage.
 */
export const onBattleDamage = (operation, conditionFn = null) => [{
    trigger_type: TRIGGER_TYPE.ON_BATTLE_DAMAGE,
    condition: conditionFn || ((env, side) => true),
    operation: (env, side) => operation(env, side),
}];

/**
 * On-attack-declared trigger — fires when an attack is declared against you.
 * For set traps like Mirror Force, Sakuretsu Armor, Magic Cylinder.
 */
export const onAttackDeclared = (operation, conditionFn = () => true) => [{
    trigger_type: TRIGGER_TYPE.ON_ATTACK_DECLARED,
    condition: conditionFn,
    operation: (env, side, attackerCardEnv, attackerIndex) =>
        operation(env, side, attackerCardEnv, attackerIndex),
}];

/**
 * Passive monster effect — "while this card is on the field" boost/suppression.
 * Automatically checks that this card is still on the field before applying.
 */
export const whileOnField = (cardKey, passiveFn) => [{
    condition: (_env) => false,
    target: null,
    operation: (_env) => {},
    passive_effect: (env, side) => {
        const isOnField = (env[side][ENVIRONMENT.MONSTER_FIELD] || [])
            .some(c => c !== CARD_TYPE.PLACEHOLDER && c?.card?.key === cardKey);
        if (!isOnField) return;
        passiveFn(env, side);
    },
}];

// ─────────────────────────────────────────────────────────────────────────────
// ── COMMON PATTERN SHORTCUTS ──────────────────────────────────────────────────
// Pre-built combinations for the most common card archetypes.
// ─────────────────────────────────────────────────────────────────────────────

/** Floater: on destroy, special summon from deck matching filter */
export const floater = (opts, label) =>
    onDestroy(specialSummonFromDeck(opts, label));

/** Recruiter: on destroy, add matching card from deck to hand */
export const recruiter = (opts, label) =>
    onDestroy(searchDeck(opts, label));

/** Draw spell: activate to draw N cards */
export const drawSpell = (n) =>
    onActivate(drawCards(n));

/** Nuke spell: destroy all monsters on both sides */
export const nuke = () =>
    onActivate(destroyMonsters({ side: 'BOTH' }));

/** Raigeki-like: destroy all opponent monsters */
export const raigeki = () =>
    onActivate(destroyMonsters({ side: 'OPPONENT' }));

/** Ookazi-like: deal fixed damage */
export const burn = (amount) =>
    onActivate(dealDamage(amount));

// ─────────────────────────────────────────────────────────────────────────────
// ── NEW PRIMITIVES (Step 8 — gap-analysis additions) ─────────────────────────
// All operations only MUTATE env. No dispatch calls inside them.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return monster(s) from a zone to hand.
 * opts.side: 'MINE' | 'OPPONENT' | 'BOTH'
 * opts.filter: optional buildFilter options
 * opts.count: number of cards to bounce (default 1; use 99 for "all")
 */
export const bounce = (opts = {}, label) => (env, side = SIDE.MINE) => {
    const targets = opts.side === 'MINE'     ? [side]
                  : opts.side === 'OPPONENT' ? [side === SIDE.MINE ? SIDE.OPPONENT : SIDE.MINE]
                  : [SIDE.MINE, SIDE.OPPONENT];
    const filter  = buildFilter(opts.filter || {});
    const max     = opts.count ?? 1;
    let bounced   = 0;

    for (const s of targets) {
        if (bounced >= max) break;
        const field = env[s][ENVIRONMENT.MONSTER_FIELD];
        for (let i = 0; i < field.length && bounced < max; i++) {
            const c = field[i];
            if (c === CARD_TYPE.PLACEHOLDER || !c?.card) continue;
            if (!filter(c)) continue;
            env[s][ENVIRONMENT.HAND].push(c);
            field[i] = CARD_TYPE.PLACEHOLDER;
            bounced++;
        }
    }
};

/**
 * Banish (remove from play) monsters from a zone.
 * Uses ENVIRONMENT.BANISHED if it exists; otherwise removes silently.
 * opts: same as destroyMonsters
 */
export const banish = (opts = {}, label) => (env, side = SIDE.MINE) => {
    const targets = opts.side === 'MINE'     ? [side]
                  : opts.side === 'OPPONENT' ? [side === SIDE.MINE ? SIDE.OPPONENT : SIDE.MINE]
                  : [SIDE.MINE, SIDE.OPPONENT];
    const filter  = buildFilter(opts.filter || {});
    const src     = opts.from || ENVIRONMENT.MONSTER_FIELD;

    for (const s of targets) {
        const zone = env[s][src];
        if (!Array.isArray(zone)) continue;
        for (let i = 0; i < zone.length; i++) {
            const c = src === ENVIRONMENT.MONSTER_FIELD ? zone[i] : zone[i];
            if (!c?.card) continue;
            if (c === CARD_TYPE.PLACEHOLDER) continue;
            if (!filter(c)) continue;
            // Send to BANISHED zone if it exists, otherwise to GY
            const dest = ENVIRONMENT.BANISHED || ENVIRONMENT.GRAVEYARD;
            if (!env[s][dest]) env[s][dest] = [];
            env[s][dest].push(c);
            if (src === ENVIRONMENT.MONSTER_FIELD) {
                zone[i] = CARD_TYPE.PLACEHOLDER;
            } else {
                zone.splice(i, 1);
                i--;
            }
        }
    }
};

/**
 * Banish cards from GY (e.g. Miracle Fusion material cost).
 * opts.filter: buildFilter options
 * opts.count: number to banish
 */
export const banishFromGY = (opts = {}, label) => (env, side = SIDE.MINE) => {
    const filter = buildFilter(opts.filter || {});
    const count  = opts.count ?? 1;
    const gy     = env[side][ENVIRONMENT.GRAVEYARD] || [];
    const dest   = ENVIRONMENT.BANISHED;
    if (!env[side][dest]) env[side][dest] = [];
    let removed = 0;
    for (let i = gy.length - 1; i >= 0 && removed < count; i--) {
        if (!filter(gy[i])) continue;
        env[side][dest].push(gy.splice(i, 1)[0]);
        removed++;
    }
};

/**
 * Send the top N cards from a deck to the GY (mill).
 * side: 'MINE' | 'OPPONENT' (default MINE)
 */
export const millCards = (n = 1, targetSide = 'MINE') => (env, side = SIDE.MINE) => {
    const s   = targetSide === 'OPPONENT'
        ? (side === SIDE.MINE ? SIDE.OPPONENT : SIDE.MINE)
        : side;
    const deck = env[s][ENVIRONMENT.DECK] || [];
    const milled = deck.splice(0, Math.min(n, deck.length));
    env[s][ENVIRONMENT.GRAVEYARD].push(...milled);
};

/**
 * Change a monster's battle position.
 * opts.position: CARD_POS.FACE | CARD_POS.DEFENSE | CARD_POS.SET
 * opts.filter:   which monster to target
 * opts.side:     'MINE' | 'OPPONENT'
 */
export const changeBattlePosition = (opts = {}) => (env, side = SIDE.MINE) => {
    const { CARD_POS: CP } = require('../Components/Card/utils/constant');
    const s      = opts.side === 'OPPONENT'
        ? (side === SIDE.MINE ? SIDE.OPPONENT : SIDE.MINE)
        : side;
    const filter = buildFilter(opts.filter || {});
    const field  = env[s][ENVIRONMENT.MONSTER_FIELD];
    for (const c of field) {
        if (c === CARD_TYPE.PLACEHOLDER || !c?.card) continue;
        if (!filter(c)) continue;
        c.current_pos = opts.position ?? CP.DEFENSE;
        break; // only change first match
    }
};

/**
 * Copy an effect from another card currently on the field.
 * Calls the source card's first effect.operation on the current env.
 * opts.sourceKey: card key to copy from
 * opts.location: 'MONSTER_FIELD' | 'SPELL_FIELD'
 */
export const copyEffect = (opts = {}) => (env, side = SIDE.MINE) => {
    const loc   = opts.location || ENVIRONMENT.MONSTER_FIELD;
    const zone  = env[side][loc] || [];
    const src   = zone.find(c =>
        c !== CARD_TYPE.PLACEHOLDER && c?.card?.key === opts.sourceKey
    );
    if (!src?.card?.effects?.[0]?.operation) return;
    return src.card.effects[0].operation(env, side);
};

/**
 * Conditional branching: if condFn(env, side) then thenOp else elseOp.
 * elseOp is optional.
 */
export const conditionalEffect = (condFn, thenOp, elseOp = null) => (env, side = SIDE.MINE) => {
    if (condFn(env, side)) {
        const r = thenOp(env, side);
        return (r && typeof r.then === 'function') ? r : undefined;
    }
    if (elseOp) {
        const r = elseOp(env, side);
        return (r && typeof r.then === 'function') ? r : undefined;
    }
};

/**
 * Negate an effect currently being resolved (for Counter Traps).
 * In the context of a chain, this marks the target link as negated.
 * NOTE: actual chain-link negation is handled by Chain.negateLink().
 * This primitive is a placeholder that logs the negation and can be
 * connected to the chain stack by the calling code.
 *
 * opts.destroyCard: also destroy the negated card
 */
export const negate = (opts = {}) => (env, side = SIDE.MINE) => {
    // The actual negation of a chain link requires access to the chain stack,
    // which is managed by Core/Chain/index.js at a higher level.
    // This operation handles the side-effect: optionally destroying the card.
    if (opts.destroyCard && opts.targetCardEnv) {
        const c = opts.targetCardEnv;
        for (const s of [SIDE.MINE, SIDE.OPPONENT]) {
            for (const zone of [ENVIRONMENT.MONSTER_FIELD, ENVIRONMENT.SPELL_FIELD]) {
                const arr = env[s][zone];
                if (!Array.isArray(arr)) continue;
                for (let i = 0; i < arr.length; i++) {
                    if (arr[i] !== CARD_TYPE.PLACEHOLDER &&
                        arr[i]?.card?.key === c?.card?.key) {
                        env[s][ENVIRONMENT.GRAVEYARD].push(arr[i]);
                        arr[i] = CARD_TYPE.PLACEHOLDER;
                        return;
                    }
                }
            }
        }
    }
};

/** Warrior-type collector ATK boost (A. Forces pattern) */
export const collectiveBoost = (amount, filter, cardKey) =>
    continuous(
        (env, side) => {
            const myField = env[side][ENVIRONMENT.MONSTER_FIELD];
            const isOnField = myField.some(
                c => c !== CARD_TYPE.PLACEHOLDER && c?.card?.key === cardKey
            );
            if (!isOnField) return; // only while this card is face-up
            const filterFn = buildFilter(filter);
            const count = myField.filter(
                c => c !== CARD_TYPE.PLACEHOLDER && filterFn(c)
            ).length;
            passiveBoost(count * amount, filter)(env, side);
        }
    );

// ─────────────────────────────────────────────────────────────────────────────
// ── RULEBOOK PRIMITIVES (engine-hooked) ──────────────────────────────────────
// Every rulebook mechanic that needs engine support has a primitive here.
// Each rides a real hook — none of these are decorative:
//   • Core/PhaseEvents          — banishUntil, boostStats({until}),
//                                 takeControl({until}), onPhase
//   • Core/Chain spell speeds   — quickEffect (speed 2), counterTrap (speed 3)
//   • Core/OncePer permanent map— oncePerDuel (wind_up tracking)
//   • Core/Battle hooks         — onFlip, protectFromBattleDestroy,
//                                 damageMultiplier
//   • environmentReducer        — temp_mods (boostStats survives stat resets)
// PHASE is re-exported below so registry entries can write
// `until: PHASE.END_PHASE` without an extra import.
// ─────────────────────────────────────────────────────────────────────────────

export { PHASE };

const oppositeOf = (side) => side === SIDE.MINE ? SIDE.OPPONENT : SIDE.MINE;

const resolveSides = (optsSide, side) =>
    optsSide === 'MINE'     ? [side]
  : optsSide === 'OPPONENT' ? [oppositeOf(side)]
  : optsSide === 'BOTH'     ? [SIDE.MINE, SIDE.OPPONENT]
  :                           [side];

/**
 * Send card(s) to the GY WITHOUT destroying them — no destroy triggers fire.
 * The rulebook distinguishes "send" from "destroy" (costs, Synchro materials,
 * mill effects); use destroyMonsters()/destroyCards() when the card text says
 * "destroy".
 * opts: { side: 'MINE'|'OPPONENT'|'BOTH', from: ENVIRONMENT.*, filter, count }
 */
export const sendToGY = (opts = {}) => (env, side = SIDE.MINE) => {
    const filter = buildFilter(opts.filter || {});
    const from   = opts.from || ENVIRONMENT.MONSTER_FIELD;
    const max    = opts.count ?? 99;
    let sent = 0;
    for (const s of resolveSides(opts.side, side)) {
        const zone = env[s][from];
        if (!Array.isArray(zone)) continue;
        for (let i = 0; i < zone.length && sent < max; i++) {
            const c = zone[i];
            if (c === CARD_TYPE.PLACEHOLDER || !c?.card) continue;
            if (!filter(c)) continue;
            env[s][ENVIRONMENT.GRAVEYARD].push(c);
            if (from === ENVIRONMENT.MONSTER_FIELD || from === ENVIRONMENT.SPELL_FIELD) {
                zone[i] = CARD_TYPE.PLACEHOLDER;
            } else {
                zone.splice(i, 1); i--;
            }
            sent++;
        }
    }
};

/**
 * Add card(s) from your GY to your hand (player selects).
 * opts: { filter, count }
 */
export const salvage = (opts = {}, label) => (env, side = SIDE.MINE) => {
    const filter = buildFilter(opts.filter || opts);
    const pool = getGY(env, side).filter(filter);
    if (!pool.length) return Promise.resolve();
    return openSelector({
        type: CARD_SELECT_TYPE.CARD_SELECT_FROM_HAND,
        label: label || 'Add 1 card from your Graveyard to your hand',
        sourceList: pool,
        numToSelect: opts.count ?? 1,
    }).then(({ cardEnvs: uids }) => {
        const gy = env[side][ENVIRONMENT.GRAVEYARD];
        for (const uid of uids) {
            const idx = gy.findIndex(c => get_unique_id_from_ennvironment(c) === uid);
            if (idx !== -1) env[side][ENVIRONMENT.HAND].push(gy.splice(idx, 1)[0]);
        }
    }).catch(() => {});
};

/** Fisher-Yates shuffle of a deck. targetSide: 'MINE' | 'OPPONENT' */
export const shuffleDeck = (targetSide = 'MINE') => (env, side = SIDE.MINE) => {
    const s = targetSide === 'OPPONENT' ? oppositeOf(side) : side;
    const deck = env[s][ENVIRONMENT.DECK] || [];
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
};

/**
 * Return card(s) to the deck.
 * opts: { side, from: ENVIRONMENT.* (default GRAVEYARD), filter, count,
 *         placement: 'shuffle' | 'top' | 'bottom' (default 'shuffle') }
 */
export const toDeck = (opts = {}) => (env, side = SIDE.MINE) => {
    const filter = buildFilter(opts.filter || {});
    const from   = opts.from || ENVIRONMENT.GRAVEYARD;
    const max    = opts.count ?? 99;
    const placement = opts.placement || 'shuffle';
    let moved = 0;
    for (const s of resolveSides(opts.side, side)) {
        const zone = env[s][from];
        if (!Array.isArray(zone)) continue;
        for (let i = 0; i < zone.length && moved < max; i++) {
            const c = zone[i];
            if (c === CARD_TYPE.PLACEHOLDER || !c?.card) continue;
            if (!filter(c)) continue;
            const deck = env[s][ENVIRONMENT.DECK];
            if (placement === 'top') deck.unshift(c);
            else deck.push(c); // 'bottom' and pre-shuffle both append
            if (from === ENVIRONMENT.MONSTER_FIELD || from === ENVIRONMENT.SPELL_FIELD) {
                zone[i] = CARD_TYPE.PLACEHOLDER;
            } else {
                zone.splice(i, 1); i--;
            }
            moved++;
        }
        if (moved && placement === 'shuffle') shuffleDeck(s === side ? 'MINE' : 'OPPONENT')(env, side);
    }
};

/**
 * TEMPORARY banish — banish a monster and return it at a future phase
 * ("banish until your next Standby Phase"). Rides Core/PhaseEvents.
 * opts: { filter, side: 'MINE'|'OPPONENT' (whose monster — default MINE),
 *         returnPhase: PHASE.* (default STANDBY_PHASE),
 *         ownTurnOnly: bool (default true — "YOUR next Standby Phase") }
 */
export const banishUntil = (opts = {}, label) => (env, side = SIDE.MINE) => {
    const targetSide = opts.side === 'OPPONENT' ? oppositeOf(side) : side;
    const filter = buildFilter(opts.filter || {});
    const pool = getField(env, targetSide).filter(filter);
    if (!pool.length) return Promise.resolve();

    return openSelector({
        type: CARD_SELECT_TYPE.CARD_SELECT_BATTLE_SELECT,
        label: label || 'Banish 1 monster (it returns later)',
        sourceList: pool,
        numToSelect: 1,
    }).then(({ cardEnvs: [uid] }) => {
        const field = env[targetSide][ENVIRONMENT.MONSTER_FIELD];
        const idx = field.findIndex(c =>
            c !== CARD_TYPE.PLACEHOLDER && get_unique_id_from_ennvironment(c) === uid);
        if (idx === -1) return;
        const cardEnv = field[idx];
        field[idx] = CARD_TYPE.PLACEHOLDER;
        if (!env[targetSide][ENVIRONMENT.BANISHED]) env[targetSide][ENVIRONMENT.BANISHED] = [];
        env[targetSide][ENVIRONMENT.BANISHED].push(cardEnv);

        PhaseEvents.schedule(
            opts.returnPhase || PHASE.STANDBY_PHASE,
            (futureEnv) => {
                const ban = futureEnv[targetSide][ENVIRONMENT.BANISHED] || [];
                const bIdx = ban.findIndex(c => get_unique_id_from_ennvironment(c) === uid);
                if (bIdx === -1) return; // moved elsewhere in the meantime
                const [returned] = ban.splice(bIdx, 1);
                if (!placeOnField(returned, futureEnv, targetSide)) {
                    futureEnv[targetSide][ENVIRONMENT.HAND].push(returned); // field full
                }
            },
            { side: targetSide, ownTurnOnly: opts.ownTurnOnly !== false }
        );
    }).catch(() => {});
};

/** Banish face-down (Pot of Desires / Different Dimension patterns). */
export const banishFaceDown = (opts = {}) => (env, side = SIDE.MINE) => {
    const filter = buildFilter(opts.filter || {});
    const from   = opts.from || ENVIRONMENT.DECK;
    const max    = opts.count ?? 1;
    const s      = opts.side === 'OPPONENT' ? oppositeOf(side) : side;
    const zone   = env[s][from];
    if (!Array.isArray(zone)) return;
    if (!env[s][ENVIRONMENT.BANISHED]) env[s][ENVIRONMENT.BANISHED] = [];
    let n = 0;
    for (let i = 0; i < zone.length && n < max; i++) {
        const c = zone[i];
        if (c === CARD_TYPE.PLACEHOLDER || !c?.card) continue;
        if (!filter(c)) continue;
        c.banished_facedown = true;
        env[s][ENVIRONMENT.BANISHED].push(c);
        if (from === ENVIRONMENT.MONSTER_FIELD || from === ENVIRONMENT.SPELL_FIELD) {
            zone[i] = CARD_TYPE.PLACEHOLDER;
        } else {
            zone.splice(i, 1); i--;
        }
        n++;
    }
};

/**
 * Summon token monster(s) to your field.
 * opts: { name, atk, def, level, race, attribute, count, position: CARD_POS.* }
 */
export const summonToken = (opts = {}) => (env, side = SIDE.MINE) => {
    const count = opts.count ?? 1;
    for (let i = 0; i < count; i++) {
        const tokenEnv = {
            card: {
                key: -(Date.now() % 10000000) - i, // negative key — never collides with passcodes
                name: opts.name || 'Token',
                atk: opts.atk ?? 0,
                def: opts.def ?? 0,
                level: opts.level ?? 1,
                attribute: opts.attribute || 'EARTH',
                race: opts.race || 'Beast',
                description: 'Token (special summoned by a card effect)',
                card_type: 'MONSTER_NORMAL',
                card_pic: null,
                is_token: true,
                effects: [],
            },
            unique_count: Date.now() + Math.floor(Math.random() * 100000) + i,
        };
        if (!placeOnField(tokenEnv, env, side)) break; // field full
        if (opts.position) tokenEnv.current_pos = opts.position;
    }
};

/**
 * Take control of an opponent's monster (player selects).
 * opts: { filter, until: PHASE.* | null — null = permanent (Change of Heart
 *         is until END_PHASE; Brain Control historic text too) }
 */
export const takeControl = (opts = {}, label) => (env, side = SIDE.MINE) => {
    const opp = oppositeOf(side);
    const filter = buildFilter(opts.filter || {});
    const pool = getField(env, opp).filter(filter);
    if (!pool.length) return Promise.resolve();

    return openSelector({
        type: CARD_SELECT_TYPE.CARD_SELECT_BATTLE_SELECT,
        label: label || "Take control of 1 opponent monster",
        sourceList: pool,
        numToSelect: 1,
    }).then(({ cardEnvs: [uid] }) => {
        const oppField = env[opp][ENVIRONMENT.MONSTER_FIELD];
        const idx = oppField.findIndex(c =>
            c !== CARD_TYPE.PLACEHOLDER && get_unique_id_from_ennvironment(c) === uid);
        if (idx === -1) return;
        const cardEnv = oppField[idx];
        oppField[idx] = CARD_TYPE.PLACEHOLDER;
        if (!placeOnField(cardEnv, env, side)) {
            oppField[idx] = cardEnv; // my field full — control change fizzles
            return;
        }
        if (opts.until) {
            PhaseEvents.schedule(opts.until, (futureEnv) => {
                const myField = futureEnv[side][ENVIRONMENT.MONSTER_FIELD];
                const i2 = myField.findIndex(c =>
                    c !== CARD_TYPE.PLACEHOLDER && get_unique_id_from_ennvironment(c) === uid);
                if (i2 === -1) return; // left the field — nothing to return
                const back = myField[i2];
                myField[i2] = CARD_TYPE.PLACEHOLDER;
                if (!placeOnField(back, futureEnv, opp)) {
                    futureEnv[opp][ENVIRONMENT.GRAVEYARD].push(back);
                }
            }, { side, ownTurnOnly: true });
        }
    }).catch(() => {});
};

/**
 * Tribute cost — player sends N of their own monsters to the GY as a cost
 * (a "send", not a "destroy" — no destroy triggers, per the rulebook).
 */
export const tributeCost = (n = 1, opts = {}, label) => (env, side = SIDE.MINE) => {
    const filter = buildFilter(opts.filter || opts);
    const pool = getField(env, side).filter(filter);
    if (pool.length < n) return Promise.resolve();
    return openSelector({
        type: CARD_SELECT_TYPE.CARD_SELECT_BATTLE_SELECT,
        label: label || `Tribute ${n} monster(s)`,
        sourceList: pool,
        numToSelect: n,
    }).then(({ cardEnvs: uids }) => {
        const field = env[side][ENVIRONMENT.MONSTER_FIELD];
        for (const uid of uids) {
            const idx = field.findIndex(c =>
                c !== CARD_TYPE.PLACEHOLDER && get_unique_id_from_ennvironment(c) === uid);
            if (idx !== -1) {
                env[side][ENVIRONMENT.GRAVEYARD].push(field[idx]);
                field[idx] = CARD_TYPE.PLACEHOLDER;
            }
        }
    }).catch(() => {});
};

/**
 * Place N counters of `name` on the first monster matching opts.filter
 * (e.g. Spell Counters, Predator Counters). Counters live on
 * cardEnv.counters = { [name]: n } and survive stat resets.
 */
export const addCounter = (name, n = 1, opts = {}) => (env, side = SIDE.MINE) => {
    const filter = buildFilter(opts.filter || {});
    for (const s of resolveSides(opts.side, side)) {
        for (const c of env[s][ENVIRONMENT.MONSTER_FIELD] || []) {
            if (c === CARD_TYPE.PLACEHOLDER || !c?.card) continue;
            if (!filter(c)) continue;
            c.counters = c.counters || {};
            c.counters[name] = (c.counters[name] || 0) + n;
            if (!opts.all) return;
        }
    }
};

/** Remove up to N counters of `name` (cost payment). */
export const removeCounter = (name, n = 1, opts = {}) => (env, side = SIDE.MINE) => {
    const filter = buildFilter(opts.filter || {});
    for (const s of resolveSides(opts.side, side)) {
        for (const c of env[s][ENVIRONMENT.MONSTER_FIELD] || []) {
            if (c === CARD_TYPE.PLACEHOLDER || !c?.card?.key) continue;
            if (!filter(c)) continue;
            if (!c.counters?.[name]) continue;
            c.counters[name] = Math.max(0, c.counters[name] - n);
            if (!opts.all) return;
        }
    }
};

/** Read a counter value (for conditions: getCounter(cardEnv, 'Spell') >= 2). */
export const getCounter = (cardEnv, name) => cardEnv?.counters?.[name] || 0;

/**
 * Timed stat change that SURVIVES the engine's per-update stat reset
 * (environmentReducer re-applies temp_mods after every reset; PhaseEvents
 * removes them when `until` arrives).
 * amounts: { atk: +n, def: +n, setAtk: n, setDef: n }
 * opts:    { filter, side: 'MINE'|'OPPONENT'|'BOTH',
 *            until: PHASE.* | null (default END_PHASE — "until the end of
 *            this turn"; null = permanent while on field) }
 */
export const boostStats = (amounts = {}, opts = {}) => (env, side = SIDE.MINE) => {
    const filter = buildFilter(opts.filter || {});
    const until  = opts.until === undefined ? PHASE.END_PHASE : opts.until;
    const applied = [];
    for (const s of resolveSides(opts.side, side)) {
        for (const c of env[s][ENVIRONMENT.MONSTER_FIELD] || []) {
            if (c === CARD_TYPE.PLACEHOLDER || !c?.card) continue;
            if (!filter(c)) continue;
            const mod = {
                atk: amounts.atk || 0,
                def: amounts.def || 0,
            };
            if (amounts.setAtk !== undefined) mod.set_atk = amounts.setAtk;
            if (amounts.setDef !== undefined) mod.set_def = amounts.setDef;
            c.temp_mods = c.temp_mods || [];
            c.temp_mods.push(mod);
            applied.push({ cardEnv: c, mod });
            // Apply immediately too, so the change is visible before the
            // next reducer pass
            if (mod.set_atk !== undefined) c.current_atk = mod.set_atk;
            if (mod.set_def !== undefined) c.current_def = mod.set_def;
            c.current_atk = (c.current_atk ?? c.card.atk ?? 0) + mod.atk;
            c.current_def = (c.current_def ?? c.card.def ?? 0) + mod.def;
        }
    }
    if (until && applied.length) {
        PhaseEvents.schedule(until, () => {
            for (const { cardEnv, mod } of applied) {
                if (!Array.isArray(cardEnv.temp_mods)) continue;
                const i = cardEnv.temp_mods.indexOf(mod);
                if (i !== -1) cardEnv.temp_mods.splice(i, 1);
            }
        }, { side, ownTurnOnly: false });
    }
};

/** Set ATK/DEF to a fixed value (MAKE_ATK_0 patterns). Same opts as boostStats. */
export const setStats = (amounts = {}, opts = {}) =>
    boostStats({ setAtk: amounts.atk, setDef: amounts.def }, opts);

/**
 * Targeted destroy with player selection (MST pattern: "target 1 card;
 * destroy it"). Fires destroy triggers for monsters, unlike sendToGY.
 * opts: { zone: 'MONSTER_FIELD' | 'SPELL_FIELD' | 'ANY' (default 'ANY'),
 *         side: 'MINE'|'OPPONENT'|'BOTH' (default 'BOTH'), filter, count }
 */
export const destroyCards = (opts = {}, label) => (env, side = SIDE.MINE) => {
    const filter = buildFilter(opts.filter || {});
    const zones = opts.zone === 'MONSTER_FIELD' ? [ENVIRONMENT.MONSTER_FIELD]
                : opts.zone === 'SPELL_FIELD'   ? [ENVIRONMENT.SPELL_FIELD]
                : [ENVIRONMENT.MONSTER_FIELD, ENVIRONMENT.SPELL_FIELD];
    const pool = [];
    for (const s of resolveSides(opts.side || 'BOTH', side)) {
        for (const zone of zones) {
            for (const c of env[s][zone] || []) {
                if (c === CARD_TYPE.PLACEHOLDER || !c?.card) continue;
                if (!filter(c)) continue;
                pool.push(c);
            }
        }
    }
    if (!pool.length) return Promise.resolve();

    return openSelector({
        type: CARD_SELECT_TYPE.CARD_SELECT_BATTLE_SELECT,
        label: label || `Destroy ${opts.count ?? 1} card(s)`,
        sourceList: pool,
        numToSelect: opts.count ?? 1,
    }).then(({ cardEnvs: uids }) => {
        const destroyedMonsters = [];
        for (const uid of uids) {
            for (const s of [SIDE.MINE, SIDE.OPPONENT]) {
                for (const zone of zones) {
                    const arr = env[s][zone];
                    if (!Array.isArray(arr)) continue;
                    const idx = arr.findIndex(c =>
                        c !== CARD_TYPE.PLACEHOLDER && c?.card &&
                        get_unique_id_from_ennvironment(c) === uid);
                    if (idx === -1) continue;
                    const cardEnv = arr[idx];
                    const isPendulum = cardEnv.card?.card_type === 'MONSTER_PENDULUM';
                    const dest = isPendulum && zone === ENVIRONMENT.MONSTER_FIELD
                        ? ENVIRONMENT.EXTRA_DECK : ENVIRONMENT.GRAVEYARD;
                    env[s][dest].push(cardEnv);
                    arr[idx] = CARD_TYPE.PLACEHOLDER;
                    if (zone === ENVIRONMENT.MONSTER_FIELD) destroyedMonsters.push({ cardEnv, s });
                }
            }
        }
        if (destroyedMonsters.length) {
            const { fireTrigger, fireFieldWatchTriggers } = require('./triggerRegistry');
            for (const { cardEnv, s } of destroyedMonsters) {
                fireTrigger(TRIGGER_TYPE.ON_DESTROY, cardEnv, env, s);
                fireFieldWatchTriggers(TRIGGER_TYPE.ON_ALLY_DESTROYED, cardEnv, env, s, true);
            }
        }
    }).catch(() => {});
};

// ── RULEBOOK WRAPPERS ─────────────────────────────────────────────────────────

/**
 * QUICK EFFECT (Spell Speed 2) — activatable during either player's turn and
 * chainable. Core/Chain reads spell_speed / quick_effect when building chain
 * windows; face-up monsters with quick_effect appear as chain responses.
 * opts: { oncePerTurn: bool (default true), windUp: bool — single use while
 *         face-up (Core/OncePer permanent tracking) }
 */
export const quickEffect = (operation, conditionFn = () => true, opts = {}) => [{
    condition: conditionFn,
    target: null,
    operation: (env, side = SIDE.MINE, targets) => operation(env, side, targets),
    quick_effect: true,
    spell_speed: 2,
    ...(opts.oncePerTurn !== false ? { once_per_turn: true } : {}),
    ...(opts.windUp ? { wind_up: true } : {}),
}];

/**
 * COUNTER TRAP (Spell Speed 3) — only speed-3 effects can respond to it.
 * Chain-link negation itself is performed by Core/Chain.negateLink; the
 * operation receives (env, side, targets) when the link resolves.
 */
export const counterTrap = (operation, conditionFn = () => true) => [{
    condition: conditionFn,
    target: null,
    operation: (env, side = SIDE.MINE, targets) => operation(env, side, targets),
    spell_speed: 3,
}];

/**
 * HARD once-per-duel / once-while-face-up effect — rides Core/OncePer's
 * permanent (wind_up) tracking, which is cleared only when the card leaves
 * the field.
 */
export const oncePerDuel = (operation, conditionFn = () => true) => [{
    condition: conditionFn,
    target: null,
    operation: (env, side = SIDE.MINE) => operation(env, side),
    wind_up: true,
}];

/**
 * Phase trigger — operation fires automatically at `phase` while this card
 * is face-up on the field (rides Core/PhaseEvents, fired from Game.jsx).
 * opts: { ownTurnOnly: bool (default true — "during YOUR Standby Phase"),
 *         condition: extra (env, side) => bool gate }
 */
export const onPhase = (phase, operation, opts = {}) => [{
    condition: () => false, // not click-activatable — fires on phase change
    target: null,
    operation: (env, side = SIDE.MINE) => operation(env, side),
    phase_trigger: { phase, ownTurnOnly: opts.ownTurnOnly !== false },
    phase_condition: opts.condition || null,
}];

/**
 * FLIP effect — fires when this monster is flipped face-up by battle
 * (Core/Battle reveal hook). Man-Eater Bug pattern.
 */
export const onFlip = (operation) => [{
    condition: () => false,
    target: null,
    operation: () => {},
    on_flip: (env, side) => operation(env, side),
}];

/**
 * Battle-destruction protection — Core/Battle consults
 * can_protect_from_destroy/protect_from_destroy before sending a monster to
 * the GY (Zenmaines pattern: pass a conditionFn that pays the cost and
 * returns true, or use the default for blanket protection).
 */
export const protectFromBattleDestroy = (conditionFn = () => true, onProtect = null) => [{
    condition: () => false,
    target: null,
    operation: () => {},
    can_protect_from_destroy: (cardEnv) => conditionFn(cardEnv),
    protect_from_destroy: (cardEnv, env, side) => {
        if (onProtect) onProtect(cardEnv, env, side);
        return env;
    },
}];

/** Battle damage multiplier (Odd-Eyes pattern — doubles battle damage). */
export const damageMultiplier = (n) => [{
    condition: () => false,
    target: null,
    operation: () => {},
    battle_damage_multiplier: n,
}];

/**
 * EQUIP SPELL — full lifecycle:
 *  1. On activation: player targets a monster matching targetOpts; the
 *     target's uid is recorded on the equip card.
 *  2. While both remain on the field: boost {atk, def} (or a custom
 *     passiveFn(target, env, side)) applies via the passive walk.
 *  3. If the equipped monster leaves the field: the equip card goes to
 *     the GY ("falls off"), per the rulebook.
 *
 * @param {number} equipKey   the equip spell's own passcode
 * @param {object} targetOpts buildFilter options for legal targets
 * @param {object|function} boost {atk, def} or (targetCardEnv, env, side) => void
 */
export const equipTo = (equipKey, targetOpts = {}, boost = {}, label) => [{
    condition: (env) =>
        getField(env, SIDE.MINE).some(buildFilter(targetOpts)),
    target: null,
    is_continuous: true, // stays on the field like a Continuous Spell
    operation: (env, side = SIDE.MINE) => {
        const filter = buildFilter(targetOpts);
        const pool = getField(env, side).filter(filter);
        if (!pool.length) return Promise.resolve();
        return openSelector({
            type: CARD_SELECT_TYPE.CARD_SELECT_BATTLE_SELECT,
            label: label || 'Equip to 1 monster',
            sourceList: pool,
            numToSelect: 1,
        }).then(({ cardEnvs: [uid] }) => {
            // Record the target on the equip card (it is on the spell field
            // by the time the operation resolves)
            const equip = (env[side][ENVIRONMENT.SPELL_FIELD] || [])
                .find(c => c?.card?.key === equipKey && !c.equip_target);
            if (equip) equip.equip_target = uid;
        }).catch(() => {});
    },
    passive_effect: (env, side) => {
        const spellField = env[side][ENVIRONMENT.SPELL_FIELD] || [];
        for (let i = 0; i < spellField.length; i++) {
            const equip = spellField[i];
            if (!equip?.card || equip.card.key !== equipKey) continue;
            if (!equip.equip_target) continue; // not yet attached
            const target = (env[side][ENVIRONMENT.MONSTER_FIELD] || []).find(c =>
                c !== CARD_TYPE.PLACEHOLDER && c?.card &&
                get_unique_id_from_ennvironment(c) === equip.equip_target);
            if (!target) {
                // Equipped monster left the field — the equip falls off
                env[side][ENVIRONMENT.GRAVEYARD].push(equip);
                spellField[i] = CARD_TYPE.PLACEHOLDER;
                continue;
            }
            if (typeof boost === 'function') {
                boost(target, env, side);
            } else {
                target.current_atk = (target.current_atk ?? target.card.atk ?? 0) + (boost.atk || 0);
                target.current_def = (target.current_def ?? target.card.def ?? 0) + (boost.def || 0);
            }
        }
    },
}];