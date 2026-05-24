import React, { Component } from "react";
import { connect } from 'react-redux';
import CardView from "../../../Card/CardView";
import { ENVIRONMENT, CARD_TYPE, SIDE, CARD_POS} from '../../../Card/utils/constant';
import { CARD_SELECT_TYPE, MONSTER_ATTACK_TYPE, PHASE, DST_DIRECT_ATTACK } from '../../utils/constant'
import { left_panel_mouse_in } from '../../../../Store/actions/mouseActions';
import { TransitionGroup, CSSTransition } from 'react-transition-group'
import './Side.css'
import { calculate_battle_style } from '../utils'
import { perform_attack } from '../../../../Store/actions/environmentActions'
import { direct_attack, end_battle, opponent_attack_ack, others_attack } from "../../../../Store/actions/battleMetaActions";
import { get_unique_id_from_ennvironment } from "../../utils/utils";
import { returnAttackStatus, constructFieldFromEnv, get_styled_index_from_environment, calculate_aim_style} from '../utils';
import { BATTLE_SELECT, ANIMATION_TYPE } from '../utils/constant'
import { is_spell, is_trap } from "../../../Card/utils/utils";
import Core from '../../../../Core';
import ZoneViewer from '../../ZoneViewer/ZoneViewer';

/**
 * Field for each player
 */
