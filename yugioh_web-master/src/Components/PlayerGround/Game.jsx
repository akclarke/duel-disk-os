import React from 'react';
import { connect } from 'react-redux';

import { initialize_environment, draw_card, update_environment } from '../../Store/actions/environmentActions';
import { change_phase } from '../../Store/actions/gameMetaActions'
import { load_card_to_environment } from '../Card/utils/utils'
import { create_card_from_api } from '../../data/cardLoader'
import { CARD_TYPE, SIDE, ENVIRONMENT } from '../Card/utils/constant'
import { PHASE, PHASE_START } from '../PlayerGround/utils/constant'
import { emit_change_phase } from '../../Client/Sender'
import { logEvent, LOG_TYPE, setLogTurn } from '../../data/duelLog';
import Field from './Field/Field.jsx';
import Hand from './Hand/Hand.jsx';
import DuelLog from './DuelLog/DuelLog';
import Settings from './Settings/Settings.jsx';
import PhaseSelector from './PhaseSelector/PhaseSelector'
import HealthBar from './HealthBar/HealthBar'
import CardSelector from './CardSelector/CardSelector'
import ChainWindow from './ChainWindow/ChainWindow'
import PhaseAnimator from './PhaseSelector/PhaseAnimator'
import './Game.css';
import { TOOL_TYPE } from '../../Store/actions/actionTypes';

