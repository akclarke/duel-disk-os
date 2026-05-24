/**
 * impact.js — Card effect impact definitions
 * 
 * These functions modify the game environment state object directly.
 * They do NOT use React setState — they operate on the engine's environment,
 * which is then dispatched to Redux by the caller.
 * 
 * Each impact function receives:
 *   @param {object} cardEnv  - The card environment object being affected
 *   @param {object} environment - The full game environment state
 *   @param {*} value - Optional numeric value (for ATK_UP, DEF_UP etc)
 * 
 * The caller (effect operation functions) is responsible for dispatching
 * the updated environment to Redux after calling an impact.
 */

import { CARD_POS, ENVIRONMENT, SIDE } from './constant.js'

export const IMPACT_DICT = {

    'DESTROY': (cardEnv, environment) => {
        // Find which side and zone this card is in, move it to graveyard
        for (const side of [SIDE.MINE, SIDE.OPPONENT]) {
            for (const zone of [ENVIRONMENT.MONSTER_FIELD, ENVIRONMENT.SPELL_FIELD]) {
                const field = environment[side][zone];
                const idx = field.findIndex(c => c && c.card && c.card.key === cardEnv.card.key);
                if (idx !== -1) {
                    environment[side][ENVIRONMENT.GRAVEYARD].push(field[idx]);
                    field[idx] = 'PLACEHOLDER';
                    return environment;
                }
            }
        }
        return environment;
    },

    'ATK_UP': (cardEnv, environment, value) => {
        cardEnv.card.current_atk = (cardEnv.card.current_atk || cardEnv.card.atk) + value;
        return environment;
    },

    'ATK_DOWN': (cardEnv, environment, value) => {
        cardEnv.card.current_atk = (cardEnv.card.current_atk || cardEnv.card.atk) - value;
        return environment;
    },

    'MAKE_ATK_0': (cardEnv, environment) => {
        cardEnv.card.current_atk = 0;
        return environment;
    },

    'HALVE_ATK': (cardEnv, environment) => {
        cardEnv.card.current_atk = Math.floor((cardEnv.card.current_atk || cardEnv.card.atk) / 2);
        return environment;
    },

    'DEF_UP': (cardEnv, environment, value) => {
        cardEnv.card.current_def = (cardEnv.card.current_def || cardEnv.card.def) + value;
        return environment;
    },

    'DEF_DOWN': (cardEnv, environment, value) => {
        cardEnv.card.current_def = (cardEnv.card.current_def || cardEnv.card.def) - value;
        return environment;
    },

    'LEVEL_UP': (cardEnv, environment, value) => {
        cardEnv.card.current_level = (cardEnv.card.current_level || cardEnv.card.level) + value;
        return environment;
    },

    'LEVEL_DOWN': (cardEnv, environment, value) => {
        cardEnv.card.current_level = (cardEnv.card.current_level || cardEnv.card.level) - value;
        return environment;
    },

    'BANISH': (cardEnv, environment) => {
        // Remove from wherever it is, add to banished
        for (const side of [SIDE.MINE, SIDE.OPPONENT]) {
            for (const zone of [ENVIRONMENT.MONSTER_FIELD, ENVIRONMENT.SPELL_FIELD, ENVIRONMENT.GRAVEYARD]) {
                const field = environment[side][zone];
                const idx = Array.isArray(field)
                    ? field.findIndex(c => c && c.card && c.card.key === cardEnv.card.key)
                    : -1;
                if (idx !== -1) {
                    environment[side][ENVIRONMENT.BANISHED].push(field[idx]);
                    if (zone === ENVIRONMENT.GRAVEYARD) {
                        field.splice(idx, 1);
                    } else {
                        field[idx] = 'PLACEHOLDER';
                    }
                    return environment;
                }
            }
        }
        return environment;
    },

    'RETURN_TO_HAND': (cardEnv, environment, side) => {
        // Moves a card from the field back to the hand
        for (const zone of [ENVIRONMENT.MONSTER_FIELD, ENVIRONMENT.SPELL_FIELD]) {
            const field = environment[side][zone];
            const idx = field.findIndex(c => c && c.card && c.card.key === cardEnv.card.key);
            if (idx !== -1) {
                environment[side][ENVIRONMENT.HAND].push(field[idx]);
                field[idx] = 'PLACEHOLDER';
                return environment;
            }
        }
        return environment;
    },

    'SHUFFLE_INTO_DECK': (cardEnv, environment, side) => {
        // Moves a card back to deck (from hand or field)
        for (const zone of [ENVIRONMENT.HAND, ENVIRONMENT.MONSTER_FIELD, ENVIRONMENT.SPELL_FIELD, ENVIRONMENT.GRAVEYARD]) {
            const field = environment[side][zone];
            const idx = Array.isArray(field)
                ? field.findIndex(c => c && c.card && c.card.key === cardEnv.card.key)
                : -1;
            if (idx !== -1) {
                environment[side][ENVIRONMENT.DECK].push(field[idx]);
                if (zone === ENVIRONMENT.HAND || zone === ENVIRONMENT.GRAVEYARD) {
                    field.splice(idx, 1);
                } else {
                    field[idx] = 'PLACEHOLDER';
                }
                // TODO: shuffle the deck array after inserting
                return environment;
            }
        }
        return environment;
    },

    'CHANGE_TO_DEF': (cardEnv, environment) => {
        cardEnv.card.current_pos = CARD_POS.DEFENSE;
        return environment;
    },

    'CHANGE_TO_ATK': (cardEnv, environment) => {
        cardEnv.card.current_pos = CARD_POS.FACE;
        return environment;
    },

    'NEGATE_EFFECT': (cardEnv, environment) => {
        // Flag the card as negated — effect resolution checks this flag
        cardEnv.card.negated = true;
        return environment;
    },

}