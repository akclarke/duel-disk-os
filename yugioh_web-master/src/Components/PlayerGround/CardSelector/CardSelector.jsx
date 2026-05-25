import React from 'react'
import { CARD_SELECT_TYPE } from '../utils/constant'
import { SIDE, ENVIRONMENT, CARD_TYPE, CARD_POS } from '../../Card/utils/constant'
import { connect } from 'react-redux';
import { get_unique_id_from_ennvironment } from '../utils/utils'
import { close_tool } from '../../../Store/actions/toolActions'
import { TOOL_TYPE } from '../../../Store/actions/actionTypes'

class CardSelector extends React.Component {
    constructor(props) {
        super(props);
        this.state = { selected_cards: {}, num_selected: 0 };
    }

    componentDidUpdate(prevProps) {
        if (!prevProps.show_card_selector && this.props.show_card_selector) {
            this.setState({ selected_cards: {}, num_selected: 0 });
            // If it's not the player's turn the CPU triggered this — auto-resolve
            const { game_meta, my_id } = this.props;
            if (game_meta && my_id && game_meta.current_turn !== my_id) {
                setTimeout(() => this._autoResolve(), 500);
            }
        }
    }

    _autoResolve = () => {
        const { card_selector_info, show_card_selector } = this.props;
        if (!show_card_selector || !card_selector_info?.type) return;
        const content = this.getContent();
        const { cards, num } = content;
        const close_info = { tool_type: TOOL_TYPE.CARD_SELECTOR };
        if (!cards || cards.length === 0) {
            card_selector_info.reject?.('no_cards');
            this.props.dispatch_close_tool(close_info);
            return;
        }
        const autoSelected = {};
        cards.slice(0, num).forEach(c => {
            autoSelected[get_unique_id_from_ennvironment(c)] = true;
        });
        card_selector_info.resolve({ cardEnvs: Object.keys(autoSelected), side: SIDE.MINE });
        this.props.dispatch_close_tool(close_info);
    };

    toggle = (uid, maxSelect) => {
        const { selected_cards, num_selected } = this.state;
        if (uid in selected_cards) {
            const next = { ...selected_cards };
            delete next[uid];
            this.setState({ selected_cards: next, num_selected: num_selected - 1 });
        } else {
            if (num_selected >= maxSelect) return;
            this.setState({
                selected_cards: { ...selected_cards, [uid]: true },
                num_selected: num_selected + 1
            });
        }
    };

    // ── Card pools ────────────────────────────────────────────────────────────
    monsters = (side, loc) =>
        (this.props.environment?.[side]?.[loc] || [])
            .filter(c => c !== CARD_TYPE.PLACEHOLDER && c?.card);

    deckMonsters = (filterFn) =>
        (this.props.environment?.[SIDE.MINE]?.[ENVIRONMENT.DECK] || [])
            .filter(c => c?.card?.card_type?.startsWith('MONSTER') && (!filterFn || filterFn(c)));

    deckCards = (filterFn) =>
        (this.props.environment?.[SIDE.MINE]?.[ENVIRONMENT.DECK] || [])
            .filter(c => c?.card && (!filterFn || filterFn(c)));

    gyMonsters = () =>
        (this.props.environment?.[SIDE.MINE]?.[ENVIRONMENT.GRAVEYARD] || [])
            .filter(c => c?.card?.card_type?.startsWith('MONSTER'));

    xyzMaterials = (reqLevel) =>
        this.monsters(SIDE.MINE, ENVIRONMENT.MONSTER_FIELD)
            .filter(c => (c.card.level || 0) === reqLevel);

    pendulumScaleCards = () =>
        (this.props.environment?.[SIDE.MINE]?.[ENVIRONMENT.HAND] || [])
            .filter(c => c?.card?.card_type === 'MONSTER_PENDULUM');

    fieldMonsters = () =>
        this.monsters(SIDE.MINE, ENVIRONMENT.MONSTER_FIELD);

    linkMaterials = (minCount) =>
        this.monsters(SIDE.MINE, ENVIRONMENT.MONSTER_FIELD);

