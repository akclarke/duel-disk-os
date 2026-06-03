/**
 * Core/Chain/index.js
 *
 * Official Yu-Gi-Oh! chain stack with LIFO resolution.
 *
 * SPELL SPEEDS
 *   1 — Normal Spells, ignition monster effects, mandatory triggers
 *   2 — Quick-Play Spells, Traps, Quick Effects (once_per_turn that are quick)
 *   3 — Counter Traps only
 *
 * CHAIN RULES
 *   • Speed 1 cannot be added to an existing chain.
 *   • Each new link must have spell speed ≥ the previous link.
 *   • Chain resolves LIFO: last activated resolves first.
 *   • Both players must pass consecutively to close the chain.
 *
 * INTEGRATION
 *   Core.Effect.activate() calls Chain.open() instead of running operation() directly.
 *   CPUPlayer responds to CHAIN_WINDOW openings via the cpu_respond callback.
 */

import store from '../../Store/store';
import { show_tool, close_tool } from '../../Store/actions/toolActions';
import { TOOL_TYPE } from '../../Store/actions/actionTypes';
import { ENVIRONMENT, SIDE, CARD_TYPE } from '../../Components/Card/utils/constant';
import { update_environment } from '../../Store/actions/environmentActions';
import { logEvent, LOG_TYPE } from '../../data/duelLog';
import { fireTrigger, fireFieldWatchTriggers, TRIGGER_TYPE } from '../../data/triggerRegistry';
import { CARD_SELECT_TYPE } from '../../Components/PlayerGround/utils/constant';

// ── SPELL SPEED CONSTANTS ──────────────────────────────────────────────────

export const SPELL_SPEED = {
    ONE:   1,
    TWO:   2,
    THREE: 3,
};

/**
 * Determine the spell speed of an effect activation.
 * Priority: explicit effect.spell_speed → card type mapping → default 1.
 */
export const getSpellSpeed = (cardEnv, effect) => {
    if (effect?.spell_speed) return effect.spell_speed;
    const ct = cardEnv?.card?.card_type || '';
    if (ct === 'TRAP_COUNTER')                 return SPELL_SPEED.THREE;
    if (ct === 'SPELL_QUICK')                  return SPELL_SPEED.TWO;
    if (ct.startsWith('TRAP'))                 return SPELL_SPEED.TWO;
    if (effect?.quick_effect || effect?.is_quick) return SPELL_SPEED.TWO;
    // Trigger effects that fire during opponent's turn are Speed 2
    if (effect?.trigger_type && effect.trigger_type !== TRIGGER_TYPE.ON_DESTROY) {
        return SPELL_SPEED.TWO;
    }
    return SPELL_SPEED.ONE;
};

// ── CHAIN LINK ─────────────────────────────────────────────────────────────

/**
 * @typedef {Object} ChainLink
 * @property {object}   cardEnv    — the card whose effect was activated
 * @property {object}   effect     — the effect entry object
 * @property {string}   side       — SIDE.MINE | SIDE.OPPONENT
 * @property {number}   spellSpeed — computed at activation
 * @property {any[]}    targets    — declared targets (populated by Targeting module)
 * @property {boolean}  negated    — true if a negation effect resolved against this link
 */

const makeLink = (cardEnv, effect, side) => ({
    cardEnv,
    effect,
    side,
    spellSpeed: getSpellSpeed(cardEnv, effect),
    targets:    [],
    negated:    false,
});

// ── CAN-ADD CHECK ─────────────────────────────────────────────────────────

/**
 * Whether `effect` on `cardEnv` can be added to the current chain stack.
 * Returns { ok: bool, reason?: string }
 */
export const canAdd = (cardEnv, effect, chainStack) => {
    const speed = getSpellSpeed(cardEnv, effect);

    if (chainStack.length === 0) return { ok: true };

    // Speed 1 cannot be added to an active chain
    if (speed === SPELL_SPEED.ONE) {
        return { ok: false, reason: 'Spell Speed 1 effects cannot be added to an existing chain' };
    }

    const prevSpeed = chainStack[chainStack.length - 1].spellSpeed;
    if (speed < prevSpeed) {
        return { ok: false, reason: `Speed ${speed} cannot chain to Speed ${prevSpeed}` };
    }

    return { ok: true };
};

// ── AVAILABLE RESPONSES ───────────────────────────────────────────────────

