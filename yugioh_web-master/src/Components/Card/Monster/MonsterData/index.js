/**
 * Card database — stores all card definitions
 * 
 * RULES FOR ADDING CARDS:
 * - The object key (e.g. 46986414) must be the card's real YGOPRODeck ID
 * - options.key must match the object key exactly
 * - Fusion/Synchro/XYZ go in the extra deck — their position is set by their class
 * - fusion_materials / synchro_materials / xyz_materials are arrays of card IDs
 * - Use ATTRIBUTE.X constants, never raw strings like 'DARK'
 */

import { CARD_TYPE, ATTRIBUTE, SIDE, ENVIRONMENT } from '../../utils/constant';
import { card_meta } from '../../CardMeta';
import initialize_monster_card from '../MonsterType';

// ─── SUMMON CONDITION HELPERS ─────────────────────────────────────────────────

const get_my_monster_on_field = (environment) => {
    const current_monsters = environment[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD];
    let count = 0;
    for (const monster of current_monsters) {
        if (monster.card) count++;
    }
    return count;
}

const model_can_normal_summon = (self, environment) => {
    if (environment.CAN_NOT_SUMMON) return false;

    // Extra deck monsters can't be normal summoned
    if (
        self.card_type === CARD_TYPE.MONSTER.FUSION ||
        self.card_type === CARD_TYPE.MONSTER.SYNCHRO ||
        self.card_type === CARD_TYPE.MONSTER.XYZ
    ) return false;

    if (self.level <= 4) return true;
    if (self.level <= 6) return get_my_monster_on_field(environment) >= 1;
    if (self.level >= 7) return get_my_monster_on_field(environment) >= 2;
}

const model_can_special_summon = (self, environment) => {
    return false;
}

// ─── CARD DATABASE ────────────────────────────────────────────────────────────

