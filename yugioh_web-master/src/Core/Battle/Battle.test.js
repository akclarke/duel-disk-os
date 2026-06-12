/**
 * Battle engine position tests.
 *
 * The core scenario: a face-up Defense Mode monster (CARD_POS.DEFENSE) must
 * battle with its DEF — the attacker takes the difference as damage when
 * DEF > ATK and the defender survives. Before the isDefPos fix these battles
 * wrongly resolved through the ATK-vs-ATK branch.
 */
import { ENVIRONMENT, SIDE, CARD_TYPE, CARD_POS } from '../../Components/Card/utils/constant';
import Battle from './index';

// triggerRegistry imports the Redux store at module top — keep the test hermetic.
jest.mock('../../data/triggerRegistry', () => ({
    fireTrigger: jest.fn(),
    fireFieldWatchTriggers: jest.fn(),
    TRIGGER_TYPE: {
        ON_DESTROY: 'ON_DESTROY',
        ON_ALLY_DESTROYED: 'ON_ALLY_DESTROYED',
        ON_BATTLE_DAMAGE: 'ON_BATTLE_DAMAGE',
        ON_BATTLE_DESTROY: 'ON_BATTLE_DESTROY',
    },
}));

const P = CARD_TYPE.PLACEHOLDER;

const makeSide = () => ({
    hp: 8000,
    [ENVIRONMENT.MONSTER_FIELD]: [P, P, P, P, P],
    [ENVIRONMENT.SPELL_FIELD]: [P, P, P, P, P],
    [ENVIRONMENT.GRAVEYARD]: [],
    [ENVIRONMENT.EXTRA_DECK]: [],
    [ENVIRONMENT.DECK]: [],
});

const makeEnv = () => ({
    [SIDE.MINE]: makeSide(),
    [SIDE.OPPONENT]: makeSide(),
});

let uniqueCount = 0;
const monster = (name, atk, def, pos, cardExtra = {}) => ({
    card: { name, atk, def, card_type: 'MONSTER_EFFECT', ...cardExtra },
    current_atk: atk,
    current_def: def,
    current_pos: pos,
    unique_count: ++uniqueCount,
});

// battle(info, env) with attacker at MINE slot 0 and defender at OPPONENT slot 0
const fight = (attacker, defender) => {
    const env = makeEnv();
    env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD][0] = attacker;
    env[SIDE.OPPONENT][ENVIRONMENT.MONSTER_FIELD][0] = defender;
    const info = { dst: 'defender-uid', side: SIDE.MINE, src_index: 0, dst_index: 0 };
    return Battle.battle(info, env);
};

describe('isDefPos', () => {
    it('matches face-up Defense Mode and both face-down positions, not ATK', () => {
        expect(Battle.isDefPos({ current_pos: CARD_POS.DEFENSE })).toBe(true);
        expect(Battle.isDefPos({ current_pos: CARD_POS.SET })).toBe(true);
        expect(Battle.isDefPos({ current_pos: CARD_POS.SET_DEFENSE })).toBe(true);
        expect(Battle.isDefPos({ current_pos: CARD_POS.FACE })).toBe(false);
        expect(Battle.isDefPos({ current_pos: CARD_POS.UNSURE })).toBe(false);
        expect(Battle.isDefPos({})).toBe(false);
    });
});