/**
 * Find all effects the given side could legally add to the chain right now.
 * Scans hand, face-down S/T field, and face-up monsters with quick effects.
 */
const findAvailableResponses = (env, side, chainStack) => {
    const available = [];

    // Face-down S/T in spell zone (traps and set quick-plays)
    const stField = env[side][ENVIRONMENT.SPELL_FIELD] || [];
    for (const cardEnv of stField) {
        if (!cardEnv?.card || cardEnv.current_pos !== 'SET') continue;
        const effects = cardEnv.card.effects || [];
        for (const eff of effects) {
            if (!eff.condition || !eff.condition(env)) continue;
            const { ok } = canAdd(cardEnv, eff, chainStack);
            if (ok) available.push({ cardEnv, effect: eff });
        }
    }

    // Face-up monsters with quick_effect flag
    const mf = env[side][ENVIRONMENT.MONSTER_FIELD] || [];
    for (const cardEnv of mf) {
        if (!cardEnv?.card || cardEnv === CARD_TYPE.PLACEHOLDER) continue;
        if (cardEnv.current_pos === 'SET') continue;
        const effects = cardEnv.card.effects || [];
        for (const eff of effects) {
            if (!eff.quick_effect) continue;
            if (!eff.condition || !eff.condition(env)) continue;
            const { ok } = canAdd(cardEnv, eff, chainStack);
            if (ok) available.push({ cardEnv, effect: eff });
        }
    }

    return available;
};

// ── UI HELPERS ─────────────────────────────────────────────────────────────

/**
 * Ask a player to add to the chain or pass.
 * Returns Promise<{ cardEnv, effect } | null> — null means pass.
 *
 * Re-uses the CHAIN_WINDOW tool type so ChainWindow.jsx handles the display.
 * The info object is extended with { chainStack, available } for the UI.
 */
const askPlayer = (side, chainStack, available, attackerName) => {
    if (available.length === 0) return Promise.resolve(null); // nothing to chain

    return new Promise(resolve => {
        store.dispatch(show_tool({
            tool_type: TOOL_TYPE.CHAIN_WINDOW,
            info: {
                cards: available.map(r => r.cardEnv),
                availableResponses: available,
                chainStack,
                triggerName: attackerName || 'card activation',
                resolve: (result) => {
                    if (!result || !result.activated) {
                        resolve(null);
                    } else {
                        // result.cardEnv comes back from ChainWindow
                        const chosen = available.find(r =>
                            r.cardEnv === result.cardEnv ||
                            r.cardEnv.card?.key === result.cardEnv?.card?.key
                        );
                        resolve(chosen || null);
                    }
                },
            },
        }));
    });
};

// ── RESOLVE ───────────────────────────────────────────────────────────────

/**
 * Resolve the chain stack LIFO.
 * Each link's effect.operation() is called in reverse order.
 * Negated links are skipped.
 */
export const resolve = async (chainStack, env) => {
    logEvent(LOG_TYPE.SYSTEM, `Chain resolves — ${chainStack.length} link(s)`);

    for (let i = chainStack.length - 1; i >= 0; i--) {
        const link = chainStack[i];
        if (link.negated) {
            logEvent(LOG_TYPE.EFFECT, `Chain Link ${i + 1} (${link.cardEnv.card?.name}) was negated — skipped`);
            continue;
        }

        logEvent(LOG_TYPE.EFFECT, `Chain Link ${i + 1} resolving: ${link.cardEnv.card?.name}`);

        try {
            const freshEnv = store.getState().environmentReducer.environment;

            // Clone working env
            const cloned = {
                ...freshEnv,
                [SIDE.MINE]: {
                    ...freshEnv[SIDE.MINE],
                    [ENVIRONMENT.MONSTER_FIELD]: [...(freshEnv[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD] || [])],
                    [ENVIRONMENT.SPELL_FIELD]:   [...(freshEnv[SIDE.MINE][ENVIRONMENT.SPELL_FIELD]   || [])],
                    [ENVIRONMENT.HAND]:          [...(freshEnv[SIDE.MINE][ENVIRONMENT.HAND]          || [])],
                    [ENVIRONMENT.DECK]:          [...(freshEnv[SIDE.MINE][ENVIRONMENT.DECK]          || [])],
                    [ENVIRONMENT.GRAVEYARD]:     [...(freshEnv[SIDE.MINE][ENVIRONMENT.GRAVEYARD]     || [])],
                    [ENVIRONMENT.EXTRA_DECK]:    [...(freshEnv[SIDE.MINE][ENVIRONMENT.EXTRA_DECK]    || [])],
                },
                [SIDE.OPPONENT]: {
                    ...freshEnv[SIDE.OPPONENT],
                    [ENVIRONMENT.MONSTER_FIELD]: [...(freshEnv[SIDE.OPPONENT][ENVIRONMENT.MONSTER_FIELD] || [])],
                    [ENVIRONMENT.GRAVEYARD]:     [...(freshEnv[SIDE.OPPONENT][ENVIRONMENT.GRAVEYARD]     || [])],
                    [ENVIRONMENT.HAND]:          [...(freshEnv[SIDE.OPPONENT][ENVIRONMENT.HAND]          || [])],
                },
            };

            const operation = link.effect.operation || link.effect.field_activate;
            if (typeof operation === 'function') {
                const result = operation(cloned, link.side, link.targets);
                if (result && typeof result.then === 'function') {
                    await result;
                }
            }

            store.dispatch(update_environment(cloned));
        } catch (e) {
            console.warn(`[Chain] Link ${i + 1} error:`, e);
        }
    }

    return store.getState().environmentReducer.environment;
};

