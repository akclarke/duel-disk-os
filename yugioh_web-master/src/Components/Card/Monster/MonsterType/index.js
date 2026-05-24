import { CARD_TYPE } from '../../utils/constant';
import NormalMonster from './NormalMonster';
import EffectMonster from './EffectMonster';
import FusionMonster from './FusionMonster';
import SynchroMonster from './SynchroMonster';
import XYZMonster from './XYZMonster';

// Register all monster types here.
// When a new type is added (Pendulum, Link etc), add it to this map.
const initializeMonsterCard = {
    [CARD_TYPE.MONSTER.NORMAL]:  (options) => new NormalMonster(options),
    [CARD_TYPE.MONSTER.EFFECT]:  (options) => new EffectMonster(options),
    [CARD_TYPE.MONSTER.FUSION]:  (options) => new FusionMonster(options),
    [CARD_TYPE.MONSTER.SYNCHRO]: (options) => new SynchroMonster(options),  // Added
    [CARD_TYPE.MONSTER.XYZ]:     (options) => new XYZMonster(options),      // Added
};

export default initializeMonsterCard;