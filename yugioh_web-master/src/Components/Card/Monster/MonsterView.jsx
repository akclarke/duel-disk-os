import React from 'react';
import './MonsterView.css'

class MonsterView extends React.Component {
    render() {
        const { card, style } = this.props;
        if (!card) return null;

        const materialCount = card.xyz_materials?.length ?? 0;

        return (
            <div style={{ position: 'relative', display: 'inline-block', width: '100%' }}>
                <img
                    style={style}
                    className="field_card"
                    key={`card_${card.unique_count}`}
                    src={'https://ygoprodeck.com/pics/' + card.card.key + '.jpg'}
                    alt={card.card.name}
                />
                {materialCount > 0 && (
                    <div style={{
                        position: 'absolute', bottom: 2, left: 2,
                        background: 'rgba(20,0,40,0.88)',
                        border: '1px solid #c060ff',
                        borderRadius: 10, padding: '1px 5px',
                        fontSize: 9, color: '#e0a0ff', fontWeight: 700,
                        lineHeight: 1.4, pointerEvents: 'none',
                    }}>
                        ◆{materialCount}
                    </div>
                )}
            </div>
        );
    }
}

export default MonsterView;
