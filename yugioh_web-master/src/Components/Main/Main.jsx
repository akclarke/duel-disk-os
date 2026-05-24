import React from 'react';
import Game from '../PlayerGround/Game';
import LeftPanel from './LeftPanel/LeftPanel';
import { exchange_deck_with_opponent } from '../../Client/Sender';
import { shuffle } from '../PlayerGround/utils/utils';
import { PHASE_START } from '../PlayerGround/utils/constant';
import { initialize_meta } from '../../Store/actions/gameMetaActions';
import { get_opponent_id } from '../../Store/actions/serverActions';
import { connect } from 'react-redux';
import './Main.css';
import { SIDE } from '../Card/utils/constant';
import Sky from 'react-sky';

import ModeSelect, { GAME_MODE } from './ModeSelect/ModeSelect';
import DeckSelect from './DeckSelect/DeckSelect';
import { preloadDeckCards } from '../../data/cardLoader';
import CPUPlayer from '../../AI/CPUPlayer';
import OfflineAdapter from '../../Client/OfflineAdapter';
import { DECK_REGISTRY } from '../../data/deckRegistry';

import yugi_sky from './assets/yugi_sky.png';
import jaden_sky from './assets/jaden_sky.png';
import neos_sky from './assets/neos_sky.png';
import yusei_sky from './assets/yusei_sky.png';

const SCREEN = {
    MODE_SELECT:      'MODE_SELECT',
    DECK_SELECT_P1:   'DECK_SELECT_P1',
    DECK_SELECT_CPU1: 'DECK_SELECT_CPU1',
    DECK_SELECT_CPU2: 'DECK_SELECT_CPU2',
    LOADING:          'LOADING',
    WAITING_PVP:      'WAITING_PVP',
    GAME:             'GAME',
};

