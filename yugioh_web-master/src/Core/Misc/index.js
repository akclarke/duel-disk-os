/**
 * Core/Misc/index.js
 * Handles drawing, moving cards to GY, and fires ON_DESTROY triggers.
 */
import { emit_move_cards_to_graveyard } from '../../Client/Sender';
import { ENVIRONMENT, CARD_TYPE, SIDE } from '../../Components/Card/utils/constant';
import { get_unique_id_from_ennvironment } from '../../Components/PlayerGround/utils/utils';
import { update_environment } from '../../Store/actions/environmentActions';
import { fireTrigger, TRIGGER_TYPE } from '../../data/triggerRegistry';
import store from '../../Store/store';

export const draw_card_from_deck = (environment, info) => {
    for (let i = 0; i < info.amount; i++) {
        environment[info.side][ENVIRONMENT.HAND].push(
            environment[info.side][ENVIRONMENT.DECK].shift()
        );
    }
    return environment;
};

export const move_cards_to_graveyard = (cards, side, src, environment) => {
    const current_cards = environment[side][src];
    const destroyed = []; // track what actually got destroyed for trigger firing

    for (let i = 0; i < current_cards.length; i++) {
        if (!current_cards[i]?.card) continue;
        if (cards.includes(get_unique_id_from_ennvironment(current_cards[i]))) {
            destroyed.push(current_cards[i]);
            environment[side][ENVIRONMENT.GRAVEYARD].push(current_cards[i]);
            if (src === ENVIRONMENT.HAND || src === ENVIRONMENT.DECK) {
                current_cards.splice(i, 1);
                i--; // adjust index after splice
            } else {
                current_cards[i] = CARD_TYPE.PLACEHOLDER;
            }
        }
    }

    const info = { cards, side: SIDE.OPPONENT, src };
    store.dispatch(update_environment(environment));
    emit_move_cards_to_graveyard(info);

    // Fire ON_DESTROY triggers for each destroyed card
    for (const cardEnv of destroyed) {
        fireTrigger(TRIGGER_TYPE.ON_DESTROY, cardEnv, environment, side);
    }

    return environment;
};

export default { draw_card_from_deck, move_cards_to_graveyard };