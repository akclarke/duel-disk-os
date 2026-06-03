import React from 'react';
import { connect } from 'react-redux';
import { PHASE, PHASE_START } from '../utils/constant'
import { ENVIRONMENT, CARD_TYPE, SIDE, CARD_POS } from '../../Card/utils/constant';
import { change_phase } from '../../../Store/actions/gameMetaActions'
import { emit_change_phase } from '../../../Client/Sender'
import { show_tool } from '../../../Store/actions/toolActions';
import { TOOL_TYPE } from '../../../Store/actions/actionTypes';
import { CARD_SELECT_TYPE } from '../utils/constant';
import { get_unique_id_from_ennvironment } from '../utils/utils';
import Core from '../../../Core';
import { choosePosition } from '../../../data/positionChooser';
import './PhaseSelector.css';

class PhaseSelector extends React.Component {
    constructor(props) {
        super(props);
        this.state = { pendulumSummonUsed: false };
    }

    componentDidUpdate(prevProps) {
        if (prevProps.game_meta?.current_turn !== this.props.game_meta?.current_turn) {
            this.setState({ pendulumSummonUsed: false });
        }
    }

    handlePhaseChange = (next_phase, phase_button_class) => {
        if (phase_button_class === 'phase_button_disabled') return;
        const info = { next_phase };
        emit_change_phase(info);
        this.props.dispatch_change_phase(info);
    }

    openSelector = (info) =>
        new Promise((resolve, reject) =>
            this.props.dispatch_show_tool({
                tool_type: TOOL_TYPE.CARD_SELECTOR,
                info: { ...info, resolve, reject }
            })
        );

    isMainPhase = () => {
        const { game_meta, my_id } = this.props;
        return (game_meta?.current_turn === my_id) &&
            (game_meta?.current_phase === PHASE.MAIN_PHASE_1 ||
             game_meta?.current_phase === PHASE.MAIN_PHASE_2);
    }

    hasSynchroTargets = () => {
        const { environment } = this.props;
        if (!environment) return false;
        const extra = environment[SIDE.MINE]?.[ENVIRONMENT.EXTRA_DECK] || [];
        const field = environment[SIDE.MINE]?.[ENVIRONMENT.MONSTER_FIELD] || [];
        const hasSynchro = extra.some(c => c?.card?.card_type === CARD_TYPE.MONSTER.SYNCHRO);
        const hasTuner = field.some(c => c?.card && c.card.isTuner);
        const hasNonTuner = field.some(c => c?.card && !c.card.isTuner);
        return hasSynchro && hasTuner && hasNonTuner;
    }

    hasXyzTargets = () => {
        const { environment } = this.props;
        if (!environment) return false;
        const extra = environment[SIDE.MINE]?.[ENVIRONMENT.EXTRA_DECK] || [];
        const field = environment[SIDE.MINE]?.[ENVIRONMENT.MONSTER_FIELD] || [];
        return extra.some(c => {
            if (c?.card?.card_type !== CARD_TYPE.MONSTER.XYZ) return false;
            const rank = c.card.rank || c.card.level || 0;
            // current_level allows Gagaga Magician (and similar) to change their level
            const sameLevel = field.filter(m => m?.card && (m.current_level ?? m.card.level ?? 0) === rank);
            return sameLevel.length >= 2;
        });
    }

    handleSynchroSummon = async () => {
        const { environment } = this.props;
        try {
            const { cardEnvs: [targetUid] } = await this.openSelector({
                type: CARD_SELECT_TYPE.CARD_SELECT_SYNCHRO_TARGET
            });
            const target = environment[SIDE.MINE][ENVIRONMENT.EXTRA_DECK]
                .find(c => c && get_unique_id_from_ennvironment(c) === targetUid);
            if (!target) return;

            const { cardEnvs: materialIds } = await this.openSelector({
                type: CARD_SELECT_TYPE.CARD_SELECT_SYNCHRO_MATERIALS,
                requiredLevel: target.card.level || 0
            });

            // Validate
            const field = environment[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD];
            const materials = field.filter(c =>
                c?.card && materialIds.includes(get_unique_id_from_ennvironment(c)));
            const hasTuner = materials.some(c => c.card.isTuner);
            const levelSum = materials.reduce((s, c) => s + (c.card.level || 0), 0);
            if (!hasTuner || levelSum !== (target.card.level || 0)) {
                alert(`Invalid materials: need Tuner + total level ${target.card.level}`);
                return;
            }

            Core.Summon.tribute(materialIds, SIDE.MINE, ENVIRONMENT.MONSTER_FIELD, environment);
            const info = { side: SIDE.MINE, card: target, src_location: ENVIRONMENT.EXTRA_DECK };
            Core.Summon.summon(info, 'SPECIAL_SUMMON', environment);
        } catch (e) { /* cancelled */ }
    }