class Game extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            transformRotateX: '45deg',
            scale: 1.0,
            x_pos: 0,
            y_pos: -100,
        }
        this.tabFlashInterval = null;
    }

    componentDidMount() {
        this.initializeEnvironment(this.props.raw_environment);
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) this.stopTabFlash();
        });
    }

    componentWillUnmount() {
        this.stopTabFlash();
    }

    startTabFlash(message) {
        this.stopTabFlash();
        let toggle = true;
        this.tabFlashInterval = setInterval(() => {
            document.title = toggle ? message : 'Duel Disk OS';
            toggle = !toggle;
        }, 1000);
    }

    stopTabFlash() {
        if (this.tabFlashInterval) {
            clearInterval(this.tabFlashInterval);
            this.tabFlashInterval = null;
        }
        document.title = 'Duel Disk OS';
    }

    auto_next_phase(next_phase) {
        const WAIT_TIME = 2100;
        setTimeout(() => {
            const info = { next_phase };
            emit_change_phase(info);
            this.props.dispatch_change_phase(info);
        }, WAIT_TIME);
    }

    componentDidUpdate(prevProps) {
        const { game_meta, my_id, environment } = this.props;

        // ── Win condition ──────────────────────────────────────────────────
        if (environment && prevProps.environment) {
            const myHp  = environment[SIDE.MINE]?.hp ?? 8000;
            const oppHp = environment[SIDE.OPPONENT]?.hp ?? 8000;
            if (myHp <= 0 && !this._gameOver) {
                this._gameOver = true;
                setTimeout(() => alert('💀 You lose! The opponent reduced your LP to 0.'), 200);
                return;
            }
            if (oppHp <= 0 && !this._gameOver) {
                this._gameOver = true;
                setTimeout(() => alert('🏆 You win! Opponent\'s LP reached 0!'), 200);
                return;
            }
        }
        const current_phase = game_meta.current_phase;
        const current_turn = game_meta.current_turn;
        const is_my_turn = my_id === current_turn;

        // Log phase transitions
        if (current_phase !== prevProps.game_meta.current_phase) {
            const who = is_my_turn ? 'Your' : "Opponent's";
            logEvent(LOG_TYPE.PHASE, `${who} ${current_phase.replace(/_/g, ' ')}`, { phase: current_phase });
        }

        // Log turn changes and update turn counter for the log
        if (current_turn !== prevProps.game_meta.current_turn) {
            setLogTurn(game_meta.turn_count || 1);
            if (is_my_turn) {
                document.hidden
                    ? this.startTabFlash('⚔️ Your Turn!')
                    : (document.title = '⚔️ Your Turn! — Duel Disk OS');
                logEvent(LOG_TYPE.SYSTEM, '--- Your turn begins ---');
            } else {
                this.stopTabFlash();
                document.title = "Opponent's Turn — Duel Disk OS";
                logEvent(LOG_TYPE.SYSTEM, "--- Opponent's turn begins ---");
            }
            if (this.props.onTurnChange) {
                this.props.onTurnChange(current_turn, my_id);
            }
        }

        // Phase auto-progression — only active player drives phases
        if (current_phase === PHASE_START && is_my_turn) {
            this.auto_next_phase(PHASE.DRAW_PHASE);
        }

        if (current_phase !== prevProps.game_meta.current_phase) {
            if (current_phase === PHASE.DRAW_PHASE) {
                this.props.dispatch_draw_card({
                    side: is_my_turn ? SIDE.MINE : SIDE.OPPONENT,
                    amount: 1
                });
                if (is_my_turn) logEvent(LOG_TYPE.DRAW, 'You drew a card');
                // Clear per-turn position flags for the active player's monsters
                const activeSide = is_my_turn ? SIDE.MINE : SIDE.OPPONENT;
                const field = environment?.[activeSide]?.[ENVIRONMENT.MONSTER_FIELD];
                if (field) {
                    let changed = false;
                    field.forEach(c => {
                        if (c && c !== CARD_TYPE.PLACEHOLDER && (c.summoned_this_turn || c.pos_changed_this_turn)) {
                            c.summoned_this_turn = false;
                            c.pos_changed_this_turn = false;
                            changed = true;
                        }
                    });
                    if (changed) this.props.dispatch_update_environment({ ...environment });
                }
                if (is_my_turn) this.auto_next_phase(PHASE.STANDBY_PHASE);
            } else if (current_phase === PHASE.STANDBY_PHASE) {
                if (is_my_turn) this.auto_next_phase(PHASE.MAIN_PHASE_1);
            } else if (current_phase === PHASE.END_PHASE) {
                if (is_my_turn) {
                    // Trigger end-phase pendulum effects, then advance
                    this.triggerEndPhasePendulumEffects(environment).then(() => {
                        this.auto_next_phase(PHASE_START);
                    });
                } else {
                    this.auto_next_phase(PHASE_START);
                }
            }
        }
    }

    initializeEnvironment = (raw_environment) => {
        const make_placeholders = () => Array(5).fill(CARD_TYPE.PLACEHOLDER);

        const loaded_card_env = raw_environment.decks.map(deck =>
            deck.deck.map(card_key => {
                try { return load_card_to_environment(create_card_from_api(card_key)); }
                catch (e) { console.warn(`[Game] Could not load card ${card_key}:`, e); return null; }
            }).filter(Boolean)
        );

        const load_extra_card_env = raw_environment.decks.map(deck =>
            deck.extra_deck.map(card_key => {
                try { return load_card_to_environment(create_card_from_api(card_key)); }
                catch (e) { console.warn(`[Game] Could not load extra deck card ${card_key}:`, e); return null; }
            }).filter(Boolean)
        );

        const mine_index     = raw_environment.first_side === SIDE.MINE ? 0 : 1;
        const opponent_index = raw_environment.first_side === SIDE.OPPONENT ? 0 : 1;

        const environment = {
            [SIDE.MINE]: {
                [ENVIRONMENT.HAND]:              loaded_card_env[mine_index].slice(0, 5),
                [ENVIRONMENT.MONSTER_FIELD]:     make_placeholders(),
                [ENVIRONMENT.SPELL_FIELD]:       make_placeholders(),
                [ENVIRONMENT.GRAVEYARD]:         [],
                [ENVIRONMENT.DECK]:              loaded_card_env[mine_index].slice(5),
                [ENVIRONMENT.EXTRA_DECK]:        load_extra_card_env[mine_index],
                [ENVIRONMENT.PENDULUM_ZONE]:     [null, null],
                [ENVIRONMENT.EXTRA_MONSTER_ZONE]:[null, null],
                hp: 8000,
            },
            [SIDE.OPPONENT]: {
                [ENVIRONMENT.HAND]:              loaded_card_env[opponent_index].slice(0, 5),
                [ENVIRONMENT.MONSTER_FIELD]:     make_placeholders(),
                [ENVIRONMENT.SPELL_FIELD]:       make_placeholders(),
                [ENVIRONMENT.GRAVEYARD]:         [],
                [ENVIRONMENT.DECK]:              loaded_card_env[opponent_index].slice(5),
                [ENVIRONMENT.EXTRA_DECK]:        load_extra_card_env[opponent_index],
                [ENVIRONMENT.PENDULUM_ZONE]:     [null, null],
                [ENVIRONMENT.EXTRA_MONSTER_ZONE]:[null, null],
                hp: 8000,
            },
            monsters: {}, spells: {}, traps: {}, environment_spell: {},
        };

        console.log('[Game] Environment initialized:', environment);
        this.props.initialize(environment);
    }

    triggerEndPhasePendulumEffects = async (environment) => {
        const pendZone = environment?.[SIDE.MINE]?.[ENVIRONMENT.PENDULUM_ZONE] || [];
        for (const cardEnv of pendZone) {
            if (!cardEnv?.card?.pendulumEffect) continue;
            const cardName = cardEnv.card.name;
            const pendDesc = cardEnv.card.pendDesc || '(Pendulum effect)';
            const wantsToActivate = window.confirm(
                `End Phase — Activate ${cardName}'s Pendulum Effect?\n\n${pendDesc}`
            );
            if (wantsToActivate) {
                try {
                    await cardEnv.card.pendulumEffect(environment, cardEnv);
                } catch (e) {
                    console.warn('[Game] Pendulum end effect error:', e);
                }
            }
        }
    };

    getTransformRotateXValue = (event, value) => {
        const valueString = `${value}deg`;
        if (valueString !== this.state.transformRotateX) this.setState({ transformRotateX: valueString });
    };

    onChangeSize = (value) => {
        const { scale } = this.state;
        if (value === 'increase' && scale < 1.4) this.setState({ scale: scale + 0.1 });
        else if (value !== 'increase' && scale > 0.7) this.setState({ scale: scale - 0.1 });
    }

    onChangePosition = (value) => {
        const { x_pos, y_pos } = this.state;
        const M = 10;
        if      (value === 'up')    this.setState({ y_pos: y_pos - M });
        else if (value === 'down')  this.setState({ y_pos: y_pos + M });
        else if (value === 'left')  this.setState({ x_pos: x_pos - M });
        else if (value === 'right') this.setState({ x_pos: x_pos + M });
        else                        this.setState({ x_pos: 0, y_pos: 0 });
    }

    render() {
        const { transformRotateX, scale, x_pos, y_pos } = this.state;
        const { tools } = this.props;
        return (
            <div className="game_container">
                <div className="field_settings_container">
                    <PhaseAnimator />
                    <CardSelector
                        key={"selector-" + Math.random()}
                        show_card_selector={tools[TOOL_TYPE.CARD_SELECTOR].status}
                        card_selector_info={tools[TOOL_TYPE.CARD_SELECTOR].info}
                    />
                    <ChainWindow />
                    <HealthBar side='MINE' />
                    <HealthBar side='OPPONENT' />
                    <PhaseSelector />
                    <DuelLog />
                    <div className="hand_field_container">
                        <Hand side='OPPONENT' />
                        <div className="field_container">
                            <Field transformRotateX={transformRotateX} scale={scale} x_pos={x_pos} y_pos={y_pos} call_card_selector={this.call_card_selector} />
                        </div>
                        <Hand side='MINE' call_card_selector={this.call_card_selector} />
                    </div>
                    <Settings onChangePosition={this.onChangePosition} onChangeSize={this.onChangeSize} getTransformRotateXValue={this.getTransformRotateXValue} />
                </div>
            </div>
        );
    }
}

const mapStateToProps = state => {
    const { environment } = state.environmentReducer;
    const { game_meta } = state.gameMetaReducer;
    const { my_id } = state.serverReducer;
    const { tools } = state.toolReducer;
    return { environment, game_meta, my_id, tools };
};

const mapDispatchToProps = dispatch => ({
    initialize: (environment) => dispatch(initialize_environment(environment)),
    dispatch_draw_card: (info) => dispatch(draw_card(info)),
    dispatch_change_phase: (info) => dispatch(change_phase(info)),
    dispatch_update_environment: (env) => dispatch(update_environment(env)),
});

export default connect(mapStateToProps, mapDispatchToProps)(Game);