class Side extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            cardClicked: -1,
            zone_viewer: null, // 'gy_mine' | 'gy_opp' | 'extra_mine' | 'extra_opp'
            // change this style to make the card move
            cardBattleStyle: {
                cardIndex: -1
            },
        }
    }


    openZoneViewer = (zone) => this.setState({ zone_viewer: zone });
    closeZoneViewer = () => this.setState({ zone_viewer: null });

    // mouse enter
    onMouseEnterHandler = (info) => {
        if (info.cardEnv.card) {
            this.props.mouse_in_view(info);
        } else {
            return
        }

        const { battle_selection, side } = this.props

        if (side == SIDE.OPPONENT && battle_selection?.cards) {
            const info_battle_select = {
                mouse_in: info.cardIndex
            }
            this.props.updateBattleSelection(BATTLE_SELECT.MOUSE_IN_SELECT, info_battle_select)
        } 

    }

    // mouse leave
    cardMouseMoveHandler = () => {
        const { battle_selection, side } = this.props
        if (side == SIDE.OPPONENT && battle_selection?.cards) {
            const info_battle_select = {
                mouse_in: -1
            }
            this.props.updateBattleSelection(BATTLE_SELECT.MOUSE_IN_SELECT, info_battle_select)
        }
        this.setState({cardClicked: -1})
    }

    
    onCardClickHandler = (info, cardIndex) => {
        // clicking the card on the field
        if (!info.cardEnv.card) {
            return
        }

        if (this.props?.battle_selection?.cards) {
            if (this.props.side == SIDE.OPPONENT) {
                const info_battle_select = {
                    selection: get_unique_id_from_ennvironment(info.cardEnv)
                }
                this.props.updateBattleSelection(BATTLE_SELECT.CONFIRM_SELECT, info_battle_select)
            } 
            return
        }

        // Activate a face-down trap/spell on YOUR field during main phase
        const { game_meta, my_id, environment } = this.props;
        const is_my_turn = game_meta?.current_turn === my_id;
        const is_main_phase = game_meta?.current_phase === PHASE.MAIN_PHASE_1 ||
                              game_meta?.current_phase === PHASE.MAIN_PHASE_2;
        const card = info.cardEnv?.card;
        const src_location = info.src_location || ENVIRONMENT.HAND;
        if (this.props.side === SIDE.MINE && is_my_turn && is_main_phase && card) {
            // Face-down S/T activation
            if ((is_spell(card.card_type) || is_trap(card.card_type)) &&
                info.cardEnv.current_pos === CARD_POS.SET) {
                if (Core.Effect.can_activate(card, environment)) {
                    info.cardEnv.current_pos = CARD_POS.FACE;
                    Core.Effect.activate(info.cardEnv, ENVIRONMENT.SPELL_FIELD, SIDE.MINE, environment);
                    return;
                }
            }
            // Face-up monster with field-activated effect (e.g. Red-Eyes Toon Dragon)
            if (card.card_type?.startsWith('MONSTER') &&
                info.cardEnv.current_pos === CARD_POS.FACE) {
                const effects = card.effects || [];
                for (const eff of effects) {
                    if (eff.once_per_turn && eff.condition && eff.condition(environment)) {
                        // Check if already used this turn
                        const usedKey = `once_per_turn_${info.cardEnv.unique_count}`;
                        if (sessionStorage.getItem(usedKey)) break; // already used
                        const result = eff.operation(environment);
                        const finish = () => {
                            sessionStorage.setItem(usedKey, '1');
                            const { update_environment } = require('../../../../Store/actions/environmentActions');
                            const storeModule = require('../../../../Store/store');
                            storeModule.default.dispatch(update_environment(environment));
                        };
                        if (result && typeof result.then === 'function') {
                            result.then(finish).catch(() => {});
                        } else {
                            finish();
                        }
                        return;
                    }
                }
            }
        }

        // Activate spell/trap from hand during main phase
        if (this.props.side === SIDE.MINE && is_my_turn && is_main_phase &&
            card && (is_spell(card.card_type) || is_trap(card.card_type)) &&
            src_location === ENVIRONMENT.HAND) {
            if (Core.Effect.can_activate(card, environment)) {
                Core.Effect.activate(info.cardEnv, ENVIRONMENT.HAND, SIDE.MINE, environment);
                return;
            }
        }

        this.setState({cardClicked: cardIndex})
    }
    

    changePositionHandler = (cardEnv, newPos) => {
        const { environment } = this.props;
        Core.Summon.changePosition(cardEnv, newPos, environment);
        this.setState({ cardClicked: -1 });
    };

    monsterAttackOnClick = (attack_type, info) => {

        const src_monster_id = get_unique_id_from_ennvironment(info.cardEnv)
        
        if (attack_type == MONSTER_ATTACK_TYPE.DIRECT_ATTACK) {
            // direct attack
            const info_battle = {
                src_monster: src_monster_id,
                dst: DST_DIRECT_ATTACK,
            }
            this.props.dispatch_direct_attack(info_battle)

        } else {
            const info_battle_select = {
                src_monster: src_monster_id,
                src_monster_index: info.cardIndex
            }
            this.props.updateBattleSelection(BATTLE_SELECT.START_SELECT, info_battle_select)
        }
    }

    componentDidUpdate(prevProps) {
        const { battle_animation, side, battle_selection } = this.props;
        if (battle_animation.key && battle_animation.key != prevProps.battle_animation.key) {
            // perform animation
            console.log(battle_animation)
            this.setState({
                cardBattleStyle: {
                    ...calculate_battle_style(battle_animation),
                    side: battle_animation.side,
                    type: ANIMATION_TYPE.ATTACK_ANIMATION
                }
            })
        }

        // when the attack animation has finished
        if (this.state.cardBattleStyle.style && this.state.cardBattleStyle.type == ANIMATION_TYPE.ATTACK_ANIMATION) {
            setTimeout(() => this.setState({
                cardBattleStyle: {
                    cardIndex: -1
                }
            }), 300)
            
        }

        if (side == SIDE.MINE && battle_selection?.selection 
            && (battle_selection.selection != prevProps.battle_selection?.selection)) {

            this.props.updateBattleSelection(BATTLE_SELECT.END_SELECT)
            const info_battle = {
                src_monster: battle_selection.src_monster,
                // monster can only attack one monster
                dst: battle_selection.selection
            }
            this.props.dispatch_others_attack(info_battle)
        }

        if (side == SIDE.MINE && battle_selection?.mouse_in && !battle_selection?.selection
                && (battle_selection?.mouse_in != prevProps.battle_selection?.mouse_in)) {

            if (battle_selection.mouse_in != -1) {
                const info = {
                    src_index: battle_selection.src_monster_index,
                    dst_index: battle_selection.mouse_in
                }
                this.setState({cardBattleStyle: {
                    // cardIndex: battle_selection.src_monster_index,
                    // style: {
                    //     transform: 'rotate(45deg)'
                    // },
                    ...calculate_aim_style(info),
                    type: ANIMATION_TYPE.AIM_ANIMATION
                }})
            } else {
                this.setState({cardBattleStyle: {
                    cardIndex: -1
                }})
            }
            
        }
    }

    


    render() {
        let side_style = undefined
        const { cardBattleStyle } = this.state
        const { side } = this.props
        if (cardBattleStyle?.side == side) {
            side_style = cardBattleStyle.side_style
        }

        const { zone_viewer } = this.state;
        return (
            <>
                {zone_viewer && (
                    <ZoneViewer zone={zone_viewer} onClose={this.closeZoneViewer} />
                )}
                <div style={side_style} className={"side_box_" + side}>
                    {this.initializeSide()}
                </div>
            </>
        );
    }

    initializeSide = () => {
        const { cardBattleStyle } = this.state;
        const { side, environment, game_meta, battle_selection} = this.props;

        if (!environment) {
            return
        }
        
        const field_cards = constructFieldFromEnv(side, environment)
        const highlightIndexes = side == SIDE.OPPONENT ? get_styled_index_from_environment(battle_selection?.cards) : undefined
        return field_cards.map((cardEnv, index) => {
            const cardView = () => {
                if (index == 0) {
                    // Pendulum Zone indicator (top-left corner slot)
                    const pendZones = environment?.[side]?.[ENVIRONMENT.PENDULUM_ZONE] || [null, null];
                    const lScale = pendZones[0]?.card?.scale;
                    const rScale = pendZones[1]?.card?.scale;
                    return (
                        <div style={{width:'100%',height:'100%',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:2,boxSizing:'border-box'}}>
                            <div style={{fontSize:6,color:'#888',fontWeight:'bold',letterSpacing:1}}>SCALES</div>
                            <div style={{fontSize:11,fontWeight:'bold',color: lScale!=null ? '#c080ff' : '#333', lineHeight:1.2}}>
                                {lScale != null ? lScale : '—'}
                            </div>
                            <div style={{fontSize:8,color:'#555',lineHeight:1}}>│</div>
                            <div style={{fontSize:11,fontWeight:'bold',color: rScale!=null ? '#c080ff' : '#333', lineHeight:1.2}}>
                                {rScale != null ? rScale : '—'}
                            </div>
                        </div>
                    );
                }

                if (index == 6) {
                    // graveyard — click to open viewer
                    const gyZone = side === SIDE.MINE ? 'gy_mine' : 'gy_opp';
                    return cardEnv.length > 0 ? (
                        <div onClick={() => this.openZoneViewer(gyZone)} style={{cursor:'pointer',position:'relative'}}>
                            <CardView card={cardEnv[cardEnv.length - 1]} key="side_card" />
                            <div style={{position:'absolute',top:2,right:4,color:'#aaa',fontSize:10,background:'rgba(0,0,0,0.6)',borderRadius:4,padding:'1px 4px'}}>
                                {cardEnv.length}
                            </div>
                        </div>
                    ) : (
                        <div onClick={() => this.openZoneViewer(gyZone)} style={{cursor:'pointer',width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',color:'#333',fontSize:10}}>GY</div>
                    );
                }

                if (index == 7) {
                    // Extra deck — click to open viewer
                    const extraZone = side === SIDE.MINE ? 'extra_mine' : 'extra_opp';
                    const extraCount = environment[side][ENVIRONMENT.EXTRA_DECK]?.length || 0;
                    return (
                        <div onClick={() => this.openZoneViewer(extraZone)} style={{cursor:'pointer',width:'100%',height:'100%',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:2}}>
                            <div style={{fontSize:7,color:'#888',fontWeight:'bold',letterSpacing:1}}>EXTRA</div>
                            <div style={{fontSize:16,fontWeight:'bold',color:'#a0f0ff',lineHeight:1}}>{extraCount}</div>
                            <div style={{fontSize:7,color:'#555'}}>[click]</div>
                        </div>
                    );
                }

                if (index == 13) {
                    return (
                        <h1 className = "deck_remaining">
                            {environment[side][ENVIRONMENT.DECK].length}
                        </h1>
                    )
                }

                if (cardEnv.card) {
                    const isSpellTrapZone = index >= 8 && index <= 12;
                    const cardType = cardEnv.card.card_type;
                    const isFaceDown = cardEnv.current_pos === CARD_POS.SET;

                    if (cardEnv.current_pos === CARD_POS.FACE) {
                        // Any face-up card: show normally
                        return (
                            <CardView style={side == cardBattleStyle.side && index == cardBattleStyle.cardIndex? cardBattleStyle.style : undefined} card={cardEnv} key="side_card" />
                        )
                    } else if (cardEnv.current_pos === CARD_POS.DEFENSE) {
                        // Face-up defense position: card visible but rotated 90 degrees
                        const battleStyle = side === cardBattleStyle.side && index === cardBattleStyle.cardIndex ? cardBattleStyle.style : {};
                        return (
                            <CardView style={{ transform: 'rotate(90deg)', ...(battleStyle || {}) }} card={cardEnv} key="side_card" />
                        )
                    } else if (isFaceDown && isSpellTrapZone) {
                        // Face-down spell/trap in S/T zone: flat card back (no rotate)
                        return <img
                            key="side_card_set_st"
                            src={'https://ms.yugipedia.com//f/fd/Back-Anime-ZX-2.png'}
                            style={{width: '100%', display: 'block'}}
                        />
                    } else if (isFaceDown) {
                        // Face-down monster in monster zone: rotated 90deg
                        return <img className="side_card_set" key="side_card_set" src={'https://ms.yugipedia.com//f/fd/Back-Anime-ZX-2.png'}/>
                    } else if (is_spell(cardType) || is_trap(cardType)) {
                        // Face-up spell/trap (shouldn't normally be set but just in case)
                        return (
                            <CardView style={side == cardBattleStyle.side && index == cardBattleStyle.cardIndex? cardBattleStyle.style : undefined} card={cardEnv} key="side_card" />
                        )
                    }
                }
            }
            const info = {
                cardEnv: cardEnv,
                cardIndex: index
            }

            const hasOptions = index == this.state.cardClicked ? "show_hand_option" : "no_hand_option"

            const {can_direct_attack, can_others_attack} = returnAttackStatus(cardEnv, game_meta, environment)

            const is_my_turn = game_meta?.current_turn === this.props.my_id;
            const is_main_phase = game_meta?.current_phase === PHASE.MAIN_PHASE_1 ||
                                  game_meta?.current_phase === PHASE.MAIN_PHASE_2;
            const is_monster_card = cardEnv.card?.card_type?.startsWith('MONSTER');
            const can_flip = side === SIDE.MINE && is_my_turn && is_main_phase && is_monster_card
                && cardEnv.current_pos === CARD_POS.SET && !cardEnv.summoned_this_turn;
            const can_to_def = side === SIDE.MINE && is_my_turn && is_main_phase && is_monster_card
                && cardEnv.current_pos === CARD_POS.FACE && !cardEnv.summoned_this_turn && !cardEnv.pos_changed_this_turn;

            return (
                <div
                    className={`card_outer_box ${highlightIndexes?.includes(index) ? 'card_flashing' : ''}`}
                    key={"side_" + side + index}
                    onMouseEnter={()=>this.onMouseEnterHandler(info)}
                    onClick={()=>this.onCardClickHandler(info, index)}
                    onMouseLeave={() => this.cardMouseMoveHandler()}>
                    <div className={`card_box`}>
                        <div className={hasOptions}>
                            <div className={can_direct_attack}
                                onClick={()=>this.monsterAttackOnClick(MONSTER_ATTACK_TYPE.DIRECT_ATTACK, info)}>
                                    Direct Attack
                            </div>
                            <div className={can_others_attack}
                                onClick={()=>this.monsterAttackOnClick(MONSTER_ATTACK_TYPE.OTHERS_ATTACK, info)}>
                                    Attack
                            </div>
                            {can_flip && (
                                <div className="show_summon"
                                    onClick={(e) => { e.stopPropagation(); this.changePositionHandler(cardEnv, CARD_POS.FACE); }}>
                                    Flip
                                </div>
                            )}
                            {can_to_def && (
                                <div className="show_summon"
                                    onClick={(e) => { e.stopPropagation(); this.changePositionHandler(cardEnv, CARD_POS.DEFENSE); }}>
                                    ▽ DEF
                                </div>
                            )}
                        </div>
                        
                        <div className={"card_mask" + (cardEnv.current_pos != CARD_POS.SET || (index >= 8 && index <= 12) ? "" : " side_card_set")}/>
                        <TransitionGroup>
    {cardView() ? (
        <CSSTransition
            key={cardEnv.card ? cardEnv.card.key : 'placeholder-' + index}
            timeout={300}
            classNames="side-card">
            {cardView()}
        </CSSTransition>
    ) : null}
</TransitionGroup>

                    </div>
                </div>
            );
        });
    };
}

const mapStateToProps = state => {
    const { left_panel_cardEnv } = state.mouseReducer
    const { environment } = state.environmentReducer
    const { game_meta } = state.gameMetaReducer
    const { battle_meta } = state.battleMetaReducer
    const { my_id } = state.serverReducer   // <-- added
    return { left_panel_cardEnv, environment, game_meta, battle_meta, my_id };  // <-- added my_id
};

const mapDispatchToProps = dispatch => ({
    // initialize: (environment) => dispatch(initialize_environment(environment)),
    mouse_in_view: (info) => dispatch(left_panel_mouse_in(info)),
    dispatch_direct_attack: (info) => dispatch(direct_attack(info)),
    dispatch_others_attack: (info) => dispatch(others_attack(info)),
    // opponent attack ack will change the battle step to damage step
    dispatch_change_to_damage_step: () => dispatch(opponent_attack_ack()),
    dispatch_perform_attack: (info) => dispatch(perform_attack(info)),
    dispatch_end_battle: () => dispatch(end_battle())
});

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(Side);