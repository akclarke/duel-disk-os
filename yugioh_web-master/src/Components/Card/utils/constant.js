export const ENVIRONMENT = {
    DECK: 'DECK',
    EXTRA_DECK: 'EXTRA_DECK',
    MONSTER_FIELD: 'MONSTER_FIELD',
    SPELL_FIELD: 'SPELL_FIELD',
    HAND: 'HAND',
    GRAVEYARD: 'GRAVEYARD',
    BANISHED: 'BANISHED',
    EXTRA_MONSTER_ZONE: 'EXTRA_MONSTER_ZONE',
    PENDULUM_ZONE:'PENDULUM_ZONE',
    // link and pendulum will be updated in the future
}

export const SIDE = {
    MINE: 'MINE',
    OPPONENT: 'OPPONENT'
}


export const CARD_TYPE = {
    MONSTER: {
        NORMAL: 'MONSTER_NORMAL',
        EFFECT: 'MONSTER_EFFECT',
        RITUAL: 'MONSTER_RITUAL',
        FUSION: 'MONSTER_FUSION',
        SYNCHRO: 'MONSTER_SYNCHRO',
        XYZ:    'MONSTER_XYZ',
        PENDULUM: 'MONSTER_PENDULUM',
        LINK:    'MONSTER_LINK',

    },
    SPELL: {
        NORMAL: 'SPELL_NORMAL',
        QUICK: 'SPELL_QUICK',
        EQUIPMENT: 'SPELL_EQUIPMENT',
        CONTINUOUS: 'SPELL_CONTINUOUS',
        ENVIRONMENT: 'SPELL_ENVIRONMENT',   
    },
    TRAP: {
        NORMAL: 'TRAP_NORMAL',
        CONTINUOUS: 'TRAP_CONTINUOUS',
        COUNTER: 'TRAP_COUNTER',
    },
    PLACEHOLDER: 'PLACEHOLDER'

}

export const CARD_POS = {
    FACE: 'FACE', //Face-Up ATK 
    DEFENSE: 'DEFENSE', //Face-Up Defense Mode
    SET: 'SET', //
    UNSURE: 'UNSURE',
    SET_DEFENSE:'SET_DEFENSE',

}


/**
 * Monster constant
 */
export const ATTRIBUTE = {
    LIGHT: 'LIGHT',
    DARK: 'DARK',
    EARTH: 'EARTH',
    FIRE: 'FIRE',
    WATER: 'WATER',
    WIND: 'WIND',
    DIVINE: 'DIVINE',
}



