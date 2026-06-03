/**
 * DeckBuilder.jsx
 * Layout: [Card Info] | [Deck View — visual grid] | [Card Search — compact list]
 */

import React from 'react';
import { searchCards, fetchCards, getCardImageUrl } from '../../../data/cardApi';
import { saveCustomDeck, loadCustomDecks, deleteCustomDeck } from '../../../data/customDecks';
import { getAllDecks } from '../../../data/deckRegistry';
import './DeckBuilder.css';

const EXTRA_TYPES = ['Fusion Monster', 'Synchro Monster', 'XYZ Monster', 'Link Monster'];

const isExtraType = (apiCard) => {
    const t = apiCard?.type || '';
    return EXTRA_TYPES.some(et => t.includes(et.split(' ')[0]));
};

const TYPE_FILTERS = [
    { label: 'All',     value: '' },
    { label: 'Monster', value: 'Effect Monster' },
    { label: 'Spell',   value: 'Spell Card' },
    { label: 'Trap',    value: 'Trap Card' },
];

const ERA_COLORS = {
    'DM': '#c8a400', 'GX': '#006abe', '5DS': '#9a0000',
    'ZEXAL': '#ff7f00', 'ARC-V': '#7a00c8', 'Custom': '#00aa66',
};

class DeckBuilder extends React.Component {
    constructor(props) {
        super(props);
        const editing = props.editingDeck;
        this.state = {
            deckId:    editing?.id   || null,
            deckName:  editing?.name || 'New Deck',
            mainDeck:  [],
            extraDeck: [],
            activeTab:     'main',
            searchQuery:   '',
            typeFilter:    '',
            searchResults: [],
            isSearching:   false,
            searchError:   null,
            previewCard:   null,
            showCopyModal: false,
            isCopyLoading: false,
            saveMsg:       null,
            _savedStamp:   0,
        };
        this._searchTimer = null;
    }

    componentDidMount() {
        const { editingDeck } = this.props;
        if (editingDeck && (editingDeck.deck?.length || editingDeck.extra_deck?.length)) {
            this.loadDeckCards(editingDeck);
        }
    }

    componentWillUnmount() { clearTimeout(this._searchTimer); }

    // ── Load deck IDs → fetch API cards ──────────────────────────────────────
    loadDeckCards = async (deck) => {
        const allIds = [...(deck.deck || []), ...(deck.extra_deck || [])];
        if (!allIds.length) return;
        try {
            const cardMap = await fetchCards(allIds);
            this.setState({
                mainDeck:  (deck.deck        || []).map(id => cardMap[id]).filter(Boolean),
                extraDeck: (deck.extra_deck  || []).map(id => cardMap[id]).filter(Boolean),
            });
        } catch (e) { console.error('[DeckBuilder] loadDeckCards failed:', e); }
    };

    // ── Search ────────────────────────────────────────────────────────────────
    onSearchChange = (e) => {
        const q = e.target.value;
        this.setState({ searchQuery: q, searchError: null });
        clearTimeout(this._searchTimer);
        if (!q.trim() && !this.state.typeFilter) { this.setState({ searchResults: [] }); return; }
        this._searchTimer = setTimeout(() => this.runSearch(q, this.state.typeFilter), 400);
    };

    onTypeFilterChange = (value) => {
        this.setState({ typeFilter: value, searchError: null });
        clearTimeout(this._searchTimer);
        this._searchTimer = setTimeout(() => this.runSearch(this.state.searchQuery, value), 100);
    };

    runSearch = async (query, typeFilter) => {
        if (!query.trim() && !typeFilter) { this.setState({ searchResults: [] }); return; }
        this.setState({ isSearching: true, searchError: null });
        try {
            const results = await searchCards(query, typeFilter ? { type: typeFilter } : {});
            this.setState({ searchResults: results.slice(0, 80), isSearching: false });
        } catch {
            this.setState({ isSearching: false, searchError: 'Search failed — check connection.' });
        }
    };

