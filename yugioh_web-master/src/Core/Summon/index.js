import { SET_SUMMON, NORMAL_SUMMON, UPDATE_ENVIRONMENT } from "../../Store/actions/actionTypes";
import { ENVIRONMENT, CARD_TYPE, CARD_POS, SIDE } from '../../Components/Card/utils/constant';
import { is_monster, is_spell, is_trap } from '../../Components/Card/utils/utils';
import { emit_summon } from '../../Client/Sender'
import { move_cards_to_graveyard } from '../Misc'
import store from "../../Store/store";
import { update_environment } from "../../Store/actions/environmentActions";
import { get_unique_id_from_ennvironment } from "../../Components/PlayerGround/utils/utils";
import { logEvent, LOG_TYPE } from '../../data/duelLog';

const summon = (info, type, environment) => {
    const cardType = info.card.card?.card_type || info.card.card_type;
    const isSpellOrTrap = is_spell(cardType) || is_trap(cardType);

    if (type === SET_SUMMON || isSpellOrTrap) {
        info.card.current_pos = CARD_POS.SET;
    } else {
        // Caller may pass info.position to override (e.g. DEF for extra-deck summons)
        info.card.current_pos = info.position || CARD_POS.FACE;
    }
    if (!isSpellOrTrap) {
        info.card.summoned_this_turn = true;
        info.card.pos_changed_this_turn = false;
    }

    // Spells and traps go to SPELL_FIELD; monsters go to MONSTER_FIELD
    const targetZone = isSpellOrTrap ? ENVIRONMENT.SPELL_FIELD : ENVIRONMENT.MONSTER_FIELD;
    const priorities = [2, 3, 1, 4, 0];
    let current_field = environment[info.side][targetZone];

    for (let i = 0; i < priorities.length; i++) {
        if (current_field[priorities[i]] === CARD_TYPE.PLACEHOLDER) {
            current_field[priorities[i]] = info.card;
            break;
        }
    }
    environment[info.side][targetZone] = current_field;

    // Remove from source location (hand or extra deck)
    const srcArray = environment[info.side][info.src_location];
    const idx = srcArray.findIndex(
        c => get_unique_id_from_ennvironment(c) === get_unique_id_from_ennvironment(info.card)
    );
    if (idx !== -1) srcArray.splice(idx, 1);

    if (info.side === SIDE.MINE) {
        emit_summon(info, type);
    }

    const cardName = info.card?.card?.name || info.card?.name || '?';
    const who = info.side === SIDE.MINE ? 'You' : 'Opponent';
    if (type === SET_SUMMON) {
        logEvent(LOG_TYPE.SET, `${who} Set a card face-down`, { cardName, side: info.side });
    } else if (isSpellOrTrap) {
        logEvent(LOG_TYPE.SUMMON, `${who} played ${cardName}`, { cardName, side: info.side });
    } else if (info.src_location === ENVIRONMENT.EXTRA_DECK) {
        logEvent(LOG_TYPE.SPECIAL, `${who} Special Summoned ${cardName} from Extra Deck`, { cardName, side: info.side });
    } else if (info.src_location === ENVIRONMENT.HAND) {
        logEvent(LOG_TYPE.SUMMON, `${who} Normal Summoned ${cardName}`, { cardName, side: info.side });
    } else {
        logEvent(LOG_TYPE.SPECIAL, `${who} Special Summoned ${cardName}`, { cardName, side: info.side });
    }

    store.dispatch(update_environment(environment));

    // Fire on_summon effect if the card has one (e.g. Red-Eyes Toon Dragon)
    // on_summon can be on card.on_summon (new) or card.effects[0].on_summon (legacy)
    const onSummonEffect = info.card?.card?.on_summon ?? info.card?.card?.effects?.[0]?.on_summon;
    if (onSummonEffect && typeof onSummonEffect === 'function') {
        setTimeout(() => {
            const freshEnv = store.getState().environmentReducer.environment;
            // Clone arrays so mutations are safe
            const cloned = {
                ...freshEnv,
                [SIDE.MINE]: {
                    ...freshEnv[SIDE.MINE],
                    [ENVIRONMENT.MONSTER_FIELD]: [...freshEnv[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD]],
                    [ENVIRONMENT.SPELL_FIELD]:   [...freshEnv[SIDE.MINE][ENVIRONMENT.SPELL_FIELD]],
                    [ENVIRONMENT.HAND]:          [...freshEnv[SIDE.MINE][ENVIRONMENT.HAND]],
                    [ENVIRONMENT.DECK]:          [...freshEnv[SIDE.MINE][ENVIRONMENT.DECK]],
                    [ENVIRONMENT.GRAVEYARD]:     [...freshEnv[SIDE.MINE][ENVIRONMENT.GRAVEYARD]],
                },
                [SIDE.OPPONENT]: { ...freshEnv[SIDE.OPPONENT] },
            };
            const result = onSummonEffect(cloned);
            const finish = () => store.dispatch(update_environment(cloned));
            if (result && typeof result.then === 'function') {
                result.then(finish).catch(finish);
            } else {
                finish();
            }
        }, 350);
    }

    return environment;
};

