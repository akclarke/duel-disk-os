import React from 'react';
import { connect } from 'react-redux';
import { TOOL_TYPE } from '../../../Store/actions/actionTypes';
import { close_tool } from '../../../Store/actions/toolActions';

const LEVELS = [1, 2, 3, 4, 5, 6, 7, 8];

const STAR_COLORS = {
    1: '#aaaaaa', 2: '#aaaaaa', 3: '#aaaaaa', 4: '#aaaaaa',
    5: '#ffcc00', 6: '#ffcc00', 7: '#ff6600', 8: '#ff3300',
};

const LevelChooser = ({ visible, info, dispatchClose }) => {
    if (!visible) return null;

    const { cardName, resolve } = info;

    const choose = (level) => {
        dispatchClose();
        resolve(level);
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
                background: '#141428', border: '2px solid #aa8800',
                borderRadius: 14, padding: '28px 32px',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18,
                minWidth: 340, boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
            }}>
                <div style={{ color: '#ffd060', fontSize: 12, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                    Declare a Level
                </div>
                <div style={{ color: '#e8e8ff', fontSize: 15, fontWeight: 700, textAlign: 'center' }}>
                    {cardName}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                    {LEVELS.map(lv => (
                        <button
                            key={lv}
                            onClick={() => choose(lv)}
                            style={{
                                background: '#1a1a3a',
                                border: `2px solid ${STAR_COLORS[lv]}`,
                                color: STAR_COLORS[lv],
                                borderRadius: 10,
                                padding: '12px 0',
                                fontSize: 18,
                                fontWeight: 900,
                                cursor: 'pointer',
                                minWidth: 60,
                                letterSpacing: 1,
                                transition: 'all 0.1s',
                            }}
                            onMouseOver={e => { e.currentTarget.style.background = '#2a2a5a'; }}
                            onMouseOut={e => { e.currentTarget.style.background = '#1a1a3a'; }}
                        >
                            {lv}
                        </button>
                    ))}
                </div>
                <button
                    onClick={cancel}
                    style={{
                        background: 'transparent', border: '1px solid #444',
                        color: '#666', borderRadius: 8,
                        padding: '7px 24px', fontSize: 12,
                        cursor: 'pointer', marginTop: 2,
                    }}
                >
                    Cancel
                </button>
            </div>
        </div>
    );
};

const mapStateToProps = state => ({
    visible: state.toolReducer.tools[TOOL_TYPE.LEVEL_CHOOSER]?.status || false,
    info: state.toolReducer.tools[TOOL_TYPE.LEVEL_CHOOSER]?.info || {},
});

const mapDispatchToProps = dispatch => ({
    dispatchClose: () => dispatch(close_tool({ tool_type: TOOL_TYPE.LEVEL_CHOOSER })),
});

export default connect(mapStateToProps, mapDispatchToProps)(LevelChooser);