    // ── Deck operations ───────────────────────────────────────────────────────
    countCopies = (apiCard) =>
        [...this.state.mainDeck, ...this.state.extraDeck].filter(c => c.id === apiCard.id).length;

    addCard = (apiCard) => {
        if (this.countCopies(apiCard) >= 3) return;
        if (isExtraType(apiCard)) {
            if (this.state.extraDeck.length >= 15) return;
            this.setState(s => ({ extraDeck: [...s.extraDeck, apiCard], activeTab: 'extra' }));
        } else {
            this.setState(s => ({ mainDeck: [...s.mainDeck, apiCard], activeTab: 'main' }));
        }
    };

    removeCard = (cardId, fromExtra) => {
        const key = fromExtra ? 'extraDeck' : 'mainDeck';
        this.setState(s => {
            const deck = [...s[key]];
            for (let i = deck.length - 1; i >= 0; i--) {
                if (deck[i].id === cardId) { deck.splice(i, 1); break; }
            }
            return { [key]: deck };
        });
    };

    // ── Copy from deck ────────────────────────────────────────────────────────
    copyFromDeck = async (deck) => {
        this.setState({ isCopyLoading: true });
        try {
            await this.loadDeckCards(deck);
            this.setState({
                deckName: deck.isCustom ? deck.name : `${deck.name} (Copy)`,
                deckId:   deck.isCustom ? deck.id   : null,
                isCopyLoading: false,
                showCopyModal: false,
            });
        } catch { this.setState({ isCopyLoading: false, showCopyModal: false }); }
    };

    // ── Save / Delete ─────────────────────────────────────────────────────────
    saveDeck = () => {
        const { deckId, deckName, mainDeck, extraDeck } = this.state;
        if (!deckName.trim()) { this.setState({ saveMsg: '⚠️ Please enter a deck name.' }); return; }
        const id = deckId || `custom_${Date.now()}`;
        const customDeck = {
            id,
            name:        deckName.trim(),
            icon:        '⚙️',
            description: `Custom deck • ${mainDeck.length} main / ${extraDeck.length} extra`,
            available:   true,
            era:         'Custom',
            deck:        mainDeck.map(c => c.id),
            extra_deck:  extraDeck.map(c => c.id),
            isCustom:    true,
        };
        saveCustomDeck(customDeck);
        // Stay in the builder — update deckId (new decks get one assigned) and refresh chips
        this.setState({ deckId: id, saveMsg: `✅ "${customDeck.name}" saved!`, _savedStamp: Date.now() });
        setTimeout(() => this.setState({ saveMsg: null }), 2500);
        // Notify parent that something changed (for DeckSelect to pick up) but do NOT navigate away
        if (this.props.onSave) this.props.onSave(customDeck, /* stayInBuilder */ true);
    };

    // ── Load a preset deck for editing ───────────────────────────────────────
    onPresetSelect = async (e) => {
        const id = e.target.value;
        e.target.value = ''; // reset dropdown so it can re-fire
        if (!id) return;

        const presets = getAllDecks();
        const preset  = presets.find(d => d.id === id);
        if (!preset) return;

        // If a custom override already exists for this preset, load that instead
        const override = loadCustomDecks().find(d => d.id === id);
        const source   = override || preset;

        this.setState({ isCopyLoading: true });
        try {
            await this.loadDeckCards(source);
            this.setState({
                deckId:   id,          // same ID as preset → saving creates/updates an override
                deckName: source.name, // keep the original name (player can rename)
                isCopyLoading: false,
                _savedStamp: Date.now(),
            });
        } catch {
            this.setState({ isCopyLoading: false });
        }
    };

