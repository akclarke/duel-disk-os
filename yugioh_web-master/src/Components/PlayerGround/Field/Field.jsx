import React from 'react';
import { connect } from 'react-redux';
import Side from './Side/Side';
import { end_battle, opponent_attack_ack } from "../../../Store/actions/battleMetaActions";
import { emit_attack_ack } from '../../../Client/Sender';
import { OfflineAdapter } from '../../../Client/OfflineAdapter';
import { SIDE, ENVIRONMENT } from '../../Card/utils/constant';
import { DST_DIRECT_ATTACK, BATTLE_STEP } from '../utils/constant';
import { perform_attack, update_environment } from '../../../Store/actions/environmentActions';
import Core from '../../../Core';
import { BATTLE_SELECT } from './utils/constant';
import { getAttackTriggerTraps } from '../../../data/triggerRegistry';
import { get_unique_id_from_ennvironment } from '../utils/utils';
import store from '../../../Store/store';
import './Field.css';

class Field extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            battle_animation: {},
            battle_selection: {},
            // trap_window: null means no window
            // trap_window: { traps, attackerCardEnv, attackerIndex, isOpponentAttack, isOffline }
            trap_window: null,
            trap_resolved: false, // prevents double-fire after trap window closes
        };
    }

    updateBattleSelection = (type, info) => {
        if (type === BATTLE_SELECT.START_SELECT) {
            const { environment } = this.props;
            this.setState({
                battle_selection: {
                    cards: Core.Utils.get_monsters_to_be_attacked(environment),
                    src_monster: info.src_monster,
                    src_monster_index: info.src_monster_index
                }
            });
        } else if (type === BATTLE_SELECT.MOUSE_IN_SELECT) {
            this.setState({ battle_selection: { ...this.state.battle_selection, mouse_in: info.mouse_in } });
        } else if (type === BATTLE_SELECT.CONFIRM_SELECT) {
            this.setState({ battle_selection: { ...this.state.battle_selection, selection: info.selection } });
        } else {
            this.setState({ battle_selection: {} });
        }
    };

    componentDidUpdate(prevProps) {
        const curr = this.props.battle_meta;
        const prev = prevProps.battle_meta;

        // ── Attack declared → START_STEP ────────────────────────────────────
        // Only fire when battle_meta transitions from nothing → START_STEP
        if (curr && !prev && curr.battle_step === BATTLE_STEP.START_STEP) {
            const isOpponentAttack = curr.side === SIDE.OPPONENT;
            const isOffline = OfflineAdapter.isEnabled();

            if (isOpponentAttack || isOffline) {
                // Only check MINE's traps when OPPONENT is the attacker
                // (When MINE attacks, show opponent trap window in a future feature)
                if (isOpponentAttack) {
                    const { environment } = this.props;
                    const traps = getAttackTriggerTraps(environment, SIDE.MINE);
                    const { src_index } = Core.Battle.get_battle_index(
                        curr.src_monster, curr.dst, curr.side, environment
                    );
                    const attackerCardEnv = environment[curr.side]?.[ENVIRONMENT.MONSTER_FIELD]?.[src_index];

                    if (traps.length > 0) {
                        // PAUSE — show trap activation window. Do NOT proceed until player decides.
                        this.setState({
                            trap_window: { traps, attackerCardEnv, attackerIndex: src_index, isOpponentAttack, isOffline },
                            trap_resolved: false,
                        });
                        return; // <-- critical: stop here, do not call _proceedToDamageStep
                    }
                }

                // No traps (or MINE is attacker in offline) — proceed immediately
                this._proceedToDamageStep(isOpponentAttack, isOffline);
            }
        }

        // ── Damage step ready → resolve battle ───────────────────────────────
        if (curr && prev &&
            curr.battle_step === BATTLE_STEP.DAMAGE_STEP &&
            curr.battle_step !== prev.battle_step) {

            this.setState({ battle_animation: { key: Math.random(), ...curr } });
            setTimeout(() => {
                this.props.dispatch_perform_attack({ ...curr });
                this.props.dispatch_end_battle();
            }, 300);
        }
    }

    _proceedToDamageStep = (isOpponentAttack, isOffline) => {
        if (isOpponentAttack && !isOffline) emit_attack_ack();
        this.props.dispatch_change_to_damage_step({ environment: this.props.environment });
    };

    handleTrapActivate = (cardEnv, trigger) => {
        const { attackerCardEnv, attackerIndex, isOpponentAttack, isOffline } = this.state.trap_window;

        const freshEnv = store.getState().environmentReducer.environment;
        const cloned = {
            ...freshEnv,
            [SIDE.MINE]: {
                ...freshEnv[SIDE.MINE],
                [ENVIRONMENT.MONSTER_FIELD]: [...freshEnv[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD]],
                [ENVIRONMENT.SPELL_FIELD]:   [...freshEnv[SIDE.MINE][ENVIRONMENT.SPELL_FIELD]],
                [ENVIRONMENT.GRAVEYARD]:     [...freshEnv[SIDE.MINE][ENVIRONMENT.GRAVEYARD]],
                [ENVIRONMENT.DECK]:          [...freshEnv[SIDE.MINE][ENVIRONMENT.DECK]],
            },
            [SIDE.OPPONENT]: {
                ...freshEnv[SIDE.OPPONENT],
                [ENVIRONMENT.MONSTER_FIELD]: [...freshEnv[SIDE.OPPONENT][ENVIRONMENT.MONSTER_FIELD]],
                [ENVIRONMENT.GRAVEYARD]:     [...freshEnv[SIDE.OPPONENT][ENVIRONMENT.GRAVEYARD]],
            },
        };

        // Remove the activated trap from the S/T field → GY
        const stField = cloned[SIDE.MINE][ENVIRONMENT.SPELL_FIELD];
        const trapSlotIdx = stField.findIndex(c =>
            c?.card && get_unique_id_from_ennvironment(c) === get_unique_id_from_ennvironment(cardEnv));
        if (trapSlotIdx !== -1) {
            cloned[SIDE.MINE][ENVIRONMENT.GRAVEYARD].push(stField[trapSlotIdx]);
            stField[trapSlotIdx] = { card: null };
        }

        const finish = () => {
            this.props.dispatch_update_environment(cloned);
            this.setState({ trap_window: null, trap_resolved: true });
            // Short pause so player can see result, then proceed to damage step
            setTimeout(() => {
                const curr = this.props.battle_meta;
                if (curr) this._proceedToDamageStep(isOpponentAttack, isOffline);
            }, 600);
        };

        try {
            const result = trigger.operation(cloned, SIDE.MINE, attackerCardEnv, attackerIndex);
            if (result && typeof result.then === 'function') {
                result.then(finish).catch(finish);
            } else {
                finish();
            }
        } catch (e) {
            console.error('[Trap] activation error:', e);
            finish();
        }
    };

    handleTrapPass = () => {
        const { isOpponentAttack, isOffline } = this.state.trap_window;
        this.setState({ trap_window: null, trap_resolved: true });
        const curr = this.props.battle_meta;
        if (curr) this._proceedToDamageStep(isOpponentAttack, isOffline);
    };

    renderTrapWindow = () => {
        const { trap_window } = this.state;
        if (!trap_window) return null;
        const { traps, attackerCardEnv } = trap_window;

        const attackerName = attackerCardEnv?.card?.name ?? 'a monster';
        const attackerAtk  = attackerCardEnv?.current_atk ?? attackerCardEnv?.card?.atk ?? '?';

        return (
            <div style={{
                position: 'fixed', inset: 0,
                background: 'rgba(0,0,0,0.82)',
                zIndex: 9999,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
                <div style={{
                    background: '#12121f',
                    border: '2px solid #c0392b',
                    borderRadius: 14,
                    padding: 28,
                    maxWidth: 520,
                    width: '92%',
                    boxShadow: '0 0 40px rgba(192,57,43,0.4)',
                }}>
                    {/* Header */}
                    <div style={{ marginBottom: 18 }}>
                        <h3 style={{ color: '#e74c3c', margin: '0 0 6px', fontSize: 18, letterSpacing: 1 }}>
                            ⚡ Attack Declared
                        </h3>
                        <p style={{ color: '#aaa', margin: 0, fontSize: 13 }}>
                            Opponent's <strong style={{ color: '#e2e2e2' }}>{attackerName}</strong>
                            {' '}(ATK {attackerAtk}) is attacking. Activate a trap?
                        </p>
                    </div>

                    {/* Trap card buttons */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                        {traps.map(({ cardEnv, trigger }) => {
                            const img = cardEnv.card?.card_pic ?? cardEnv.card?.image_url;
                            return (
                                <button
                                    key={get_unique_id_from_ennvironment(cardEnv)}
                                    onClick={() => this.handleTrapActivate(cardEnv, trigger)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 14,
                                        background: '#1c1c35',
                                        border: '1px solid #c0392b',
                                        borderRadius: 10,
                                        padding: '10px 16px',
                                        cursor: 'pointer',
                                        textAlign: 'left',
                                        transition: 'background 0.15s',
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = '#2a1a2e'}
                                    onMouseLeave={e => e.currentTarget.style.background = '#1c1c35'}
                                >
                                    {img && (
                                        <img src={img} alt="" style={{
                                            width: 44, height: 64, objectFit: 'cover',
                                            borderRadius: 4, flexShrink: 0,
                                            border: '1px solid #333'
                                        }} />
                                    )}
                                    <div>
                                        <div style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>
                                            🪤 {cardEnv.card?.name ?? 'Trap Card'}
                                        </div>
                                        <div style={{ color: '#888', fontSize: 11, marginTop: 3, lineHeight: 1.4 }}>
                                            {cardEnv.card?.description?.slice(0, 80) ?? ''}…
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    {/* Pass button */}
                    <button
                        onClick={this.handleTrapPass}
                        style={{
                            width: '100%',
                            background: '#1a1a2e',
                            border: '1px solid #3a3a5a',
                            color: '#888',
                            borderRadius: 8,
                            padding: '10px 0',
                            cursor: 'pointer',
                            fontSize: 13,
                            letterSpacing: 0.5,
                        }}
                        onMouseEnter={e => e.currentTarget.style.color = '#bbb'}
                        onMouseLeave={e => e.currentTarget.style.color = '#888'}
                    >
                        Pass — proceed to damage step
                    </button>
                </div>
            </div>
        );
    };

    render() {
        const { battle_animation, battle_selection } = this.state;
        const { transformRotateX, scale, x_pos, y_pos } = this.props;
        const fieldStyle = {
            transform: transformRotateX && scale && x_pos !== undefined && y_pos !== undefined
                ? `perspective(1000px) rotateX(${transformRotateX}) scale(${scale}) translate(${x_pos}px, ${y_pos}px)`
                : 'perspective(1000px) rotateX(45deg) scale(1.0) translate(0px, 0px)',
        };
        return (
            <div className="field_box" style={fieldStyle}>
                {this.renderTrapWindow()}
                <Side battle_animation={battle_animation} side="OPPONENT"
                    battle_selection={battle_selection}
                    updateBattleSelection={this.updateBattleSelection} />
                <div style={{ height: '50px' }} />
                <Side battle_animation={battle_animation} side="MINE"
                    call_card_selector={this.props.call_card_selector}
                    battle_selection={battle_selection}
                    updateBattleSelection={this.updateBattleSelection} />
            </div>
        );
    }
}

const mapStateToProps = state => {
    const { left_panel_cardEnv } = state.mouseReducer;
    const { environment } = state.environmentReducer;
    const { game_meta } = state.gameMetaReducer;
    const { battle_meta } = state.battleMetaReducer;
    return { left_panel_cardEnv, environment, game_meta, battle_meta };
};

const mapDispatchToProps = dispatch => ({
    dispatch_change_to_damage_step: (info) => dispatch(opponent_attack_ack(info)),
    dispatch_perform_attack:        (info) => dispatch(perform_attack(info)),
    dispatch_end_battle:            ()     => dispatch(end_battle()),
    dispatch_update_environment:    (env)  => dispatch(update_environment(env)),
});

export default connect(mapStateToProps, mapDispatchToProps)(Field);