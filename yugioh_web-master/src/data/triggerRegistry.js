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

import { logEvent, LOG_TYPE } from './duelLog';
import {
    searchDeck, drawCards, dealDamage,
    onDestroy, onBattleDamage, onAttackDeclared,
    destroyMonsters, recruiter,
} from './effectFactory';

// ── Trigger type constants ────────────────────────────────────────────────────
export const TRIGGER_TYPE = {
    ON_DESTROY:          'ON_DESTROY',
    ON_LEAVE_FIELD:      'ON_LEAVE_FIELD',
    ON_BATTLE_DAMAGE:    'ON_BATTLE_DAMAGE',
    ON_ATTACK_DECLARED:  'ON_ATTACK_DECLARED',
    ON_PENDULUM_PLACED:  'ON_PENDULUM_PLACED',
    ON_NORMAL_SUMMON:    'ON_NORMAL_SUMMON',
    ON_MONSTER_SUMMONED: 'ON_MONSTER_SUMMONED', // fires whenever any monster is summoned
    ON_WINDUP_EFFECT:    'ON_WINDUP_EFFECT',    // fires when a Wind-Up monster uses its single-use effect
    ON_ALLY_DESTROYED:   'ON_ALLY_DESTROYED',   // fires when a same-side monster is destroyed and sent to GY
    ON_BATTLE_DESTROY:   'ON_BATTLE_DESTROY',   // fires on the ATTACKER when it destroys a monster by battle
};

// ── TRIGGER REGISTRY ─────────────────────────────────────────────────────────