    hasPendulumScales = () => {
        const { environment } = this.props;
        if (!environment || this.state.pendulumSummonUsed) return false;
        const zones = environment[SIDE.MINE]?.[ENVIRONMENT.PENDULUM_ZONE] || [null, null];
        return zones[0]?.card && zones[0]?.current_pos === CARD_POS.FACE &&
               zones[1]?.card && zones[1]?.current_pos === CARD_POS.FACE;
    }

    hasLinkTargets = () => {
        const { environment } = this.props;
        if (!environment) return false;
        const extra = environment[SIDE.MINE]?.[ENVIRONMENT.EXTRA_DECK] || [];
        const field = environment[SIDE.MINE]?.[ENVIRONMENT.MONSTER_FIELD] || [];
        const hasLink = extra.some(c => c?.card?.card_type === CARD_TYPE.MONSTER.LINK);
        const fieldCount = field.filter(c => c?.card).length;
        return hasLink && fieldCount >= 1;
    }

    handlePendulumSummon = async () => {
        if (this.state.pendulumSummonUsed) {
            alert('You have already Pendulum Summoned this turn.');
            return;
        }
        const { environment } = this.props;
        const zones = environment[SIDE.MINE]?.[ENVIRONMENT.PENDULUM_ZONE] || [null, null];
        const leftScale  = zones[0]?.current_pos === CARD_POS.FACE ? (zones[0]?.card?.scale ?? null) : null;
        const rightScale = zones[1]?.current_pos === CARD_POS.FACE ? (zones[1]?.card?.scale ?? null) : null;
        if (leftScale === null || rightScale === null) {
            alert('You need two face-up Pendulum Scales first. Click a Pendulum Monster in hand and choose "Scale".');
            return;
        }
        try {
            const { cardEnvs: targetIds } = await this.openSelector({
                type: CARD_SELECT_TYPE.CARD_SELECT_PENDULUM_TARGETS
            });
            if (!targetIds.length) return;
            this.setState({ pendulumSummonUsed: true });
            const freshEnv = this.props.environment;
            const extraDeck = freshEnv[SIDE.MINE][ENVIRONMENT.EXTRA_DECK] || [];
            const hand      = freshEnv[SIDE.MINE][ENVIRONMENT.HAND] || [];
            const allSources = [...extraDeck, ...hand];
            for (const uid of targetIds) {
                const cardEnv = allSources.find(c => c && get_unique_id_from_ennvironment(c) === uid);
                if (!cardEnv) continue;
                const fromExtra = extraDeck.some(c => c && get_unique_id_from_ennvironment(c) === uid);
                const src = fromExtra ? ENVIRONMENT.EXTRA_DECK : ENVIRONMENT.HAND;
                const pos = await choosePosition(cardEnv.card?.name || 'Monster');
                const info = {
                    side: SIDE.MINE,
                    card: cardEnv,
                    src_location: src,
                    position: pos,
                };
                Core.Summon.summon(info, 'SPECIAL_SUMMON', freshEnv);
            }
        } catch (e) { /* cancelled */ }
    }

