/**
 * Core/Battle/index.js
 * Handles battle damage calculation with correct DEF position logic,
 * Toon Kingdom protection, and fires ON_DESTROY + ON_BATTLE_DAMAGE triggers.
 */
import { ENVIRONMENT, SIDE, CARD_TYPE, CARD_POS } from '../../Components/Card/utils/constant';
import { DST_DIRECT_ATTACK } from '../../Components/PlayerGround/utils/constant';
import { get_unique_id_from_ennvironment } from '../../Components/PlayerGround/utils/utils';
import { fireTrigger, fireFieldWatchTriggers, TRIGGER_TYPE } from '../../data/triggerRegistry';
import { logEvent, LOG_TYPE } from '../../data/duelLog';

const isFaceDown = (cardEnv) =>
    cardEnv?.current_pos === CARD_POS.SET ||
    cardEnv?.current_pos === CARD_POS.SET_DEFENSE;

// Defense position = face-down OR face-up Defense Mode (CARD_POS.DEFENSE) —
// all of them battle with DEF, not ATK.
const isDefPos = (cardEnv) =>
    isFaceDown(cardEnv) ||
    cardEnv?.current_pos === CARD_POS.DEFENSE;

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
    // Allow the card to protect itself (e.g. Wind-Up Zenmaines detaches material instead)
    if (cardEnv?.card?.can_protect_from_destroy?.(cardEnv)) {
        env = cardEnv.card.protect_from_destroy(cardEnv, env, side);
        return env;
    }
    const isPendulum = cardEnv?.card?.card_type === 'MONSTER_PENDULUM';
    const dest = isPendulum ? ENVIRONMENT.EXTRA_DECK : ENVIRONMENT.GRAVEYARD;
    env[side][dest].push(cardEnv);
    env[side][ENVIRONMENT.MONSTER_FIELD][index] = CARD_TYPE.PLACEHOLDER;
    fireTrigger(TRIGGER_TYPE.ON_DESTROY, cardEnv, env, side);
    // Let allied field monsters react to the destruction (e.g. Wind-Up Carrier Zenmaity)
    fireFieldWatchTriggers(TRIGGER_TYPE.ON_ALLY_DESTROYED, cardEnv, env, side, true);
    return env;
};

const battle = (info, environment) => {
    const { dst, side, src_index, dst_index } = info;
    const defSide = side === SIDE.MINE ? SIDE.OPPONENT : SIDE.MINE;

    const attacker = environment[side][ENVIRONMENT.MONSTER_FIELD][src_index];
    const defender = environment[defSide][ENVIRONMENT.MONSTER_FIELD][dst_index];

    if (attacker) attacker.attacked_this_turn = true;

    // Battle damage multiplier (Odd-Eyes Pendulum Dragon, Supreme King Dragon Odd-Eyes, etc.)
    const dmgMult = attacker?.card?.battle_damage_multiplier ?? 1;

    // ── Direct attack ─────────────────────────────────────────────────────────
    if (dst === DST_DIRECT_ATTACK) {
        const baseDmg = attacker?.current_atk ?? attacker?.card?.atk ?? 0;
        const dmg = Math.round(baseDmg * dmgMult);
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

    // Capture position BEFORE the battle reveal so the flip doesn't change
    // which damage branch this battle resolves through.
    const defenderWasDefPos = isDefPos(defender);
    const defenderWasFaceDown = isFaceDown(defender);

    // Battle reveal: a face-down defender flips face-up and its flip effect
    // fires (effectFactory.onFlip → card.on_flip), per the rulebook.
    // A monster already face-up in Defense Mode is NOT flipped again.
    if (defenderWasFaceDown && typeof defender?.card?.on_flip === 'function') {
        defender.current_pos = CARD_POS.DEFENSE;
        const flipped = defender;
        logEvent(LOG_TYPE.EFFECT, `${flipped.card?.name} was flipped — FLIP effect activates`);
        setTimeout(() => {
            try {
                const store = require('../../Store/store').default;
                const { update_environment } = require('../../Store/actions/environmentActions');
                const freshEnv = store.getState().environmentReducer.environment;
                const result = flipped.card.on_flip(freshEnv, defSide);
                const finish = () => store.dispatch(update_environment(freshEnv));
                if (result && typeof result.then === 'function') result.then(finish).catch(finish);
                else finish();
            } catch (e) { console.warn('[Battle] on_flip error:', e); }
        }, 500);
    }

    if (defenderWasDefPos) {
        // ── ATK vs DEF ────────────────────────────────────────────────────────
        const defDEF = defender?.current_def ?? defender?.card?.def ?? 0;
        if (atkATK > defDEF) {
            if (!tryProtect(defender, environment, defSide)) {
                environment = battle_to_graveyard(defender, defSide, dst_index, environment);
                logEvent(LOG_TYPE.SEND_GY, `${defName} destroyed by battle`, { cardName: defName });
                // Fire ON_BATTLE_DESTROY on the attacker so attacker-based triggers can respond
                fireTrigger(TRIGGER_TYPE.ON_BATTLE_DESTROY, attacker, environment, side, { destroyedCard: defender });
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
                fireTrigger(TRIGGER_TYPE.ON_BATTLE_DESTROY, attacker, environment, side, { destroyedCard: defender });
            }
            const baseDmg = atkATK - defATK;
            const dmg = Math.round(baseDmg * dmgMult);
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

export default { battle, get_battle_index, isDefPos, isFaceDown };