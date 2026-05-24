/**
 * cardApi.js
 * Fetches card data from YGOPRODeck API and caches it in localStorage.
 * 
 * API docs: https://ygoprodeck.com/api-guide/
 * Rate limit: ~20 requests/sec, free, no key required.
 * 
 * Cache strategy:
 *   - Cards cached individually by ID under key "ygopro_card_{id}"
 *   - Cache version stored under "ygopro_cache_version"
 *   - Stale after 7 days
 */

const API_BASE = 'https://db.ygoprodeck.com/api/v7/cardinfo.php';
const CACHE_VERSION = '2';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ─── CACHE HELPERS ────────────────────────────────────────────────────────────

const cacheKey = (id) => `ygopro_card_${id}`;

const readCache = (id) => {
    try {
        const raw = localStorage.getItem(cacheKey(id));
        if (!raw) return null;
        const { data, timestamp, version } = JSON.parse(raw);
        if (version !== CACHE_VERSION) return null;
        if (Date.now() - timestamp > CACHE_TTL_MS) return null;
        return data;
    } catch {
        return null;
    }
};

const writeCache = (id, data) => {
    try {
        localStorage.setItem(cacheKey(id), JSON.stringify({
            data,
            timestamp: Date.now(),
            version: CACHE_VERSION
        }));
    } catch {
        // localStorage full or unavailable — skip caching
    }
};

// ─── API FETCH ────────────────────────────────────────────────────────────────

/**
 * Fetch a single card by its Konami ID.
 * Returns the raw YGOPRODeck card object.
 */
export const fetchCard = async (id) => {
    const cached = readCache(id);
    if (cached) return cached;

    const res = await fetch(`${API_BASE}?id=${id}`);
    if (!res.ok) throw new Error(`YGOPRODeck API error for card ${id}: ${res.status}`);

    const json = await res.json();
    const card = json.data[0];
    writeCache(id, card);
    return card;
};

/**
 * Fetch multiple cards by ID in a single API call (batched).
 * Falls back to individual fetches for any cards not returned.
 * Returns a map of { id -> apiCard }
 */
export const fetchCards = async (ids) => {
    const result = {};
    const toFetch = [];

    // Check cache first
    for (const id of ids) {
        const cached = readCache(id);
        if (cached) {
            result[id] = cached;
        } else {
            toFetch.push(id);
        }
    }

    if (toFetch.length === 0) return result;

    // Batch fetch — YGOPRODeck supports comma-separated IDs
    try {
        const res = await fetch(`${API_BASE}?id=${toFetch.join(',')}`);
        if (!res.ok) throw new Error(`Batch fetch failed: ${res.status}`);
        const json = await res.json();

        for (const card of json.data) {
            result[card.id] = card;
            writeCache(card.id, card);
        }
    } catch (err) {
        console.warn('[cardApi] Batch fetch failed, trying individually:', err);
        // Fall back to individual fetches
        for (const id of toFetch) {
            try {
                result[id] = await fetchCard(id);
            } catch (e) {
                console.error(`[cardApi] Could not fetch card ${id}:`, e);
            }
        }
    }

    return result;
};

/**
 * Given a raw YGOPRODeck card object, return the CARD_TYPE constant string.
 * Maps YGOPRODeck's "type" field to our internal CARD_TYPE constants.
 */
export const apiTypeToCardType = (apiCard) => {
    const t = apiCard.type?.toLowerCase() || '';

    if (t.includes('fusion'))     return 'MONSTER_FUSION';
    if (t.includes('synchro'))    return 'MONSTER_SYNCHRO';
    if (t.includes('xyz'))        return 'MONSTER_XYZ';
    if (t.includes('link'))       return 'MONSTER_LINK';
    if (t.includes('ritual') && t.includes('monster')) return 'MONSTER_RITUAL';
    if (t.includes('pendulum'))   return 'MONSTER_PENDULUM';
    if (t.includes('effect'))     return 'MONSTER_EFFECT';
    if (t.includes('normal') && t.includes('monster')) return 'MONSTER_NORMAL';
    if (t.includes('token'))      return 'MONSTER_NORMAL';

    // Spells
    if (t.includes('quick-play spell')) return 'SPELL_QUICK';
    if (t.includes('equip spell'))      return 'SPELL_EQUIPMENT';
    if (t.includes('continuous spell')) return 'SPELL_CONTINUOUS';
    if (t.includes('field spell'))      return 'SPELL_ENVIRONMENT';
    if (t.includes('ritual spell'))     return 'SPELL_NORMAL';
    if (t.includes('spell'))            return 'SPELL_NORMAL';

    // Traps
    if (t.includes('counter trap'))    return 'TRAP_COUNTER';
    if (t.includes('continuous trap')) return 'TRAP_CONTINUOUS';
    if (t.includes('trap'))            return 'TRAP_NORMAL';

    return 'MONSTER_NORMAL'; // fallback
};

/**
 * Map YGOPRODeck attribute string to our ATTRIBUTE constant.
 */
export const apiAttributeToConstant = (attr) => {
    const map = {
        'LIGHT': 'LIGHT', 'DARK': 'DARK', 'EARTH': 'EARTH',
        'FIRE': 'FIRE', 'WATER': 'WATER', 'WIND': 'WIND', 'DIVINE': 'DIVINE'
    };
    return map[attr?.toUpperCase()] || 'DARK';
};

/**
 * Get the best available card image URL from an API card object.
 */
export const getCardImageUrl = (apiCard) => {
    return apiCard?.card_images?.[0]?.image_url_small
        || apiCard?.card_images?.[0]?.image_url
        || 'https://ms.yugipedia.com//f/fd/Back-Anime-ZX-2.png';
};

/**
 * Clear all cached card data (useful for forcing a refresh).
 */
export const clearCardCache = () => {
    try {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k?.startsWith('ygopro_card_')) keysToRemove.push(k);
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
        console.log(`[cardApi] Cleared ${keysToRemove.length} cached cards`);
    } catch {}
};