export const TRIGGER_REGISTRY = {

    // Predaplant Spider Orchid (30537973) — Pendulum Scale 1
    // When activated (placed face-up in Pendulum Zone) same Main Phase: SS 1 Predaplant from Deck in DEF
    30537973: [{
        trigger_type: TRIGGER_TYPE.ON_PENDULUM_PLACED,
        condition: (env, side) =>
            (env[side][ENVIRONMENT.DECK] || []).some(c => c?.card?.name?.toLowerCase().includes('predaplant')),
        operation: (env, side) => {
            const deck = env[side][ENVIRONMENT.DECK];
            const valid = deck.filter(c => c?.card?.name?.toLowerCase().includes('predaplant'));
            if (!valid.length) return Promise.resolve();
            logEvent(LOG_TYPE.EFFECT, 'Spider Orchid: SS 1 Predaplant from Deck in DEF');
            const { show_tool: showTool } = require('../Store/actions/toolActions');
            const { TOOL_TYPE: TT } = require('../Store/actions/actionTypes');
            const { CARD_SELECT_TYPE: CST } = require('../Components/PlayerGround/utils/constant');
            return new Promise((resolve, reject) =>
                store.dispatch(showTool({
                    tool_type: TT.CARD_SELECTOR,
                    info: {
                        type: CST.CARD_SELECT_FROM_DECK,
                        label: 'Spider Orchid — Special Summon 1 Predaplant from Deck (DEF)',
                        sourceList: valid,
                        numToSelect: 1,
                        resolve, reject,
                    }
                }))
            ).then(({ cardEnvs: [uid] }) => {
                const freshEnv = store.getState().environmentReducer.environment;
                const d = freshEnv[side][ENVIRONMENT.DECK];
                const idx = d.findIndex(c => get_unique_id_from_ennvironment(c) === uid);
                if (idx === -1) return;
                const [card] = d.splice(idx, 1);
                const field = freshEnv[side][ENVIRONMENT.MONSTER_FIELD];
                for (const slot of [2, 3, 1, 4, 0]) {
                    if (field[slot] === CARD_TYPE.PLACEHOLDER) {
                        card.current_pos = CARD_POS.DEFENSE;
                        card.summoned_this_turn = true;
                        field[slot] = card;
                        break;
                    }
                }
                logEvent(LOG_TYPE.SPECIAL, `Spider Orchid: SS ${card.card?.name} in DEF`);
                store.dispatch(update_environment(freshEnv));
            }).catch(() => {});
        },
    }],

    // Performapal Monkeyboard (17330916) — when placed face-up in Pendulum Zone: search 1 Level 4 or lower Performapal from Deck
    17330916: [{
        trigger_type: TRIGGER_TYPE.ON_PENDULUM_PLACED,
        condition: () => true,
        operation: (env, side) => searchDeck(
            { type: 'MONSTER', nameIncludes: 'Performapal', custom: (c) => (c.card?.level ?? 9) <= 4 },
            'Monkeyboard — add 1 Level 4 or lower Performapal from Deck to hand'
        )(env, side)
    }],

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
            const destroyed = field[attackerIndex];
            if (destroyed?.card) {
                const isPendulum = destroyed.card?.card_type === 'MONSTER_PENDULUM';
                const dest = isPendulum ? ENVIRONMENT.EXTRA_DECK : ENVIRONMENT.GRAVEYARD;
                env[SIDE.OPPONENT][dest].push(destroyed);
                field[attackerIndex] = CARD_TYPE.PLACEHOLDER;
                store.dispatch(update_environment(env));
                fireTrigger(TRIGGER_TYPE.ON_DESTROY, destroyed, env, SIDE.OPPONENT);
            }
        }
    ),

    // Kagetokage (94656263) — when a Level 4 is Normal Summoned: SS itself from hand (DEF)
    94656263: [{
        trigger_type: TRIGGER_TYPE.ON_NORMAL_SUMMON,
        condition: (_env, _side, extraData) => (extraData?.summonedCard?.card?.level ?? 0) === 4,
        operation: async (env, side) => {
            const hand = env[side][ENVIRONMENT.HAND];
            const idx = hand.findIndex(c => c?.card?.key === 94656263);
            if (idx === -1) return;
            const [kage] = hand.splice(idx, 1);
            const field = env[side][ENVIRONMENT.MONSTER_FIELD];
            const priorities = [2, 3, 1, 4, 0];
            for (const slot of priorities) {
                if (field[slot] === CARD_TYPE.PLACEHOLDER) {
                    kage.current_pos = CARD_POS.DEFENSE;
                    kage.summoned_this_turn = true;
                    field[slot] = kage;
                    break;
                }
            }
            logEvent(LOG_TYPE.SPECIAL, 'Kagetokage: Special Summoned itself from hand in DEF');
            store.dispatch(update_environment(env));
        }
    }],

    // Odd-Eyes Dragon (53025096) — when it destroys an opponent's monster by battle:
    // inflict damage equal to half that monster's original ATK
    53025096: [{
        trigger_type: TRIGGER_TYPE.ON_BATTLE_DESTROY,
        condition: (_env, _side, extraData) => !!(extraData?.destroyedCard?.card?.atk),
        operation: (env, side, extraData) => {
            const destroyedAtk = extraData?.destroyedCard?.card?.atk ?? 0;
            const dmg = Math.floor(destroyedAtk / 2);
            if (dmg <= 0) return;
            const opp = side === SIDE.MINE ? SIDE.OPPONENT : SIDE.MINE;
            env[opp].hp = Math.max(0, (env[opp].hp || 0) - dmg);
            logEvent(LOG_TYPE.DAMAGE, `Odd-Eyes Dragon: inflicts ${dmg} extra damage (half of ${destroyedAtk})`);
            store.dispatch(update_environment(env));
        },
    }],

    // Odd-Eyes Absolute Dragon (16691074) — XYZ Rank 7
    // ON_ATTACK_DECLARED (from Monster Zone): detach 1 material → negate attack, optionally SS Odd-Eyes from hand/GY
    // ON_DESTROY (sent to GY): SS another Odd-Eyes XYZ from Extra Deck
    16691074: [
        {
            trigger_type: TRIGGER_TYPE.ON_ATTACK_DECLARED,
            negates_attack: true,
            condition: (env, side) => {
                const mf = env[side]?.[ENVIRONMENT.MONSTER_FIELD] || [];
                const abs = mf.find(c => c !== CARD_TYPE.PLACEHOLDER && c?.card?.key === 16691074);
                return !!(abs?.xyz_materials?.length);
            },
            operation: async (env, side, attackerCardEnv) => {
                const mf = env[side][ENVIRONMENT.MONSTER_FIELD];
                const abs = mf.find(c => c !== CARD_TYPE.PLACEHOLDER && c?.card?.key === 16691074);
                if (!abs?.xyz_materials?.length) return;
                // Detach 1 material
                const [mat] = abs.xyz_materials.splice(0, 1);
                env[side][ENVIRONMENT.GRAVEYARD].push(mat);
                logEvent(LOG_TYPE.EFFECT, 'Odd-Eyes Absolute Dragon: negated attack (1 material detached)');
                // Optionally SS 1 Odd-Eyes from hand or GY
                const hand = (env[side][ENVIRONMENT.HAND] || []).filter(c => c?.card?.name?.toLowerCase().includes('odd-eyes'));
                const gy   = (env[side][ENVIRONMENT.GRAVEYARD] || []).filter(c =>
                    c?.card?.name?.toLowerCase().includes('odd-eyes') && c?.card?.card_type?.startsWith('MONSTER')
                );
                const pool = [...hand, ...gy];
                if (pool.length) {
                    const { show_tool: showTool } = require('../Store/actions/toolActions');
                    const { TOOL_TYPE: TT } = require('../Store/actions/actionTypes');
                    const { CARD_SELECT_TYPE: CST } = require('../Components/PlayerGround/utils/constant');
                    await new Promise((resolve, reject) =>
                        store.dispatch(showTool({
                            tool_type: TT.CARD_SELECTOR,
                            info: {
                                type: CST.CARD_SELECT_FROM_HAND,
                                label: 'Absolute Dragon: SS 1 Odd-Eyes from hand/GY (optional — cancel to skip)',
                                sourceList: pool, numToSelect: 1, resolve, reject,
                            }
                        }))
                    ).then(({ cardEnvs: [uid] }) => {
                        const freshEnv = store.getState().environmentReducer.environment;
                        for (const loc of [ENVIRONMENT.HAND, ENVIRONMENT.GRAVEYARD]) {
                            const arr = freshEnv[side][loc];
                            const idx = arr.findIndex(c => get_unique_id_from_ennvironment(c) === uid);
                            if (idx !== -1) {
                                const [card] = arr.splice(idx, 1);
                                const field = freshEnv[side][ENVIRONMENT.MONSTER_FIELD];
                                for (const slot of [2, 3, 1, 4, 0]) {
                                    if (field[slot] === CARD_TYPE.PLACEHOLDER) {
                                        card.current_pos = CARD_POS.FACE;
                                        card.summoned_this_turn = true;
                                        field[slot] = card;
                                        break;
                                    }
                                }
                                logEvent(LOG_TYPE.SPECIAL, `Absolute Dragon: SS ${card.card?.name}`);
                                store.dispatch(update_environment(freshEnv));
                                return;
                            }
                        }
                    }).catch(() => {}); // player cancelled — that's fine
                }
                store.dispatch(update_environment(env));
            },
        },
        {
            // When sent to GY: SS 1 Odd-Eyes XYZ from Extra Deck (except itself)
            trigger_type: TRIGGER_TYPE.ON_DESTROY,
            condition: (env, side) =>
                (env[side][ENVIRONMENT.EXTRA_DECK] || []).some(c =>
                    c?.card?.card_type === 'MONSTER_XYZ' &&
                    c?.card?.name?.toLowerCase().includes('odd-eyes') &&
                    c?.card?.key !== 16691074
                ),
            operation: async (env, side) => {
                const valid = (env[side][ENVIRONMENT.EXTRA_DECK] || []).filter(c =>
                    c?.card?.card_type === 'MONSTER_XYZ' &&
                    c?.card?.name?.toLowerCase().includes('odd-eyes') &&
                    c?.card?.key !== 16691074
                );
                if (!valid.length) return;
                logEvent(LOG_TYPE.EFFECT, 'Odd-Eyes Absolute Dragon: SS another Odd-Eyes XYZ from Extra Deck');
                const { show_tool: showTool } = require('../Store/actions/toolActions');
                const { TOOL_TYPE: TT } = require('../Store/actions/actionTypes');
                const { CARD_SELECT_TYPE: CST } = require('../Components/PlayerGround/utils/constant');
                return new Promise((resolve, reject) =>
                    store.dispatch(showTool({
                        tool_type: TT.CARD_SELECTOR,
                        info: {
                            type: CST.CARD_SELECT_FROM_HAND,
                            label: 'Absolute Dragon (GY): SS 1 other Odd-Eyes XYZ from Extra Deck',
                            sourceList: valid, numToSelect: 1, resolve, reject,
                        }
                    }))
                ).then(({ cardEnvs: [uid] }) => {
                    const freshEnv = store.getState().environmentReducer.environment;
                    const ed = freshEnv[side][ENVIRONMENT.EXTRA_DECK];
                    const idx = ed.findIndex(c => get_unique_id_from_ennvironment(c) === uid);
                    if (idx === -1) return;
                    const [card] = ed.splice(idx, 1);
                    const field = freshEnv[side][ENVIRONMENT.MONSTER_FIELD];
                    for (const slot of [2, 3, 1, 4, 0]) {
                        if (field[slot] === CARD_TYPE.PLACEHOLDER) {
                            card.current_pos = CARD_POS.FACE;
                            card.summoned_this_turn = true;
                            field[slot] = card;
                            break;
                        }
                    }
                    logEvent(LOG_TYPE.SPECIAL, `Absolute Dragon: SS ${card.card?.name} from Extra Deck`);
                    store.dispatch(update_environment(freshEnv));
                }).catch(() => {});
            },
        },
    ],

    // Number 39: Utopia (84013237) — XYZ Rank 4
    // When any monster declares an attack: detach 1 material → negate that attack
    // If this card has no materials, destroy it
    84013237: [{
        trigger_type: TRIGGER_TYPE.ON_ATTACK_DECLARED,
        negates_attack: true,
        condition: (env, side) => {
            const mf = env[side]?.[ENVIRONMENT.MONSTER_FIELD] || [];
            const utopia = mf.find(c => c !== CARD_TYPE.PLACEHOLDER && c?.card?.key === 84013237);
            return !!(utopia?.xyz_materials?.length);
        },
        operation: (env, side) => {
            const mf = env[side][ENVIRONMENT.MONSTER_FIELD];
            const utopia = mf.find(c => c !== CARD_TYPE.PLACEHOLDER && c?.card?.key === 84013237);
            if (!utopia?.xyz_materials?.length) return;
            const [mat] = utopia.xyz_materials.splice(0, 1);
            env[side][ENVIRONMENT.GRAVEYARD].push(mat);
            logEvent(LOG_TYPE.EFFECT, 'Number 39: Utopia — negated the attack (1 material detached)');
            // Destroy itself if no materials remain
            if (!utopia.xyz_materials.length) {
                const idx = mf.indexOf(utopia);
                if (idx !== -1) {
                    env[side][ENVIRONMENT.GRAVEYARD].push(utopia);
                    mf[idx] = CARD_TYPE.PLACEHOLDER;
                    logEvent(LOG_TYPE.EFFECT, 'Utopia has no more materials — destroyed itself');
                }
            }
            store.dispatch(update_environment(env));
        },
    }],

    // Wind-Up Carrier Zenmaity (81122844) — when a face-up Wind-Up ally is destroyed: detach 1 material, return to hand
    81122844: [{
        trigger_type: TRIGGER_TYPE.ON_ALLY_DESTROYED,
        condition: (env, side, extraData) => {
            const destroyed = extraData?.summonedCard; // reusing summonedCard field for the destroyed card
            if (!destroyed?.card?.name?.toLowerCase().includes('wind-up')) return false;
            if (destroyed?.card?.key === 81122844) return false; // don't react to own destruction
            const field = env[side]?.[ENVIRONMENT.MONSTER_FIELD] || [];
            const zenmaity = field.find(c =>
                c !== CARD_TYPE.PLACEHOLDER && c?.card?.key === 81122844 && (c.xyz_materials?.length || 0) > 0
            );
            return !!zenmaity;
        },
        operation: (env, side, extraData) => {
            const destroyed = extraData?.summonedCard;
            if (!destroyed?.card) return;
            const field = env[side][ENVIRONMENT.MONSTER_FIELD];
            const zenmaity = field.find(c =>
                c !== CARD_TYPE.PLACEHOLDER && c?.card?.key === 81122844 && (c.xyz_materials?.length || 0) > 0
            );
            if (!zenmaity) return;
            // Detach 1 material
            const [mat] = zenmaity.xyz_materials.splice(0, 1);
            env[side][ENVIRONMENT.GRAVEYARD].push(mat);
            // Find destroyed card in GY and return to hand
            const gy = env[side][ENVIRONMENT.GRAVEYARD];
            const gi = gy.findIndex(c => c?.card?.key === destroyed.card.key && c !== mat);
            if (gi !== -1) {
                env[side][ENVIRONMENT.HAND].push(gy.splice(gi, 1)[0]);
                logEvent(LOG_TYPE.EFFECT, `Zenmaity: returned ${destroyed.card.name} to hand`);
            }
            store.dispatch(update_environment(env));
        },
    }],

    // Legendary Lord Six Samurai - Enishi (70634245) — when sent to GY: SS 1 banished Six Samurai
    // Simplified: SS 1 Six Samurai from the GY instead (we don't track banished zone)
    70634245: onDestroy(
        (env, side) => {
            const gy = env[side][ENVIRONMENT.GRAVEYARD] || [];
            const valid = gy.filter(c =>
                c?.card?.name?.toLowerCase().includes('samurai') && c.card.key !== 70634245
            );
            if (!valid.length) return Promise.resolve();
            logEvent(LOG_TYPE.EFFECT, 'Legendary Lord Enishi: SS 1 Six Samurai from GY');
            const { show_tool: showTool } = require('../Store/actions/toolActions');
            const { TOOL_TYPE: TT } = require('../Store/actions/actionTypes');
            const { CARD_SELECT_TYPE: CST } = require('../Components/PlayerGround/utils/constant');
            return new Promise((resolve, reject) =>
                store.dispatch(showTool({
                    tool_type: TT.CARD_SELECTOR,
                    info: {
                        type: CST.CARD_SELECT_FROM_HAND, label: 'Legendary Lord Enishi: SS 1 Six Samurai from GY',
                        sourceList: valid, numToSelect: 1, resolve, reject
                    }
                }))
            ).then(({ cardEnvs: [uid] }) => {
                const freshEnv = store.getState().environmentReducer.environment;
                const g = freshEnv[side][ENVIRONMENT.GRAVEYARD];
                const idx = g.findIndex(c => get_unique_id_from_ennvironment(c) === uid);
                if (idx === -1) return;
                const [card] = g.splice(idx, 1);
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
                store.dispatch(update_environment(freshEnv));
            }).catch(() => {})
        }
    ),

    // Wind-Up Shark (25484449) — when any other Wind-Up NS/SS: SS itself from hand
    25484449: [{
        trigger_type: TRIGGER_TYPE.ON_MONSTER_SUMMONED,
        condition: (_env, _side, extraData) => {
            const name = extraData?.summonedCard?.card?.name?.toLowerCase() || '';
            return name.includes('wind-up') && extraData?.summonedCard?.card?.key !== 25484449;
        },
        operation: async (env, side) => {
            const hand = env[side][ENVIRONMENT.HAND];
            const idx = hand.findIndex(c => c?.card?.key === 25484449);
            if (idx === -1) return;
            const [shark] = hand.splice(idx, 1);
            const field = env[side][ENVIRONMENT.MONSTER_FIELD];
            const priorities = [2, 3, 1, 4, 0];
            for (const slot of priorities) {
                if (field[slot] === CARD_TYPE.PLACEHOLDER) {
                    shark.current_pos = CARD_POS.FACE;
                    shark.summoned_this_turn = true;
                    field[slot] = shark;
                    break;
                }
            }
            logEvent(LOG_TYPE.SPECIAL, 'Wind-Up Shark: Special Summoned itself from hand');
            store.dispatch(update_environment(env));
        },
    }],

    // Wind-Up Honeybee (93451636) — on destroy: SS Level 4 or lower Wind-Up from Deck
    93451636: onDestroy(
        (env, side) => {
            const deck = env[side][ENVIRONMENT.DECK] || [];
            const valid = deck.filter(c =>
                c?.card?.name?.toLowerCase().includes('wind-up') && (c.card.level || 0) <= 4
            );
            if (!valid.length) return Promise.resolve();
            const { show_tool: showTool } = require('../Store/actions/toolActions');
            const { TOOL_TYPE: TT } = require('../Store/actions/actionTypes');
            const { CARD_SELECT_TYPE: CST } = require('../Components/PlayerGround/utils/constant');
            return new Promise((resolve, reject) =>
                store.dispatch(showTool({
                    tool_type: TT.CARD_SELECTOR,
                    info: { type: CST.CARD_SELECT_FROM_DECK, label: 'Honeybee — SS 1 Lv4 or lower Wind-Up from Deck', sourceList: valid, numToSelect: 1, resolve, reject }
                }))
            ).then(({ cardEnvs: [uid] }) => {
                const freshEnv = store.getState().environmentReducer.environment;
                const d = freshEnv[side][ENVIRONMENT.DECK];
                const idx = d.findIndex(c => get_unique_id_from_ennvironment(c) === uid);
                if (idx === -1) return;
                const [card] = d.splice(idx, 1);
                const field = freshEnv[side][ENVIRONMENT.MONSTER_FIELD];
                const priorities = [2, 3, 1, 4, 0];
                for (const slot of priorities) {
                    if (field[slot] === CARD_TYPE.PLACEHOLDER) {
                        card.current_pos = CARD_POS.DEFENSE;
                        card.summoned_this_turn = true;
                        field[slot] = card;
                        break;
                    }
                }
                store.dispatch(update_environment(freshEnv));
            }).catch(() => {})
        }
    ),

    // Wind-Up Knight (80538728) — when Wind-Up attacked: negate that attack (single use, from monster zone)
    80538728: [{
        trigger_type: TRIGGER_TYPE.ON_ATTACK_DECLARED,
        condition: (env, side) => {
            const field = env[side]?.[ENVIRONMENT.MONSTER_FIELD] || [];
            const knight = field.find(c => c?.card?.key === 80538728);
            if (!knight || knight.wind_up_used) return false;
            return field.some(c => c !== CARD_TYPE.PLACEHOLDER && c?.card?.name?.toLowerCase().includes('wind-up'));
        },
        negates_attack: true,
        operation: (env, side, attackerCardEnv, attackerIndex) => {
            const field = env[side]?.[ENVIRONMENT.MONSTER_FIELD] || [];
            const knight = field.find(c => c?.card?.key === 80538728);
            if (knight) knight.wind_up_used = true;
            logEvent(LOG_TYPE.EFFECT, 'Wind-Up Knight: negated the attack!');
            store.dispatch(update_environment(env));
        },
    }],

    // Wind-Up Factory (95714077) — on any Wind-Up effect: add Lv4 or lower Wind-Up from Deck to hand (once per turn)
    95714077: [{
        trigger_type: TRIGGER_TYPE.ON_WINDUP_EFFECT,
        condition: (env, side) => {
            const deck = env[side]?.[ENVIRONMENT.DECK] || [];
            return deck.some(c => c?.card?.name?.toLowerCase().includes('wind-up') && (c.card.level || 0) <= 4);
        },
        operation: async (env, side) => {
            const deck = env[side][ENVIRONMENT.DECK];
            const valid = deck.filter(c =>
                c?.card?.name?.toLowerCase().includes('wind-up') && (c.card.level || 0) <= 4
            );
            if (!valid.length) return;
            // Find Factory on spell field and check once-per-turn
            const sf = env[side][ENVIRONMENT.SPELL_FIELD] || [];
            const factory = sf.find(c => c?.card?.key === 95714077);
            if (factory?.factory_used_this_turn) return;
            if (factory) factory.factory_used_this_turn = true;

            const { show_tool: showTool } = require('../Store/actions/toolActions');
            const { TOOL_TYPE: TT } = require('../Store/actions/actionTypes');
            const { CARD_SELECT_TYPE: CST } = require('../Components/PlayerGround/utils/constant');
            return new Promise((resolve, reject) =>
                store.dispatch(showTool({
                    tool_type: TT.CARD_SELECTOR,
                    info: { type: CST.CARD_SELECT_FROM_DECK, label: 'Wind-Up Factory — add 1 Lv4 or lower Wind-Up to hand', sourceList: valid, numToSelect: 1, resolve, reject }
                }))
            ).then(({ cardEnvs: [uid] }) => {
                const freshEnv = store.getState().environmentReducer.environment;
                const d = freshEnv[side][ENVIRONMENT.DECK];
                const idx = d.findIndex(c => get_unique_id_from_ennvironment(c) === uid);
                if (idx === -1) return;
                freshEnv[side][ENVIRONMENT.HAND].push(d.splice(idx, 1)[0]);
                logEvent(LOG_TYPE.EFFECT, 'Wind-Up Factory: added a Wind-Up to hand');
                store.dispatch(update_environment(freshEnv));
            }).catch(() => {})
        },
    }],

    // Wind-Up Magician (59297550) — on any Wind-Up effect: SS Lv4 or lower Wind-Up from Deck in DEF (single use)
    59297550: [{
        trigger_type: TRIGGER_TYPE.ON_WINDUP_EFFECT,
        condition: (env, side) => {
            const field = env[side]?.[ENVIRONMENT.MONSTER_FIELD] || [];
            const magician = field.find(c => c?.card?.key === 59297550);
            if (!magician || magician.wind_up_used) return false;
            return (env[side]?.[ENVIRONMENT.DECK] || []).some(
                c => c?.card?.name?.toLowerCase().includes('wind-up') && (c.card.level || 0) <= 4
            );
        },
        operation: async (env, side) => {
            const field = env[side][ENVIRONMENT.MONSTER_FIELD];
            const magician = field.find(c => c?.card?.key === 59297550);
            if (magician) magician.wind_up_used = true;
            const deck = env[side][ENVIRONMENT.DECK];
            const valid = deck.filter(c =>
                c?.card?.name?.toLowerCase().includes('wind-up') && (c.card.level || 0) <= 4
            );
            if (!valid.length) return;
            const { show_tool: showTool } = require('../Store/actions/toolActions');
            const { TOOL_TYPE: TT } = require('../Store/actions/actionTypes');
            const { CARD_SELECT_TYPE: CST } = require('../Components/PlayerGround/utils/constant');
            return new Promise((resolve, reject) =>
                store.dispatch(showTool({
                    tool_type: TT.CARD_SELECTOR,
                    info: { type: CST.CARD_SELECT_FROM_DECK, label: 'Wind-Up Magician — SS 1 Lv4 or lower Wind-Up from Deck (DEF)', sourceList: valid, numToSelect: 1, resolve, reject }
                }))
            ).then(({ cardEnvs: [uid] }) => {
                const freshEnv = store.getState().environmentReducer.environment;
                const d = freshEnv[side][ENVIRONMENT.DECK];
                const idx = d.findIndex(c => get_unique_id_from_ennvironment(c) === uid);
                if (idx === -1) return;
                const [card] = d.splice(idx, 1);
                const mf = freshEnv[side][ENVIRONMENT.MONSTER_FIELD];
                const priorities = [2, 3, 1, 4, 0];
                for (const slot of priorities) {
                    if (mf[slot] === CARD_TYPE.PLACEHOLDER) {
                        card.current_pos = CARD_POS.DEFENSE;
                        card.summoned_this_turn = true;
                        mf[slot] = card;
                        break;
                    }
                }
                logEvent(LOG_TYPE.SPECIAL, `Wind-Up Magician: SS ${card.card?.name} in DEF`);
                store.dispatch(update_environment(freshEnv));
            }).catch(() => {})
        },
    }],

    // Predaplant Byblisp (44932065) — on sent to GY: add 1 Predaplant from Deck to hand
    44932065: onDestroy(
        searchDeck(
            { type: 'MONSTER', nameIncludes: 'Predaplant' },
            'Predaplant Byblisp — add 1 Predaplant from Deck to hand'
        )
    ),

    // Six Samurai United (72345736) — Bushido counter increment on Six Samurai summon (max 2)
    72345736: [{
        trigger_type: TRIGGER_TYPE.ON_MONSTER_SUMMONED,
        condition: (_env, _side, extraData) =>
            extraData?.summonedCard?.card?.name?.toLowerCase().includes('samurai'),
        operation: (cardEnv, _env, _side) => {
            cardEnv.bushido_counters = Math.min((cardEnv.bushido_counters || 0) + 1, 2);
            logEvent(LOG_TYPE.EFFECT, `Six Samurai United: ${cardEnv.bushido_counters} counter(s)`);
        },
    }],

    // Shien's Dojo (47436247) — Bushido counter increment (no max)
    47436247: [{
        trigger_type: TRIGGER_TYPE.ON_MONSTER_SUMMONED,
        condition: (_env, _side, extraData) => {
            const name = extraData?.summonedCard?.card?.name?.toLowerCase() || '';
            return name.includes('samurai') || name.includes('shien');
        },
        operation: (cardEnv, _env, _side) => {
            cardEnv.bushido_counters = (cardEnv.bushido_counters || 0) + 1;
            logEvent(LOG_TYPE.EFFECT, `Shien's Dojo: ${cardEnv.bushido_counters} counter(s)`);
        },
    }],

    // Secret Six Samurai - Fuma (71207871) — on destroy: SS 1 Six Samurai from Deck
    71207871: onDestroy(
        (env, side) => {
            const deck = env[side][ENVIRONMENT.DECK] || [];
            const valid = deck.filter(c =>
                c?.card?.name?.toLowerCase().includes('samurai') && c.card.key !== 71207871
            );
            if (!valid.length) return Promise.resolve();
            const { show_tool: showTool } = require('../Store/actions/toolActions');
            const { TOOL_TYPE: TT } = require('../Store/actions/actionTypes');
            const { CARD_SELECT_TYPE: CST } = require('../Components/PlayerGround/utils/constant');
            return new Promise((resolve, reject) =>
                store.dispatch(showTool({
                    tool_type: TT.CARD_SELECTOR,
                    info: { type: CST.CARD_SELECT_FROM_DECK, label: 'Fuma — Special Summon 1 Six Samurai from Deck', sourceList: valid, numToSelect: 1, resolve, reject }
                }))
            ).then(({ cardEnvs: [uid] }) => {
                const freshEnv = store.getState().environmentReducer.environment;
                const d = freshEnv[side][ENVIRONMENT.DECK];
                const idx = d.findIndex(c => get_unique_id_from_ennvironment(c) === uid);
                if (idx === -1) return;
                const [card] = d.splice(idx, 1);
                const field = freshEnv[side][ENVIRONMENT.MONSTER_FIELD];
                const priorities = [2, 3, 1, 4, 0];
                for (const slot of priorities) {
                    if (field[slot] === CARD_TYPE.PLACEHOLDER) {
                        card.current_pos = CARD_POS.FACE;
                        card.summoned_this_turn = true;
                        field[slot] = card;
                        break;
                    }
                }
                store.dispatch(update_environment(freshEnv));
            }).catch(() => {})
        }
    ),

    // Shien's Footsoldier (99675356) — on destroy by battle: SS Level 3 or lower Six Samurai from Deck
    99675356: onDestroy(
        (env, side) => {
            const deck = env[side][ENVIRONMENT.DECK] || [];
            const valid = deck.filter(c =>
                c?.card?.name?.toLowerCase().includes('samurai') &&
                (c.card.level || 0) <= 3
            );
            if (!valid.length) return Promise.resolve();
            const { show_tool: showTool } = require('../Store/actions/toolActions');
            const { TOOL_TYPE: TT } = require('../Store/actions/actionTypes');
            const { CARD_SELECT_TYPE: CST } = require('../Components/PlayerGround/utils/constant');
            return new Promise((resolve, reject) =>
                store.dispatch(showTool({
                    tool_type: TT.CARD_SELECTOR,
                    info: { type: CST.CARD_SELECT_FROM_DECK, label: "Footsoldier — Special Summon 1 Level 3 or lower Six Samurai from Deck", sourceList: valid, numToSelect: 1, resolve, reject }
                }))
            ).then(({ cardEnvs: [uid] }) => {
                const freshEnv = store.getState().environmentReducer.environment;
                const d = freshEnv[side][ENVIRONMENT.DECK];
                const idx = d.findIndex(c => get_unique_id_from_ennvironment(c) === uid);
                if (idx === -1) return;
                const [card] = d.splice(idx, 1);
                const field = freshEnv[side][ENVIRONMENT.MONSTER_FIELD];
                const priorities = [2, 3, 1, 4, 0];
                for (const slot of priorities) {
                    if (field[slot] === CARD_TYPE.PLACEHOLDER) {
                        card.current_pos = CARD_POS.FACE;
                        card.summoned_this_turn = true;
                        field[slot] = card;
                        break;
                    }
                }
                store.dispatch(update_environment(freshEnv));
            }).catch(() => {})
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
 * Scan the active player's hand for cards with hand-watcher triggers (e.g. ON_NORMAL_SUMMON)
 * and fire any whose condition passes. Called by Core/Summon after a Normal Summon.
 */
export const fireHandWatchTriggers = (triggerType, summonedCardEnv, environment, side) => {
    const hand = environment[side]?.[ENVIRONMENT.HAND] || [];
    for (const cardEnv of hand) {
        const cardKey = cardEnv?.card?.key;
        if (!cardKey) continue;
        const triggers = TRIGGER_REGISTRY[cardKey];
        if (!triggers) continue;
        for (const trigger of triggers) {
            if (trigger.trigger_type !== triggerType) continue;
            const extraData = { summonedCard: summonedCardEnv };
            if (trigger.condition && !trigger.condition(environment, side, extraData)) continue;

            console.log(`[HandWatch] ${triggerType} → ${cardEnv.card.name}`);
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
                    [SIDE.OPPONENT]: { ...freshEnv[SIDE.OPPONENT] },
                };
                const result = trigger.operation(cloned, side, extraData);
                const finish = () => store.dispatch(update_environment(cloned));
                if (result && typeof result.then === 'function') {
                    result.then(finish).catch(finish);
                } else {
                    finish();
                }
            }, 500);
        }
    }
};

