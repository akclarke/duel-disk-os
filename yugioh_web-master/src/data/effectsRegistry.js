/**
 * effectsRegistry.js — src/data/effectsRegistry.js
 *
 * Maps card IDs to player-activated effects (hand click or field click).
 * Triggered effects (on destroy, on battle damage, on attack declared)
 * live in triggerRegistry.js instead.
 *
 * Mix of styles is intentional — factory style for most cards,
 * hand-written for cards that need custom logic beyond what the factory covers.
 */

import { ENVIRONMENT, SIDE, CARD_TYPE, CARD_POS } from '../Components/Card/utils/constant';
import { CARD_SELECT_TYPE } from '../Components/PlayerGround/utils/constant';
import { TOOL_TYPE } from '../Store/actions/actionTypes';
import { show_tool } from '../Store/actions/toolActions';
import store from '../Store/store';
import { update_environment } from '../Store/actions/environmentActions';
import { get_unique_id_from_ennvironment } from '../Components/PlayerGround/utils/utils';
import { logEvent, LOG_TYPE } from './duelLog';

import {
    // Operations
    searchDeck, drawCards, discardFromHand, gainLP, payLP, dealDamage,
    destroyMonsters, destroySpellsTraps, specialSummonFromDeck,
    specialSummonFromHand, specialSummonFromGY, passiveBoost, sequence, when,
    // Wrappers
    onActivate, continuous, onSummon, oncePerTurn, onDestroy,
    onBattleDamage, onAttackDeclared, whileOnField,
    // Shortcuts
    floater, recruiter, drawSpell, nuke, raigeki, burn, collectiveBoost,
} from './effectFactory';

// ─── INTERNAL HELPERS (kept for hand-written cards below) ────────────────────

const openSelector = (info) =>
    new Promise((resolve, reject) =>
        store.dispatch(show_tool({
            tool_type: TOOL_TYPE.CARD_SELECTOR,
            info: { ...info, resolve, reject }
        }))
    );

const getMonsters = (env, side) =>
    (env[side][ENVIRONMENT.MONSTER_FIELD] || [])
        .filter(c => c !== CARD_TYPE.PLACEHOLDER && c?.card);

const dispatchEnv = (env) => store.dispatch(update_environment(env));

// ─── EFFECTS REGISTRY ────────────────────────────────────────────────────────