    // ── Content builder ───────────────────────────────────────────────────────
    getContent = () => {
        const { card_selector_info, environment } = this.props;
        const { type, cardEnv, filterFn, label, requiredLevel, numToSelect, sourceList, num_to_select } = card_selector_info || {};

        switch (type) {
            case CARD_SELECT_TYPE.CARD_SELECT_TRIBUTE_SUMMON: {
                const n = (cardEnv?.card?.level || 0) >= 7 ? 2 : 1;
                return { title: `Select ${n} monster(s) to tribute`, num: n, cards: this.monsters(SIDE.MINE, ENVIRONMENT.MONSTER_FIELD) };
            }
            case CARD_SELECT_TYPE.CARD_SELECT_BATTLE_SELECT:
                return { title: 'Select a monster to attack', num: 1, cards: this.monsters(SIDE.OPPONENT, ENVIRONMENT.MONSTER_FIELD) };
            case CARD_SELECT_TYPE.CARD_SELECT_SPECIAL_SUMMON_TARGET:
                return { title: 'Select a monster to Special Summon', num: 1, cards: this.monsters(SIDE.MINE, ENVIRONMENT.EXTRA_DECK) };
            case CARD_SELECT_TYPE.CARD_SELECT_SPECIAL_SUMMON_MATERIALS:
                return { title: `Select ${num_to_select} Fusion Material(s)`, num: num_to_select || 2, cards: card_selector_info.materials || [] };
            case CARD_SELECT_TYPE.CARD_SELECT_FROM_DECK:
                return { title: label || 'Select 1 card from your Deck', num: numToSelect || 1, cards: this.deckCards(filterFn) };
            case CARD_SELECT_TYPE.CARD_SELECT_FROM_GY:
                return { title: label || 'Select 1 monster from your Graveyard', num: numToSelect || 1, cards: this.gyMonsters() };
            case CARD_SELECT_TYPE.CARD_SELECT_FROM_HAND:
                return { title: label || 'Select 1 card from your hand', num: numToSelect || 1, cards: sourceList || this.monsters(SIDE.MINE, ENVIRONMENT.HAND) };
            case CARD_SELECT_TYPE.CARD_SELECT_RITUAL_MONSTER: {
                const rituals = this.monsters(SIDE.MINE, ENVIRONMENT.HAND)
                    .filter(c => c?.card?.card_type === 'MONSTER_RITUAL');
                return { title: 'Select the Ritual Monster to summon', num: 1, cards: rituals };
            }
            case CARD_SELECT_TYPE.CARD_SELECT_RITUAL_TRIBUTE: {
                const hand = this.monsters(SIDE.MINE, ENVIRONMENT.HAND).filter(c => c?.card?.card_type?.startsWith('MONSTER'));
                const field = this.monsters(SIDE.MINE, ENVIRONMENT.MONSTER_FIELD);
                return { title: `Select tributes (total level ≥ ${requiredLevel})`, num: 99, cards: [...hand, ...field], flexible: true, requiredLevel };
            }
            case CARD_SELECT_TYPE.CARD_SELECT_SYNCHRO_TARGET:
                return { title: 'Select Synchro Monster to summon', num: 1, cards: this.monsters(SIDE.MINE, ENVIRONMENT.EXTRA_DECK).filter(c => c?.card?.card_type === 'MONSTER_SYNCHRO') };
            case CARD_SELECT_TYPE.CARD_SELECT_SYNCHRO_MATERIALS:
                return { title: `Select materials (Tuner + others, total level = ${requiredLevel})`, num: 99, cards: this.monsters(SIDE.MINE, ENVIRONMENT.MONSTER_FIELD), flexible: true, requiredLevel, synchro: true };
            case CARD_SELECT_TYPE.CARD_SELECT_XYZ_TARGET:
                return { title: 'Select XYZ Monster to summon', num: 1, cards: this.monsters(SIDE.MINE, ENVIRONMENT.EXTRA_DECK).filter(c => c?.card?.card_type === 'MONSTER_XYZ') };
            case CARD_SELECT_TYPE.CARD_SELECT_XYZ_MATERIALS:
                return { title: `Select ${numToSelect || 2} Level-${requiredLevel} monsters`, num: numToSelect || 2, cards: this.xyzMaterials(requiredLevel) };
            case CARD_SELECT_TYPE.CARD_SELECT_PENDULUM_SCALE:
                return { title: 'Select a Pendulum Monster to place in the Pendulum Zone', num: 1, cards: this.pendulumScaleCards() };
            case CARD_SELECT_TYPE.CARD_SELECT_PENDULUM_TARGETS: {
                const env = this.props.environment;
                const leftScale  = env?.[SIDE.MINE]?.[ENVIRONMENT.PENDULUM_ZONE]?.[0]?.card?.scale ?? null;
                const rightScale = env?.[SIDE.MINE]?.[ENVIRONMENT.PENDULUM_ZONE]?.[1]?.card?.scale ?? null;
                if (leftScale === null || rightScale === null) return { title: 'Set both pendulum scales first', num: 0, cards: [] };
                const lo = Math.min(leftScale, rightScale);
                const hi = Math.max(leftScale, rightScale);
                const valid = (env?.[SIDE.MINE]?.[ENVIRONMENT.EXTRA_DECK] || [])
                    .concat(env?.[SIDE.MINE]?.[ENVIRONMENT.HAND] || [])
                    .filter(c => c?.card && c.card.card_type === 'MONSTER_PENDULUM'
                        && (c.card.level || 0) > lo && (c.card.level || 0) < hi);
                return { title: `Pendulum Summon monsters between scales ${lo}–${hi}`, num: valid.length, cards: valid, flexible: true, minSelect: 1 };
            }
            case CARD_SELECT_TYPE.CARD_SELECT_LINK_TARGET:
                return { title: 'Select a Link Monster to summon', num: 1, cards: this.monsters(SIDE.MINE, ENVIRONMENT.EXTRA_DECK).filter(c => c?.card?.card_type === 'MONSTER_LINK') };
            case CARD_SELECT_TYPE.CARD_SELECT_LINK_MATERIALS: {
                const linkRating = card_selector_info?.linkRating || 2;
                return { title: `Select ${linkRating} monster(s) as Link Material`, num: linkRating, cards: this.linkMaterials(linkRating) };
            }
            default:
                return { title: 'Select a card', num: 1, cards: [] };
        }
    };