/**
 * Scan the active player's SPELL_FIELD for continuous spells/traps that watch
 * for summon events (e.g. Six Samurai United, Shien's Dojo Bushido counter increment).
 * Called by Core/Summon after every monster summon.
 */
export const fireFieldWatchTriggers = (triggerType, summonedCardEnv, environment, side, includeMonsterField = false) => {
    const spellField   = environment[side]?.[ENVIRONMENT.SPELL_FIELD]   || [];
    const monsterField = includeMonsterField
        ? (environment[side]?.[ENVIRONMENT.MONSTER_FIELD] || []).filter(c => c !== CARD_TYPE.PLACEHOLDER)
        : [];
    const allCards = [...spellField, ...monsterField];
    for (const cardEnv of allCards) {
        const cardKey = cardEnv?.card?.key;
        if (!cardKey) continue;
        const triggers = TRIGGER_REGISTRY[cardKey];
        if (!triggers) continue;
        for (const trigger of triggers) {
            if (trigger.trigger_type !== triggerType) continue;
            const extraData = { summonedCard: summonedCardEnv };
            if (trigger.condition && !trigger.condition(environment, side, extraData)) continue;
            // Inline — no setTimeout because counter updates should be immediate
            trigger.operation(cardEnv, environment, side, extraData);
        }
    }
};

