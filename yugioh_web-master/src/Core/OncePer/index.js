/**
 * Core/OncePer/index.js
 *
 * Per-turn once-per-turn tracking that replaces the sessionStorage approach.
 *
 * KEY FORMAT
 *   `{cardUniqueCount}:{effectIndex}`
 *   Example: "42_0" — card instance 42, effect index 0
 *
 * LIFECYCLE
 *   OncePer.clearAll()   — call at the start of each new turn (Draw Phase)
 *   OncePer.canActivate  — check before showing Activate button / running effect
 *   OncePer.markUsed     — call immediately after the effect begins resolving
 *
 * WIND-UP "SINGLE USE" PATTERN
 *   Wind-Up effects use wind_up: true on the effect entry.
 *   They are tracked via OncePer with a special `_windup_` prefix so they
 *   are NOT cleared on turn change (they persist for the card's life on the field).
 *
 * INTEGRATION POINTS
 *   1. Side.jsx: hasActivatableEffect / activateFieldEffect
 *   2. effectFactory.js: oncePerTurn wrapper
 *   3. gameMetaReducer.js (or Game.jsx): call clearAll() on Draw Phase start
 */

// ── STATE ─────────────────────────────────────────────────────────────────

/** @type {Map<string, boolean>} */
const usedThisTurn = new Map();

/** @type {Map<string, boolean>} — never cleared (wind-up single-use) */
const usedPermanent = new Map();

// ── KEY BUILDERS ──────────────────────────────────────────────────────────

const turnKey     = (cardEnv, effectIndex = 0) => `${cardEnv.unique_count}:${effectIndex}`;
const permanentKey = (cardEnv, effectIndex = 0) => `_windup_${cardEnv.unique_count}:${effectIndex}`;

// ── PUBLIC API ─────────────────────────────────────────────────────────────

/**
 * Returns true if the effect has NOT been used this turn (or ever, for single-use).
 * @param {object} cardEnv   — the card environment object
 * @param {number} effectIndex — index in the card's effects array (default 0)
 * @param {boolean} isWindUp — true for wind-up / single-use effects
 */
const canActivate = (cardEnv, effectIndex = 0, isWindUp = false) => {
    if (!cardEnv) return false;
    if (isWindUp) {
        return !usedPermanent.has(permanentKey(cardEnv, effectIndex));
    }
    return !usedThisTurn.has(turnKey(cardEnv, effectIndex));
};

/**
 * Mark an effect as used.
 * For wind-up effects (isWindUp = true), the mark is permanent for this card instance.
 */
const markUsed = (cardEnv, effectIndex = 0, isWindUp = false) => {
    if (!cardEnv) return;
    if (isWindUp) {
        usedPermanent.set(permanentKey(cardEnv, effectIndex), true);
        // Also set the legacy flag for backwards compat with existing effectsRegistry code
        cardEnv.wind_up_used = true;
    } else {
        usedThisTurn.set(turnKey(cardEnv, effectIndex), true);
    }
};

/**
 * Clear all per-turn once-per-turn records.
 * Call at the start of each Draw Phase.
 * Permanent (wind-up) records are NOT cleared.
 */
const clearAll = () => {
    usedThisTurn.clear();
    // Also migrate any existing sessionStorage keys for backwards compat
    try {
        const toRemove = [];
        for (let i = 0; i < sessionStorage.length; i++) {
            const k = sessionStorage.key(i);
            if (k?.startsWith('once_per_turn_')) toRemove.push(k);
        }
        toRemove.forEach(k => sessionStorage.removeItem(k));
    } catch { /* sessionStorage not available in all contexts */ }
};

/**
 * Clear permanent records for a specific card instance.
 * Call when a card is sent to GY, banished, or returned to hand/deck
 * (so that if it's re-summoned, its once-per-turn resets).
 */
const clearCard = (cardEnv) => {
    if (!cardEnv) return;
    const prefix = `${cardEnv.unique_count}:`;
    const windupPrefix = `_windup_${cardEnv.unique_count}:`;
    for (const key of [...usedThisTurn.keys()]) {
        if (key.startsWith(prefix)) usedThisTurn.delete(key);
    }
    for (const key of [...usedPermanent.keys()]) {
        if (key.startsWith(windupPrefix)) usedPermanent.delete(key);
    }
    // Reset legacy flag
    if (cardEnv) cardEnv.wind_up_used = false;
};

/**
 * Debug: return a snapshot of current state (useful in console).
 */
const debug = () => ({
    turnKeys:      [...usedThisTurn.keys()],
    permanentKeys: [...usedPermanent.keys()],
});

export default { canActivate, markUsed, clearAll, clearCard, debug };
