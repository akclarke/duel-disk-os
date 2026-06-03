/**
 * Core/Targeting/index.js
 *
 * Target declaration for effects that target cards.
 *
 * OFFICIAL RULE:
 *   Targets are declared at activation, before the chain is built.
 *   At resolution, targets are validated (still on field, still valid).
 *   If a target is no longer valid at resolution, the effect disappears.
 *
 * USAGE IN effectFactory.js:
 *   Add a `targets` config to an effect entry:
 *   {
 *     targets: { count: 1, location: 'OPPONENT_FIELD', filter: (cardEnv, env, side) => bool },
 *     operation: (env, side, targets) => void|Promise
 *   }
 *
 * The Targeting module is called by Core.Effect.activate() BEFORE Chain.open()
 * when the effect has a targets config.
 */

import store from '../../Store/store';
import { show_tool } from '../../Store/actions/toolActions';
import { TOOL_TYPE } from '../../Store/actions/actionTypes';
import { ENVIRONMENT, SIDE, CARD_TYPE, CARD_POS } from '../../Components/Card/utils/constant';
import { CARD_SELECT_TYPE } from '../../Components/PlayerGround/utils/constant';
import { get_unique_id_from_ennvironment } from '../../Components/PlayerGround/utils/utils';

// ── TARGET LOCATION POOLS ─────────────────────────────────────────────────

const LOCATION_MAP = {
    OPPONENT_FIELD:      (env, side) => {
        const opp = side === SIDE.MINE ? SIDE.OPPONENT : SIDE.MINE;
        return (env[opp][ENVIRONMENT.MONSTER_FIELD] || []).filter(c =>
            c !== CARD_TYPE.PLACEHOLDER && c?.card && c.current_pos !== CARD_POS.SET
        );
    },
    MY_FIELD:            (env, side) =>
        (env[side][ENVIRONMENT.MONSTER_FIELD] || []).filter(c =>
            c !== CARD_TYPE.PLACEHOLDER && c?.card
        ),
    ANY_FIELD:           (env, side) => {
        const opp = side === SIDE.MINE ? SIDE.OPPONENT : SIDE.MINE;
        return [
            ...(env[side][ENVIRONMENT.MONSTER_FIELD] || []).filter(c => c !== CARD_TYPE.PLACEHOLDER && c?.card),
            ...(env[opp][ENVIRONMENT.MONSTER_FIELD]  || []).filter(c => c !== CARD_TYPE.PLACEHOLDER && c?.card),
        ];
    },
    OPPONENT_SPELL_TRAP: (env, side) => {
        const opp = side === SIDE.MINE ? SIDE.OPPONENT : SIDE.MINE;
        return (env[opp][ENVIRONMENT.SPELL_FIELD] || []).filter(c => c?.card);
    },
    ANY_SPELL_TRAP:      (env, side) => {
        const opp = side === SIDE.MINE ? SIDE.OPPONENT : SIDE.MINE;
        return [
            ...(env[side][ENVIRONMENT.SPELL_FIELD] || []).filter(c => c?.card),
            ...(env[opp][ENVIRONMENT.SPELL_FIELD]  || []).filter(c => c?.card),
        ];
    },
};

// ── DECLARE ───────────────────────────────────────────────────────────────

/**
 * Open a CardSelector for the player to declare targets.
 *
 * targetsConfig: { count, location, filter, label }
 *   count:    number of cards to select
 *   location: key from LOCATION_MAP, or 'CUSTOM' (use filter only)
 *   filter:   optional (cardEnv, env, side) => bool extra filter
 *   label:    optional display label
 *
 * Returns Promise<cardEnv[]> — the declared targets.
 * Throws if player cancels.
 */
export const declare = (targetsConfig, env, side) => {
    const { count = 1, location = 'OPPONENT_FIELD', filter, label } = targetsConfig;

    const locationFn = LOCATION_MAP[location] || LOCATION_MAP.OPPONENT_FIELD;
    let pool = locationFn(env, side);

    if (filter) {
        pool = pool.filter(c => filter(c, env, side));
    }

    if (pool.length === 0) {
        return Promise.reject(new Error('No valid targets available'));
    }

    return new Promise((resolve, reject) => {
        store.dispatch(show_tool({
            tool_type: TOOL_TYPE.CARD_SELECTOR,
            info: {
                type:        CARD_SELECT_TYPE.CARD_SELECT_BATTLE_SELECT,
                label:       label || `Select ${count} target(s)`,
                sourceList:  pool,
                numToSelect: count,
                resolve: (result) => {
                    if (!result?.cardEnvs?.length) { reject(new Error('Cancelled')); return; }
                    // Map UIDs back to cardEnv objects
                    const targets = result.cardEnvs
                        .map(uid => pool.find(c => get_unique_id_from_ennvironment(c) === uid))
                        .filter(Boolean);
                    resolve(targets);
                },
                reject,
            },
        }));
    });
};

// ── VALIDATE ──────────────────────────────────────────────────────────────

/**
 * Check that all declared targets are still present on the field at resolution time.
 * Returns true if all targets are still valid, false if any have left the field.
 *
 * targets:       cardEnv[] declared at activation
 * targetsConfig: the same config used during declaration
 */
export const validate = (targets, targetsConfig, env, side) => {
    if (!targets || targets.length === 0) return true;

    const { location = 'OPPONENT_FIELD', filter } = targetsConfig;
    const locationFn = LOCATION_MAP[location] || LOCATION_MAP.OPPONENT_FIELD;
    let currentPool = locationFn(env, side);
    if (filter) currentPool = currentPool.filter(c => filter(c, env, side));

    const currentUIDs = new Set(currentPool.map(c => get_unique_id_from_ennvironment(c)));

    for (const target of targets) {
        const uid = get_unique_id_from_ennvironment(target);
        if (!currentUIDs.has(uid)) {
            console.log(`[Targeting] Target ${target.card?.name} is no longer valid — effect disappears`);
            return false;
        }
    }
    return true;
};

export default { declare, validate, LOCATION_MAP };
