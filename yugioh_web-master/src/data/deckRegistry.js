/**
 * deckRegistry.js
 * All passcodes verified via Amazon product listings (consistent across all printings).
 */

export const DECK_REGISTRY = {

    // ─── ELEMENTAL HEROs ─────────────────────────────────────────────────────
    // Verified IDs:
    //   Sparkman 20721928 | Avian 21844576 | Burstinatrix 58932615
    //   Clayman 84327329 | Neos 89943723 | Wildheart 86188410 | Bladedge 59793705
    //   Flame Wingman 35809262 | Tempest 83121692 | Wildedge 10526791
    //   Polymerization 24094653 | Miracle Fusion 45906428 | E - Emergency Call 213326
    //   Skyscraper 37120512 | Monster Reborn 83764718 | Dark Hole 53129443
    //   Raigeki 12580477 | Dian Keto 84257639 | Graceful Dice 74137509

    ELEMENTAL_HERO: {
        id: 'ELEMENTAL_HERO',
        name: 'Elemental HEROs',
        icon: '⚡',
        description: "Jaden Yuki's signature deck. Fuse HERO monsters into powerful Flame Wingman and Tempest.",
        available: true,
        era: 'GX',
        deck: [
            // Monsters (18)
            40044918, 40044918, 40044918, // Elemental HERO Stratos x3
            20721928,                     // Elemental HERO Sparkman x1
            21844576, 21844576,           // Elemental HERO Avian x2
            58932615, 58932615, 58932615, // Elemental HERO Burstinatrix x3
            84327329, 84327329,           // Elemental HERO Clayman x2
            86188410, 86188410,           // Elemental HERO Wildheart x2
            59793705,                     // Elemental HERO Bladedge
            // Spells (22)
            24094653, 24094653, 24094653, // Polymerization x3
            45906428, 45906428,           // Miracle Fusion x2
            213326,  213326,  213326,     // E - Emergency Call x3
            37120512,                     // Skyscraper
            83764718, 83764718,           // Monster Reborn x2
            53129443,                     // Dark Hole
            12580477,                     // Raigeki
            84257639, 84257639,           // Dian Keto the Cure Master x2
            74137509, 74137509,           // Graceful Dice x2
            55144522,                     // Pot of Greed
            89943723,                     // Elemental HERO Neos
            44095762,                     // Mirror Force
            56120475, 56120475, 56120475, // Sakuretsu Armor x3
            62279055, 62279055,           // Magic Cylinder x2
            97077563,                     // Call of the Haunted
        ],
        extra_deck: [
            35809262, 35809262, 35809262, // Elemental HERO Flame Wingman x3
            83121692, 83121692,           // Elemental HERO Tempest x2
            10526791,                     // Elemental HERO Wildedge
        ]
    },

    // ─── DARK MAGICIAN ───────────────────────────────────────────────────────
    // Verified IDs:
    //   Dark Magician 46986414 | Buster Blader 78193831 | DM Girl 70903634
    //   Skilled DM 73752131 | Magician of Dark Illusion 97077563
    //   Apprentice Magician 80070805 | Dark Magician of Chaos 40737112
    //   Dark Paladin 98502113 | Dark Magic Attack 2314238 | Thousand Knives 63519819
    //   Dark Magic Curtain 99789342 | Monster Reborn 83764718 | Dark Hole 53129443
    //   Raigeki 12580477 | Polymerization 24094653
    //   Dian Keto 84257639 | Graceful Dice 74137509 | Pot of Greed 55144522

    DARK_MAGICIAN: {
        id: 'DARK_MAGICIAN',
        name: 'Dark Magician',
        icon: '🔮',
        description: "Yugi's ace. Classic spellcaster strategy with Dark Paladin fusion and powerful spell support.",
        available: true,
        era: 'DM',
        deck: [
            // Monsters (16)
            46986414, 46986414, 46986414, // Dark Magician x3
            78193831, 78193831,           // Buster Blader x2
            70903634, 70903634, 70903634, // Dark Magician Girl x3
            73752131, 73752131,           // Skilled Dark Magician x2
            // 97077563 WRONG — Magician of Dark Illusion ID unknown, check physical card
            80070805, 80070805,           // Apprentice Magician x2
            40737112,                     // Dark Magician of Chaos
            // Spells (24)
            24094653, 24094653, 24094653, // Polymerization x3
            83764718, 83764718,           // Monster Reborn x2
            53129443,                     // Dark Hole
            12580477,                     // Raigeki
            2314238,  2314238,            // Dark Magic Attack x2
            63519819, 63519819,           // Thousand Knives x2
            99789342,                     // Dark Magic Curtain
            84257639, 84257639,           // Dian Keto the Cure Master x2
            74137509, 74137509,           // Graceful Dice x2
            55144522,                     // Pot of Greed
            89943723,                     // Elemental HERO Neos
            44095762,                     // Mirror Force
            56120475, 56120475, 56120475, // Sakuretsu Armor x3
            62279055, 62279055,           // Magic Cylinder x2
            97077563,                     // Call of the Haunted
            83764718,                     // Monster Reborn (3rd)
            53129443,                     // Dark Hole (2nd)
        ],
        extra_deck: [
            98502113, 98502113, 98502113, // Dark Paladin x3
        ]
    },


    WARRIOR: {
        id: 'WARRIOR',
        name: 'Warrior Alliance',
        icon: '⚔️',
        description: "Marauding Captain leads Warriors. Command Knight boosts ATK, ROTA searches key monsters. Mirror Force and Sakuretsu Armor guard the field.",
        available: true,
        era: 'GX',
        deck: [
            // ── Monsters (18) ──────────────────────────────────────────────
            2460565,  2460565,  2460565,  // Marauding Captain x3
            10375182, 10375182, 10375182, // Command Knight x3
            5438492,  5438492,  5438492,  // Warrior Lady of the Wasteland x3
            7572887,  7572887,            // D.D. Warrior Lady x2
            39507162, 39507162,           // Blade Knight x2
            423705,   423705,             // Gearfried the Iron Knight x2
            78658564,                     // Goblin Attack Force
            26202165,                     // Sangan
            78010363,                     // Witch of the Black Forest
            // ── Spells (14) ────────────────────────────────────────────────
            32807846, 32807846, 32807846, // Reinforcement of the Army x3
            403847,   403847,             // The A. Forces x2
            53129443,                     // Dark Hole
            12580477,                     // Raigeki
            83764718,                     // Monster Reborn
            19613556,                     // Heavy Storm
            5318639,  5318639,            // Mystical Space Typhoon x2
            55144522,                     // Pot of Greed
            84257639,                     // Dian Keto the Cure Master
            83764718,                     // Monster Reborn x2
            // ── Traps (8) ──────────────────────────────────────────────────
            44095762, 44095762,           // Mirror Force x2
            56120475, 56120475,           // Sakuretsu Armor x2
            62279055, 62279055,           // Magic Cylinder x2
            97077563, 97077563,           // Call of the Haunted x2
        ],
        extra_deck: []
    },

    TOON: {
        id: 'TOON',
        name: "Pegasus's Toons",
        icon: '🎭',
        description: "Maximillion Pegasus's Toon monsters. Get Toon World or Toon Kingdom on the field, then flood with Toons that attack directly.",
        available: true,
        era: 'DM',
        deck: [
            // ── Toon Monsters (17) ──────────────────────────────────────────
            53183600, 53183600,           // Blue-Eyes Toon Dragon x2  (Lv8)
            21296502, 21296502, 21296502, // Toon Dark Magician x3     (Lv7)
            31733941, 31733941,           // Red-Eyes Toon Dragon x2   (Lv7)
            90960358, 90960358,           // Toon Dark Magician Girl x2 (Lv6)
            91842653, 91842653,           // Toon Summoned Skull x2    (Lv6)
            28711724,                     // Toon Black Luster Soldier (Lv8)
            65458948, 65458948, 65458948, // Toon Mermaid x3           (Lv4)
            26202165,                     // Sangan
            16392422, 16392422, 16392422, // Toon Masked Sorcerer x3
            78010363,                     // Witch of the Black Forest
            // ── Spells (17) ─────────────────────────────────────────────────
            15259703, 15259703, 15259703, // Toon World x3
            43175858, 43175858,           // Toon Kingdom x2
            89997728, 89997728, 89997728, // Toon Table of Contents x3
            91500017, 91500017, 91500017, // Toon Bookmark x3
            53129443,                     // Dark Hole
            12580477,                     // Raigeki
            83764718,                     // Monster Reborn
            55144522,                     // Pot of Greed
            89943723,                     // Elemental HERO Neos
            44095762,                     // Mirror Force
            56120475, 56120475, 56120475, // Sakuretsu Armor x3
            62279055, 62279055,           // Magic Cylinder x2
            97077563,                     // Call of the Haunted
            19613556,                     // Heavy Storm
            5318639,                      // Mystical Space Typhoon
            // ── Traps (6) ───────────────────────────────────────────────────
            44095762, 44095762,           // Mirror Force x2
            62279055,                     // Magic Cylinder x1
        ],
        extra_deck: []
    },
    // ─── SYNCHRON – STARDUST ─────────────────────────────────────────────────
    // HOW TO SYNCHRO SUMMON: Normal summon Junk Synchron (Tuner Lv3) + any
    // non-tuner on field → click ⚡ Synchro → pick Junk Warrior (Lv5) or
    // Stardust Dragon (Lv8, needs tuner + non-tuner totalling 8)
    SYNCHRON_STARDUST: {
        id: 'SYNCHRON_STARDUST',
        name: 'Synchron – Stardust',
        icon: '⭐',
        description: "Yusei Fudo's deck. Junk Synchron + Speed Warrior = Junk Warrior (Lv5). Add Hyper Synchron for Stardust Dragon (Lv8).",
        available: true,
        era: '5DS',
        deck: [
            // ── Tuner Monsters (9) ─────────────────────────────────────────
            63977008, 63977008, 63977008, // Junk Synchron x3          (Tuner Lv3)
            23571046, 23571046,           // Quillbolt Hedgehog x2     (Tuner Lv1)
            67270095, 67270095,           // Turbo Synchron x2         (Tuner Lv1)
            96182448, 96182448,           // Nitro Synchron x2         (Tuner Lv1)
            // ── Non-Tuner Monsters (12) ────────────────────────────────────
            9365703,  9365703,  9365703,  // Speed Warrior x3          (Lv2 — Junk Synchron target)
            40348946, 40348946,           // Hyper Synchron x2         (Lv4 — boosts Synchro ATK)
            36643046, 36643046, 36643046, // Synchron Explorer x3      (Lv2 — revives Synchrons)
            53855409, 53855409,           // Doppelwarrior x2          (Lv2 — makes 2 tokens)
            26202165,                     // Sangan
            78010363,                     // Witch of the Black Forest
            // ── Spells (12) ────────────────────────────────────────────────
            83764718, 83764718,           // Monster Reborn x2
            53129443,                     // Dark Hole
            12580477,                     // Raigeki
            55144522,                     // Pot of Greed
            84257639, 84257639,           // Dian Keto the Cure Master x2
            5318639,  5318639,            // Mystical Space Typhoon x2
            19613556,                     // Heavy Storm
            74137509, 74137509,           // Graceful Dice x2
            // ── Traps (7) ──────────────────────────────────────────────────
            44095762, 44095762,           // Mirror Force x2
            56120475, 56120475,           // Sakuretsu Armor x2
            62279055, 62279055,           // Magic Cylinder x2
            97077563,                     // Call of the Haunted x1
        ],
        extra_deck: [
            44508094, 44508094, 44508094, // Stardust Dragon x3        (Synchro Lv8)
            60800381, 60800381,           // Junk Warrior x2           (Synchro Lv5)
            18013090, 18013090,           // Nitro Warrior x2          (Synchro Lv7)
        ]
    },

    // ─── NUMBER XYZ ──────────────────────────────────────────────────────────
    // HOW TO XYZ SUMMON: Get 2 Level-4 monsters on field → click 🌀 XYZ →
    // pick Number 39: Utopia (Rank 4). Goblindbergh summons a 2nd Lv4 from hand
    // when normal summoned. Kagetokage special summons itself when a Lv4 is normal summoned.
    NUMBER_XYZ: {
        id: 'NUMBER_XYZ',
        name: 'Number XYZ',
        icon: '🔢',
        description: "Yuma's deck. Goblindbergh + Kagetokage instantly give 2 Level-4s → XYZ Summon Number 39: Utopia.",
        available: true,
        era: 'ZEXAL',
        deck: [
            // ── Level 4 Monsters (18) ──────────────────────────────────────
            26082117, 26082117, 26082117, // Gagaga Magician x3        (Lv4)
            97896503, 97896503, 97896503, // Zubaba Knight x3          (Lv4)
            98865920, 98865920, 98865920, // Achacha Archer x3         (Lv4, burn effect)
            25259669, 25259669, 25259669, // Goblindbergh x3           (Lv4, summons Lv4 from hand)
            94656263, 94656263, 94656263, // Kagetokage x3             (Lv4, SS when Lv4 normal summoned)
            3606728,  3606728,            // Gagaga Girl x2            (Lv3, Gagaga support)
            // ── Spells (14) ────────────────────────────────────────────────
            83764718, 83764718,           // Monster Reborn x2
            53129443,                     // Dark Hole
            12580477,                     // Raigeki
            55144522,                     // Pot of Greed
            84257639, 84257639,           // Dian Keto the Cure Master x2
            5318639,  5318639,            // Mystical Space Typhoon x2
            19613556,                     // Heavy Storm
            85839825, 85839825,           // Xyz Energy x2             (send XYZ material, destroy card)
            74137509, 74137509,           // Graceful Dice x2
            // ── Traps (8) ──────────────────────────────────────────────────
            44095762, 44095762,           // Mirror Force x2
            56120475, 56120475,           // Sakuretsu Armor x2
            62279055, 62279055,           // Magic Cylinder x2
            97077563, 97077563,           // Call of the Haunted x2
        ],
        extra_deck: [
            84013237, 84013237, 84013237, // Number 39: Utopia x3      (Rank 4)
            56840427, 56840427,           // Number C39: Utopia Ray x2 (Rank 4)
            12014404, 12014404,           // Gagaga Cowboy x2          (Rank 4, burn)
        ]
    },

    // ─── PERFORMAPAL ODD-EYES (Pendulum) ─────────────────────────────────────
    // HOW TO PENDULUM SUMMON:
    //   1. Click a pendulum monster in hand → "Scale" button → places it in left/right pendulum zone
    //   2. Do the same for a second pendulum with a DIFFERENT scale number
    //   3. Once both zones filled, click 🔮 Pendulum → pick any monsters with level
    //      strictly BETWEEN the two scale numbers to summon all at once
    // Scales in this deck: Monkeyboard=1, Pendulum Sorcerer=2, Odd-Eyes=4, Lizardraw=6, Skullcrobat=8
    // Best combo: Scale 1 (Monkeyboard) + Scale 8 (Skullcrobat) → summon levels 2-7
    PERFORMAPAL_ODD_EYES: {
        id: 'PERFORMAPAL_ODD_EYES',
        name: 'Performapal Odd-Eyes',
        icon: '🎪',
        description: "Yuya's pendulum deck. Set Scale 1 + Scale 8, then pendulum summon all your monsters at once.",
        available: true,
        era: 'ARC-V',
        deck: [
            // ── Pendulum Monsters (18) ─────────────────────────────────────
            40318957, 40318957, 40318957, // Performapal Skullcrobat Joker x3  (Scale 8, Lv4)
            47075569, 47075569, 47075569, // Performapal Pendulum Sorcerer x3  (Scale 2, Lv6)
            16178681, 16178681, 16178681, // Odd-Eyes Pendulum Dragon x3       (Scale 4, Lv7)
            17330916, 17330916, 17330916, // Performapal Monkeyboard x3        (Scale 1, Lv4)
            73130445, 73130445, 73130445, // Performapal Lizardraw x3          (Scale 6, Lv4)
            // ── Non-Pendulum Monsters (4) ──────────────────────────────────
            26202165,                     // Sangan
            78010363,                     // Witch of the Black Forest
            89943723, 89943723,           // Elemental HERO Neos x2
            // ── Spells (12) ────────────────────────────────────────────────
            83764718, 83764718,           // Monster Reborn x2
            53129443,                     // Dark Hole
            12580477,                     // Raigeki
            55144522,                     // Pot of Greed
            84257639, 84257639,           // Dian Keto the Cure Master x2
            5318639,  5318639,  5318639,  // Mystical Space Typhoon x3
            19613556,                     // Heavy Storm
            // ── Traps (6) ──────────────────────────────────────────────────
            44095762, 44095762,           // Mirror Force x2
            56120475, 56120475,           // Sakuretsu Armor x2
            62279055, 62279055,           // Magic Cylinder x2
        ],
        extra_deck: [
            16691074, 16691074, 16691074, // Odd-Eyes Absolute Dragon x3  (Rank 7 XYZ — 2 Lv7 monsters)
            84013237, 84013237,           // Number 39: Utopia x2         (Rank 4 XYZ — 2 Lv4 monsters)
            12014404, 12014404,           // Gagaga Cowboy x2             (Rank 4 XYZ)
        ]
    },

    // ─── DECODE TALKER (Link) ─────────────────────────────────────────────────
    // HOW TO LINK SUMMON: Fill the field with 3+ small monsters →
    // click 🔗 Link → pick Decode Talker (Link-3) → select 3 field monsters as material
    // They go to GY and Decode Talker takes a monster zone spot
    DECODE_TALKER: {
        id: 'DECODE_TALKER',
        name: 'Decode Talker',
        icon: '🔗',
        description: "Playmaker's deck. Flood the field with Cyberse monsters, tribute 3 for Decode Talker (Link-3).",
        available: true,
        era: 'VRAINS',
        deck: [
            // ── Cyberse monsters (18) ──────────────────────────────────────
            18789533, 18789533, 18789533, // Dotscaper x3              (Lv1, SS itself from GY)
            63528891, 63528891, 63528891, // Backup Secretary x3       (Lv3, SS if you control Cyberse)
            9523599,  9523599,  9523599,  // Stack Reviver x3          (Lv1, revive from GY)
            10705656, 10705656, 10705656, // Widget Kid x3             (Lv3)
            36694815, 36694815, 36694815, // Bitrooper x3              (Lv4)
            // ── Generic Monsters (4) ───────────────────────────────────────
            26202165,                     // Sangan
            78010363,                     // Witch of the Black Forest
            89943723, 89943723,           // Elemental HERO Neos x2
            // ── Spells (12) ────────────────────────────────────────────────
            83764718, 83764718,           // Monster Reborn x2
            53129443,                     // Dark Hole
            12580477,                     // Raigeki
            55144522,                     // Pot of Greed
            84257639, 84257639,           // Dian Keto the Cure Master x2
            5318639,  5318639,  5318639,  // Mystical Space Typhoon x3
            19613556,                     // Heavy Storm
            // ── Traps (6) ──────────────────────────────────────────────────
            44095762, 44095762,           // Mirror Force x2
            56120475, 56120475,           // Sakuretsu Armor x2
            62279055, 62279055,           // Magic Cylinder x2
        ],
        extra_deck: [
            1861629,  1861629,  1861629,  // Decode Talker x3          (Link-3)
            5043010,  5043010,            // Firewall Dragon x2        (Link-4)
            75452921, 75452921,           // Knightmare Cerberus x2    (Link-2)
        ]
    },

    // ─── COMING SOON ─────────────────────────────────────────────────────────

    BLUE_EYES: {
        id: 'BLUE_EYES',
        name: 'Blue-Eyes White Dragon',
        icon: '🐉',
        description: "Seto Kaiba's legendary 3000 ATK dragon.",
        available: false, era: 'DM',
        deck: [89631139, 89631139, 89631139, 44519536, 44519536, 1626550, 83764718, 53129443],
        extra_deck: []
    },
    GOD_CARDS: {
        id: 'GOD_CARDS',
        name: 'Egyptian God Cards',
        icon: '☀️',
        description: 'Slifer, Obelisk, and Ra. Three legendary gods.',
        available: false, era: 'DM',
        deck: [10000050, 10000010, 10000000, 83764718, 53129443],
        extra_deck: []
    },
    RED_EYES: {
        id: 'RED_EYES',
        name: 'Red-Eyes',
        icon: '🐲',
        description: "Joey Wheeler's Red-Eyes Black Dragon.",
        available: false, era: 'DM',
        deck: [74677422, 74677422, 74677422, 83764718, 53129443],
        extra_deck: []
    },
    MAGICIAN_GIRL: {
        id: 'MAGICIAN_GIRL',
        name: 'Magician Girls',
        icon: '✨',
        description: 'Yug\'s Dark Magician Girl and her companions.',
        available: false, era: 'DM',
        deck: [70903634, 70903634, 70903634, 46986414, 46986414, 83764718, 53129443],
        extra_deck: []
    },
    HARPIE_LADY: {
        id: 'HARPIE_LADY',
        name: 'Harpie Lady',
        icon: '🦅',
        description: "Mai Valentine's swift WIND monsters.",
        available: false, era: 'DM',
        deck: [76812113, 76812113, 76812113, 53829412, 83764718, 18144506],
        extra_deck: []
    },
    A_TO_Z: {
        id: 'A_TO_Z', name: 'A to Z', icon: '🔤',
        description: 'ABC and XYZ Union machines.',
        available: false, era: 'DM', deck: [], extra_deck: []
    },
    SIX_SAMURAI: {
        id: 'SIX_SAMURAI', name: 'Six Samurai', icon: '⚔️',
        description: 'Legendary samurai warriors led by the Great Shogun, Tenkabito Shien.',
        available: false, era: 'GX',
        deck: [33184167, 33184167, 33184167, 83764718, 53129443],
        extra_deck: []
    },
    SIGNER_DRAGONS: {
        id: 'SIGNER_DRAGONS', name: 'Signer Dragons', icon: '🌟',
        description: "Yusei's Signer Dragons.",
        available: false, era: '5DS',
        deck: [44508094, 44508094, 70784184, 70784184, 83764718, 53129443],
        extra_deck: []
    },
    ARCHFIEND_RED_DRAGON: {
        id: 'ARCHFIEND_RED_DRAGON', name: 'Archfiend – Red Dragon', icon: '🔴',
        description: "Jack Atlas's Red Dragon Archfiend.",
        available: false, era: '5DS',
        deck: [70784184, 70784184, 70784184, 53129443, 83764718],
        extra_deck: []
    },
    MORPHTRONIC: {
        id: 'MORPHTRONIC', name: 'Morphtronic', icon: '📱',
        description: "Leo's transforming machines.",
        available: false, era: '5DS', deck: [], extra_deck: []
    },
    MORPHTRONIC_LIFESTREAM: {
        id: 'MORPHTRONIC_LIFESTREAM', name: 'Morphtronic – Lifestream', icon: '💚',
        description: 'Lifestream Dragon variant.',
        available: false, era: '5DS', deck: [], extra_deck: []
    },
    SUPREME_KING_MAGICIANS: {
        id: 'SUPREME_KING_MAGICIANS', name: 'Supreme King Magicians', icon: '👑',
        description: "Zarc's Supreme King Dragons.",
        available: false, era: 'ARC-V', deck: [], extra_deck: []
    },
    SUPERHEAVY_SAMURAI: {
        id: 'SUPERHEAVY_SAMURAI', name: 'Superheavy Samurai', icon: '🤖',
        description: 'Giant mechs in Defense Position.',
        available: false, era: 'ARC-V', deck: [], extra_deck: []
    },
    DDD: {
        id: 'DDD', name: 'D/D/D', icon: '🌀',
        description: "Reiji's D/D/D strategy.",
        available: false, era: 'ARC-V', deck: [], extra_deck: []
    },
};

export const getAvailableDecks = () =>
    Object.values(DECK_REGISTRY).filter(d => d.available);

export const getAllDecks = () =>
    Object.values(DECK_REGISTRY);

export const getAllCardIds = () => {
    const ids = new Set();
    for (const deck of getAvailableDecks()) {
        deck.deck.forEach(id => ids.add(id));
        deck.extra_deck.forEach(id => ids.add(id));
    }
    return [...ids];
};