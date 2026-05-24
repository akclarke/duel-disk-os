import MonsterEnv from '../Monster/MonsterEnv.js';
import SpellEnv from '../Spell/SpellEnv';
import { get_card_meta } from '../../../data/cardLoader';

let current_game_unique_count = 0

export const is_monster = (card_type) => card_type?.substring(0, 7) === 'MONSTER'
export const is_spell   = (card_type) => card_type?.substring(0, 5) === 'SPELL'
export const is_trap    = (card_type) => card_type?.substring(0, 4) === 'TRAP'

export const load_card_to_environment = function (card) {
    const meta = get_card_meta(card.key);
    const card_type = meta.card_type;
    current_game_unique_count++;
    if (is_monster(card_type)) {
        return new MonsterEnv(card, current_game_unique_count);
    } else if (is_spell(card_type) || is_trap(card_type)) {
        // Traps use SpellEnv — same wrapper, just different card_type
        return new SpellEnv(card, current_game_unique_count);
    } else {
        return undefined;
    }
}

export const create_card = (card_key) => {
    console.warn(`[utils] create_card(${card_key}) — use create_card_from_api instead`);
    return null;
}