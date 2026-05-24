/**
 * OfflineAdapter.js — src/Client/OfflineAdapter.js
 * Signals to the game systems that we're in offline (CPU) mode.
 * When enabled, socket-dependent flows self-resolve locally.
 */
let _enabled = false;

export const OfflineAdapter = {
    enable()    { _enabled = true;  console.log('[Offline] mode ON');  },
    disable()   { _enabled = false; console.log('[Offline] mode OFF'); },
    isEnabled() { return _enabled; }
};

export default OfflineAdapter;
