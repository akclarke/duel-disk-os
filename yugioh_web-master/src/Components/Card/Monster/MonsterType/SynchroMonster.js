import Monster from './Monster'
import { CARD_TYPE, ENVIRONMENT } from '../../utils/constant';

class SynchroMonster extends Monster {
    constructor(options) {
        super(options);
        this.card_type = CARD_TYPE.MONSTER.SYNCHRO;  // Fixed: was FUSION
        this.positon = ENVIRONMENT.EXTRA_DECK;
        this.level = options.level;
        this.synchro_materials = options.synchro_materials;
        // isTuner is inherited from Monster base class
    }
}

export default SynchroMonster;  // Fixed: was FusionMonster