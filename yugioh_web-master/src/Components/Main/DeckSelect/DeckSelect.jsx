/**
 * DeckSelect.jsx
 * 
 * Deck selection screen shown before CPU modes start.
 * Shows all deck recipes — available ones selectable, locked ones say "Coming Soon".
 * 
 * Place at: src/Components/Main/DeckSelect/DeckSelect.jsx
 */

import React from 'react';
import { getAllDecks } from '../../../data/deckRegistry';
import './DeckSelect.css';

// Era color coding
const ERA_COLORS = {
    'DM':    '#c8a400',  // gold
    'GX':    '#006abe',  // blue
    '5DS':   '#9a0000',  // red
    'ZEXAL': '#ff7f00',  // orange
    'ARC-V': '#7a00c8',  // purple
};

class DeckSelect extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            hoveredDeck: null,
            selectedDeck: null,
        };
    }

    render() {
        const { title, onSelect, onBack, selectedDeckId } = this.props;
        const { hoveredDeck } = this.state;
        const decks = getAllDecks();

        const previewDeck = hoveredDeck || decks.find(d => d.id === selectedDeckId) || null;

        return (
            <div className="deck_select_container">
                <div className="deck_select_header">
                    <button className="deck_select_back" onClick={onBack}>← Back</button>
                    <h2>{title || 'Select Your Deck'}</h2>
                    <div style={{width: 80}} /> {/* spacer */}
                </div>

                <div className="deck_select_body">
                    {/* Left — deck grid */}
                    <div className="deck_grid">
                        {decks.map(deck => (
                            <div
                                key={deck.id}
                                className={`deck_tile ${!deck.available ? 'deck_tile_locked' : ''} ${selectedDeckId === deck.id ? 'deck_tile_selected' : ''}`}
                                onClick={() => deck.available && onSelect(deck)}
                                onMouseEnter={() => this.setState({ hoveredDeck: deck })}
                                onMouseLeave={() => this.setState({ hoveredDeck: null })}
                                title={!deck.available ? 'Coming Soon' : deck.name}
                            >
                                <span className="deck_tile_icon">{deck.icon}</span>
                                <span className="deck_tile_name">{deck.name}</span>
                                <span
                                    className="deck_tile_era"
                                    style={{ color: ERA_COLORS[deck.era] || '#aaa' }}>
                                    {deck.era}
                                </span>
                                {!deck.available && (
                                    <div className="deck_tile_lock">🔒 Coming Soon</div>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Right — preview panel */}
                    <div className="deck_preview">
                        {previewDeck ? (
                            <>
                                <div className="deck_preview_icon">{previewDeck.icon}</div>
                                <h3>{previewDeck.name}</h3>
                                <span
                                    className="deck_preview_era"
                                    style={{ color: ERA_COLORS[previewDeck.era] || '#aaa' }}>
                                    Yu-Gi-Oh! {previewDeck.era}
                                </span>
                                <p className="deck_preview_desc">{previewDeck.description}</p>

                                {previewDeck.available ? (
                                    <>
                                        <div className="deck_preview_stats">
                                            <span>Main Deck: {previewDeck.deck.length}</span>
                                            <span>Extra Deck: {previewDeck.extra_deck.length}</span>
                                        </div>
                                        <button
                                            className="deck_preview_select_btn"
                                            onClick={() => onSelect(previewDeck)}>
                                            Select This Deck
                                        </button>
                                    </>
                                ) : (
                                    <div className="deck_preview_coming_soon">
                                        🔒 Coming Soon
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="deck_preview_empty">
                                <p>Hover a deck to preview it</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }
}

export default DeckSelect;


/* ═══════════════════════════════════════════════════════════════
   DeckSelect.css — save as DeckSelect/DeckSelect.css
   ═══════════════════════════════════════════════════════════════

.deck_select_container {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    background: linear-gradient(135deg, #0a0a1a 0%, #1a1a3a 50%, #0a0a1a 100%);
    color: white;
    font-family: Lato, sans-serif;
}

.deck_select_header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 32px;
    border-bottom: 1px solid rgba(255,255,255,0.1);
}

.deck_select_header h2 {
    font-size: 1.4rem;
    font-weight: 800;
    margin: 0;
    color: #f0c040;
}

.deck_select_back {
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.2);
    color: white;
    padding: 8px 16px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 0.9rem;
    font-family: Lato, sans-serif;
    transition: background 0.2s;
}

.deck_select_back:hover {
    background: rgba(255,255,255,0.15);
}

.deck_select_body {
    display: flex;
    flex: 1;
    gap: 0;
    overflow: hidden;
}

.deck_grid {
    flex: 1;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 12px;
    padding: 24px;
    overflow-y: auto;
    align-content: start;
}

.deck_tile {
    background: rgba(255,255,255,0.05);
    border: 2px solid rgba(255,255,255,0.08);
    border-radius: 12px;
    padding: 16px 12px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    transition: transform 0.15s, border-color 0.15s, box-shadow 0.15s;
    position: relative;
    text-align: center;
    min-height: 110px;
}

.deck_tile:hover:not(.deck_tile_locked) {
    transform: translateY(-3px);
    border-color: #f0c040;
    box-shadow: 0 6px 20px rgba(240, 192, 64, 0.2);
}

.deck_tile_selected {
    border-color: #f0c040 !important;
    background: rgba(240, 192, 64, 0.1) !important;
}

.deck_tile_locked {
    opacity: 0.45;
    cursor: default;
}

.deck_tile_icon { font-size: 1.8rem; }
.deck_tile_name { font-size: 0.78rem; font-weight: 700; line-height: 1.3; }
.deck_tile_era  { font-size: 0.65rem; font-weight: 600; }

.deck_tile_lock {
    position: absolute;
    bottom: 6px;
    font-size: 0.6rem;
    color: #888;
}

.deck_preview {
    width: 280px;
    min-width: 280px;
    border-left: 1px solid rgba(255,255,255,0.1);
    padding: 32px 24px;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 12px;
}

.deck_preview_icon { font-size: 4rem; }

.deck_preview h3 {
    font-size: 1.3rem;
    font-weight: 800;
    margin: 0;
}

.deck_preview_era {
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 1px;
    text-transform: uppercase;
}

.deck_preview_desc {
    font-size: 0.85rem;
    color: #bbb;
    line-height: 1.6;
    margin: 0;
}

.deck_preview_stats {
    display: flex;
    gap: 20px;
    font-size: 0.8rem;
    color: #aaa;
}

.deck_preview_select_btn {
    background: #f0c040;
    color: #1a1a1a;
    border: none;
    padding: 12px 28px;
    border-radius: 8px;
    font-size: 0.95rem;
    font-weight: 800;
    cursor: pointer;
    font-family: Lato, sans-serif;
    transition: background 0.2s, transform 0.15s;
    margin-top: 8px;
}

.deck_preview_select_btn:hover {
    background: #ffd060;
    transform: scale(1.03);
}

.deck_preview_coming_soon {
    font-size: 0.9rem;
    color: #888;
    padding: 12px 20px;
    border: 1px dashed #444;
    border-radius: 8px;
}

.deck_preview_empty {
    color: #555;
    font-size: 0.9rem;
    margin-top: 40px;
}

*/