/**
 * Get all ON_ATTACK_DECLARED traps from a player's spell field.
 * Used by Field.jsx to populate the trap window.
 */
export const getAttackTriggerTraps = (environment, side) => {
    const result = [];

    // Face-down spells/traps in S/T zone
    for (const cardEnv of (environment[side][ENVIRONMENT.SPELL_FIELD] || [])) {
        if (!cardEnv?.card) continue;
        if (cardEnv.current_pos !== CARD_POS.SET) continue;
        const triggers = TRIGGER_REGISTRY[cardEnv.card.key];
        if (!triggers) continue;
        for (const trigger of triggers) {
            if (trigger.trigger_type === TRIGGER_TYPE.ON_ATTACK_DECLARED) {
                result.push({ cardEnv, trigger });
            }
        }
    }

    // Face-up monsters with ON_ATTACK_DECLARED (e.g. Wind-Up Knight)
    for (const cardEnv of (environment[side][ENVIRONMENT.MONSTER_FIELD] || [])) {
        if (!cardEnv?.card || cardEnv === CARD_TYPE.PLACEHOLDER) continue;
        if (cardEnv.current_pos === CARD_POS.SET) continue; // must be face-up
        const triggers = TRIGGER_REGISTRY[cardEnv.card.key];
        if (!triggers) continue;
        for (const trigger of triggers) {
            if (trigger.trigger_type === TRIGGER_TYPE.ON_ATTACK_DECLARED) {
                if (!trigger.condition || trigger.condition(environment, side)) {
                    result.push({ cardEnv, trigger });
                }
            }
        }
    }

    return result;
};