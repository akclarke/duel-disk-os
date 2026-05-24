/**
 * environmentReducer.js — src/Store/reducers/environmentReducer.js
 *
 * After every state update, runs applyPassiveEffects() to recalculate
 * ATK/DEF boosts from continuous spells/monsters on the field.
 * This is how "while on the field" effects work — they recalculate
 * every time state changes rather than applying a one-time boost.
 */
import { UPDATE_ENVIRONMENT, INITIALIZE_ENVIRONMENT, DRAW_CARD, PERFORM_ATTACK } from "../actions/actionTypes";
import Core from '../../Core';
import { ENVIRONMENT, SIDE, CARD_TYPE } from '../../Components/Card/utils/constant';

const initialState = {
    environment: undefined,
};

// ─── PASSIVE EFFECT ENGINE ─────────────────────────────────────────────────────
//
// Before we save state, we:
//  1. Reset all monsters to their base ATK/DEF (card.atk / card.def)
//  2. Walk every face-up spell/trap on the field; if it has passive_effect, call it
//  3. Walk every face-up monster on the field; if it has passive_effect, call it
//
// passive_effect(environment, side) mutates ATK/DEF directly on the cardEnv objects.
// It must be a PURE calculation (no promises, no dispatch calls).

const resetStats = (environment) => {
    for (const side of [SIDE.MINE, SIDE.OPPONENT]) {
        const field = environment[side][ENVIRONMENT.MONSTER_FIELD];
        if (!field) continue;
        for (const cardEnv of field) {
            if (cardEnv === CARD_TYPE.PLACEHOLDER || !cardEnv?.card) continue;
            // Reset to base values each cycle
            cardEnv.current_atk = cardEnv.card.atk ?? 0;
            cardEnv.current_def = cardEnv.card.def ?? 0;
        }
    }
};

const applyPassiveEffects = (environment) => {
    if (!environment) return environment;

    // 1. Reset all current_atk / current_def to base
    resetStats(environment);

    // 2. Apply passive effects from continuous spells/traps on field
    for (const side of [SIDE.MINE, SIDE.OPPONENT]) {
        const spellField = environment[side][ENVIRONMENT.SPELL_FIELD];
        if (!spellField) continue;
        for (const cardEnv of spellField) {
            if (!cardEnv?.card?.passive_effect) continue;
            try {
                cardEnv.card.passive_effect(environment, side);
            } catch (e) {
                console.warn('[PassiveEffect] spell error:', cardEnv.card.name, e);
            }
        }

        // 3. Apply passive effects from face-up monsters on field
        const monsterField = environment[side][ENVIRONMENT.MONSTER_FIELD];
        if (!monsterField) continue;
        for (const cardEnv of monsterField) {
            if (cardEnv === CARD_TYPE.PLACEHOLDER || !cardEnv?.card?.passive_effect) continue;
            try {
                cardEnv.card.passive_effect(environment, side);
            } catch (e) {
                console.warn('[PassiveEffect] monster error:', cardEnv.card?.name, e);
            }
        }
    }

    return environment;
};

// ─── REDUCER ──────────────────────────────────────────────────────────────────

export default function(state = initialState, action) {

    if (action.type === UPDATE_ENVIRONMENT) {
        const { environment } = action.payload;
        applyPassiveEffects(environment);
        return { environment: { ...environment } };

    } else if (action.type === INITIALIZE_ENVIRONMENT) {
        const { environment } = action.payload;
        applyPassiveEffects(environment);
        return { environment: { ...environment } };

    } else if (action.type === DRAW_CARD) {
        const { info } = action.payload;
        const new_environment = Core.Misc.draw_card_from_deck(state.environment, info);
        applyPassiveEffects(new_environment);
        return { environment: { ...new_environment } };

    } else if (action.type === PERFORM_ATTACK) {
        const { info } = action.payload;
        const new_environment = Core.Battle.battle(info, state.environment);
        applyPassiveEffects(new_environment);
        return { environment: { ...new_environment } };

    } else {
        return state;
    }
}