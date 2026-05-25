import React, { useState, useEffect, useRef } from 'react';
import { subscribe, getEvents, clearLog, exportReplayData, LOG_ICONS, LOG_COLORS, LOG_TYPE } from '../../../data/duelLog';
import './DuelLog.css';

const MAX_VISIBLE = 80;

const relativeTime = (ts) => {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 5)  return 'now';
    if (s < 60) return `${s}s ago`;
    return `${Math.floor(s / 60)}m ago`;
};

export default function DuelLog() {
    const [events, setEvents]     = useState(() => getEvents());
    const [expanded, setExpanded] = useState(false);
    const [filter, setFilter]     = useState(null); // null = show all
    const listRef = useRef(null);

    useEffect(() => subscribe(setEvents), []);

    const visible = (filter
        ? events.filter(e => e.type === filter)
        : events
    ).slice(0, MAX_VISIBLE);

    const handleExport = () => {
        const data = exportReplayData();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url;
        a.download = `duel-replay-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // Collapsed pill — show last meaningful event
    if (!expanded) {
        const last = events.find(e => e.type !== LOG_TYPE.SYSTEM) || events[0];
        return (
            <div className="duel-log-pill" onClick={() => setExpanded(true)} title="Open Duel Log">
                <span className="duel-log-pill-icon">📋</span>
                <span className="duel-log-pill-text">
                    {last
                        ? `${LOG_ICONS[last.type] || '●'} ${last.text}`
                        : 'Duel Log'}
                </span>
                {events.length > 0 && (
                    <span className="duel-log-pill-count">{events.length}</span>
                )}
            </div>
        );
    }

    return (
        <div className="duel-log-panel">
            {/* Header */}
            <div className="duel-log-header">
                <span className="duel-log-title">📋 Duel Log</span>
                <div className="duel-log-actions">
                    <button className="duel-log-btn" onClick={handleExport} title="Export replay JSON">⬇ Export</button>
                    <button className="duel-log-btn duel-log-btn-danger" onClick={clearLog} title="Clear log">✕ Clear</button>
                    <button className="duel-log-btn" onClick={() => setExpanded(false)} title="Collapse">— Hide</button>
                </div>
            </div>

            {/* Type filter chips */}
            <div className="duel-log-filters">
                <span
                    className={`duel-log-chip ${!filter ? 'active' : ''}`}
                    onClick={() => setFilter(null)}>All</span>
                {[LOG_TYPE.SUMMON, LOG_TYPE.SPECIAL, LOG_TYPE.ATTACK, LOG_TYPE.DAMAGE,
                  LOG_TYPE.EFFECT, LOG_TYPE.EFFECT_FAIL, LOG_TYPE.PHASE].map(t => (
                    <span key={t}
                        className={`duel-log-chip ${filter === t ? 'active' : ''}`}
                        style={{ '--chip-color': LOG_COLORS[t] }}
                        onClick={() => setFilter(f => f === t ? null : t)}>
                        {LOG_ICONS[t]} {t}
                    </span>
                ))}
            </div>

            {/* Event list */}
            <div className="duel-log-list" ref={listRef}>
                {visible.length === 0 ? (
                    <div className="duel-log-empty">No events yet.</div>
                ) : visible.map(e => (
                    <div key={e.id} className="duel-log-entry" style={{ '--entry-color': LOG_COLORS[e.type] || '#666' }}>
                        <span className="duel-log-entry-icon">{LOG_ICONS[e.type] || '●'}</span>
                        <span className="duel-log-entry-text">{e.text}</span>
                        <span className="duel-log-entry-meta">T{e.turn} · {relativeTime(e.timestamp)}</span>
                    </div>
                ))}
            </div>

            <div className="duel-log-footer">{events.length} events recorded</div>
        </div>
    );
}
