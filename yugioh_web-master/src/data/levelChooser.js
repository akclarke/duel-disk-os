import store from '../Store/store';
import { show_tool } from '../Store/actions/toolActions';
import { TOOL_TYPE } from '../Store/actions/actionTypes';

/**
 * Show the Level chooser modal (1-8).
 * Returns a Promise that resolves to the chosen level number, or null if cancelled.
 */
export const chooseLevel = (cardName) =>
    new Promise((resolve) =>
        store.dispatch(show_tool({
            tool_type: TOOL_TYPE.LEVEL_CHOOSER,
            info: { cardName, resolve },
        }))
    );