    deleteDeck = () => {
        const { deckId, deckName } = this.state;
        if (!deckId) return;
        if (!window.confirm(`Delete "${deckName}"? This cannot be undone.`)) return;
        deleteCustomDeck(deckId);
        // Clear the form and stay in the builder — don't navigate away
        this.setState({
            deckId:      null,
            deckName:    'New Deck',
            mainDeck:    [],
            extraDeck:   [],
            saveMsg:     `🗑 "${deckName}" deleted`,
            _savedStamp: Date.now(),
        });
        setTimeout(() => this.setState({ saveMsg: null }), 2500);
    };

    // ── Card info panel (left) ────────────────────────────────────────────────
    renderCardInfo() {
        const { previewCard } = this.state;
        if (!previewCard) {
            return (
                <div className="db_info">
                    <div className="db_info_empty">
                        <div className="db_info_empty_icon">🃏</div>
                        <p>Hover a card<br/>to preview it</p>
                    </div>
                </div>
            );
        }
        const img = previewCard.card_images?.[0]?.image_url;
        const copies = this.countCopies(previewCard);
        const maxed = copies >= 3 || (isExtraType(previewCard) && this.state.extraDeck.length >= 15);
        return (
            <div className="db_info">
                {img && (
                    <img src={img} alt={previewCard.name} className="db_info_img"
                        onError={e => { e.target.src = 'https://ms.yugipedia.com//f/fd/Back-Anime-ZX-2.png'; }} />
                )}
                <div className="db_info_name">{previewCard.name}</div>
                <div className="db_info_type">{previewCard.type}</div>
                {previewCard.atk !== undefined && (
                    <div className="db_info_stats">
                        <span>ATK {previewCard.atk ?? '?'}</span>
                        <span>DEF {previewCard.def ?? '?'}</span>
                        {previewCard.level ? <span>Lv {previewCard.level}</span> : null}
                        {previewCard.rank  ? <span>Rk {previewCard.rank}</span>  : null}
                    </div>
                )}
                <div className="db_info_desc">{previewCard.desc}</div>
                <button
                    className={`db_info_add_btn ${maxed ? 'maxed' : ''}`}
                    disabled={maxed}
                    onClick={() => this.addCard(previewCard)}
                >
                    {maxed ? '✓ Max copies' : '+ Add to Deck'}
                </button>
                {copies > 0 && <div className="db_info_copies">{copies}/3 in deck</div>}
            </div>
        );
    }

