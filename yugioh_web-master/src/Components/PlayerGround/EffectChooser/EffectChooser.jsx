import React from 'react';
import { connect } from 'react-redux';
import { TOOL_TYPE } from '../../../Store/actions/actionTypes';
import { close_tool } from '../../../Store/actions/toolActions';

const EffectChooser = ({ visible, info, dispatchClose }) => {
    if (!visible) return null;

    const { effects = [], resolve } = info;

    const choose = (id) => {
        dispatchClose();
        resolve(id);
    };

    const cancel = () => {
        dispatchClose();
        resolve(null);
    };

    return (
        <div style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.78)',
            zIndex: 20000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
            <div style={{
                background: '#141428', border: '2px solid #6060cc',
                borderRadius: 14, padding: '28px 32px',
                display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 12,
                minWidth: 320, maxWidth: 440,
                boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
            }}>
                <div style={{ color: '#c0c0ff', fontSize: 12, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 }}>
                    Choose an Effect
                </div>

                {effects.map((eff) => (
                    <button
                        key={eff.id}
                        onClick={() => choose(eff.id)}
                        style={{
                            background: '#1a1a3a',
                            border: '2px solid #4040aa',
                            color: '#d0d0ff',
                            borderRadius: 10,
                            padding: '14px 18px',
                            fontSize: 13,
                            fontWeight: 700,
                            cursor: 'pointer',
                            textAlign: 'left',
                            transition: 'all 0.1s',
                            lineHeight: 1.4,
                        }}
                        onMouseOver={e => { e.currentTarget.style.background = '#2a2a5a'; e.currentTarget.style.borderColor = '#7070dd'; }}
                        onMouseOut={e => { e.currentTarget.style.background = '#1a1a3a'; e.currentTarget.style.borderColor = '#4040aa'; }}
                    >
                        <div style={{ color: '#a0a0ff', fontSize: 11, fontWeight: 800, marginBottom: 3 }}>
                            ✦ {eff.label}
                        </div>
                        {eff.description && (
                            <div style={{ color: '#888', fontSize: 10, fontWeight: 400 }}>
                                {eff.description}
                            </div>
                        )}
                    </button>
                ))}

                <button
                    onClick={cancel}
                    style={{
                        background: 'transparent', border: '1px solid #333',
                        color: '#555', borderRadius: 8,
                        padding: '7px 0', fontSize: 11,
                        cursor: 'pointer', marginTop: 4,
                        fontFamily: 'Lato, sans-serif',
                    }}
                >
                    Cancel
                </button>
            </div>
        </div>
    );
};

const mapStateToProps = state => ({
    visible: state.toolReducer.tools[TOOL_TYPE.EFFECT_CHOOSER]?.status || false,
    info: state.toolReducer.tools[TOOL_TYPE.EFFECT_CHOOSER]?.info || {},
});

const mapDispatchToProps = dispatch => ({
    dispatchClose: () => dispatch(close_tool({ tool_type: TOOL_TYPE.EFFECT_CHOOSER })),
});

export default connect(mapStateToProps, mapDispatchToProps)(EffectChooser);
