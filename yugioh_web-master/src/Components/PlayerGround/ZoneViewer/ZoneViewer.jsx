/**
 * ZoneViewer.jsx — src/Components/PlayerGround/ZoneViewer/ZoneViewer.jsx
 * Modal for previewing GY, Extra Deck, and Banished Zone cards.
 */
import React from 'react';
import { connect } from 'react-redux';
import { ENVIRONMENT, SIDE, CARD_TYPE } from '../../Card/utils/constant';

const ZONE_LABELS = {
    gy_mine:        '🪦 My Graveyard',
    gy_opp:         "🪦 Opponent's Graveyard",
    extra_mine:     '📘 My Extra Deck',
    extra_opp:      "📘 Opponent's Extra Deck",
    pendulum_mine:  '🔮 My Pendulum Zones',
    pendulum_opp:   "🔮 Opponent's Pendulum Zones",
};

class ZoneViewer extends React.Component {
    getCards = () => {
        const { zone, environment } = this.props;
        if (!environment || !zone) return [];
        switch (zone) {
            case 'gy_mine':        return environment[SIDE.MINE][ENVIRONMENT.GRAVEYARD] || [];
            case 'gy_opp':         return environment[SIDE.OPPONENT][ENVIRONMENT.GRAVEYARD] || [];
            case 'extra_mine':     return environment[SIDE.MINE][ENVIRONMENT.EXTRA_DECK] || [];
            case 'extra_opp':      return environment[SIDE.OPPONENT][ENVIRONMENT.EXTRA_DECK] || [];
            case 'pendulum_mine':  return (environment[SIDE.MINE][ENVIRONMENT.PENDULUM_ZONE] || []).filter(Boolean);
            case 'pendulum_opp':   return (environment[SIDE.OPPONENT][ENVIRONMENT.PENDULUM_ZONE] || []).filter(Boolean);
            default: return [];
        }
    };

    render() {
        const { zone, onClose } = this.props;
        if (!zone) return null;

        const cards = this.getCards().filter(c => c?.card);
        const title = ZONE_LABELS[zone] || 'Zone';

        return (
            <div style={{
                position: 'fixed', inset: 0,
                background: 'rgba(0,0,0,0.82)', zIndex: 10000,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }} onClick={onClose}>
                <div style={{
                    background: '#0f0f1a', border: '2px solid #3a3a6a',
                    borderRadius: 14, padding: 24, maxWidth: 700,
                    width: '90%', maxHeight: '80vh', overflowY: 'auto',
                }} onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <h2 style={{ color: '#e2e2ff', margin: 0, fontSize: 18 }}>{title}</h2>
                        <span style={{ color: '#888', fontSize: 13 }}>{cards.length} card{cards.length !== 1 ? 's' : ''}</span>
                    </div>

                    {cards.length === 0 ? (
                        <p style={{ color: '#555', textAlign: 'center', padding: '20px 0' }}>Empty</p>
                    ) : (
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                            gap: 12
                        }}>
                            {cards.map((cardEnv, i) => {
                                const c = cardEnv.card;
                                const img = c.card_pic || c.image_url || 'https://ms.yugipedia.com//f/fd/Back-Anime-ZX-2.png';
                                const isMonster = c.card_type?.startsWith('MONSTER');
                                return (
                                    <div key={i} style={{
                                        background: '#1a1a30', borderRadius: 8,
                                        border: '1px solid #2a2a50', overflow: 'hidden',
                                        display: 'flex', flexDirection: 'column'
                                    }}>
                                        <img
                                            src={img}
                                            alt={c.name}
                                            style={{ width: '100%', aspectRatio: '59/86', objectFit: 'cover' }}
                                            onError={e => { e.target.src = 'https://ms.yugipedia.com//f/fd/Back-Anime-ZX-2.png'; }}
                                        />
                                        <div style={{ padding: '6px 8px' }}>
                                            <div style={{ color: '#ddd', fontSize: 11, fontWeight: 600, lineHeight: 1.3, marginBottom: 3 }}>
                                                {c.name}
                                            </div>
                                            {isMonster && (
                                                <div style={{ color: '#888', fontSize: 10 }}>
                                                    Lv{c.level} · {c.atk ?? '?'}/{c.def ?? '?'}
                                                </div>
                                            )}
                                            {c.scale != null && (
                                                <div style={{ color: '#c080ff', fontSize: 10, marginTop: 2 }}>
                                                    Scale: {c.scale}
                                                </div>
                                            )}
                                            {/* Pendulum zone effect activation */}
                                            {zone === 'pendulum_mine' && c.pendulumEffect && (
                                                <button onClick={(e) => {
                                                    e.stopPropagation();
                                                    const env = this.props.environment;
                                                    if (typeof c.pendulumEffect === 'function') {
                                                        c.pendulumEffect(env, cardEnv);
                                                    }
                                                }} style={{
                                                    marginTop: 4, width: '100%', background: '#2a1a4a',
                                                    border: '1px solid #6040a0', color: '#c080ff',
                                                    borderRadius: 4, padding: '3px 0', fontSize: 9, cursor: 'pointer'
                                                }}>⚡ Activate</button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    <div style={{ textAlign: 'right', marginTop: 16 }}>
                        <button onClick={onClose} style={{
                            background: '#1e1e3a', border: '1px solid #3a3a6a',
                            color: '#aaa', borderRadius: 8, padding: '8px 20px',
                            cursor: 'pointer', fontSize: 13
                        }}>Close</button>
                    </div>
                </div>
            </div>
        );
    }
}

const mapStateToProps = state => ({
    environment: state.environmentReducer.environment
});

export default connect(mapStateToProps)(ZoneViewer);