const tribute = (cards, side, src, environment) => {
    // cards may be unique_id strings OR MonsterEnv objects — normalise to unique_id strings
    const ids = cards.map(c =>
        typeof c === 'string' ? c : get_unique_id_from_ennvironment(c)
    );
    const res = move_cards_to_graveyard(ids, side, src, environment);
    store.dispatch(update_environment(res));
    return res;
};


// Move cards from a non-field location (HAND) to GY — used by ritual summon
const sendToGY = (ids, side, src, environment) => {
    const arr = environment[side][src];
    for (let i = arr.length - 1; i >= 0; i--) {
        const c = arr[i];
        if (!c?.card) continue;
        const uid = typeof c === 'string' ? c : get_unique_id_from_ennvironment(c);
        if (ids.includes(uid)) {
            environment[side][ENVIRONMENT.GRAVEYARD].push(c);
            arr.splice(i, 1);
        }
    }
    store.dispatch(update_environment(environment));
    return environment;
};

/**
 * Manually change a monster's battle position.
 * Flip Summon:  SET  → FACE     (manual, once; not allowed if summoned_this_turn)
 * Battle Change: FACE → DEFENSE  (manual, once; sets pos_changed_this_turn)
 * DEF→ATK and →SET are card-effect-only — call this directly from effect code.
 */
const changePosition = (cardEnv, newPos, environment) => {
    const oldPos = cardEnv.current_pos;
    if (oldPos === CARD_POS.FACE && newPos === CARD_POS.DEFENSE) {
        cardEnv.pos_changed_this_turn = true;
    }
    cardEnv.current_pos = newPos;
    const name = cardEnv.card?.name || '?';
    const posLabel = { [CARD_POS.FACE]: 'ATK', [CARD_POS.DEFENSE]: 'DEF (face-up)', [CARD_POS.SET]: 'DEF (face-down)' };
    const action = oldPos === CARD_POS.SET ? 'Flip Summoned' : 'changed position:';
    logEvent(LOG_TYPE.POSITION, `${name} ${action} ${posLabel[newPos] || newPos}`, { cardName: name });
    store.dispatch(update_environment({ ...environment }));
};

/**
 * Detach one XYZ material from an XYZ monster and send it to the GY.
 * If the monster has more than one material, opens a card selector so the
 * player can choose which one to detach.
 * Returns the detached cardEnv (or null if cancelled / no materials).
 */
const detachXyzMaterial = async (xyzCardEnv, side, environment) => {
    const materials = xyzCardEnv.xyz_materials;
    if (!materials || materials.length === 0) return null;

    let detachUid;
    if (materials.length === 1) {
        detachUid = get_unique_id_from_ennvironment(materials[0]);
    } else {
        // Ask player which material to detach
        const { show_tool } = await import('../../Store/actions/toolActions');
        const { TOOL_TYPE } = await import('../../Store/actions/actionTypes');
        const { CARD_SELECT_TYPE } = await import('../../Components/PlayerGround/utils/constant');
        try {
            const result = await new Promise((resolve, reject) =>
                store.dispatch(show_tool({
                    tool_type: TOOL_TYPE.CARD_SELECTOR,
                    info: {
                        type: CARD_SELECT_TYPE.CARD_SELECT_FROM_HAND,
                        label: 'Select 1 XYZ Material to detach',
                        sourceList: materials,
                        numToSelect: 1,
                        resolve, reject,
                    },
                }))
            );
            detachUid = result.cardEnvs?.[0];
        } catch {
            return null; // cancelled
        }
    }

    const idx = materials.findIndex(c => get_unique_id_from_ennvironment(c) === detachUid);
    if (idx === -1) return null;
    const [detached] = materials.splice(idx, 1);

    // Detached XYZ material always goes to GY (even if it's a pendulum)
    const freshEnv = store.getState().environmentReducer.environment;
    freshEnv[side][ENVIRONMENT.GRAVEYARD].push(detached);
    logEvent(LOG_TYPE.EFFECT, `XYZ detach: ${detached.card?.name} → GY`, { cardName: detached.card?.name });
    store.dispatch(update_environment(freshEnv));
    return detached;
};

export default { summon, tribute, sendToGY, changePosition, detachXyzMaterial };