import Monster from './Monster'
import { CARD_TYPE, ENVIRONMENT } from '../../utils/constant';

class XYZMonster extends Monster {
    constructor(options) {
        super(options);
        this.card_type = CARD_TYPE.MONSTER.XYZ;      // Fixed: was FUSION
        this.positon = ENVIRONMENT.EXTRA_DECK;
        this.rank = options.rank;                     // Fixed: was never assigned
        this.xyz_materials = options.xyz_materials;
    }
}

export default XYZMonster;  // Fixed: was FusionMonster