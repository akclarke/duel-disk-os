/**
 * triggerRegistry.js — src/data/triggerRegistry.js
 *
 * Maps card IDs to triggered effects that fire automatically on game events.
 * Uses effectFactory.js wrappers — each card is now 1-2 lines.
 *
 * Trigger types:
 *   ON_DESTROY          — card sent to GY by any means
 *   ON_BATTLE_DAMAGE    — this monster inflicts battle damage
 *   ON_ATTACK_DECLARED  — attack declared (set traps only)
 */

import { ENVIRONMENT, SIDE, CARD_TYPE, CARD_POS } from '../Components/Card/utils/constant';
import { CARD_SELECT_TYPE } from '../Components/PlayerGround/utils/constant';
import { TOOL_TYPE } from '../Store/actions/actionTypes';
import { show_tool } from '../Store/actions/toolActions';
import store from '../Store/store';
import { update_environment } from '../Store/actions/environmentActions';
import { get_unique_id_from_ennvironment } from '../Components/PlayerGround/utils/utils';

import {
    searchDeck, drawCards, dealDamage,
    onDestroy, onBattleDamage, onAttackDeclared,
    destroyMonsters, recruiter,
} from './effectFactory';

// ── Trigger type constants ────────────────────────────────────────────────────
export const TRIGGER_TYPE = {
    ON_DESTROY:         'ON_DESTROY',
    ON_LEAVE_FIELD:     'ON_LEAVE_FIELD',
    ON_BATTLE_DAMAGE:   'ON_BATTLE_DAMAGE',
    ON_ATTACK_DECLARED: 'ON_ATTACK_DECLARED',
};

// ── TRIGGER REGISTRY ─────────────────────────────────────────────────────────

export const TRIGGER_REGISTRY = {

    // Sangan (26202165) — on destroy: search 1 monster ATK ≤ 1500 from deck
    26202165: recruiter(
        { atk: { max: 1500 }, type: 'MONSTER' },
        'Sangan — add 1 monster with ATK ≤ 1500 from Deck to hand'
    ),

    // Witch of the Black Forest (78010363) — on destroy: search 1 monster DEF ≤ 1500
    78010363: onDestroy(
        searchDeck(
            { def: { max: 1500 }, type: 'MONSTER' },
            'Witch of the Black Forest — add 1 monster with DEF ≤ 1500 to hand'
        )
    ),

    // Toon Masked Sorcerer (16392422) — on battle damage: draw 1 card
    16392422: onBattleDamage(
        drawCards(1)
    ),

    // Mirror Force (44095762) — on attack declared: destroy all ATK-pos opponent monsters
    44095762: onAttackDeclared(
        (env) => destroyMonsters({
            side: 'OPPONENT',
            filter: { custom: (c) => c.current_pos === CARD_POS.FACE || c.current_pos === 'UNSURE' }
        })(env, SIDE.MINE)
    ),

    // Sakuretsu Armor (56120475) — on attack declared: destroy the attacking monster
    56120475: onAttackDeclared(
        (env, side, attackerCardEnv, attackerIndex) => {
            if (attackerIndex === undefined) return;
            const field = env[SIDE.OPPONENT][ENVIRONMENT.MONSTER_FIELD];
            if (field[attackerIndex]?.card) {
                env[SIDE.OPPONENT][ENVIRONMENT.GRAVEYARD].push(field[attackerIndex]);
                field[attackerIndex] = CARD_TYPE.PLACEHOLDER;
                store.dispatch(update_environment(env));
            }
        }
    ),

    // Magic Cylinder (62279055) — on attack declared: negate, deal ATK as damage
    62279055: onAttackDeclared(
        (env, side, attackerCardEnv) => {
            const dmg = attackerCardEnv?.current_atk ?? attackerCardEnv?.card?.atk ?? 0;
            env[SIDE.OPPONENT].hp = Math.max(0, (env[SIDE.OPPONENT].hp || 0) - dmg);
            store.dispatch(update_environment(env));
            console.log('[Magic Cylinder] Negated attack, dealt', dmg, 'damage');
        }
    ),
};

// ─── ENGINE ──────────────────────────────────────────────────────────────────

/**
 * Fire all matching triggers for a card.
 * Called by Battle_index and Misc after a card is destroyed or takes damage.
 */
export const fireTrigger = (triggerType, cardEnv, environment, side, extraData = {}) => {
    const cardKey = cardEnv?.card?.key;
    if (!cardKey) return;
    const triggers = TRIGGER_REGISTRY[cardKey];
    if (!triggers) return;

    for (const trigger of triggers) {
        if (trigger.trigger_type !== triggerType) continue;
        if (trigger.condition && !trigger.condition(environment, side, extraData)) continue;

        console.log(`[Trigger] ${triggerType} → ${cardEnv.card.name}`);
        setTimeout(() => {
            const freshEnv = store.getState().environmentReducer.environment;
            const cloned = {
                ...freshEnv,
                [SIDE.MINE]: {
                    ...freshEnv[SIDE.MINE],
                    [ENVIRONMENT.MONSTER_FIELD]: [...(freshEnv[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD] || [])],
                    [ENVIRONMENT.HAND]:          [...(freshEnv[SIDE.MINE][ENVIRONMENT.HAND]          || [])],
                    [ENVIRONMENT.DECK]:          [...(freshEnv[SIDE.MINE][ENVIRONMENT.DECK]          || [])],
                    [ENVIRONMENT.GRAVEYARD]:     [...(freshEnv[SIDE.MINE][ENVIRONMENT.GRAVEYARD]     || [])],
                    [ENVIRONMENT.SPELL_FIELD]:   [...(freshEnv[SIDE.MINE][ENVIRONMENT.SPELL_FIELD]   || [])],
                },
                [SIDE.OPPONENT]: {
                    ...freshEnv[SIDE.OPPONENT],
                    [ENVIRONMENT.MONSTER_FIELD]: [...(freshEnv[SIDE.OPPONENT][ENVIRONMENT.MONSTER_FIELD] || [])],
                    [ENVIRONMENT.GRAVEYARD]:     [...(freshEnv[SIDE.OPPONENT][ENVIRONMENT.GRAVEYARD]     || [])],
                },
            };
            const result = trigger.operation(
                cloned, side, extraData.attackerCardEnv, extraData.attackerIndex
            );
            const finish = () => store.dispatch(update_environment(cloned));
            if (result && typeof result.then === 'function') {
                result.then(finish).catch(finish);
            } else {
                finish();
            }
        }, 500);
    }
};

/**
 * Get all ON_ATTACK_DECLARED traps from a player's spell field.
 * Used by Field.jsx to populate the trap window.
 */
export const getAttackTriggerTraps = (environment, side) => {
    const spellField = environment[side][ENVIRONMENT.SPELL_FIELD] || [];
    const result = [];
    for (const cardEnv of spellField) {
        if (!cardEnv?.card) continue;
        const triggers = TRIGGER_REGISTRY[cardEnv.card.key];
        if (!triggers) continue;
        for (const trigger of triggers) {
            if (trigger.trigger_type === TRIGGER_TYPE.ON_ATTACK_DECLARED) {
                result.push({ cardEnv, trigger });
            }
        }
    }
    return result;
};