// ── OPEN ──────────────────────────────────────────────────────────────────

/**
 * Open a chain starting with `firstLink`.
 * Alternates asking each player to add to the chain until both pass consecutively.
 * Returns Promise that resolves after the chain fully resolves.
 *
 * @param {ChainLink} firstLink   — chain link 1 (already built by caller)
 * @param {string}    turnPlayer  — who has priority (SIDE.MINE | SIDE.OPPONENT)
 * @param {string}    triggerName — display name for what triggered the chain
 */
export const open = async (firstLink, turnPlayer, triggerName) => {
    const chainStack = [firstLink];

    logEvent(LOG_TYPE.SYSTEM, `Chain opens — Link 1: ${firstLink.cardEnv.card?.name} (Speed ${firstLink.spellSpeed})`);

    const nonTurnPlayer = turnPlayer === SIDE.MINE ? SIDE.OPPONENT : SIDE.MINE;
    const order         = [nonTurnPlayer, turnPlayer]; // non-turn-player responds first
    let   consecutivePasses = 0;

    while (consecutivePasses < 2) {
        for (const respondingSide of order) {
            if (consecutivePasses >= 2) break;

            const env       = store.getState().environmentReducer.environment;
            const available = findAvailableResponses(env, respondingSide, chainStack);

            // CPU always passes (unless we expand CPUPlayer later)
            const isCPU = respondingSide === SIDE.OPPONENT; // simplified
            if (isCPU || available.length === 0) {
                consecutivePasses++;
                continue;
            }

            const chosen = await askPlayer(respondingSide, chainStack, available, triggerName);

            if (!chosen) {
                consecutivePasses++;
            } else {
                consecutivePasses = 0;
                const newLink = makeLink(chosen.cardEnv, chosen.effect, respondingSide);
                chainStack.push(newLink);
                logEvent(LOG_TYPE.SYSTEM, `Chain Link ${chainStack.length}: ${chosen.cardEnv.card?.name} (Speed ${newLink.spellSpeed})`);
            }
        }
    }

    logEvent(LOG_TYPE.SYSTEM, `Chain closing — resolving ${chainStack.length} link(s) LIFO`);
    return resolve(chainStack, store.getState().environmentReducer.environment);
};

// ── NEGATE A CHAIN LINK ───────────────────────────────────────────────────

/**
 * Mark the Nth chain link as negated.
 * Called by negate() in effectFactory when a counter trap resolves.
 * link_index: 1-based (1 = first link on chain, i.e. the last to resolve)
 */
export const negateLink = (chainStack, linkIndex) => {
    const idx = linkIndex - 1;
    if (idx >= 0 && idx < chainStack.length) {
        chainStack[idx].negated = true;
        logEvent(LOG_TYPE.EFFECT, `Chain Link ${linkIndex} (${chainStack[idx].cardEnv.card?.name}) negated`);
    }
};

export default { SPELL_SPEED, getSpellSpeed, canAdd, open, resolve, negateLink, makeLink };
