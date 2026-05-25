/**
 * ChainWindow.jsx — shows eligible face-down traps/quick-plays when opponent acts.
 * Game logic pauses (via Promise in CPUPlayer) until player passes or activates.
 */
import React from 'react';
import { connect } from 'react-redux';
import { TOOL_TYPE } from '../../../Store/actions/actionTypes';
import { close_tool } from '../../../Store/actions/toolActions';
import { CARD_POS } from '../../Card/utils/constant';
import { update_environment } from '../../../Store/actions/environmentActions';
import store from '../../../Store/store';

class ChainWindow extends React.Component {
    handlePass = () => {
        const { info, dispatch_close } = this.props;
        info?.resolve?.({ activated: false });
        dispatch_close({ tool_type: TOOL_TYPE.CHAIN_WINDOW });
    };

    handleActivate = (cardEnv) => {
        const { info, dispatch_close } = this.props;
        // Reveal the card
        cardEnv.current_pos = CARD_POS.FACE;
        store.dispatch(update_environment({ ...store.getState().environmentReducer.environment }));

        // Run the card's effect if it has one
        const effect = cardEnv.card?.effects?.[0];
        const runEffect = async () => {
            if (effect?.activate_effect) {
                try {
                    const env = store.getState().environmentReducer.environment;
                    await Promise.resolve(effect.activate_effect(env));
                } catch (e) {
                    console.warn('[ChainWindow] Effect error:', e);
                }
            }
        };

        info?.resolve?.({ activated: true, cardEnv });
        dispatch_close({ tool_type: TOOL_TYPE.CHAIN_WINDOW });
        runEffect();
    };

    render() {
        const { show, info } = this.props;
        if (!show) return null;

        const cards = info?.cards || [];
        const triggerName = info?.triggerName || 'opponent action';

        return (
            <div style={{
                position: 'fixed', inset: 0, zIndex: 9500,
                background: 'rgba(0,0,0,0.78)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
                <div style={{
                    background: '#0d0d1f', border: '2px solid #5a3a7a',
                    borderRadius: 14, padding: 24, maxWidth: 560, width: '90%',
                    boxShadow: '0 8px 40px rgba(90,40,120,0.4)',
                }}>
                    <h3 style={{ color: '#e2c0ff', margin: '0 0 4px', fontSize: 16 }}>
                        ⛓️ Chain Response
                    </h3>
                    <p style={{ color: '#888', fontSize: 12, margin: '0 0 16px' }}>
                        {triggerName} — Activate a card or pass?
                    </p>

                    {cards.length === 0 ? (
                        <p style={{ color: '#555', textAlign: 'center', padding: '12px 0', fontSize: 13 }}>
                            No eligible cards to activate.
                        </p>
                    ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
                            {cards.map((cardEnv, i) => {
                                const c = cardEnv.card;
                                const img = c?.card_pic || c?.image_url ||
                                    'https://ms.yugipedia.com//f/fd/Back-Anime-ZX-2.png';
                                return (
                                    <div key={i} style={{ textAlign: 'center', width: 90 }}>
                                        <img
                                            src={img}
                                            alt={c?.name}
                                            style={{ width: 88, borderRadius: 6, border: '2px solid #5a3a7a', display: 'block' }}
                                            onError={e => { e.target.src = 'https://ms.yugipedia.com//f/fd/Back-Anime-ZX-2.png'; }}
                                        />
                                        <div style={{ color: '#ddd', fontSize: 9, marginTop: 4, lineHeight: 1.2 }}>
                                            {c?.name}
                                        </div>
                                        <button onClick={() => this.handleActivate(cardEnv)} style={{
                                            marginTop: 5, width: '100%',
                                            background: '#2a1a4a', border: '1px solid #7a4aaa',
                                            color: '#d090ff', borderRadius: 4,
                                            padding: '3px 0', fontSize: 10, cursor: 'pointer',
                                        }}>
                                            ⚡ Activate
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    <div style={{ textAlign: 'right' }}>
                        <button onClick={this.handlePass} style={{
                            background: '#1a1a3a', border: '1px solid #3a3a6a',
                            color: '#aaa', borderRadius: 8, padding: '9px 28px',
                            cursor: 'pointer', fontSize: 13,
                        }}>
                            Pass
                        </button>
                    </div>
                </div>
            </div>
        );
    }
}

const mapStateToProps = state => ({
    show: state.toolReducer.tools[TOOL_TYPE.CHAIN_WINDOW]?.status || false,
    info: state.toolReducer.tools[TOOL_TYPE.CHAIN_WINDOW]?.info || {},
});

const mapDispatchToProps = dispatch => ({
    dispatch_close: (info) => dispatch(close_tool(info)),
});

export default connect(mapStateToProps, mapDispatchToProps)(ChainWindow);
