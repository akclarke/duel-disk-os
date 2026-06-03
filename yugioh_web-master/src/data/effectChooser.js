import store from '../Store/store';
import { show_tool } from '../Store/actions/toolActions';
import { TOOL_TYPE } from '../Store/actions/actionTypes';

/**
 * Show a modal listing multiple named effects for the player to choose from.
 * effects: [{ id: string, label: string, description?: string }]
 * Returns a Promise resolving to the chosen effect id, or null if cancelled.
 */
export const chooseEffect = (effects) =>
    new Promise((resolve) =>
        store.dispatch(show_tool({
            tool_type: TOOL_TYPE.EFFECT_CHOOSER,
            info: { effects, resolve },
        }))
    );
