/**
 * Core/Battle/index.js
 * Handles battle damage calculation with correct DEF position logic,
 * Toon Kingdom protection, and fires ON_DESTROY + ON_BATTLE_DAMAGE triggers.
 */
import { ENVIRONMENT, SIDE, CARD_TYPE, CARD_POS } from '../../Components/Card/utils/constant';
import { DST_DIRECT_ATTACK } from '../../Components/PlayerGround/utils/constant';
import { get_unique_id_from_ennvironment } from '../../Components/PlayerGround/utils/utils';
import { fireTrigger, TRIGGER_TYPE } from '../../data/triggerRegistry';
import { logEvent, LOG_TYPE } from '../../data/duelLog';

const isDefPos = (cardEnv) =>
    cardEnv?.current_pos === CARD_POS.SET ||
    cardEnv?.current_pos === CARD_POS.SET_DEFENSE;

// Toon Kingdom: if monster is a Toon and Kingdom is active, banish top card instead
const tryProtect = (cardEnv, env, side) => {
    if (!cardEnv?.card?.name?.toLowerCase().includes('toon')) return false;
    const hasKingdom = env[side][ENVIRONMENT.SPELL_FIELD]
        .some(c => c?.card?.key === 43175858);
    if (!hasKingdom) return false;
    const deck = env[side][ENVIRONMENT.DECK];
    if (!deck.length) return false;
    const [banished] = deck.splice(0, 1);
    env[side][ENVIRONMENT.GRAVEYARD].push(banished);
    console.log(`[Toon Kingdom] Protected ${cardEnv.card.name}`);
    return true;
};

const battle_to_graveyard = (cardEnv, side, index, env) => {
    env[side][ENVIRONMENT.GRAVEYARD].push(cardEnv);
    env[side][ENVIRONMENT.MONSTER_FIELD][index] = CARD_TYPE.PLACEHOLDER;
    // Fire ON_DESTROY trigger
    fireTrigger(TRIGGER_TYPE.ON_DESTROY, cardEnv, env, side);
    return env;
};

const battle = (info, environment) => {
    const { dst, side, src_index, dst_index } = info;
    const defSide = side === SIDE.MINE ? SIDE.OPPONENT : SIDE.MINE;

    const attacker = environment[side][ENVIRONMENT.MONSTER_FIELD][src_index];
    const defender = environment[defSide][ENVIRONMENT.MONSTER_FIELD][dst_index];

    // ── Direct attack ─────────────────────────────────────────────────────────
    if (dst === DST_DIRECT_ATTACK) {
        const dmg = attacker?.current_atk ?? attacker?.card?.atk ?? 0;
        environment[defSide].hp -= dmg;
        const atkName = attacker?.card?.name || '?';
        logEvent(LOG_TYPE.ATTACK, `${atkName} attacks directly for ${dmg} damage`, { cardName: atkName, damage: dmg });
        logEvent(LOG_TYPE.DAMAGE, `Opponent takes ${dmg} damage (LP: ${environment[defSide].hp})`, { amount: dmg });
        fireTrigger(TRIGGER_TYPE.ON_BATTLE_DAMAGE, attacker, environment, side);
        return environment;
    }

    const atkATK = attacker?.current_atk ?? attacker?.card?.atk ?? 0;
    const atkName = attacker?.card?.name || '?';
    const defName = defender?.card?.name || '?';
    logEvent(LOG_TYPE.ATTACK, `${atkName} (${atkATK}) attacks ${defName}`, { cardName: atkName });

    if (isDefPos(defender)) {
        // ── ATK vs DEF ────────────────────────────────────────────────────────
        const defDEF = defender?.current_def ?? defender?.card?.def ?? 0;
        if (atkATK > defDEF) {
            if (!tryProtect(defender, environment, defSide)) {
                environment = battle_to_graveyard(defender, defSide, dst_index, environment);
                logEvent(LOG_TYPE.SEND_GY, `${defName} destroyed by battle`, { cardName: defName });
            }
        } else if (atkATK === defDEF) {
            logEvent(LOG_TYPE.ATTACK, `${atkName} vs ${defName} — ATK = DEF, no result`);
        } else {
            const piercing = defDEF - atkATK;
            environment[side].hp -= piercing;
            logEvent(LOG_TYPE.DAMAGE, `You take ${piercing} damage (LP: ${environment[side].hp})`, { amount: piercing });
        }
    } else {
        // ── ATK vs ATK ────────────────────────────────────────────────────────
        const defATK = defender?.current_atk ?? defender?.card?.atk ?? 0;
        if (atkATK > defATK) {
            if (!tryProtect(defender, environment, defSide)) {
                environment = battle_to_graveyard(defender, defSide, dst_index, environment);
                logEvent(LOG_TYPE.SEND_GY, `${defName} destroyed by battle`, { cardName: defName });
            }
            const dmg = atkATK - defATK;
            environment[defSide].hp -= dmg;
            logEvent(LOG_TYPE.DAMAGE, `Opponent takes ${dmg} damage (LP: ${environment[defSide].hp})`, { amount: dmg });
            fireTrigger(TRIGGER_TYPE.ON_BATTLE_DAMAGE, attacker, environment, side);
        } else if (atkATK < defATK) {
            if (!tryProtect(attacker, environment, side)) {
                environment = battle_to_graveyard(attacker, side, src_index, environment);
                logEvent(LOG_TYPE.SEND_GY, `${atkName} destroyed by battle`, { cardName: atkName });
            }
            const dmg = defATK - atkATK;
            environment[side].hp -= dmg;
            logEvent(LOG_TYPE.DAMAGE, `You take ${dmg} damage (LP: ${environment[side].hp})`, { amount: dmg });
        } else {
            const saveAtk = tryProtect(attacker, environment, side);
            const saveDef = tryProtect(defender, environment, defSide);
            if (!saveAtk) environment = battle_to_graveyard(attacker, side, src_index, environment);
            if (!saveDef) environment = battle_to_graveyard(defender, defSide, dst_index, environment);
            logEvent(LOG_TYPE.ATTACK, `${atkName} vs ${defName} — tie, both destroyed`);
        }
    }
    return environment;
};

const get_battle_index = (src_monster, dst, side, environment) => {
    const defSide = side === SIDE.MINE ? SIDE.OPPONENT : SIDE.MINE;
    const attackers = environment[side][ENVIRONMENT.MONSTER_FIELD];
    const defenders = environment[defSide][ENVIRONMENT.MONSTER_FIELD];
    const src_index = attackers.findIndex(c =>
        c?.card && get_unique_id_from_ennvironment(c) === src_monster);
    const dst_index = dst === DST_DIRECT_ATTACK ? dst :
        defenders.findIndex(c => c?.card && get_unique_id_from_ennvironment(c) === dst);
    return { src_index, dst_index };
};

export default { battle, get_battle_index };