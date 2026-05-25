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

// Zones from which a pendulum monster leaving goes to the extra deck (face-up)
// rather than the graveyard. Hand/Deck discards and XYZ detach still go to GY.
const FIELD_ZONES = new Set([
    ENVIRONMENT.MONSTER_FIELD,
    ENVIRONMENT.SPELL_FIELD,
    ENVIRONMENT.PENDULUM_ZONE,
]);

export const move_cards_to_graveyard = (cards, side, src, environment, options = {}) => {
    const current_cards = environment[side][src];
    const destroyed = []; // track what actually got destroyed for trigger firing

    for (let i = 0; i < current_cards.length; i++) {
        if (!current_cards[i]?.card) continue;
        if (cards.includes(get_unique_id_from_ennvironment(current_cards[i]))) {
            const cardEnv = current_cards[i];
            destroyed.push(cardEnv);

            // Pendulum monsters leaving the field go face-up to the extra deck,
            // not the graveyard — unless this is an XYZ detach (options.forceGY).
            const isPendulum = cardEnv.card?.card_type === 'MONSTER_PENDULUM';
            const isFromField = FIELD_ZONES.has(src);
            const dest = (isPendulum && isFromField && !options.forceGY)
                ? ENVIRONMENT.EXTRA_DECK
                : ENVIRONMENT.GRAVEYARD;

            environment[side][dest].push(cardEnv);

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