class Main extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            screen: SCREEN.MODE_SELECT,
            gameMode: null,
            playerDeck: null,
            cpuDeck1: null,
            cpuDeck2: null,
            loadingProgress: 0,
            loadingTotal: 0,
            loadingError: null,
        };
        this.raw_environment = null;
        this.my_deck = null;
        this.cpu1 = null;
        this.cpu2 = null;
    }

    // ── PvP: react to server matching us with an opponent ─────────────────────
    componentDidUpdate(prevProps) {
        if (this.state.gameMode !== GAME_MODE.PVP) return;

        if (this.props.opponent_id && this.props.opponent_id !== prevProps.opponent_id) {
            const deck = this.state.playerDeck || DECK_REGISTRY.ELEMENTAL_HERO;
            this.my_deck = {
                deck: shuffle([...deck.deck]),
                extra_deck: [...deck.extra_deck]
            };
            exchange_deck_with_opponent(this.my_deck);
        }

        if (this.props.opponent_deck && this.props.opponent_deck !== prevProps.opponent_deck) {
            this.raw_environment = {
                decks: [
                    this.props.my_id === this.props.player_starts ? this.my_deck : this.props.opponent_deck,
                    this.props.opponent_id === this.props.player_starts ? this.my_deck : this.props.opponent_deck,
                ],
                first_side: this.props.my_id === this.props.player_starts ? SIDE.MINE : SIDE.OPPONENT
            };
            this.props.dispatch_initialize_meta({
                current_turn: this.props.player_starts,
                current_phase: PHASE_START,
                my_id: this.props.my_id,
                opponent_id: this.props.opponent_id
            });
            this.setState({ screen: SCREEN.GAME });
        }
    }

    // ── Mode selection ────────────────────────────────────────────────────────
    onSelectMode = (mode) => {
        this.setState({ gameMode: mode });
        if (mode === GAME_MODE.PVP) {
            this.setState({ screen: SCREEN.WAITING_PVP });
        } else if (mode === GAME_MODE.PV_CPU) {
            this.setState({ screen: SCREEN.DECK_SELECT_P1 });
        } else if (mode === GAME_MODE.CPU_CPU) {
            this.setState({ screen: SCREEN.DECK_SELECT_CPU1 });
        }
    }

    // ── Deck selection ────────────────────────────────────────────────────────
    onSelectPlayerDeck = async (deck) => {
        const cpuDeck = DECK_REGISTRY.ELEMENTAL_HERO; // CPU always plays Elemental HEROs for now
        this.setState({ playerDeck: deck, screen: SCREEN.LOADING });
        await this._loadAndStart(deck, cpuDeck);
    }

    onSelectCPU1Deck = (deck) => {
        this.setState({ cpuDeck1: deck, screen: SCREEN.DECK_SELECT_CPU2 });
    }

    onSelectCPU2Deck = async (deck) => {
        this.setState({ cpuDeck2: deck, screen: SCREEN.LOADING });
        await this._loadAndStart(this.state.cpuDeck1, deck);
    }

    // ── Load cards from API then start game ───────────────────────────────────
    _loadAndStart = async (deck1, deck2) => {
        const allIds = [
            ...deck1.deck, ...deck1.extra_deck,
            ...deck2.deck, ...deck2.extra_deck
        ];

        try {
            await preloadDeckCards(allIds, (loaded, total) => {
                this.setState({ loadingProgress: loaded, loadingTotal: total });
            });
        } catch (err) {
            console.error('[Main] Card loading failed:', err);
            this.setState({
                screen: SCREEN.MODE_SELECT,
                loadingError: 'Failed to load card data. Check your internet connection and try again.',
                gameMode: null
            });
            return;
        }

        this._startOfflineGame(deck1, deck2);
    }

    _startOfflineGame(deck1, deck2) {
        OfflineAdapter.enable();
        const { gameMode } = this.state;
        const p1Id = 'player_1';
        const p2Id = gameMode === GAME_MODE.PV_CPU ? 'cpu_1' : 'cpu_2';

        this.raw_environment = {
            decks: [
                { deck: shuffle([...deck1.deck]), extra_deck: [...deck1.extra_deck] },
                { deck: shuffle([...deck2.deck]), extra_deck: [...deck2.extra_deck] },
            ],
            first_side: SIDE.MINE
        };

        // Set my_id in serverReducer so Game.jsx knows who the human player is
        this.props.dispatch_get_opponent_id({
            my_id: p1Id,
            opponent_id: p2Id,
            player_starts: p1Id
        });

        this.props.dispatch_initialize_meta({
            current_turn: p1Id,
            current_phase: PHASE_START,
            my_id: p1Id,
            opponent_id: p2Id
        });

        // Set up CPU
        if (gameMode === GAME_MODE.PV_CPU) {
            this.cpu1 = new CPUPlayer(SIDE.OPPONENT, true);
        } else if (gameMode === GAME_MODE.CPU_CPU) {
            this.cpu1 = new CPUPlayer(SIDE.MINE, false);
            this.cpu2 = new CPUPlayer(SIDE.OPPONENT, true);
        }

        this.setState({ screen: SCREEN.GAME });
    }

    // ── Called by Game.jsx when turn changes ──────────────────────────────────
    onTurnChange = (currentTurnId) => {
        const { gameMode } = this.state;
        if (!gameMode || gameMode === GAME_MODE.PVP) return;

        if (gameMode === GAME_MODE.PV_CPU && currentTurnId === 'cpu_1' && this.cpu1) {
            this.cpu1.takeTurn();
        }
        if (gameMode === GAME_MODE.CPU_CPU) {
            if (currentTurnId === 'player_1' && this.cpu1) this.cpu1.takeTurn();
            if (currentTurnId === 'cpu_2' && this.cpu2) this.cpu2.takeTurn();
        }
    }

    // ── Render ────────────────────────────────────────────────────────────────
    render() {
        const { screen, loadingProgress, loadingTotal, loadingError, cpuDeck1 } = this.state;

        if (screen === SCREEN.MODE_SELECT) {
            return (
                <>
                    {loadingError && (
                        <div style={{ background: '#f44', color: 'white', padding: '12px 20px', textAlign: 'center' }}>
                            {loadingError}
                        </div>
                    )}
                    <ModeSelect onSelectMode={this.onSelectMode} />
                </>
            );
        }

        if (screen === SCREEN.DECK_SELECT_P1) {
            return (
                <DeckSelect
                    title="Choose Your Deck"
                    onSelect={this.onSelectPlayerDeck}
                    onBack={() => { OfflineAdapter.disable(); this.setState({ screen: SCREEN.MODE_SELECT }); }}
                />
            );
        }

        if (screen === SCREEN.DECK_SELECT_CPU1) {
            return (
                <DeckSelect
                    title="Choose CPU 1's Deck"
                    onSelect={this.onSelectCPU1Deck}
                    onBack={() => { OfflineAdapter.disable(); this.setState({ screen: SCREEN.MODE_SELECT }); }}
                />
            );
        }

        if (screen === SCREEN.DECK_SELECT_CPU2) {
            return (
                <DeckSelect
                    title="Choose CPU 2's Deck"
                    onSelect={this.onSelectCPU2Deck}
                    selectedDeckId={cpuDeck1?.id}
                    onBack={() => this.setState({ screen: SCREEN.DECK_SELECT_CPU1 })}
                />
            );
        }

        if (screen === SCREEN.LOADING) {
            const pct = loadingTotal > 0 ? Math.round((loadingProgress / loadingTotal) * 100) : 0;
            return (
                <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    justifyContent: 'center', minHeight: '100vh',
                    background: '#0a0a1a', color: 'white', fontFamily: 'Lato, sans-serif', gap: 20
                }}>
                    <h2>🎴 Loading Card Data...</h2>
                    <div style={{ width: 300, height: 12, background: '#222', borderRadius: 6, overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: '#f0c040', transition: 'width 0.3s ease' }} />
                    </div>
                    <p style={{ color: '#aaa', fontSize: '0.85rem' }}>
                        {loadingProgress} / {loadingTotal} cards • {pct}%
                    </p>
                </div>
            );
        }

        if (screen === SCREEN.WAITING_PVP) {
            return (
                <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    justifyContent: 'center', minHeight: '100vh',
                    background: '#0a0a1a', color: 'white', fontFamily: 'Lato, sans-serif', gap: 20
                }}>
                    <h2>⚔️ Finding Opponent...</h2>
                    <p style={{ color: '#aaa' }}>Waiting for another player to connect</p>
                    <button onClick={() => { OfflineAdapter.disable(); this.setState({ screen: SCREEN.MODE_SELECT, gameMode: null }); }}
                        style={{
                            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)',
                            color: 'white', padding: '8px 20px', borderRadius: 8, cursor: 'pointer',
                            fontFamily: 'Lato, sans-serif', fontSize: '0.9rem'
                        }}>
                        Cancel
                    </button>
                </div>
            );
        }

        if (screen === SCREEN.GAME && this.raw_environment) {
            return (
                <div className="main_container">
                    <div style={{ position: 'absolute', width: '100%', height: '100%', zIndex: '-10' }}>
                        <Sky
                            images={{ 0: yugi_sky, 1: jaden_sky, 2: yusei_sky, 3: neos_sky }}
                            how={30} time={20} size={'200px'} background={'#f2f2f2'}
                        />
                    </div>
                    <LeftPanel />
                    <Game
                        raw_environment={this.raw_environment}
                        onTurnChange={this.onTurnChange}
                    />
                </div>
            );
        }

        return <div style={{ color: 'white', padding: 40, background: '#0a0a1a', minHeight: '100vh' }}>Loading...</div>;
    }
}

const mapStateToProps = state => {
    const { opponent_id, my_id, player_starts, opponent_deck } = state.serverReducer;
    return { opponent_id, my_id, player_starts, opponent_deck };
};

const mapDispatchToProps = dispatch => ({
    dispatch_initialize_meta: (game_meta) => dispatch(initialize_meta(game_meta)),
    dispatch_get_opponent_id: (info) => dispatch(get_opponent_id(info))
});

export default connect(mapStateToProps, mapDispatchToProps)(Main);