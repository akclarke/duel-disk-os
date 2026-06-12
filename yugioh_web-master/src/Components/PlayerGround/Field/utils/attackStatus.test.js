/**
 * Attack-eligibility tests for returnAttackStatus.
 *
 * Defense-position monsters (face-up DEFENSE or face-down SET/SET_DEFENSE)
 * must not be offered Attack / Direct Attack buttons.
 */
import { ENVIRONMENT, SIDE, CARD_TYPE, CARD_POS } from '../../../Card/utils/constant';
import { PHASE } from '../../utils/constant';
import { returnAttackStatus } from './index';

// Pulled in transitively via Core/Battle — it imports the Redux store at module top.
jest.mock('../../../../data/triggerRegistry', () => ({
    fireTrigger: jest.fn(),
    fireFieldWatchTriggers: jest.fn(),
    TRIGGER_TYPE: {},
}));

// Pulled in transitively via Card/utils/utils — it drags in effectsRegistry and
// the socket client at module top. Only called at runtime, never by these tests.
jest.mock('../../../../data/cardLoader', () => ({
    get_card_meta: jest.fn(),
}));

const ENABLED = 'show_summon';
const DISABLED = 'no_hand_option';
const P = CARD_TYPE.PLACEHOLDER;

const gameMeta = { current_phase: PHASE.BATTLE_PHASE, current_turn: 'me', my_id: 'me' };

const envWithOpponentMonsters = (...monsters) => ({
    [SIDE.OPPONENT]: {
        [ENVIRONMENT.MONSTER_FIELD]: [...monsters, P, P, P, P, P].slice(0, 5),
    },
});

const monster = (pos, extra = {}) => ({
    card: { name: 'Axe Raider', atk: 1700, def: 1150, card_type: 'MONSTER_EFFECT' },
    current_pos: pos,
    ...extra,
});

describe('returnAttackStatus position checks', () => {
    it('face-up ATK monster can direct attack when the opponent field is empty', () => {
        const res = returnAttackStatus(monster(CARD_POS.FACE), gameMeta, envWithOpponentMonsters());
        expect(res).toEqual({ can_direct_attack: ENABLED, can_others_attack: DISABLED });
    });

    it('face-up ATK monster must attack a monster when one is present', () => {
        const env = envWithOpponentMonsters(monster(CARD_POS.FACE));
        const res = returnAttackStatus(monster(CARD_POS.FACE), gameMeta, env);
        expect(res).toEqual({ can_direct_attack: DISABLED, can_others_attack: ENABLED });
    });

    it.each([CARD_POS.DEFENSE, CARD_POS.SET, CARD_POS.SET_DEFENSE])(
        '%s monster cannot attack at all',
        (pos) => {
            const env = envWithOpponentMonsters(monster(CARD_POS.FACE));
            expect(returnAttackStatus(monster(pos), gameMeta, env))
                .toEqual({ can_direct_attack: DISABLED, can_others_attack: DISABLED });
            expect(returnAttackStatus(monster(pos), gameMeta, envWithOpponentMonsters()))
                .toEqual({ can_direct_attack: DISABLED, can_others_attack: DISABLED });
        }
    );

    it('legacy UNSURE position is treated as Attack Position', () => {
        const res = returnAttackStatus(monster(CARD_POS.UNSURE), gameMeta, envWithOpponentMonsters());
        expect(res).toEqual({ can_direct_attack: ENABLED, can_others_attack: DISABLED });
    });

    it('monster that already attacked this turn stays disabled', () => {
        const attacked = monster(CARD_POS.FACE, { attacked_this_turn: true });
        const res = returnAttackStatus(attacked, gameMeta, envWithOpponentMonsters());
        expect(res).toEqual({ can_direct_attack: DISABLED, can_others_attack: DISABLED });
    });
});