    handleLinkSummon = async () => {
        const { environment } = this.props;
        try {
            const { cardEnvs: [targetUid] } = await this.openSelector({
                type: CARD_SELECT_TYPE.CARD_SELECT_LINK_TARGET
            });
            const target = environment[SIDE.MINE][ENVIRONMENT.EXTRA_DECK]
                .find(c => c && get_unique_id_from_ennvironment(c) === targetUid);
            if (!target) return;

            const linkRating = target.card.linkRating || 2;
            const { cardEnvs: materialIds } = await this.openSelector({
                type: CARD_SELECT_TYPE.CARD_SELECT_LINK_MATERIALS,
                linkRating
            });
            if (materialIds.length < linkRating) return;

            Core.Summon.tribute(materialIds, SIDE.MINE, ENVIRONMENT.MONSTER_FIELD, environment);
            const info = { side: SIDE.MINE, card: target, src_location: ENVIRONMENT.EXTRA_DECK };
            Core.Summon.summon(info, 'SPECIAL_SUMMON', environment);
        } catch (e) { /* cancelled */ }
    }

    handleXyzSummon = async () => {
        const { environment } = this.props;
        try {
            const { cardEnvs: [targetUid] } = await this.openSelector({
                type: CARD_SELECT_TYPE.CARD_SELECT_XYZ_TARGET
            });
            const target = environment[SIDE.MINE][ENVIRONMENT.EXTRA_DECK]
                .find(c => c && get_unique_id_from_ennvironment(c) === targetUid);
            if (!target) return;

            const numMats = target.card.xyz_material_count || 2;
            // Use rank (or level) of the XYZ monster as the required level for materials
            const requiredRank = target.card.rank || target.card.level || 0;
            const { cardEnvs: materialIds } = await this.openSelector({
                type: CARD_SELECT_TYPE.CARD_SELECT_XYZ_MATERIALS,
                requiredLevel: requiredRank,
                numToSelect: numMats
            });

            if (materialIds.length !== numMats) return;

            // Remove materials from field and attach as overlay units (NOT sent to GY)
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

            const pos = await choosePosition(target.card?.name || 'Monster');
            const info = { side: SIDE.MINE, card: target, src_location: ENVIRONMENT.EXTRA_DECK, position: pos };
            Core.Summon.summon(info, 'SPECIAL_SUMMON', environment);
        } catch (e) { /* cancelled */ }
    }

    // ── Secret Six Samurai - Rihan Contact Fusion ──────────────────────────────
    // Requires 3 Six Samurai with 3 different Attributes on field → send to GY → SS Rihan
    hasRihanTargets = () => {
        const { environment } = this.props;
        if (!environment) return false;
        const extra = environment[SIDE.MINE]?.[ENVIRONMENT.EXTRA_DECK] || [];
        const hasRihan = extra.some(c => c?.card?.key === 33964637);
        if (!hasRihan) return false;
        const field = (environment[SIDE.MINE]?.[ENVIRONMENT.MONSTER_FIELD] || []).filter(c =>
            c !== CARD_TYPE.PLACEHOLDER && c?.card?.name?.toLowerCase().includes('samurai')
        );
        if (field.length < 3) return false;
        // Need 3 with 3 different attributes
        const attrs = new Set(field.map(c => c.card.attribute?.toUpperCase()).filter(Boolean));
        return attrs.size >= 3;
    }

    handleRihanSummon = async () => {
        const { environment } = this.props;
        const field = (environment[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD] || []).filter(c =>
            c !== CARD_TYPE.PLACEHOLDER && c?.card?.name?.toLowerCase().includes('samurai')
        );
        try {
            // Player selects 3 Six Samurai with different attributes as materials
            const { cardEnvs: matIds } = await this.openSelector({
                type: CARD_SELECT_TYPE.CARD_SELECT_FROM_HAND,
                label: 'Rihan Contact Fusion — select 3 Six Samurai with 3 different Attributes',
                sourceList: field,
                numToSelect: 3,
            });
            if (matIds.length < 3) return;

            // Validate 3 different attributes
            const selected = matIds.map(uid => field.find(c => get_unique_id_from_ennvironment(c) === uid)).filter(Boolean);
            const attrs = new Set(selected.map(c => c.card.attribute?.toUpperCase()).filter(Boolean));
            if (attrs.size < 3) {
                alert('Rihan requires 3 Six Samurai with 3 different Attributes!');
                return;
            }

            // Send 3 materials to GY
            const mf = environment[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD];
            for (const uid of matIds) {
                const idx = mf.findIndex(c => c?.card && get_unique_id_from_ennvironment(c) === uid);
                if (idx !== -1) {
                    environment[SIDE.MINE][ENVIRONMENT.GRAVEYARD].push(mf[idx]);
                    mf[idx] = CARD_TYPE.PLACEHOLDER;
                }
            }

            // SS Rihan from Extra Deck
            const rihan = environment[SIDE.MINE][ENVIRONMENT.EXTRA_DECK].find(c => c?.card?.key === 33964637);
            if (!rihan) return;
            const info = { side: SIDE.MINE, card: rihan, src_location: ENVIRONMENT.EXTRA_DECK, position: CARD_POS.FACE };
            Core.Summon.summon(info, 'SPECIAL_SUMMON', environment);
        } catch (e) { /* cancelled */ }
    }

