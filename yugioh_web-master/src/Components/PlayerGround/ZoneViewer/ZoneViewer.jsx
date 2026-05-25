/**
 * ZoneViewer.jsx — modal for GY, Extra Deck, Banished Zone, and Pendulum Zones.
 * Click a card in the grid to see its full details on the right.
 */
import React from 'react';
import { connect } from 'react-redux';
import { ENVIRONMENT, SIDE } from '../../Card/utils/constant';

const ZONE_LABELS = {
    gy_mine:       '🪦 My Graveyard',
    gy_opp:        "🪦 Opponent's Graveyard",
    extra_mine:    '📘 My Extra Deck',
    extra_opp:     "📘 Opponent's Extra Deck",
    pendulum_mine: '🔮 My Pendulum Zones',
    pendulum_opp:  "🔮 Opponent's Pendulum Zones",
};

const FALLBACK_IMG = 'https://ms.yugipedia.com//f/fd/Back-Anime-ZX-2.png';

class ZoneViewer extends React.Component {
    state = { selected: null };

    getCards = () => {
        const { zone, environment } = this.props;
        if (!environment || !zone) return [];
        switch (zone) {
            case 'gy_mine':       return environment[SIDE.MINE][ENVIRONMENT.GRAVEYARD] || [];
            case 'gy_opp':        return environment[SIDE.OPPONENT][ENVIRONMENT.GRAVEYARD] || [];
            case 'extra_mine':    return environment[SIDE.MINE][ENVIRONMENT.EXTRA_DECK] || [];
            case 'extra_opp':     return environment[SIDE.OPPONENT][ENVIRONMENT.EXTRA_DECK] || [];
            case 'pendulum_mine': return (environment[SIDE.MINE][ENVIRONMENT.PENDULUM_ZONE] || []).filter(Boolean);
            case 'pendulum_opp':  return (environment[SIDE.OPPONENT][ENVIRONMENT.PENDULUM_ZONE] || []).filter(Boolean);
            default: return [];
        }
    };

    selectCard = (cardEnv) => this.setState({ selected: cardEnv });

