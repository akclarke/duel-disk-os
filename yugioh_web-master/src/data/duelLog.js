/**
 * duelLog.js — lightweight event log for the duel.
 * Module-level singleton — no Redux needed.
 * Subscribe from components; call logEvent from anywhere in the game.
 *
 * Replay foundation: the events array is the full game tape.
 * Export it with exportReplayData() to persist/transmit.
 */

export const LOG_TYPE = {
    PHASE:       'phase',
    DRAW:        'draw',
    SUMMON:      'summon',
    SET:         'set',
    SPECIAL:     'special',
    POSITION:    'position',
    ATTACK:      'attack',
    DAMAGE:      'damage',
    LP:          'lp',
    EFFECT:      'effect',
    EFFECT_FAIL: 'effect_fail',
    SEND_GY:     'gy',
    SYSTEM:      'system',
};

export const LOG_ICONS = {
    [LOG_TYPE.PHASE]:       '⟳',
    [LOG_TYPE.DRAW]:        '🃏',
    [LOG_TYPE.SUMMON]:      '⬆',
    [LOG_TYPE.SET]:         '⬇',
    [LOG_TYPE.SPECIAL]:     '✦',
    [LOG_TYPE.POSITION]:    '↔',
    [LOG_TYPE.ATTACK]:      '⚔',
    [LOG_TYPE.DAMAGE]:      '💥',
    [LOG_TYPE.LP]:          '♥',
    [LOG_TYPE.EFFECT]:      '✨',
    [LOG_TYPE.EFFECT_FAIL]: '✗',
    [LOG_TYPE.SEND_GY]:     '⚰',
    [LOG_TYPE.SYSTEM]:      '●',
};

export const LOG_COLORS = {
    [LOG_TYPE.PHASE]:       '#4a9eff',
    [LOG_TYPE.DRAW]:        '#e8d44d',
    [LOG_TYPE.SUMMON]:      '#4cdb7a',
    [LOG_TYPE.SET]:         '#7adb9a',
    [LOG_TYPE.SPECIAL]:     '#00e5aa',
    [LOG_TYPE.POSITION]:    '#5ae8e0',
    [LOG_TYPE.ATTACK]:      '#ff6b4a',
    [LOG_TYPE.DAMAGE]:      '#ff3030',
    [LOG_TYPE.LP]:          '#ff80b0',
    [LOG_TYPE.EFFECT]:      '#d070ff',
    [LOG_TYPE.EFFECT_FAIL]: '#555',
    [LOG_TYPE.SEND_GY]:     '#888',
    [LOG_TYPE.SYSTEM]:      '#666',
};

const MAX_EVENTS = 500;

let _events = [];
let _eventId = 0;
let _turn = 1;
const _subscribers = new Set();

const _notify = () => _subscribers.forEach(fn => fn([..._events]));

export const logEvent = (type, text, extra = {}) => {
    const entry = {
        id: ++_eventId,
        type,
        text,
        turn: _turn,
        timestamp: Date.now(),
        ...extra,
    };
    _events.unshift(entry);           // newest first
    if (_events.length > MAX_EVENTS) _events.length = MAX_EVENTS;
    _notify();
};

export const setLogTurn = (n) => { _turn = n; };

export const getEvents = () => [..._events];

export const clearLog = () => {
    _events = [];
    _eventId = 0;
    _notify();
};

export const subscribe = (fn) => {
    _subscribers.add(fn);
    return () => _subscribers.delete(fn);
};

/** Structured export for future replay / persistence. */
export const exportReplayData = () => ({
    exportedAt: Date.now(),
    totalEvents: _events.length,
    events: [..._events].reverse(), // chronological order for replay
});
