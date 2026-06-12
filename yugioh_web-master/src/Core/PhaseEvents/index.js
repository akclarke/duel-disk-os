/**
 * Core/PhaseEvents/index.js
 *
 * Phase-event bus. Game.jsx calls firePhase() on every phase transition;
 * two kinds of consumers run off it:
 *
 *  1. SCHEDULED ONE-SHOTS — schedule(phase, fn, opts) registers a callback
 *     for a future occurrence of `phase` (e.g. "return this banished card
 *     during my next Standby Phase", "drop this ATK boost at the End Phase").
 *     Used by effectFactory primitives: banishUntil(), boostStats({until}),
 *     takeControl({until}).
 *
 *  2. CARD PHASE TRIGGERS — registry entries carrying
 *     `phase_trigger: { phase, ownTurnOnly }` fire their operation while
 *     their card is face-up on the field (effectFactory.onPhase()).
 *
 * Callbacks receive a fresh env snapshot and MUTATE it. The bus dispatches
 * one env update after each phase's batch, so individual callbacks must not
 * dispatch themselves.
 */

import store from '../../Store/store';
import { update_environment } from '../../Store/actions/environmentActions';
import { ENVIRONMENT, SIDE, CARD_TYPE } from '../../Components/Card/utils/constant';

// ── STATE ──────────────────────────────────────────────────────────────────

/**
 * @type {Array<{phase: string, fn: (env) => void|Promise, side: string|null,
 *               ownTurnOnly: boolean}>}
 */
let scheduled = [];

// ── PUBLIC API ─────────────────────────────────────────────────────────────

/**
 * Register a one-shot callback for the next occurrence of `phase`.
 *
 * @param {string}   phase        PHASE.* constant ('Draw', 'Standby', ...)
 * @param {function} fn           (env) => void|Promise — mutates env
 * @param {object}   opts
 * @param {string}   opts.side         SIDE.MINE | SIDE.OPPONENT — whose effect this is
 * @param {boolean}  opts.ownTurnOnly  only fire during that side's own turn
 *                                     ("until YOUR next Standby Phase")
 */
const schedule = (phase, fn, { side = null, ownTurnOnly = false } = {}) => {
    scheduled.push({ phase, fn, side, ownTurnOnly });
};

/** Remove a previously scheduled callback (identity match on fn). */
const unschedule = (fn) => {
    scheduled = scheduled.filter(s => s.fn !== fn);
};

/**
 * Called by Game.jsx on every phase transition (both players' turns funnel
 * through the same componentDidUpdate).
 *
 * @param {string}  phase     the phase just entered
 * @param {boolean} isMyTurn  true if it is SIDE.MINE's turn
 */
const firePhase = (phase, isMyTurn) => {
    // 1. Collect due one-shots
    const due = [];
    scheduled = scheduled.filter(s => {
        if (s.phase !== phase) return true;
        if (s.ownTurnOnly && s.side) {
            const isOwnTurn = s.side === SIDE.MINE ? isMyTurn : !isMyTurn;
            if (!isOwnTurn) return true; // not this occurrence — keep waiting
        }
        due.push(s);
        return false;
    });

    // 2. Collect phase-trigger entries from face-up cards on both fields
    const env0 = store.getState().environmentReducer.environment;
    const triggered = [];
    if (env0) {
        for (const side of [SIDE.MINE, SIDE.OPPONENT]) {
            const isOwnTurn = side === SIDE.MINE ? isMyTurn : !isMyTurn;
            for (const zone of [ENVIRONMENT.MONSTER_FIELD, ENVIRONMENT.SPELL_FIELD]) {
                for (const cardEnv of (env0[side]?.[zone] || [])) {
                    if (cardEnv === CARD_TYPE.PLACEHOLDER || !cardEnv?.card?.effects) continue;
                    if (cardEnv.current_pos === 'SET') continue; // face-down cards don't tick
                    for (const eff of cardEnv.card.effects) {
                        const pt = eff?.phase_trigger;
                        if (!pt || pt.phase !== phase) continue;
                        if (pt.ownTurnOnly && !isOwnTurn) continue;
                        triggered.push({ eff, side });
                    }
                }
            }
        }
    }

    if (!due.length && !triggered.length) return;

    // 3. Run everything against one fresh snapshot, then dispatch once
    const run = async () => {
        const env = store.getState().environmentReducer.environment;
        if (!env) return;
        for (const s of due) {
            try {
                const r = s.fn(env);
                if (r && typeof r.then === 'function') await r;
            } catch (e) {
                console.warn('[PhaseEvents] scheduled callback error:', e);
            }
        }
        for (const { eff, side } of triggered) {
            try {
                if (eff.phase_condition && !eff.phase_condition(env, side)) continue;
                const r = eff.operation(env, side);
                if (r && typeof r.then === 'function') await r;
            } catch (e) {
                console.warn('[PhaseEvents] phase trigger error:', e);
            }
        }
        store.dispatch(update_environment(env));
    };
    run();
};

/** Reset all scheduled callbacks (new duel). */
const clearAll = () => { scheduled = []; };

/** Debug snapshot. */
const debug = () => scheduled.map(s => ({ phase: s.phase, side: s.side, ownTurnOnly: s.ownTurnOnly }));

export default { schedule, unschedule, firePhase, clearAll, debug };