    render() {
        const { zone, onClose } = this.props;
        if (!zone) return null;

        const cards = this.getCards().filter(c => c?.card);
        const title = ZONE_LABELS[zone] || 'Zone';
        const { selected } = this.state;
        const sc = selected?.card;

        return (
            <div style={{
                position: 'fixed', inset: 0,
                background: 'rgba(0,0,0,0.85)', zIndex: 10000,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }} onClick={onClose}>
                <div style={{
                    background: '#0f0f1a', border: '2px solid #3a3a6a',
                    borderRadius: 14, padding: 20, width: '90%', maxWidth: 860,
                    maxHeight: '85vh', display: 'flex', flexDirection: 'column',
                }} onClick={e => e.stopPropagation()}>

                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                        <h2 style={{ color: '#e2e2ff', margin: 0, fontSize: 17 }}>{title}</h2>
                        <span style={{ color: '#666', fontSize: 12 }}>{cards.length} card{cards.length !== 1 ? 's' : ''}</span>
                    </div>

                    {/* Body: grid + detail */}
                    <div style={{ display: 'flex', gap: 16, flex: 1, minHeight: 0 }}>

                        {/* Card grid */}
                        <div style={{
                            flex: '0 0 auto', width: cards.length > 0 ? 260 : '100%',
                            overflowY: 'auto',
                        }}>
                            {cards.length === 0 ? (
                                <p style={{ color: '#555', textAlign: 'center', padding: '20px 0' }}>Empty</p>
                            ) : (
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fill, minmax(74px, 1fr))',
                                    gap: 8
                                }}>
                                    {cards.map((cardEnv, i) => {
                                        const c = cardEnv.card;
                                        const img = c.card_pic || c.image_url || FALLBACK_IMG;
                                        const isSelected = selected === cardEnv;
                                        return (
                                            <div key={i}
                                                onClick={() => this.selectCard(cardEnv)}
                                                style={{
                                                    borderRadius: 6, overflow: 'hidden', cursor: 'pointer',
                                                    border: `2px solid ${isSelected ? '#6060e0' : '#2a2a50'}`,
                                                    transform: isSelected ? 'scale(1.04)' : 'none',
                                                    transition: 'all 0.12s',
                                                }}>
                                                <img
                                                    src={img} alt={c.name}
                                                    style={{ width: '100%', aspectRatio: '59/86', objectFit: 'cover', display: 'block' }}
                                                    onError={e => { e.target.src = FALLBACK_IMG; }}
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Detail panel */}
                        {sc && (
                            <div style={{
                                flex: 1, overflowY: 'auto', minWidth: 0,
                                background: '#131325', borderRadius: 10,
                                border: '1px solid #2a2a50', padding: 14,
                                display: 'flex', flexDirection: 'column', gap: 10,
                            }}>
                                {/* Card image + core stats */}
                                <div style={{ display: 'flex', gap: 12 }}>
                                    <img
                                        src={sc.card_pic || sc.image_url || FALLBACK_IMG}
                                        alt={sc.name}
                                        style={{ width: 100, borderRadius: 6, flexShrink: 0, alignSelf: 'flex-start' }}
                                        onError={e => { e.target.src = FALLBACK_IMG; }}
                                    />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ color: '#e0e0ff', fontWeight: 700, fontSize: 13, marginBottom: 4 }}>
                                            {sc.name}
                                        </div>
                                        <div style={{ color: '#888', fontSize: 11, marginBottom: 2 }}>
                                            {sc.card_type?.replace(/_/g, ' ')}
                                        </div>
                                        {sc.card_type?.startsWith('MONSTER') && (
                                            <>
                                                <div style={{ color: '#aaa', fontSize: 11 }}>
                                                    {sc.level != null ? `Level ${sc.level}` : sc.rank != null ? `Rank ${sc.rank}` : ''}
                                                    {sc.attribute ? ` · ${sc.attribute}` : ''}
                                                    {sc.race ? ` / ${sc.race}` : ''}
                                                </div>
                                                <div style={{ color: '#ccaa66', fontSize: 12, marginTop: 3 }}>
                                                    ATK {sc.atk ?? '?'} / DEF {sc.def ?? '?'}
                                                </div>
                                            </>
                                        )}
                                        {sc.scale != null && (
                                            <div style={{ color: '#c080ff', fontSize: 11, marginTop: 3 }}>
                                                Pendulum Scale: {sc.scale}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Pendulum effect text */}
                                {sc.pendDesc && (
                                    <div>
                                        <div style={{ color: '#c080ff', fontSize: 10, fontWeight: 700, marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                            Pendulum Effect
                                        </div>
                                        <div style={{ color: '#bba', fontSize: 11, lineHeight: 1.55 }}>
                                            {sc.pendDesc}
                                        </div>
                                    </div>
                                )}

                                {/* Monster / spell / trap description */}
                                {sc.description && (
                                    <div>
                                        {sc.pendDesc && (
                                            <div style={{ color: '#8899aa', fontSize: 10, fontWeight: 700, marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                                Monster Effect
                                            </div>
                                        )}
                                        <div style={{ color: '#ccc', fontSize: 11, lineHeight: 1.55 }}>
                                            {sc.description}
                                        </div>
                                    </div>
                                )}

                                {/* Pendulum zone activate button */}
                                {zone === 'pendulum_mine' && sc.pendulumEffect && (
                                    <button onClick={(e) => {
                                        e.stopPropagation();
                                        if (typeof sc.pendulumEffect === 'function') {
                                            sc.pendulumEffect(this.props.environment, selected);
                                        }
                                    }} style={{
                                        background: '#2a1a4a', border: '1px solid #7040b0',
                                        color: '#c080ff', borderRadius: 6,
                                        padding: '6px 14px', fontSize: 12, cursor: 'pointer', alignSelf: 'flex-start'
                                    }}>⚡ Activate Pendulum Effect</button>
                                )}
                            </div>
                        )}

                        {/* Placeholder when nothing selected yet */}
                        {!sc && cards.length > 0 && (
                            <div style={{
                                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: '#333', fontSize: 13,
                            }}>
                                Click a card to view details
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div style={{ textAlign: 'right', marginTop: 14 }}>
                        <button onClick={onClose} style={{
                            background: '#1e1e3a', border: '1px solid #3a3a6a',
                            color: '#aaa', borderRadius: 8, padding: '8px 20px',
                            cursor: 'pointer', fontSize: 13,
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