    render() {
        const { game_meta, my_id } = this.props;
        const inMainPhase = this.isMainPhase();

        const phaseArray = Object.keys(PHASE).map((phase) => {
            const phase_button_class = (p) => {
                const current_phase = game_meta.current_phase;
                const current_turn = game_meta.current_turn;
                if (current_phase === PHASE_START) return 'phase_button_disabled';
                if (current_phase === p) return 'phase_button_current';
                if (p === PHASE.DRAW_PHASE || p === PHASE.STANDBY_PHASE ||
                    current_phase === PHASE.DRAW_PHASE || current_phase === PHASE.STANDBY_PHASE ||
                    current_turn !== my_id) return 'phase_button_disabled';
                return Object.values(PHASE).indexOf(current_phase) < Object.values(PHASE).indexOf(p)
                    ? `phase_button_enabled phase_button_enabled_${p}`
                    : 'phase_button_disabled';
            };
            const cls = phase_button_class(PHASE[phase]);
            return (
                <div className={`phase_button ${cls}`} key={`phase_button_${PHASE[phase]}`}
                    onClick={() => this.handlePhaseChange(PHASE[phase], cls)}>
                    {PHASE[phase]}
                </div>
            );
        });

        const synchroBtn = inMainPhase && this.hasSynchroTargets()
            ? <div className="phase_button phase_button_enabled phase_button_special"
                onClick={this.handleSynchroSummon} title="Synchro Summon">⚡ Synchro</div>
            : null;

        const xyzBtn = inMainPhase && this.hasXyzTargets()
            ? <div className="phase_button phase_button_enabled phase_button_special"
                onClick={this.handleXyzSummon} title="XYZ Summon">🌀 XYZ</div>
            : null;

        const pendulumBtn = inMainPhase && this.hasPendulumScales()
            ? <div className="phase_button phase_button_enabled phase_button_special"
                onClick={this.handlePendulumSummon} title="Pendulum Summon">🔮 Pendulum</div>
            : null;

        const linkBtn = inMainPhase && this.hasLinkTargets()
            ? <div className="phase_button phase_button_enabled phase_button_special"
                onClick={this.handleLinkSummon} title="Link Summon">🔗 Link</div>
            : null;

        const rihanBtn = inMainPhase && this.hasRihanTargets()
            ? <div className="phase_button phase_button_enabled phase_button_special"
                onClick={this.handleRihanSummon} title="Rihan Contact Fusion">⛩️ Rihan</div>
            : null;

        return (
            <div className="turn_selector_container">
                {phaseArray}
                {synchroBtn}
                {xyzBtn}
                {pendulumBtn}
                {linkBtn}
                {rihanBtn}
            </div>
        );
    }
}

const mapStateToProps = state => {
    const { environment } = state.environmentReducer;
    const { game_meta } = state.gameMetaReducer;
    const { my_id } = state.serverReducer;
    return { environment, game_meta, my_id };
};

const mapDispatchToProps = dispatch => ({
    dispatch_change_phase: (info) => dispatch(change_phase(info)),
    dispatch_show_tool: (info) => dispatch(show_tool(info))
});

export default connect(mapStateToProps, mapDispatchToProps)(PhaseSelector);