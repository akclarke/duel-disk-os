/**
 * cardLoader.js — src/data/cardLoader.js
 * Builds card objects from YGOPRODeck API + effectsRegistry.
 * For cards with legacy SpellData entries (like Polymerization), pulls those effects.
 */

import { fetchCards, apiTypeToCardType, apiAttributeToConstant, getCardImageUrl } from './cardApi';
import { EFFECTS_REGISTRY } from './effectsRegistry';
import { autoGenEffect } from './effectAutoGen';
import { spell_database } from '../Components/Card/Spell/SpellData';
import { CARD_TYPE, ENVIRONMENT } from '../Components/Card/utils/constant';

// ─── IN-MEMORY CARD STORE ─────────────────────────────────────────────────────
const cardStore = {};

// ─── SUMMON CONDITION HELPERS ─────────────────────────────────────────────────
const getMyMonsterCount = (environment) => {
    if (!environment) return 0;
    return environment['MINE']?.['MONSTER_FIELD']
        ?.filter(m => m !== 'PLACEHOLDER' && m?.card).length || 0;
};

const buildCanNormalSummon = (level, cardType) => (self, environment) => {
    if (environment?.CAN_NOT_SUMMON) return false;
    if (['MONSTER_FUSION','MONSTER_SYNCHRO','MONSTER_XYZ','MONSTER_LINK'].includes(cardType)) return false;
    if (level <= 4) return true;
    if (level <= 6) return getMyMonsterCount(environment) >= 1;
    return getMyMonsterCount(environment) >= 2;
};

// ─── BUILDERS ────────────────────────────────────────────────────────────────
const buildMonsterCard = (id, apiCard, cardType) => {
    const level = apiCard.level || apiCard.rank || 0;
    const effects = EFFECTS_REGISTRY[id] || autoGenEffect(id, apiCard) || [];

    const card = {
        key: id,
        name: apiCard.name,
        atk: apiCard.atk ?? 0,
        def: apiCard.def ?? 0,
        level,
        rank: apiCard.rank || 0,
        attribute: apiAttributeToConstant(apiCard.attribute),
        race: apiCard.race,
        description: apiCard.desc,
        card_type: cardType,
        card_pic: getCardImageUrl(apiCard),
        isTuner: apiCard.type?.toLowerCase().includes('tuner') ||
                 apiCard.desc?.toLowerCase().includes('tuner') || false,
        effects,
        passive_effect: effects[0]?.passive_effect ?? null,
        on_summon: effects[0]?.on_summon ?? null,
        can_normal_summon: buildCanNormalSummon(level, cardType),
        can_special_summon: () => false,
    };

    if (cardType === CARD_TYPE.MONSTER.FUSION) {
        card.fusion_materials = EFFECTS_REGISTRY[`${id}_materials`] || [];
    }
    if (cardType === CARD_TYPE.MONSTER.SYNCHRO) {
        card.synchro_materials = EFFECTS_REGISTRY[`${id}_materials`] || [];
    }
    if (cardType === CARD_TYPE.MONSTER.XYZ) {
        card.xyz_materials = EFFECTS_REGISTRY[`${id}_materials`] || [];
    }
    if (cardType === CARD_TYPE.MONSTER.PENDULUM) {
        card.scale = apiCard.scale ?? 0;
        card.pendDesc = apiCard.pend_desc || '';
        card.pendulumEffect = effects[0]?.pendulumEffect ?? null;
        // Pendulums CAN be normal summoned face-up (tribute rules apply by level).
        // They cannot be normal SET face-down — Hand.jsx hides the Set button.
        // (can_normal_summon already set above via buildCanNormalSummon — no override needed)
    }
    if (cardType === CARD_TYPE.MONSTER.LINK) {
        card.linkRating = apiCard.linkval ?? 0;
        card.linkMarkers = apiCard.linkmarkers || [];
        card.def = 0; // Link monsters have no DEF
        card.can_normal_summon = () => false;
    }

    return card;
};

const buildSpellCard = (id, apiCard, cardType) => {
    // First check our custom effectsRegistry
    let effects = EFFECTS_REGISTRY[id];

    // If not in effectsRegistry, try legacy spell_database, then auto-gen
    if (!effects) {
        try {
            if (spell_database && spell_database[id]) {
                const legacyCard = spell_database[id]();
                effects = legacyCard.effects || [];
            }
        } catch (e) {
            console.warn('[cardLoader] spell_database error for', id, e);
        }
    }

    const finalEffects = effects || autoGenEffect(id, apiCard) || [];
    return {
        key: id,
        name: apiCard.name,
        description: apiCard.desc,
        card_type: cardType,
        card_pic: getCardImageUrl(apiCard),
        effects: finalEffects,
        is_continuous: !!(finalEffects[0]?.is_continuous),
        passive_effect: finalEffects[0]?.passive_effect ?? null,
    };
};

const buildTrapCard = (id, apiCard, cardType) => {
    const effects = EFFECTS_REGISTRY[id] || [];
    return {
        key: id,
        name: apiCard.name,
        description: apiCard.desc,
        card_type: cardType,
        card_pic: getCardImageUrl(apiCard),
        effects,
        is_continuous: !!(effects[0]?.is_continuous),
        passive_effect: effects[0]?.passive_effect ?? null,
    };
};

// ─── PRELOAD ──────────────────────────────────────────────────────────────────
export const preloadDeckCards = async (ids, onProgress) => {
    const unique = [...new Set(ids)];
    const alreadyLoaded = unique.filter(id => cardStore[id]);
    const toLoad = unique.filter(id => !cardStore[id]);

    if (toLoad.length === 0) {
        onProgress?.(unique.length, unique.length);
        return;
    }

    onProgress?.(alreadyLoaded.length, unique.length);

    const apiCards = await fetchCards(toLoad);

    let loaded = alreadyLoaded.length;
    for (const [idStr, apiCard] of Object.entries(apiCards)) {
        const id = parseInt(idStr);
        const cardType = apiTypeToCardType(apiCard);
        const typeStr = cardType.split('_')[0];

        if (typeStr === 'MONSTER') {
            cardStore[id] = buildMonsterCard(id, apiCard, cardType);
        } else if (typeStr === 'SPELL') {
            cardStore[id] = buildSpellCard(id, apiCard, cardType);
        } else {
            cardStore[id] = buildTrapCard(id, apiCard, cardType);
        }
        loaded++;
        onProgress?.(loaded, unique.length);
    }

    console.log(`[cardLoader] Loaded ${toLoad.length} cards (${alreadyLoaded.length} cached)`);
};

// ─── RUNTIME CARD ACCESS ──────────────────────────────────────────────────────
export const create_card_from_api = (id) => {
    const card = cardStore[id];
    if (!card) {
        console.error(`[cardLoader] Card ${id} not in store — was preloadDeckCards called?`);
        return {
            key: id,
            name: `Unknown (${id})`,
            atk: 0, def: 0, level: 1,
            attribute: 'DARK', race: 'Unknown',
            description: '',
            card_type: CARD_TYPE.MONSTER.NORMAL,
            card_pic: 'https://ms.yugipedia.com//f/fd/Back-Anime-ZX-2.png',
            effects: [],
            can_normal_summon: () => true,
            can_special_summon: () => false,
        };
    }
    return card;
};

export const get_card_meta = (id) => {
    const card = cardStore[id];
    if (!card) return { card_type: CARD_TYPE.MONSTER.NORMAL };
    return { card_type: card.card_type };
};

export const isCardLoaded = (id) => !!cardStore[id];
export const getLoadedCardIds = () => Object.keys(cardStore).map(Number);