    // ── Deck panel (center) — visual card grid ────────────────────────────────
    renderDeckPanel() {
        const { activeTab, mainDeck, extraDeck, deckName, deckId, saveMsg } = this.state;
        const deck = activeTab === 'main' ? mainDeck : extraDeck;
        const savedDecks = loadCustomDecks();

        // Group cards for display
        const grouped = [];
        const seen = {};
        for (const card of deck) {
            if (seen[card.id]) seen[card.id].count++;
            else { const e = { card, count: 1 }; seen[card.id] = e; grouped.push(e); }
        }

        const mainOk = mainDeck.length >= 40 && mainDeck.length <= 60;

        return (
            <div className="db_center">
                {/* Preset decks dropdown */}
                <div className="db_preset_row">
                    <span className="db_saved_label" style={{ whiteSpace: 'nowrap' }}>Preset Decks</span>
                    <select
                        className="db_preset_select"
                        defaultValue=""
                        onChange={this.onPresetSelect}
                        title="Load a preset deck to edit"
                    >
                        <option value="" disabled>— select to edit —</option>
                        {getAllDecks().filter(d => d.available).map(d => (
                            <option key={d.id} value={d.id}>
                                {d.icon} {d.name} ({d.era})
                                {loadCustomDecks().some(c => c.id === d.id) ? ' ✎' : ''}
                            </option>
                        ))}
                    </select>
                </div>

                {/* My Decks (custom) row */}
                {savedDecks.length > 0 && (
                    <div className="db_saved_section">
                        <div className="db_saved_label">My Decks</div>
                        <div className="db_saved_list">
                            {savedDecks
                                .filter(d => !getAllDecks().some(p => p.id === d.id)) // exclude preset overrides from chips
                                .map(d => (
                                <button
                                    key={d.id}
                                    className={`db_saved_chip ${deckId === d.id ? 'active' : ''}`}
                                    onClick={() => this.copyFromDeck(d)}
                                    title={`${d.deck?.length ?? 0} main / ${d.extra_deck?.length ?? 0} extra`}
                                >
                                    {d.name}
                                </button>
                            ))}
                            <button className="db_saved_new"
                                onClick={() => this.setState({ deckId: null, deckName: 'New Deck', mainDeck: [], extraDeck: [] })}>
                                + New
                            </button>
                        </div>
                    </div>
                )}

                {/* Deck name */}
                <input className="db_name_input" type="text" placeholder="Deck name…"
                    value={deckName} onChange={e => this.setState({ deckName: e.target.value })} />

                {/* Tabs */}
                <div className="db_tabs">
                    <button className={`db_tab ${activeTab === 'main' ? 'active' : ''}`}
                        onClick={() => this.setState({ activeTab: 'main' })}>
                        Main&nbsp;
                        <span className={mainOk ? 'db_count_ok' : 'db_count_warn'}>{mainDeck.length}</span>
                    </button>
                    <button className={`db_tab ${activeTab === 'extra' ? 'active' : ''}`}
                        onClick={() => this.setState({ activeTab: 'extra' })}>
                        Extra&nbsp;<span className="db_count_ok">{extraDeck.length}/15</span>
                    </button>
                </div>

                {/* Visual card grid */}
                <div className="db_deck_grid">
                    {grouped.length === 0 && (
                        <div className="db_deck_grid_empty">
                            Search for cards on the right →<br/>click <strong>+</strong> to add them here
                        </div>
                    )}
                    {grouped.map(({ card, count }) => {
                        const img = card.card_images?.[0]?.image_url_small || card.card_images?.[0]?.image_url;
                        return (
                            <div key={card.id} className="db_deck_card_tile"
                                onMouseEnter={() => this.setState({ previewCard: card })}>
                                {img && (
                                    <img src={img} alt={card.name} className="db_deck_card_img"
                                        onError={e => { e.target.src = 'https://ms.yugipedia.com//f/fd/Back-Anime-ZX-2.png'; }} />
                                )}
                                {count > 1 && <div className="db_deck_card_count">×{count}</div>}
                                <button className="db_deck_card_remove"
                                    title="Remove one copy"
                                    onClick={(e) => { e.stopPropagation(); this.removeCard(card.id, activeTab === 'extra'); }}>
                                    −
                                </button>
                            </div>
                        );
                    })}
                </div>

                {/* Actions */}
                <div className="db_actions">
                    <button className="db_copy_btn" onClick={() => this.setState({ showCopyModal: true })}>
                        📋 Copy from Deck
                    </button>
                    <button className="db_save_btn" onClick={this.saveDeck}>💾 Save</button>
                    {deckId && (
                        <button className="db_delete_btn" onClick={this.deleteDeck}>🗑</button>
                    )}
                </div>
                {saveMsg && <div className="db_save_msg">{saveMsg}</div>}
            </div>
        );
    }

