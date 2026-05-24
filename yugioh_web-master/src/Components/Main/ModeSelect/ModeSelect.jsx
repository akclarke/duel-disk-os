/**
 * ModeSelect.jsx
 * 
 * The main menu shown before a duel starts.
 * Replaces the "Please wait for an opponent" screen.
 * 
 * Place this file at:
 *   src/Components/Main/ModeSelect/ModeSelect.jsx
 * 
 * Also create ModeSelect.css in the same folder (contents below).
 */

import React from 'react';
import './ModeSelect.css';

export const GAME_MODE = {
    PVP:     'PVP',      // Player vs Player (online matchmaking)
    PV_CPU:  'PV_CPU',   // Player vs CPU
    CPU_CPU: 'CPU_CPU',  // CPU vs CPU (spectate)
};

class ModeSelect extends React.Component {
    render() {
        const { onSelectMode } = this.props;

        return (
            <div className="mode_select_container">
                <div className="mode_select_title">
                    <h1>🎴 Duel Disk OS</h1>
                    <p>Select a game mode</p>
                </div>

                <div className="mode_select_cards">
                    <div className="mode_card mode_card_pvp" onClick={() => onSelectMode(GAME_MODE.PVP)}>
                        <div className="mode_card_icon">⚔️</div>
                        <h2>Player vs Player</h2>
                        <p>Duel a real opponent online.<br/>Waiting for matchmaking...</p>
                        <div className="mode_card_badge mode_badge_online">ONLINE</div>
                    </div>

                    <div className="mode_card mode_card_cpu" onClick={() => onSelectMode(GAME_MODE.PV_CPU)}>
                        <div className="mode_card_icon">🤖</div>
                        <h2>Player vs CPU</h2>
                        <p>Choose your deck and duel<br/>against the AI.</p>
                        <div className="mode_card_badge mode_badge_offline">OFFLINE</div>
                    </div>

                    <div className="mode_card mode_card_spectate" onClick={() => onSelectMode(GAME_MODE.CPU_CPU)}>
                        <div className="mode_card_icon">👁️</div>
                        <h2>CPU vs CPU</h2>
                        <p>Watch two AI decks battle<br/>each other. Great for testing.</p>
                        <div className="mode_card_badge mode_badge_offline">OFFLINE</div>
                    </div>
                </div>
            </div>
        );
    }
}

export default ModeSelect;


/* ═══════════════════════════════════════════════════════════════
   ModeSelect.css — save as ModeSelect/ModeSelect.css
   ═══════════════════════════════════════════════════════════════

.mode_select_container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    background: linear-gradient(135deg, #0a0a1a 0%, #1a1a3a 50%, #0a0a1a 100%);
    color: white;
    font-family: Lato, sans-serif;
}

.mode_select_title {
    text-align: center;
    margin-bottom: 48px;
}

.mode_select_title h1 {
    font-size: 3rem;
    font-weight: 900;
    letter-spacing: 2px;
    margin: 0;
    background: linear-gradient(90deg, #f0c040, #ffffff, #f0c040);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
}

.mode_select_title p {
    font-size: 1.1rem;
    color: #aaa;
    margin: 8px 0 0 0;
}

.mode_select_cards {
    display: flex;
    gap: 24px;
    flex-wrap: wrap;
    justify-content: center;
    padding: 0 24px;
}

.mode_card {
    background: rgba(255,255,255,0.05);
    border: 2px solid rgba(255,255,255,0.1);
    border-radius: 16px;
    padding: 36px 28px;
    width: 220px;
    text-align: center;
    cursor: pointer;
    transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
    position: relative;
}

.mode_card:hover {
    transform: translateY(-6px);
    border-color: #f0c040;
    box-shadow: 0 12px 40px rgba(240, 192, 64, 0.3);
}

.mode_card_icon {
    font-size: 3rem;
    margin-bottom: 12px;
}

.mode_card h2 {
    font-size: 1.1rem;
    font-weight: 800;
    margin: 0 0 8px 0;
}

.mode_card p {
    font-size: 0.85rem;
    color: #aaa;
    line-height: 1.5;
    margin: 0;
}

.mode_card_badge {
    position: absolute;
    top: 12px;
    right: 12px;
    font-size: 0.65rem;
    font-weight: 800;
    padding: 3px 8px;
    border-radius: 20px;
    letter-spacing: 0.5px;
}

.mode_badge_online {
    background: #2a6a2a;
    color: #7fff7f;
}

.mode_badge_offline {
    background: #2a2a6a;
    color: #7f7fff;
}

*/
