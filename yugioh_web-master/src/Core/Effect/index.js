import { emit_activate_effect, emit_card_finish_operate, emit_effect_ack } from "../../Client/Sender"
import { OfflineAdapter } from "../../Client/OfflineAdapter"
import store from "../../Store/store"
import { get_all_cards_on_field, get_cardEnv_by_unique_id } from "../utils"
import { ENVIRONMENT, CARD_TYPE, SIDE } from '../../Components/Card/utils/constant';
import { update_environment } from "../../Store/actions/environmentActions";
import { get_unique_id_from_ennvironment } from "../../Components/PlayerGround/utils/utils";
import { move_cards_to_graveyard } from '../Misc'

class Effect {
    constructor() {
        this.category = undefined
        this.type = undefined
        this.chain = undefined
        this.condition = undefined
        this.target = undefined
        this.operation = undefined
    }
}

const createEffect = () => new Effect()

const can_activate = (card, environment) => {
    if (!card.effects || card.effects.length === 0) return false;
    for (const effect of card.effects) {
        if (effect.condition(environment)) return true;
    }
    return false;
}

const activate = (cardEnv, src_location, side, environment) => {
    // Move card from hand onto spell field
    if (src_location == ENVIRONMENT.HAND) {
        let current_field = environment[side][ENVIRONMENT.SPELL_FIELD];
        const summon_priorities = [2, 3, 1, 4, 0]
        for (let i = 0; i < summon_priorities.length; i++) {
            if (current_field[summon_priorities[i]] == CARD_TYPE.PLACEHOLDER) {
                current_field[summon_priorities[i]] = cardEnv;
                break;
            }
        }
        environment[side][ENVIRONMENT.SPELL_FIELD] = current_field;
        const idx = environment[side][src_location].findIndex(
            c => get_unique_id_from_ennvironment(c) == get_unique_id_from_ennvironment(cardEnv)
        );
        if (idx !== -1) environment[side][src_location].splice(idx, 1);
    }

    store.dispatch(update_environment(environment));

    if (OfflineAdapter.isEnabled()) {
        // Offline: execute the effect immediately without waiting for socket
        const uid = get_unique_id_from_ennvironment(cardEnv);
        const effect = cardEnv.card.effects?.[0];
        if (effect) {
            // Small delay so the card visually appears on the field first
            setTimeout(() => {
                // Shallow-clone env arrays so mutations don't affect Redux state directly
                // (Cannot use JSON.parse/stringify — it strips function properties like can_normal_summon)
                const storeEnv = store.getState().environmentReducer.environment;
                const cloneSide = (side) => ({
                    ...storeEnv[side],
                    [ENVIRONMENT.MONSTER_FIELD]: [...storeEnv[side][ENVIRONMENT.MONSTER_FIELD]],
                    [ENVIRONMENT.SPELL_FIELD]:   [...storeEnv[side][ENVIRONMENT.SPELL_FIELD]],
                    [ENVIRONMENT.GRAVEYARD]:     [...storeEnv[side][ENVIRONMENT.GRAVEYARD]],
                    [ENVIRONMENT.DECK]:          [...storeEnv[side][ENVIRONMENT.DECK]],
                    [ENVIRONMENT.HAND]:          [...storeEnv[side][ENVIRONMENT.HAND]],
                    [ENVIRONMENT.EXTRA_DECK]:    [...(storeEnv[side][ENVIRONMENT.EXTRA_DECK] || [])],
                });
                const freshEnv = {
                    ...storeEnv,
                    [SIDE.MINE]:     cloneSide(SIDE.MINE),
                    [SIDE.OPPONENT]: cloneSide(SIDE.OPPONENT),
                };
                const sendToGY = () => {
                    // Continuous spells/traps stay on field — never send to GY
                    if (cardEnv.card?.is_continuous) {
                        // Flip face-up so it shows the card art
                        cardEnv.current_pos = 'FACE';
                        return;
                    }
                    const currentEnv = store.getState().environmentReducer.environment;
                    move_cards_to_graveyard([uid], side, ENVIRONMENT.SPELL_FIELD, currentEnv);
                };
                try {
                    console.log('[Effect] running operation for', cardEnv.card?.name, 'uid:', uid);
                    const result = effect.operation(freshEnv);
                    console.log('[Effect] operation complete, dispatching env update');
                    // operation may return a Promise (e.g. Polymerization uses CardSelector)
                    if (result && typeof result.then === 'function') {
                        result.then(() => {
                            // Re-clone after selector closed in case user interactions changed store
                            const postEnv = store.getState().environmentReducer.environment;
                            // freshEnv has the operation mutations; merge array changes back onto postEnv
                            // Simplest: just dispatch freshEnv (our working copy) then GY cleanup
                            store.dispatch(update_environment(freshEnv));
                            sendToGY();
                        }).catch(() => {
                            // User cancelled selector — still GY the activating card
                            sendToGY();
                        });
                    } else {
                        store.dispatch(update_environment(freshEnv));
                        sendToGY();
                    }
                } catch(e) {
                    console.error('[Effect] offline operation error:', e);
                    sendToGY();
                }
            }, 400);
        }
    } else if (side == SIDE.MINE) {
        // Online PvP: let server orchestrate
        emit_activate_effect({ cardEnv, src_location });
    }

    return environment;
}

// Online PvP only — server calls this back after effect ack
const operate = async (data, environment) => {
    const { cardEnv, src_location } = data.data
    const local_card = get_cardEnv_by_unique_id(
        environment, SIDE.MINE, ENVIRONMENT.SPELL_FIELD,
        get_unique_id_from_ennvironment(cardEnv)
    )
    await local_card.card.effects[0].operation(environment)
    emit_card_finish_operate({ cardEnv, src_location })
    move_cards_to_graveyard(
        [get_unique_id_from_ennvironment(local_card)],
        SIDE.MINE, ENVIRONMENT.SPELL_FIELD, environment
    )
}

const opponent_activate = (data, environment) => {
    const activated_card = data.data.cardEnv
    const src_location = data.data.src_location
    const local_card = get_cardEnv_by_unique_id(
        environment, SIDE.OPPONENT, src_location,
        get_unique_id_from_ennvironment(activated_card)
    )
    activate(local_card, src_location, SIDE.OPPONENT, environment)
    const card_able_to_chain = get_cards_to_chain(local_card, environment)
    if (card_able_to_chain.length > 0) {
        // TODO: chain
    } else {
        emit_effect_ack()
    }
}

const opponent_effect_ack = (data, environment) => {
    emit_effect_ack()
}

const opponent_operated = (data, environment) => {
    const { cardEnv, src_location } = data.data
    const local_card = get_cardEnv_by_unique_id(
        environment, SIDE.OPPONENT, ENVIRONMENT.SPELL_FIELD,
        get_unique_id_from_ennvironment(cardEnv)
    )
    setTimeout(() => {
        move_cards_to_graveyard(
            [get_unique_id_from_ennvironment(local_card)],
            SIDE.OPPONENT, ENVIRONMENT.SPELL_FIELD, environment
        )
    }, 3000)
}

const get_cards_to_chain = (prev, environment) => {
    const all_cards = get_all_cards_on_field(environment)
    let card_able_to_chain = []
    for (const cardEnv of all_cards) {
        if (cardEnv?.card?.effects) {
            for (const effect of cardEnv.card.effects) {
                if (effect.condition(environment, prev)) {
                    card_able_to_chain.push(cardEnv)
                }
            }
        }
    }
    return card_able_to_chain
}

export default {
    createEffect,
    can_activate,
    activate,
    operate,
    opponent_activate,
    opponent_operated,
    opponent_effect_ack
}