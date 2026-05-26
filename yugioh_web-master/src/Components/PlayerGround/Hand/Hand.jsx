import React from 'react';
import { connect } from 'react-redux';
import { ENVIRONMENT, CARD_TYPE, CARD_POS, SIDE } from '../../Card/utils/constant';
import { CARD_SELECT_TYPE, PHASE } from '../utils/constant'
import { is_monster, is_spell, is_trap } from '../../Card/utils/utils'
import CardView from '../../Card/CardView';
import { left_panel_mouse_in } from '../../../Store/actions/mouseActions';
import { TransitionGroup, CSSTransition} from 'react-transition-group' // ES6

import Core from '../../../Core'

import './Hand.css'
import { get_unique_id_from_ennvironment } from '../utils/utils';
import { NORMAL_SUMMON, SET_SUMMON, TOOL_TYPE } from '../../../Store/actions/actionTypes';
import { show_tool } from '../../../Store/actions/toolActions';

class Hand extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            // which card in the hand is clicked (to show the options)
            cardClicked: -1,
        }
    }


    cardOnClickHandler = (cardIndex) => {
        this.setState({cardClicked: cardIndex})
    }

    cardMouseMoveHandler = () => {
        this.setState({cardClicked: -1})
    }

    summon_final = (info, type, event) => {
        const { environment, side } = this.props

        Core.Summon.summon(info, type, environment)

        this.setState({cardClicked: -1})
        event.stopPropagation();
    }

    summonOnclick = (info, type) => event => {
        const { environment } = this.props
        if (is_monster(info.card?.card?.card_type) && (info.card.card.level || 0) > 4) {
            // tribute summon; Send a promise to call card selector
            return new Promise((resolve, reject) => {
                const info_show_tool = {
                    tool_type: TOOL_TYPE.CARD_SELECTOR,
                    info: {
                        resolve: resolve,
                        reject: reject,
                        cardEnv: info.card,
                        type: CARD_SELECT_TYPE.CARD_SELECT_TRIBUTE_SUMMON
                    }
                }
                // this.props.call_card_selector(info_card_selector)
                this.props.dispatch_show_tool(info_show_tool)
            }).then((result) => {
                Core.Summon.tribute(result.cardEnvs, SIDE.MINE, ENVIRONMENT.MONSTER_FIELD, environment)
                setTimeout(()=>this.summon_final(info, type, event), 500)
                
            })
        } else {
            this.summon_final(info, type, event)
        }
    }

    activateOnClick = (cardEnv) => event => {
        const { environment } = this.props;
        const effects = cardEnv?.card?.effects;
        if (!effects || effects.length === 0) {
            this.setState({cardClicked: -1});
            event.stopPropagation();
            return;
        }
        for (const effect of effects) {
            if (effect.condition(environment)) {
                Core.Effect.activate(cardEnv, ENVIRONMENT.HAND, SIDE.MINE, environment);
                break; // only activate once
            }
        }
        this.setState({cardClicked: -1});
        event.stopPropagation();
    }

    // ── Selector helper (mirrors Poly pattern) ──────────────────────────────
    openSelector = (selectorInfo) =>
        new Promise((resolve, reject) => {
            this.props.dispatch_show_tool({
                tool_type: TOOL_TYPE.CARD_SELECTOR,
                info: { ...selectorInfo, resolve, reject }
            });
        });

    // ── Ritual Summon ────────────────────────────────────────────────────────
    ritualSummonOnClick = (cardEnv) => async (event) => {
        event.stopPropagation();
        const { environment } = this.props;
        // cardEnv IS the ritual monster; find ritual spells in hand
        const ritualSpells = environment[SIDE.MINE][ENVIRONMENT.HAND]
            .filter(c => c?.card?.ritual_required_id === cardEnv.card.key ||
                         c?.card?.card_type === 'SPELL_RITUAL');
        if (!ritualSpells.length) return;

        try {
            // Pick which ritual spell to use (auto-pick if only one)
            const spellEnv = ritualSpells[0];
            const requiredLevel = cardEnv.card.level || 0;

            // Select tributes (total level >= ritual monster level)
            const { cardEnvs: tributeIds } = await this.openSelector({
                type: CARD_SELECT_TYPE.CARD_SELECT_RITUAL_TRIBUTE,
                requiredLevel,
                label: `Select monsters to tribute (total level ≥ ${requiredLevel})`
            });

            const freshEnv = this.props.environment;

            // Send ritual spell to GY
            Core.Summon.sendToGY([Core.Utils.get_unique_id(spellEnv)], SIDE.MINE, ENVIRONMENT.HAND, freshEnv);

            // Tribute selected monsters from hand and field
            const handIds = tributeIds.filter(uid =>
                freshEnv[SIDE.MINE][ENVIRONMENT.HAND].some(c => Core.Utils.get_unique_id(c) === uid));
            const fieldIds = tributeIds.filter(uid =>
                freshEnv[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD].some(c => c?.card && Core.Utils.get_unique_id(c) === uid));
            if (handIds.length) Core.Summon.sendToGY(handIds, SIDE.MINE, ENVIRONMENT.HAND, freshEnv);
            if (fieldIds.length) Core.Summon.tribute(fieldIds, SIDE.MINE, ENVIRONMENT.MONSTER_FIELD, freshEnv);

            // Special summon the ritual monster
            const info = { side: SIDE.MINE, card: cardEnv, src_location: ENVIRONMENT.HAND };
            Core.Summon.summon(info, 'SPECIAL_SUMMON', freshEnv);
        } catch (e) { /* cancelled */ }
        this.setState({ cardClicked: -1 });
    }

    // ── Pendulum Zone Placement (face-up activation = Scale, face-down = Set) ──
    _placeToPendulumZone = (cardEnv, faceDown) => {
        const { environment } = this.props;
        const zones = environment[SIDE.MINE][ENVIRONMENT.PENDULUM_ZONE] || [null, null];
        const slotIndex = zones[0] === null ? 0 : zones[1] === null ? 1 : null;
        if (slotIndex === null) {
            alert('Both Pendulum Zones are occupied. Remove one first.');
            return;
        }
        const placed = { ...cardEnv, current_pos: faceDown ? CARD_POS.SET : CARD_POS.FACE };
        const freshEnv = {
            ...environment,
            [SIDE.MINE]: {
                ...environment[SIDE.MINE],
                [ENVIRONMENT.PENDULUM_ZONE]: zones.map((z, i) => i === slotIndex ? placed : z),
                [ENVIRONMENT.HAND]: environment[SIDE.MINE][ENVIRONMENT.HAND].filter(c => c !== cardEnv),
            }
        };
        const { update_environment } = require('../../../Store/actions/environmentActions');
        const storeModule = require('../../../Store/store');
        storeModule.default.dispatch(update_environment(freshEnv));
        this.setState({ cardClicked: -1 });
    };

    placeScaleOnClick = (cardEnv) => (event) => {
        event.stopPropagation();
        this._placeToPendulumZone(cardEnv, false); // face-up
    }

    setInPendulumZone = (cardEnv) => (event) => {
        event.stopPropagation();
        this._placeToPendulumZone(cardEnv, true); // face-down
    }

    // ── Synchro Summon (called from PhaseSelector area) ──────────────────────
    static async synchroSummon(dispatch_show_tool, environment) {
        const openSel = (info) => new Promise((resolve, reject) =>
            dispatch_show_tool({ tool_type: TOOL_TYPE.CARD_SELECTOR, info: { ...info, resolve, reject } })
        );

        const synchroTargets = environment[SIDE.MINE][ENVIRONMENT.EXTRA_DECK]
            ?.filter(c => c?.card?.card_type === CARD_TYPE.MONSTER.SYNCHRO) || [];
        if (!synchroTargets.length) return;

        try {
            const { cardEnvs: [targetUid] } = await openSel({
                type: CARD_SELECT_TYPE.CARD_SELECT_SYNCHRO_TARGET
            });
            const target = environment[SIDE.MINE][ENVIRONMENT.EXTRA_DECK]
                .find(c => c && get_unique_id_from_ennvironment(c) === targetUid);
            if (!target) return;

            const { cardEnvs: materialIds } = await openSel({
                type: CARD_SELECT_TYPE.CARD_SELECT_SYNCHRO_MATERIALS,
                requiredLevel: target.card.level || 0
            });

            // Validate: must have tuner, levels must sum to target level
            const field = environment[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD];
            const materials = field.filter(c => c?.card && materialIds.includes(get_unique_id_from_ennvironment(c)));
            const hasTuner = materials.some(c => c.card.isTuner);
            const levelSum = materials.reduce((s, c) => s + (c.card.level || 0), 0);
            if (!hasTuner || levelSum !== (target.card.level || 0)) return;

            // Send materials to GY (pendulums auto-redirect to extra deck in move_cards_to_graveyard)
            Core.Summon.tribute(materialIds, SIDE.MINE, ENVIRONMENT.MONSTER_FIELD, environment);
            const defPos = window.confirm('Summon in Defense position? (Cancel = Attack position)');
            const info = {
                side: SIDE.MINE, card: target, src_location: ENVIRONMENT.EXTRA_DECK,
                position: defPos ? 'DEFENSE' : 'FACE',
            };
            Core.Summon.summon(info, 'SPECIAL_SUMMON', environment);
        } catch (e) { /* cancelled */ }
    }

    // ── XYZ Summon (called from PhaseSelector area) ──────────────────────────
    static async xyzSummon(dispatch_show_tool, environment) {
        const openSel = (info) => new Promise((resolve, reject) =>
            dispatch_show_tool({ tool_type: TOOL_TYPE.CARD_SELECTOR, info: { ...info, resolve, reject } })
        );

        const xyzTargets = environment[SIDE.MINE][ENVIRONMENT.EXTRA_DECK]
            ?.filter(c => c?.card?.card_type === CARD_TYPE.MONSTER.XYZ) || [];
        if (!xyzTargets.length) return;

        try {
            const { cardEnvs: [targetUid] } = await openSel({
                type: CARD_SELECT_TYPE.CARD_SELECT_XYZ_TARGET
            });
            const target = environment[SIDE.MINE][ENVIRONMENT.EXTRA_DECK]
                .find(c => c && get_unique_id_from_ennvironment(c) === targetUid);
            if (!target) return;

            const numMaterials = target.card.xyz_material_count || 2;
            const { cardEnvs: materialIds } = await openSel({
                type: CARD_SELECT_TYPE.CARD_SELECT_XYZ_MATERIALS,
                requiredLevel: target.card.level || 0,
                numToSelect: numMaterials
            });

            if (materialIds.length !== numMaterials) return;

            // Remove materials from field and attach to XYZ monster as overlay units.
            // They are NOT sent to the GY — they stay on target.xyz_materials.
            const field = environment[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD];
            const attachedMaterials = [];
            for (const uid of materialIds) {
                const idx = field.findIndex(c => c?.card && get_unique_id_from_ennvironment(c) === uid);
                if (idx !== -1) {
                    attachedMaterials.push(field[idx]);
                    field[idx] = CARD_TYPE.PLACEHOLDER;
                }
            }
            target.xyz_materials = attachedMaterials;

            const defPos = window.confirm('Summon in Defense position? (Cancel = Attack position)');
            const info = {
                side: SIDE.MINE, card: target, src_location: ENVIRONMENT.EXTRA_DECK,
                position: defPos ? 'DEFENSE' : 'FACE',
            };
            Core.Summon.summon(info, 'SPECIAL_SUMMON', environment);
        } catch (e) { /* cancelled */ }
    }

    onMouseEnterHandler = (info) => {
        if (info.cardEnv.card) {
            this.props.dispatch_mouse_in_view(info);
        }
    }

    render() {
        const {side, environment, game_meta, my_id} = this.props;
        
        // Only show interactive options if it is your side AND your turn
        const is_my_turn = game_meta?.current_turn === my_id;
        const is_main_phase = game_meta?.current_phase === PHASE.MAIN_PHASE_1 || 
                              game_meta?.current_phase === PHASE.MAIN_PHASE_2;

        let hand_array = []
        if (environment) {
            hand_array = side === SIDE.MINE 
                ? environment[side][ENVIRONMENT.HAND].map((cardEnv, cardIndex) => {
                    const hasOptions = cardIndex === this.state.cardClicked ? "show_hand_option" : "no_hand_option"
                    const info_in = { cardEnv }

                    const get_hand_card_view = () => {
                        if (is_monster(cardEnv.card.card_type)) {
                            // Only show summon options if it's your turn AND main phase
                            const can_summon = is_my_turn && is_main_phase && 
                                cardEnv.card.can_normal_summon(cardEnv.card, environment)
                            const can_normal_summon = can_summon ? "show_summon" : "no_hand_option"
                            const can_set = can_summon ? "show_summon" : "no_hand_option"
                            const isRitual = cardEnv.card.card_type === CARD_TYPE.MONSTER.RITUAL;
                            const can_special_summon = is_my_turn && is_main_phase && 
                                cardEnv.card.can_special_summon(cardEnv.card, environment) 
                                ? "show_summon" : "no_hand_option"
                            const can_ritual = is_my_turn && is_main_phase && isRitual &&
                                environment[SIDE.MINE][ENVIRONMENT.HAND]
                                    .some(c => c?.card?.card_type === 'SPELL_RITUAL')
                                ? "show_summon" : "no_hand_option"

                            const isPendulum = cardEnv.card.card_type === CARD_TYPE.MONSTER.PENDULUM;
                            const pendulumZones = environment[SIDE.MINE][ENVIRONMENT.PENDULUM_ZONE] || [null, null];
                            const canScale = is_my_turn && is_main_phase && isPendulum
                                && (pendulumZones[0] === null || pendulumZones[1] === null)
                                ? "show_summon" : "no_hand_option";

                            const info = {
                                side: side,
                                card: cardEnv,
                                src_location: ENVIRONMENT.HAND
                            }
                            return (
                                <div>
                                    <div className={hasOptions}>
                                        <div className={can_normal_summon} onClick={this.summonOnclick(info, NORMAL_SUMMON)}>Summon</div>
                                        {isRitual
                                            ? <div className={can_ritual} onClick={this.ritualSummonOnClick(cardEnv)}>Ritual</div>
                                            : isPendulum
                                                ? <div className={canScale} onClick={this.placeScaleOnClick(cardEnv)}>Scale</div>
                                                : <div className={can_special_summon}>Special</div>
                                        }
                                        {/* Pendulums set face-down into the Pendulum Zone; other monsters into the monster zone */}
                                        <div className={can_set} onClick={isPendulum ? this.setInPendulumZone(cardEnv) : this.summonOnclick(info, SET_SUMMON)}>Set</div>
                                    </div>
                                    <CardView card={cardEnv} />
                                </div>
                            )
                        } else if (is_spell(cardEnv.card.card_type)) {
                            // Only show activate if it's your turn AND main phase AND effect condition met
                            const can_activate = is_my_turn && is_main_phase && 
                                Core.Effect.can_activate(cardEnv.card, environment) 
                                ? "show_summon" : "no_hand_option"
                            const can_set = is_my_turn && is_main_phase 
                                ? "show_summon" : "no_hand_option"
                            return (
                                <div>
                                    <div className={hasOptions}>
                                        <div className={can_activate} onClick={this.activateOnClick(cardEnv)}>Activate</div>
                                        <div className={can_set} onClick={this.summonOnclick({side, card: cardEnv, src_location: ENVIRONMENT.HAND}, SET_SUMMON)}>Set</div>
                                    </div>
                                    <CardView card={cardEnv} />
                                </div>
                            )
                        } else {
                            // Traps — can only be set during main phase on your turn
                            const can_set = is_my_turn && is_main_phase 
                                ? "show_summon" : "no_hand_option"
                            const trap_info = { side, card: cardEnv, src_location: ENVIRONMENT.HAND }
                            return (
                                <div>
                                    <div className={hasOptions}>
                                        <div className={can_set} onClick={this.summonOnclick(trap_info, SET_SUMMON)}>Set</div>
                                    </div>
                                    <CardView card={cardEnv} />
                                </div>
                            )
                        }
                    }

                    return (
                        <div 
                            className="hand_card" 
                            key={"hand_card_" + get_unique_id_from_ennvironment(cardEnv)}
                            onClick={() => this.cardOnClickHandler(cardIndex)}
                            onMouseLeave={() => this.cardMouseMoveHandler()}
                            onMouseEnter={() => this.onMouseEnterHandler(info_in)}>
                                {get_hand_card_view()}
                        </div>
                    )
                }) 
                : environment[side][ENVIRONMENT.HAND].map((_, i) => (
                    // Opponent's hand — show card backs only, never options
                    <img 
                        key={"opponent_hand_" + i}
                        style={{width: '5%', marginRight: '10px'}} 
                        src={'https://ms.yugipedia.com//f/fd/Back-Anime-ZX-2.png'}
                    />
                ))
        }

        return (
    <TransitionGroup
        className={side === SIDE.MINE ? "hand_container_mine" : "hand_container_opponent"}>
        {hand_array.map((card, i) => (
            <CSSTransition
                key={card.key}
                timeout={300}
                classNames="hand-card">
                {card}
            </CSSTransition>
        ))}
    </TransitionGroup>
)
    }
}


const mapStateToProps = state => {
    const { left_panel_cardEnv } = state.mouseReducer;
    const { environment } = state.environmentReducer;
    const { game_meta } = state.gameMetaReducer;
    const { my_id } = state.serverReducer;   // <-- THIS WAS MISSING — caused neither player to act
    return { left_panel_cardEnv, environment, game_meta, my_id };
};

const mapDispatchToProps = dispatch => ({
    // initialize: (environment) => dispatch(initialize_environment(environment)),
    dispatch_mouse_in_view: (info) => dispatch(left_panel_mouse_in(info)),
    dispatch_show_tool: (info) => dispatch(show_tool(info))
});

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(Hand);