    // ── Search panel (right) — compact list ──────────────────────────────────
    renderSearchPanel() {
        const { searchQuery, typeFilter, searchResults, isSearching, searchError } = this.state;

        return (
            <div className="db_right">
                <div className="db_search_row">
                    <input className="db_search_input" type="text"
                        placeholder="🔍 Search any card…"
                        value={searchQuery} onChange={this.onSearchChange} autoFocus />
                </div>

                <div className="db_filters">
                    {TYPE_FILTERS.map(f => (
                        <button key={f.value}
                            className={`db_filter_btn ${typeFilter === f.value ? 'active' : ''}`}
                            onClick={() => this.onTypeFilterChange(f.value)}>
                            {f.label}
                        </button>
                    ))}
                </div>

                <div className="db_search_list">
                    {isSearching && <div className="db_status">Searching…</div>}
                    {searchError && <div className="db_status db_error">{searchError}</div>}
                    {!isSearching && !searchError && searchResults.length === 0 && (
                        <div className="db_status">
                            {searchQuery || typeFilter ? 'No cards found.' : 'Type a card name to search.'}
                        </div>
                    )}

                    {searchResults.map(card => {
                        const copies = this.countCopies(card);
                        const maxed = copies >= 3 || (isExtraType(card) && this.state.extraDeck.length >= 15);
                        const img = card.card_images?.[0]?.image_url_small;

                        return (
                            <div key={card.id}
                                className={`db_search_result_row ${maxed ? 'maxed' : ''}`}
                                onMouseEnter={() => this.setState({ previewCard: card })}>
                                <div className="db_search_result_img_wrap">
                                    {img
                                        ? <img src={img} alt="" className="db_search_result_thumb"
                                            onError={e => { e.target.src = 'https://ms.yugipedia.com//f/fd/Back-Anime-ZX-2.png'; }} />
                                        : <div className="db_search_result_thumb db_thumb_placeholder" />
                                    }
                                </div>
                                <div className="db_search_result_info">
                                    <div className="db_search_result_name">{card.name}</div>
                                    <div className="db_search_result_meta">
                                        {card.type?.replace(' Monster', '').replace(' Card', '')}
                                        {card.atk !== undefined ? ` • ${card.atk}/${card.def}` : ''}
                                    </div>
                                </div>
                                {copies > 0 && (
                                    <span className="db_search_result_copies">×{copies}</span>
                                )}
                                <button className={`db_search_add_btn ${maxed ? 'maxed' : ''}`}
                                    disabled={maxed}
                                    onClick={(e) => { e.stopPropagation(); this.addCard(card); }}
                                    title={maxed ? 'Max copies' : 'Add to deck'}>
                                    {maxed ? '✓' : '+'}
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    }

    // ── Copy deck modal ───────────────────────────────────────────────────────
    renderCopyModal() {
        const { showCopyModal, isCopyLoading } = this.state;
        if (!showCopyModal) return null;
        const allDecks = [...getAllDecks().filter(d => d.available), ...loadCustomDecks()];
        return (
            <div className="db_modal_overlay" onClick={() => this.setState({ showCopyModal: false })}>
                <div className="db_modal" onClick={e => e.stopPropagation()}>
                    <h3>Copy From Deck</h3>
                    {isCopyLoading && <div className="db_status">Loading deck cards…</div>}
                    <div className="db_copy_list">
                        {allDecks.map(deck => (
                            <button key={deck.id} className="db_copy_item"
                                onClick={() => this.copyFromDeck(deck)} disabled={isCopyLoading}>
                                <span className="db_copy_icon">{deck.icon}</span>
                                <span className="db_copy_name">{deck.name}</span>
                                <span className="db_copy_era" style={{ color: ERA_COLORS[deck.era] || '#aaa' }}>
                                    {deck.era}
                                </span>
                            </button>
                        ))}
                    </div>
                    <button className="db_modal_close" onClick={() => this.setState({ showCopyModal: false })}>
                        Cancel
                    </button>
                </div>
            </div>
        );
    }

    render() {
        return (
            <div className="db_container">
                <div className="db_header">
                    <button className="db_back_btn" onClick={this.props.onBack}>← Back</button>
                    <h2>🃏 Deck Builder</h2>
                    <div style={{ width: 80 }} />
                </div>
                {/* Layout: Card Info | Deck Grid | Card Search */}
                <div className="db_body">
                    {this.renderCardInfo()}
                    {this.renderDeckPanel()}
                    {this.renderSearchPanel()}
                </div>
                {this.renderCopyModal()}
            </div>
        );
    }
}

export default DeckBuilder;