    isValid = (content) => {
        const count = Object.keys(this.state.selected_cards).length;
        if (content.flexible) {
            if (count < (content.minSelect || 0)) return false;
            if (content.synchro) {
                const env = this.props.environment;
                const field = (env?.[SIDE.MINE]?.[ENVIRONMENT.MONSTER_FIELD] || []).filter(c => c?.card);
                const selected = field.filter(c => get_unique_id_from_ennvironment(c) in this.state.selected_cards);
                const hasTuner = selected.some(c => c.card.isTuner);
                const levelSum = selected.reduce((s, c) => s + (c.card.level || 0), 0);
                return hasTuner && levelSum === (content.requiredLevel || 0);
            }
            // Ritual: total level >= requiredLevel
            const cards = content.cards || [];
            const selected = cards.filter(c => get_unique_id_from_ennvironment(c) in this.state.selected_cards);
            const levelSum = selected.reduce((s, c) => s + (c.card?.level || 0), 0);
            return levelSum >= (content.requiredLevel || 0);
        }
        return count === content.num;
    };

    render() {
        const { show_card_selector, card_selector_info } = this.props;
        if (!show_card_selector || !card_selector_info?.type) return null;

        const content = this.getContent();
        const { title, num, cards } = content;
        const valid = this.isValid(content);
        const close_info = { tool_type: TOOL_TYPE.CARD_SELECTOR };

        const cardStyle = (uid) => ({
            background: uid in this.state.selected_cards ? '#1b3a6b' : '#12122a',
            border: `2px solid ${uid in this.state.selected_cards ? '#4a9eff' : '#2a2a50'}`,
            borderRadius: 10, cursor: 'pointer', overflow: 'hidden',
            transition: 'all 0.15s ease', display: 'flex', flexDirection: 'column',
            transform: uid in this.state.selected_cards ? 'translateY(-4px)' : 'none',
        });

        return (
            <div style={{
                position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
                zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
                <div style={{
                    background: '#0d0d1f', border: '2px solid #3a3a7a',
                    borderRadius: 16, padding: 28, width: '90%', maxWidth: 720,
                    maxHeight: '85vh', display: 'flex', flexDirection: 'column'
                }}>
                    {/* Header */}
                    <div style={{ marginBottom: 16 }}>
                        <h3 style={{ color: '#c8c8ff', margin: '0 0 4px', fontSize: 17 }}>{title}</h3>
                        <div style={{ color: '#666', fontSize: 12 }}>
                            {Object.keys(this.state.selected_cards).length} / {content.flexible ? '?' : num} selected
                        </div>
                    </div>

                    {/* Card grid */}
                    <div style={{ flex: 1, overflowY: 'auto', marginBottom: 16 }}>
                        {(!cards || cards.length === 0) ? (
                            <div style={{ color: '#555', textAlign: 'center', padding: '30px 0', fontSize: 14 }}>
                                No valid cards available
                            </div>
                        ) : (
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
                                gap: 12
                            }}>
                                {cards.map((cardEnv) => {
                                    const uid = get_unique_id_from_ennvironment(cardEnv);
                                    const c = cardEnv.card;
                                    const img = c?.card_pic || c?.image_url || 'https://ms.yugipedia.com//f/fd/Back-Anime-ZX-2.png';
                                    const isMonster = c?.card_type?.startsWith('MONSTER');
                                    const isTuner = c?.isTuner;
                                    return (
                                        <div key={uid} style={cardStyle(uid)}
                                            onClick={() => this.toggle(uid, content.flexible ? 999 : num)}>
                                            <div style={{ position: 'relative' }}>
                                                <img src={img} alt={c?.name} style={{ width: '100%', aspectRatio: '59/86', objectFit: 'cover', display: 'block' }}
                                                    onError={e => { e.target.src = 'https://ms.yugipedia.com//f/fd/Back-Anime-ZX-2.png'; }}
                                                />
                                                {uid in this.state.selected_cards && (
                                                    <div style={{
                                                        position: 'absolute', top: 4, right: 4,
                                                        background: '#4a9eff', borderRadius: '50%',
                                                        width: 20, height: 20, display: 'flex',
                                                        alignItems: 'center', justifyContent: 'center',
                                                        fontSize: 12, fontWeight: 700, color: '#fff'
                                                    }}>✓</div>
                                                )}
                                            </div>
                                            <div style={{ padding: '6px 8px', flex: 1 }}>
                                                <div style={{ color: '#dde', fontSize: 10, fontWeight: 600, lineHeight: 1.3 }}>
                                                    {c?.name || '—'}
                                                </div>
                                                {isMonster && (
                                                    <div style={{ color: '#778', fontSize: 9, marginTop: 2 }}>
                                                        Lv{c?.level} · ATK {c?.atk ?? '?'}
                                                        {isTuner && <span style={{ color: '#6af', marginLeft: 4 }}>[T]</span>}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                        <button onClick={() => {
                            card_selector_info.reject?.('cancelled');
                            this.props.dispatch_close_tool(close_info);
                        }} style={{
                            background: 'transparent', border: '1px solid #444',
                            color: '#888', borderRadius: 8, padding: '9px 22px',
                            cursor: 'pointer', fontSize: 13
                        }}>Cancel</button>
                        <button disabled={!valid} onClick={() => {
                            card_selector_info.resolve({ cardEnvs: Object.keys(this.state.selected_cards), side: SIDE.MINE });
                            this.props.dispatch_close_tool(close_info);
                        }} style={{
                            background: valid ? '#1b4bab' : '#1a1a3a',
                            border: `1px solid ${valid ? '#4a9eff' : '#333'}`,
                            color: valid ? '#fff' : '#555',
                            borderRadius: 8, padding: '9px 26px',
                            cursor: valid ? 'pointer' : 'not-allowed', fontSize: 13,
                            transition: 'all 0.15s ease'
                        }}>Confirm</button>
                    </div>
                </div>
            </div>
        );
    }
}

const mapStateToProps = state => ({
    environment: state.environmentReducer.environment,
    game_meta: state.gameMetaReducer.game_meta,
    my_id: state.serverReducer.my_id,
});
const mapDispatchToProps = dispatch => ({ dispatch_close_tool: (info) => dispatch(close_tool(info)) });
export default connect(mapStateToProps, mapDispatchToProps)(CardSelector);