export const EFFECTS_REGISTRY = {

    // ════════════════════════════════════════════════════════════════════════
    // ── UNIVERSAL SPELLS ──────────────────────────────────────────────────
    // ════════════════════════════════════════════════════════════════════════

    // Dark Hole (53129443) — destroy ALL monsters
    53129443: nuke(),

    // Raigeki (12580477) — destroy all OPPONENT monsters
    12580477: raigeki(),

    // Pot of Greed (55144522) — draw 2 cards
    55144522: drawSpell(2),

    // Graceful Charity (74137509 — draw 3, discard 2
    74137509: onActivate(sequence(drawCards(3), discardFromHand(2,
        {}, 'Graceful Charity — discard 2 cards'))),

    // Heavy Storm (19613556) — destroy all spells/traps
    19613556: onActivate(destroySpellsTraps({ side: 'BOTH' }),
        (env) => [SIDE.MINE, SIDE.OPPONENT].some(s =>
            (env[s][ENVIRONMENT.SPELL_FIELD] || []).some(c => c?.card)
        )
    ),

    // Mystical Space Typhoon (5318639) — destroy 1 opponent S/T (auto-targets first found)
    5318639: onActivate((env) => {
        const field = env[SIDE.OPPONENT][ENVIRONMENT.SPELL_FIELD];
        for (let i = 0; i < field.length; i++) {
            if (field[i]?.card) {
                env[SIDE.OPPONENT][ENVIRONMENT.GRAVEYARD].push(field[i]);
                field[i] = CARD_TYPE.PLACEHOLDER;
                    break;
            }
        }
    }, (env) => (env[SIDE.OPPONENT][ENVIRONMENT.SPELL_FIELD] || []).some(c => c?.card)),

    // Dian Keto the Cure Master (84257639) — gain 1000 LP
    84257639: onActivate(gainLP(1000)),

    // Monster Reborn (83764718) — revive from EITHER graveyard
    // Hand-written: needs both-GY selector logic
    83764718: onActivate((env) => {
        const myGY  = (env[SIDE.MINE][ENVIRONMENT.GRAVEYARD]     || []).filter(c => c?.card?.card_type?.startsWith('MONSTER'));
        const oppGY = (env[SIDE.OPPONENT][ENVIRONMENT.GRAVEYARD] || []).filter(c => c?.card?.card_type?.startsWith('MONSTER'));
        const allGY = [...myGY, ...oppGY];
        if (!allGY.length) return Promise.resolve();

        return openSelector({
            type: CARD_SELECT_TYPE.CARD_SELECT_FROM_HAND,
            label: 'Monster Reborn — select a monster from either GY',
            sourceList: allGY,
        }).then(({ cardEnvs: [uid] }) => {
            for (const s of [SIDE.MINE, SIDE.OPPONENT]) {
                const gy = env[s][ENVIRONMENT.GRAVEYARD];
                const idx = gy.findIndex(c => get_unique_id_from_ennvironment(c) === uid);
                if (idx === -1) continue;
                const [card] = gy.splice(idx, 1);
                const field = env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD];
                const priorities = [2, 3, 1, 4, 0];
                for (const slot of priorities) {
                    if (field[slot] === CARD_TYPE.PLACEHOLDER) {
                        card.current_pos = CARD_POS.FACE;
                        field[slot] = card;
                        break;
                    }
                }
                    break;
            }
        }).catch(() => {});
    }, (env) => {
        const myGY  = (env[SIDE.MINE][ENVIRONMENT.GRAVEYARD]     || []).some(c => c?.card?.card_type?.startsWith('MONSTER'));
        const oppGY = (env[SIDE.OPPONENT][ENVIRONMENT.GRAVEYARD] || []).some(c => c?.card?.card_type?.startsWith('MONSTER'));
        return myGY || oppGY;
    }),

    // Call of the Haunted (97077563) — revive 1 monster from YOUR GY
    97077563: onActivate(
        specialSummonFromGY({ type: 'MONSTER' }, 'Call of the Haunted — select monster to revive'),
        (env) => (env[SIDE.MINE][ENVIRONMENT.GRAVEYARD] || []).some(c => c?.card?.card_type?.startsWith('MONSTER'))
    ),

    // ════════════════════════════════════════════════════════════════════════
    // ── WARRIOR SPELLS ──────────────────────────────────────────────────────
    // ════════════════════════════════════════════════════════════════════════

    // E - Emergency Call (213326) — add 1 HERO monster from deck to hand
    213326: onActivate(
        searchDeck({ nameIncludes: 'HERO', type: 'MONSTER' }, 'E - Emergency Call — add 1 HERO to hand'),
        (env) => (env[SIDE.MINE][ENVIRONMENT.DECK] || []).some(c => c?.card?.name?.toLowerCase().includes('hero'))
    ),

    // Reinforcement of the Army (32807846) — add 1 Warrior Lv4 or lower from deck
    32807846: onActivate(
        searchDeck({ race: 'Warrior', level: 4, type: 'MONSTER' }, 'ROTA — add 1 Warrior (Lv ≤ 4) to hand'),
        (env) => (env[SIDE.MINE][ENVIRONMENT.DECK] || []).some(c =>
            c?.card?.race?.toLowerCase().includes('warrior') && (c?.card?.level || 0) <= 4)
    ),

    // The A. Forces (403847) — continuous; Warriors gain 200 ATK per Warrior on field
    403847: continuous(
        (env, side) => {
            const myField = env[side][ENVIRONMENT.MONSTER_FIELD];
            const isActive = myField.some(c => c !== CARD_TYPE.PLACEHOLDER && c?.card?.key === 403847);
            if (!isActive) return;
            const count = myField.filter(c => c !== CARD_TYPE.PLACEHOLDER && c?.card?.race?.toLowerCase().includes('warrior')).length;
            if (!count) return;
            for (const m of myField) {
                if (m !== CARD_TYPE.PLACEHOLDER && m?.card?.race?.toLowerCase().includes('warrior'))
                    m.current_atk = (m.current_atk ?? m.card.atk ?? 0) + count * 200;
            }
        }
    ),

    // ════════════════════════════════════════════════════════════════════════
    // ── DARK MAGICIAN SPELLS ────────────────────────────────────────────────
    // ════════════════════════════════════════════════════════════════════════

    // Dark Magic Curtain (99789342) — pay half LP, summon DM from deck
    99789342: onActivate((env) => {
        const cost = Math.floor(env[SIDE.MINE].hp / 2);
        env[SIDE.MINE].hp -= cost;
        return specialSummonFromDeck(
            { key: 46986414 },
            'Dark Magic Curtain — Summon Dark Magician from Deck'
        )(env, SIDE.MINE);
    }, (env) => env[SIDE.MINE].hp > 0 &&
        (env[SIDE.MINE][ENVIRONMENT.DECK] || []).some(c => c?.card?.key === 46986414)),

    // Dark Magic Attack (2314238) — if DM on field, destroy all opp S/T
    2314238: onActivate(
        destroySpellsTraps({ side: 'OPPONENT' }),
        (env) => getMonsters(env, SIDE.MINE).some(c => c?.card?.key === 46986414) &&
                 (env[SIDE.OPPONENT][ENVIRONMENT.SPELL_FIELD] || []).some(c => c?.card)
    ),

    // Thousand Knives (63391643) — if DM on field, destroy highest ATK opp monster
    63391643: onActivate((env) => {
        const field = env[SIDE.OPPONENT][ENVIRONMENT.MONSTER_FIELD];
        let highIdx = -1, highAtk = -1;
        for (let i = 0; i < field.length; i++) {
            if (field[i]?.card) {
                const atk = field[i].current_atk ?? field[i].card.atk ?? 0;
                if (atk > highAtk) { highAtk = atk; highIdx = i; }
            }
        }
        if (highIdx !== -1) {
            env[SIDE.OPPONENT][ENVIRONMENT.GRAVEYARD].push(field[highIdx]);
            field[highIdx] = CARD_TYPE.PLACEHOLDER;
        }
    }, (env) => getMonsters(env, SIDE.MINE).some(c => c?.card?.key === 46986414) &&
               getMonsters(env, SIDE.OPPONENT).length > 0),

    // ════════════════════════════════════════════════════════════════════════
    // ── HERO SPELLS ─────────────────────────────────────────────────────────
    // ════════════════════════════════════════════════════════════════════════

    // Skyscraper (37120512) — continuous; HEROs gain 1000 ATK
    37120512: continuous(
        (env, side) => {
            const isActive = (env[side][ENVIRONMENT.SPELL_FIELD] || [])
                .some(c => c?.card?.key === 37120512);
            if (!isActive) return;
            for (const m of (env[side][ENVIRONMENT.MONSTER_FIELD] || [])) {
                if (m !== CARD_TYPE.PLACEHOLDER && m?.card?.name?.toLowerCase().includes('hero'))
                    m.current_atk = (m.current_atk ?? m.card.atk ?? 0) + 1000;
            }
        }
    ),

    // Miracle Fusion (45906428) — banish HERO materials, Fusion Summon
    // Hand-written: complex multi-step selection
    45906428: onActivate((env) => {
        const extra = (env[SIDE.MINE][ENVIRONMENT.EXTRA_DECK] || [])
            .filter(c => c?.card?.card_type === 'MONSTER_FUSION' && c?.card?.fusion_materials?.length > 0);
        if (!extra.length) return Promise.resolve();

        return openSelector({
            type: CARD_SELECT_TYPE.CARD_SELECT_SPECIAL_SUMMON_TARGET,
            label: 'Miracle Fusion — select HERO Fusion Monster',
        }).then(({ cardEnvs: [targetUid] }) => {
            const target = extra.find(c => get_unique_id_from_ennvironment(c) === targetUid);
            if (!target) return;
            const fieldM = getMonsters(env, SIDE.MINE).filter(m => target.card.fusion_materials?.includes(m.card.key));
            const gyM    = (env[SIDE.MINE][ENVIRONMENT.GRAVEYARD] || []).filter(c => target.card.fusion_materials?.includes(c?.card?.key));
            const avail  = [...fieldM, ...gyM];
            const needed = target.card.fusion_materials?.length || 2;
            if (avail.length < needed) return;
            for (const mat of avail.slice(0, needed)) {
                const fIdx = (env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD] || []).findIndex(c => c === mat);
                if (fIdx !== -1) { env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD][fIdx] = CARD_TYPE.PLACEHOLDER; }
                else {
                    const gIdx = (env[SIDE.MINE][ENVIRONMENT.GRAVEYARD] || []).indexOf(mat);
                    if (gIdx !== -1) env[SIDE.MINE][ENVIRONMENT.GRAVEYARD].splice(gIdx, 1);
                }
                env[SIDE.MINE][ENVIRONMENT.GRAVEYARD].push(mat);
            }
            const edIdx = (env[SIDE.MINE][ENVIRONMENT.EXTRA_DECK] || [])
                .findIndex(c => get_unique_id_from_ennvironment(c) === targetUid);
            if (edIdx !== -1) env[SIDE.MINE][ENVIRONMENT.EXTRA_DECK].splice(edIdx, 1);
            const field = env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD];
            const priorities = [2, 3, 1, 4, 0];
            for (const slot of priorities) {
                if (field[slot] === CARD_TYPE.PLACEHOLDER) {
                    target.current_pos = CARD_POS.FACE;
                    field[slot] = target;
                    break;
                }
            }
        }).catch(() => {});
    }, (env) => (env[SIDE.MINE][ENVIRONMENT.EXTRA_DECK] || [])
        .some(c => c?.card?.card_type === 'MONSTER_FUSION')),

    // ════════════════════════════════════════════════════════════════════════
    // ── TOON SPELLS ─────────────────────────────────────────────────────────
    // ════════════════════════════════════════════════════════════════════════

    // Toon World (15259703) — pay 1000 LP; continuous
    15259703: continuous(
        null, // no passive effect needed — Toon World just enables Toon monsters
        payLP(1000),
        (env) => env[SIDE.MINE].hp > 1000
    ),

    // Toon Kingdom (43175858) — banish top 3 from deck; continuous
    43175858: continuous(
        null,
        (env) => {
            const deck = env[SIDE.MINE][ENVIRONMENT.DECK];
            const banished = deck.splice(0, Math.min(3, deck.length));
            env[SIDE.MINE][ENVIRONMENT.GRAVEYARD].push(...banished); // simplified: no banish zone yet
        },
        (env) => (env[SIDE.MINE][ENVIRONMENT.DECK] || []).length >= 3
    ),

    // Toon Table of Contents (89997728) — search any Toon card
    89997728: onActivate(
        searchDeck({ nameIncludes: 'toon' }, 'Toon Table of Contents — add 1 Toon card to hand'),
        (env) => (env[SIDE.MINE][ENVIRONMENT.DECK] || []).some(c => c?.card?.name?.toLowerCase().includes('toon'))
    ),

    // Toon Bookmark (91500017) — add Toon World from deck or GY to hand
    91500017: onActivate((env) => {
        const deckCopies = (env[SIDE.MINE][ENVIRONMENT.DECK]      || []).filter(c => c?.card?.key === 15259703);
        const gyCopies   = (env[SIDE.MINE][ENVIRONMENT.GRAVEYARD] || []).filter(c => c?.card?.key === 15259703);
        const pool = [...deckCopies, ...gyCopies];
        if (!pool.length) return Promise.resolve();

        return openSelector({
            type: CARD_SELECT_TYPE.CARD_SELECT_FROM_HAND,
            label: 'Toon Bookmark — add Toon World to hand',
            sourceList: pool,
        }).then(({ cardEnvs: [uid] }) => {
            for (const loc of [ENVIRONMENT.DECK, ENVIRONMENT.GRAVEYARD]) {
                const arr = env[SIDE.MINE][loc];
                const idx = arr.findIndex(c => get_unique_id_from_ennvironment(c) === uid);
                if (idx !== -1) {
                    env[SIDE.MINE][ENVIRONMENT.HAND].push(arr.splice(idx, 1)[0]);
                            return;
                }
            }
        }).catch(() => {});
    }, (env) => {
        const inDeck = (env[SIDE.MINE][ENVIRONMENT.DECK]      || []).some(c => c?.card?.key === 15259703);
        const inGY   = (env[SIDE.MINE][ENVIRONMENT.GRAVEYARD] || []).some(c => c?.card?.key === 15259703);
        return inDeck || inGY;
    }),

    // ════════════════════════════════════════════════════════════════════════
    // ── TOON MONSTERS (on-summon / field effects) ────────────────────────────
    // ════════════════════════════════════════════════════════════════════════

    // Red-Eyes Toon Dragon (31733941) — once per turn: SS 1 Toon from hand
    31733941: oncePerTurn(
        specialSummonFromHand({ nameIncludes: 'toon' }, 'Red-Eyes Toon Dragon — Special Summon 1 Toon from hand'),
        (env) => {
            const hasToonField = (env[SIDE.MINE][ENVIRONMENT.SPELL_FIELD] || [])
                .some(c => c?.card?.key === 15259703 || c?.card?.key === 43175858);
            const hasToonHand = (env[SIDE.MINE][ENVIRONMENT.HAND] || [])
                .some(c => c?.card?.name?.toLowerCase().includes('toon'));
            return hasToonField && hasToonHand;
        }
    ),

    // Toon Dark Magician (21296502) — on summon: add 1 Toon S/T from deck
    21296502: onSummon(
        searchDeck(
            { nameIncludes: 'toon', custom: (c) => !c?.card?.card_type?.startsWith('MONSTER') },
            'Toon Dark Magician — add 1 Toon Spell/Trap from Deck to hand'
        ),
        (env) => (env[SIDE.MINE][ENVIRONMENT.SPELL_FIELD] || [])
            .some(c => c?.card?.key === 15259703 || c?.card?.key === 43175858)
    ),

    // Toon Dark Magician Girl (90960358) — on summon: gains 300 ATK per DM/DMG in field+GY
    90960358: onSummon((env) => {
        const dmKeys = new Set([46986414, 70903634]);
        let count = 0;
        for (const s of [SIDE.MINE, SIDE.OPPONENT]) {
            for (const loc of [ENVIRONMENT.MONSTER_FIELD, ENVIRONMENT.GRAVEYARD]) {
                for (const c of (env[s][loc] || [])) {
                    if (c !== CARD_TYPE.PLACEHOLDER && dmKeys.has(c?.card?.key)) count++;
                }
            }
        }
        if (!count) return;
        const field = env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD];
        for (const m of field) {
            if (m?.card?.key === 90960358) {
                m.current_atk = (m.current_atk ?? m.card.atk ?? 2000) + count * 300;
                console.log(`[Toon DMG] +${count * 300} ATK → ${m.current_atk}`);
            }
        }
    }),

    // ════════════════════════════════════════════════════════════════════════
    // ── ON-SUMMON TEST CARDS ──────────────────────────────────────────────
    // ════════════════════════════════════════════════════════════════════════

    // Elemental HERO Stratos (40044918) — on summon: search 1 HERO monster from deck
    40044918: onSummon(
        searchDeck({ nameIncludes: 'HERO', type: 'MONSTER' }, 'Stratos — add 1 HERO monster to hand')
    ),

    // ════════════════════════════════════════════════════════════════════════
    // ── PASSIVE FIELD MONSTER EFFECTS ────────────────────────────────────────
    // ════════════════════════════════════════════════════════════════════════

    // Command Knight (10375182) — all Warriors (except itself) gain 200 ATK
    10375182: whileOnField(10375182, (env, side) => {
        for (const m of (env[side][ENVIRONMENT.MONSTER_FIELD] || [])) {
            if (m !== CARD_TYPE.PLACEHOLDER &&
                m?.card?.race?.toLowerCase().includes('warrior') &&
                m?.card?.key !== 10375182) {
                m.current_atk = (m.current_atk ?? m.card.atk ?? 0) + 200;
            }
        }
    }),

    // Marauding Captain (2460565) — Warriors gain 200 ATK
    2460565: whileOnField(2460565, (env, side) => {
        for (const m of (env[side][ENVIRONMENT.MONSTER_FIELD] || [])) {
            if (m !== CARD_TYPE.PLACEHOLDER &&
                m?.card?.race?.toLowerCase().includes('warrior')) {
                m.current_atk = (m.current_atk ?? m.card.atk ?? 0) + 200;
            }
        }
    }),

    // ─── FUSION MATERIALS ────────────────────────────────────────────────────
    // Elemental HERO Flame Wingman — Avian + Burstinatrix
    // Elemental HERO Tempest — Avian + Sparkman + Bubbleman (3-material)
    // Elemental HERO Wildedge — Wildheart + Bladedge
    // Dark Paladin — Dark Magician + Buster Blader
    // (handled by Polymerization / Miracle Fusion logic — no effect entry needed)

    // ════════════════════════════════════════════════════════════════════════
    // ── PENDULUM MONSTERS ────────────────────────────────────────────────
    // ════════════════════════════════════════════════════════════════════════

    // Odd-Eyes Pendulum Dragon (16178681)
    // Pendulum Effect: "Once per turn, during your End Phase: You can destroy this card,
    // and if you do, add 1 Pendulum Monster with 1500 or less ATK from your Deck to your hand."
    16178681: [{
        pendulumEffect: async (env, cardEnv) => {
            const deckPendulums = (env[SIDE.MINE][ENVIRONMENT.DECK] || [])
                .filter(c => c?.card?.card_type === 'MONSTER_PENDULUM' && (c.card.atk ?? 9999) <= 1500);

            if (deckPendulums.length === 0) {
                alert('No Pendulum Monsters with 1500 or less ATK in your Deck.');
                return;
            }

            let result;
            try {
                result = await openSelector({
                    type: CARD_SELECT_TYPE.CARD_SELECT_FROM_DECK,
                    label: 'Odd-Eyes: Add 1 Pendulum Monster (≤1500 ATK) from Deck to Hand',
                    numToSelect: 1,
                    filterFn: c => c?.card?.card_type === 'MONSTER_PENDULUM' && (c.card.atk ?? 9999) <= 1500,
                });
            } catch {
                return; // player cancelled
            }

            if (!result?.cardEnvs?.length) return;

            const freshEnv = store.getState().environmentReducer.environment;

            // Move chosen card from deck to hand
            const deck = freshEnv[SIDE.MINE][ENVIRONMENT.DECK];
            for (const uid of result.cardEnvs) {
                const idx = deck.findIndex(c => get_unique_id_from_ennvironment(c) === uid);
                if (idx !== -1) {
                    const [found] = deck.splice(idx, 1);
                    freshEnv[SIDE.MINE][ENVIRONMENT.HAND].push(found);
                    logEvent(LOG_TYPE.EFFECT, `Odd-Eyes Pendulum Dragon: added ${found.card?.name} to hand`);
                }
            }

            // Remove Odd-Eyes from pendulum zone and send to GY
            const pendZone = freshEnv[SIDE.MINE][ENVIRONMENT.PENDULUM_ZONE];
            for (let i = 0; i < pendZone.length; i++) {
                if (pendZone[i]?.card?.key === 16178681) {
                    freshEnv[SIDE.MINE][ENVIRONMENT.GRAVEYARD].push(pendZone[i]);
                    pendZone[i] = null;
                    logEvent(LOG_TYPE.EFFECT, 'Odd-Eyes Pendulum Dragon: destroyed from Pendulum Zone');
                    break;
                }
            }

            store.dispatch(update_environment(freshEnv));
        },
    }],
};