describe('battle vs face-up DEFENSE monster', () => {
    it('DEF > attacker ATK: attacker takes the difference, defender survives', () => {
        const attacker = monster('Axe Raider', 1700, 1150, CARD_POS.FACE);
        const defender = monster('Mystical Elf', 800, 2000, CARD_POS.DEFENSE);
        const env = fight(attacker, defender);

        // Attacker's controller takes 2000 - 1700 = 300
        expect(env[SIDE.MINE].hp).toBe(7700);
        expect(env[SIDE.OPPONENT].hp).toBe(8000);
        // Defender survives in place; nothing destroyed
        expect(env[SIDE.OPPONENT][ENVIRONMENT.MONSTER_FIELD][0]).toBe(defender);
        expect(env[SIDE.OPPONENT][ENVIRONMENT.GRAVEYARD]).toHaveLength(0);
        expect(env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD][0]).toBe(attacker);
        expect(env[SIDE.MINE][ENVIRONMENT.GRAVEYARD]).toHaveLength(0);
    });

    it('ATK > DEF: defender destroyed, no battle damage to either player', () => {
        const attacker = monster('Summoned Skull', 2500, 1200, CARD_POS.FACE);
        const defender = monster('Mystical Elf', 800, 2000, CARD_POS.DEFENSE);
        const env = fight(attacker, defender);

        expect(env[SIDE.OPPONENT][ENVIRONMENT.MONSTER_FIELD][0]).toBe(P);
        expect(env[SIDE.OPPONENT][ENVIRONMENT.GRAVEYARD]).toContain(defender);
        expect(env[SIDE.MINE].hp).toBe(8000);
        expect(env[SIDE.OPPONENT].hp).toBe(8000);
    });

    it('ATK = DEF: no destruction, no damage', () => {
        const attacker = monster('Axe Raider', 2000, 1150, CARD_POS.FACE);
        const defender = monster('Mystical Elf', 800, 2000, CARD_POS.DEFENSE);
        const env = fight(attacker, defender);

        expect(env[SIDE.MINE].hp).toBe(8000);
        expect(env[SIDE.OPPONENT].hp).toBe(8000);
        expect(env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD][0]).toBe(attacker);
        expect(env[SIDE.OPPONENT][ENVIRONMENT.MONSTER_FIELD][0]).toBe(defender);
    });
});

describe('battle vs face-down SET monster (regression)', () => {
    it('still resolves ATK vs DEF', () => {
        const attacker = monster('Axe Raider', 1700, 1150, CARD_POS.FACE);
        const defender = monster('Mystical Elf', 800, 2000, CARD_POS.SET);
        const env = fight(attacker, defender);

        expect(env[SIDE.MINE].hp).toBe(7700);
        expect(env[SIDE.OPPONENT][ENVIRONMENT.MONSTER_FIELD][0]).toBe(defender);
    });
});

describe('battle vs face-up ATK monster (regression)', () => {
    it('resolves ATK vs ATK with battle damage', () => {
        const attacker = monster('Summoned Skull', 2500, 1200, CARD_POS.FACE);
        const defender = monster('Axe Raider', 1700, 1150, CARD_POS.FACE);
        const env = fight(attacker, defender);

        expect(env[SIDE.OPPONENT][ENVIRONMENT.MONSTER_FIELD][0]).toBe(P);
        expect(env[SIDE.OPPONENT][ENVIRONMENT.GRAVEYARD]).toContain(defender);
        expect(env[SIDE.OPPONENT].hp).toBe(8000 - 800);
        expect(env[SIDE.MINE].hp).toBe(8000);
    });
});

describe('battle reveal (flip effects)', () => {
    afterEach(() => {
        jest.clearAllTimers();
        jest.useRealTimers();
    });

    it('face-down defender with a flip effect is revealed and the effect is scheduled', () => {
        jest.useFakeTimers();
        const attacker = monster('Axe Raider', 1700, 1150, CARD_POS.FACE);
        const defender = monster('Man-Eater Bug', 450, 600, CARD_POS.SET, { on_flip: jest.fn() });
        fight(attacker, defender);

        // Revealed face-up in Defense Mode, flip effect queued
        expect(defender.current_pos).toBe(CARD_POS.DEFENSE);
        expect(jest.getTimerCount()).toBe(1);
    });

    it('already face-up DEFENSE defender is NOT flipped again', () => {
        jest.useFakeTimers();
        const attacker = monster('Axe Raider', 1700, 1150, CARD_POS.FACE);
        const defender = monster('Man-Eater Bug', 450, 2000, CARD_POS.DEFENSE, { on_flip: jest.fn() });
        const env = fight(attacker, defender);

        // No flip effect re-fired, but the battle still resolved vs DEF
        expect(jest.getTimerCount()).toBe(0);
        expect(env[SIDE.MINE].hp).toBe(7700);
        expect(env[SIDE.OPPONENT][ENVIRONMENT.MONSTER_FIELD][0]).toBe(defender);
    });
});
