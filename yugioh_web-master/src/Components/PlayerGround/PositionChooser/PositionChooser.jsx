import React from 'react';
import { connect } from 'react-redux';
import { TOOL_TYPE } from '../../../Store/actions/actionTypes';
import { close_tool } from '../../../Store/actions/toolActions';
import { CARD_POS } from '../../Card/utils/constant';

const PositionChooser = ({ visible, info, dispatchClose }) => {
    if (!visible) return null;

    const { cardName, resolve } = info;

    const choose = (pos) => {
        dispatchClose();
        resolve(pos);
    };

    return (
        <div style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.72)',
            zIndex: 20000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
            <div style={{
                background: '#141428', border: '2px solid #4444aa',
                borderRadius: 14, padding: '28px 36px',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18,
                minWidth: 300, boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            }}>
                <div style={{ color: '#c8c8ff', fontSize: 13, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                    Choose Battle Position
                </div>
                <div style={{ color: '#e8e8ff', fontSize: 16, fontWeight: 700, textAlign: 'center' }}>
                    {cardName}
                </div>
                <div style={{ display: 'flex', gap: 14, marginTop: 4 }}>
                    <button
                        onClick={() => choose(CARD_POS.FACE)}
                        style={{
                            background: '#0d2a50', border: '2px solid #3a7ad0',
                            color: '#7ab8ff', borderRadius: 10,
                            padding: '14px 36px', fontSize: 16, fontWeight: 800,
                            cursor: 'pointer', minWidth: 110, letterSpacing: 1,
                            transition: 'all 0.1s',
                        }}
                        onMouseOver={e => { e.target.style.background = '#1a3a6a'; e.target.style.color = '#aad4ff'; }}
                        onMouseOut={e => { e.target.style.background = '#0d2a50'; e.target.style.color = '#7ab8ff'; }}
                    >
                        ATK
                    </button>
                    <button
                        onClick={() => choose(CARD_POS.DEFENSE)}
                        style={{
                            background: '#2a1010', border: '2px solid #aa3a3a',
                            color: '#ff9090', borderRadius: 10,
                            padding: '14px 36px', fontSize: 16, fontWeight: 800,
                            cursor: 'pointer', minWidth: 110, letterSpacing: 1,
                            transition: 'all 0.1s',
                        }}
                        onMouseOver={e => { e.target.style.background = '#3a1a1a'; e.target.style.color = '#ffb0b0'; }}
                        onMouseOut={e => { e.target.style.background = '#2a1010'; e.target.style.color = '#ff9090'; }}
                    >
                        DEF
                    </button>
                </div>
            </div>
        </div>
    );
};

const mapStateToProps = state => ({
    visible: state.toolReducer.tools[TOOL_TYPE.POSITION_CHOOSER]?.status || false,
    info: state.toolReducer.tools[TOOL_TYPE.POSITION_CHOOSER]?.info || {},
});

const mapDispatchToProps = dispatch => ({
    dispatchClose: () => dispatch(close_tool({ tool_type: TOOL_TYPE.POSITION_CHOOSER })),
});

export default connect(mapStateToProps, mapDispatchToProps)(PositionChooser);
