import { CHANGE_PHASE, INITIALIZE_META } from "../actions/actionTypes";
import { PHASE } from '../../Components/PlayerGround/utils/constant'
import { draw_card } from '../actions/environmentActions';
import store from '../store';


const initialState = {
    game_meta: undefined,
}

export default function(state = initialState, action) {

    if (action.type == CHANGE_PHASE) {
        const { info } = action.payload;

        let current_turn = state.game_meta.current_turn;
        // Swap turn when the new turn cycle begins (PHASE_START), not at END_PHASE.
        // Swapping at END_PHASE caused is_my_turn to flip before Game.jsx could
        // call auto_next_phase(PHASE_START), permanently stalling the game.
        if (info.next_phase === 'Game start') {
            const { my_id, opponent_id } = state.game_meta;
            current_turn = (current_turn === my_id) ? opponent_id : my_id;
        }

        return JSON.parse(JSON.stringify({
            game_meta: {
                ...state.game_meta,
                current_phase: info.next_phase,
                current_turn: current_turn
            }
        }));
    } else if (action.type == INITIALIZE_META) {
        const { game_meta } = action.payload;
        state.game_meta = game_meta
        return {
            game_meta: {
                ...state.game_meta
            }
        }
    }
    
    else {
        return state;
    }
};