export const monster_database = {

    // ── ELEMENTAL HEROs ───────────────────────────────────────────────────────

    20721928: () => {
        const options = {
            key: 20721928,
            atk: 1600, def: 1400,
            name: 'Elemental HERO Sparkman',
            level: 4,
            attribute: ATTRIBUTE.LIGHT,
            race: 'Warrior',
            description: 'An Elemental HERO and a warrior of light who proficiently wields many kinds of armaments. His Static Shockwave cuts off the path of villainy.',
            can_normal_summon: model_can_normal_summon,
            can_special_summon: model_can_special_summon,
        }
        return initialize_monster_card[card_meta[options.key].card_type](options);
    },

    58932615: () => {
        const options = {
            key: 58932615,
            atk: 1200, def: 800,
            name: 'Elemental HERO Burstinatrix',
            level: 3,
            attribute: ATTRIBUTE.FIRE,
            race: 'Warrior',
            description: 'A flame manipulator who was the first Elemental HERO woman. Her Burstfire burns away villainy.',
            can_normal_summon: model_can_normal_summon,
            can_special_summon: model_can_special_summon,
        }
        return initialize_monster_card[card_meta[options.key].card_type](options);
    },

    84327329: () => {
        const options = {
            key: 84327329,
            atk: 800, def: 2000,
            name: 'Elemental HERO Clayman',
            level: 4,
            attribute: ATTRIBUTE.EARTH,
            race: 'Warrior',
            description: 'An Elemental HERO with a clay body built-to-last. He\'ll preserve his Elemental HERO colleagues at any cost.',
            can_normal_summon: model_can_normal_summon,
            can_special_summon: model_can_special_summon,
        }
        return initialize_monster_card[card_meta[options.key].card_type](options);
    },

    21844576: () => {
        const options = {
            key: 21844576,
            atk: 1000, def: 1000,
            name: 'Elemental HERO Avian',
            level: 3,
            attribute: ATTRIBUTE.WIND,
            race: 'Warrior',
            description: 'A winged Elemental HERO who wheels through the sky and manipulates the wind. His signature move, Featherbreak, gives villainy a blow from sky-high.',
            can_normal_summon: model_can_normal_summon,
            can_special_summon: model_can_special_summon,
        }
        return initialize_monster_card[card_meta[options.key].card_type](options);
    },

    89943723: () => {
        const options = {
            key: 89943723,
            atk: 2500, def: 2000,
            name: 'Elemental HERO Neos',
            level: 7,
            attribute: ATTRIBUTE.LIGHT,
            race: 'Warrior',
            description: 'A new Elemental HERO has arrived from Neo-Space! When he initiates a Contact Fusion with a Neo-Spacian his unknown powers are unleashed.',
            can_normal_summon: model_can_normal_summon,
            can_special_summon: model_can_special_summon,
        }
        return initialize_monster_card[card_meta[options.key].card_type](options);
    },

    // ── CLASSIC MONSTERS ──────────────────────────────────────────────────────

    46986414: () => {
        // Fixed: key was 46809262 (wrong). Real Dark Magician ID is 46986414
        const options = {
            key: 46986414,
            atk: 2500, def: 2100,
            name: 'Dark Magician',
            level: 7,
            attribute: ATTRIBUTE.DARK,
            race: 'Spellcaster',
            description: 'The ultimate wizard in terms of attack and defense.',
            can_normal_summon: model_can_normal_summon,
            can_special_summon: model_can_special_summon,
        }
        return initialize_monster_card[card_meta[options.key].card_type](options);
    },

    78193831: () => {
        // Fixed: key was 35809372 (wrong). Real Buster Blader ID is 78193831
        const options = {
            key: 78193831,
            atk: 2600, def: 2300,
            name: 'Buster Blader',
            level: 7,
            attribute: ATTRIBUTE.EARTH,
            race: 'Warrior',
            description: 'This card gains 500 ATK for each Dragon-Type monster your opponent controls or is in their GY.',
            can_normal_summon: model_can_normal_summon,
            can_special_summon: model_can_special_summon,
        }
        return initialize_monster_card[card_meta[options.key].card_type](options);
    },

    // ── FUSION MONSTERS (Extra Deck) ──────────────────────────────────────────

    35809262: () => {
        const options = {
            key: 35809262,
            atk: 2100, def: 1200,
            name: 'Elemental HERO Flame Wingman',
            level: 6,
            attribute: ATTRIBUTE.WIND,
            race: 'Warrior',
            description: '"Elemental HERO Avian" + "Elemental HERO Burstinatrix"\nMust be Fusion Summoned. When this card destroys a monster by battle: inflict damage equal to that monster\'s ATK.',
            can_normal_summon: model_can_normal_summon,
            can_special_summon: model_can_special_summon,
            fusion_materials: [21844576, 58932615],  // Avian + Burstinatrix
        }
        return initialize_monster_card[card_meta[options.key].card_type](options);
    },

    // Fixed: Starving Venom now has correct ID, correct materials, correct description
    // Real Starving Venom Fusion Dragon ID: 13331639
    13331639: () => {
        const options = {
            key: 13331639,
            atk: 2800, def: 2000,
            name: 'Starving Venom Fusion Dragon',
            level: 8,
            attribute: ATTRIBUTE.DARK,
            race: 'Dragon',
            description: '2 DARK monsters on the field, except Tokens. Once per turn: target 1 Special Summoned monster your opponent controls; until the End Phase, this card\'s name becomes that monster\'s, and replace this effect with that monster\'s original effects. If this card is destroyed: destroy all Special Summoned monsters your opponent controls.',
            can_normal_summon: model_can_normal_summon,
            can_special_summon: model_can_special_summon,
            fusion_materials: [ATTRIBUTE.DARK, ATTRIBUTE.DARK],  // Any 2 DARK monsters
        }
        return initialize_monster_card[card_meta[options.key].card_type](options);
    },

    // Fixed: Dark Paladin now has correct ID and name (was mislabeled as Starving Venom)
    // Real Dark Paladin ID: 98502113
    98502113: () => {
        const options = {
            key: 98502113,
            atk: 2900, def: 2400,
            name: 'Dark Paladin',
            level: 8,
            attribute: ATTRIBUTE.DARK,
            race: 'Spellcaster',
            description: '"Dark Magician" + "Buster Blader"\nMust be Fusion Summoned. When a Spell Card is activated (Quick Effect): you can discard 1 card; negate the activation, and if you do, destroy it. This card gains 500 ATK for each Dragon-Type monster on the field or in any GY.',
            can_normal_summon: model_can_normal_summon,
            can_special_summon: model_can_special_summon,
            fusion_materials: [46986414, 78193831],  // Dark Magician + Buster Blader
        }
        return initialize_monster_card[card_meta[options.key].card_type](options);
    },

}