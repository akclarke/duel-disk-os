import Monster from './Monster'
import { CARD_TYPE, ENVIRONMENT } from '../../utils/constant';
class NormalMonster extends Monster {
    constructor(options){
       super(options);
       this.card_type = CARD_TYPE.MONSTER.NORMAL;
       this.positon = ENVIRONMENT.DECK;
    }
}

export default NormalMonster;