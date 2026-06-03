import store from '../Store/store';
import { show_tool } from '../Store/actions/toolActions';
import { TOOL_TYPE } from '../Store/actions/actionTypes';

/**
 * Show the ATK/DEF position chooser modal.
 * Returns a Promise that resolves to CARD_POS.FACE (ATK) or CARD_POS.DEFENSE.
 */
export const choosePosition = (cardName) =>
    new Promise((resolve) =>
        store.dispatch(show_tool({
            tool_type: TOOL_TYPE.POSITION_CHOOSER,
            info: { cardName, resolve },
        }))
    );
