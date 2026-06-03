/**
 * customDecks.js — src/data/customDecks.js
 * localStorage CRUD helpers for player-created decks.
 *
 * Deck objects stored here have the same shape as DECK_REGISTRY entries:
 * { id, name, icon, description, available, era, deck, extra_deck, isCustom }
 */

const STORAGE_KEY = 'dueldisk_custom_decks';

export const loadCustomDecks = () => {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch {
        return [];
    }
};

export const saveCustomDeck = (deck) => {
    const decks = loadCustomDecks();
    const idx = decks.findIndex(d => d.id === deck.id);
    if (idx !== -1) decks[idx] = deck;
    else decks.push(deck);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(decks));
    return decks;
};

export const deleteCustomDeck = (id) => {
    const decks = loadCustomDecks().filter(d => d.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(decks));
    return decks;
};
