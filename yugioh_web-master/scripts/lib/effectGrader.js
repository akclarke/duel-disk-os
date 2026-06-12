#!/usr/bin/env node
/**
 * scripts/lib/effectGrader.js
 *
 * Shared Lua-vs-registry grading logic, used by both:
 *  - scripts/validateEffects.js  (grades existing registry entries)
 *  - scripts/generateEffects.js  (self-validates a freshly generated entry
 *    before showing it to the user)
 *
 * Keeping this in one place guarantees the generator is held to exactly
 * the same bar as the validation report.
 */

'use strict';

// ── 1. LUA PARSING ───────────────────────────────────────────────────────────

const LUA_PATTERNS = [
    // Effect types
    { re: /EFFECT_TYPE_TRIGGER_O/,     key: 'triggerO'           },
    { re: /EFFECT_TYPE_TRIGGER_F/,     key: 'triggerF'           },
    { re: /EFFECT_TYPE_FIELD/,         key: 'fieldEffect'        },
    { re: /EFFECT_TYPE_IGNITION/,      key: 'ignition'           },
    { re: /EFFECT_TYPE_ACTIVATE/,      key: 'activate'           },
    { re: /EFFECT_TYPE_CONTINUOUS/,    key: 'continuous'         },
    // Event codes
    { re: /EVENT_TO_GRAVE/,            key: 'evToGrave'          },
    { re: /EVENT_BATTLE_DAMAGE/,       key: 'evBattleDamage'     },
    { re: /EVENT_ATTACK_ANNOUNCE/,     key: 'evAttackAnnounce'   },
    { re: /EVENT_SUMMON_SUCCESS/,      key: 'evSummon'           },
    { re: /EVENT_SPSUMMON_SUCCESS/,    key: 'evSpSummon'         },
    { re: /EVENT_PHASE\b/,             key: 'evPhase'            },
    // Categories
    { re: /CATEGORY_TOHAND/,           key: 'catToHand'          },
    { re: /CATEGORY_DRAW/,             key: 'catDraw'            },
    { re: /CATEGORY_DESTROY/,          key: 'catDestroy'         },
    { re: /CATEGORY_DAMAGE/,           key: 'catDamage'          },
    { re: /CATEGORY_SPECIAL_SUMMON/,   key: 'catSsSummon'        },
    { re: /CATEGORY_REMOVE/,           key: 'catBanish'          },
    { re: /CATEGORY_HANDES/,           key: 'catHandDest'        },
    { re: /CATEGORY_EQUIP/,            key: 'catEquip'           },
    // Misc
    { re: /SetCountLimit\s*\(/,        key: 'oncePer'            },
    { re: /SetHintTiming|SetActivatable/, key: 'quickEffect'     },
];

function parseLua(lua) {
    const found = {};
    for (const { re, key } of LUA_PATTERNS) {
        found[key] = re.test(lua);
    }
    return found;
}

// ── 2. MAP LUA → EXPECTED FACTORY PRIMITIVE ──────────────────────────────────

function expectedPrimitive(lua) {
    const hints = [];

    if (lua.triggerO && lua.evToGrave)       hints.push('onDestroy()');
    if (lua.triggerO && lua.evBattleDamage)  hints.push('onBattleDamage()');
    if (lua.triggerO && lua.evAttackAnnounce) hints.push('onAttackDeclared()');
    if (lua.triggerO && lua.evSummon)        hints.push('onSummon() trigger');
    if (lua.triggerO && lua.evSpSummon)      hints.push('onSummon() trigger (special)');
    if (lua.fieldEffect || lua.continuous)   hints.push('continuous() or whileOnField()');
    if (lua.ignition)                        hints.push('onActivate() or oncePerTurn()');
    if (lua.activate && !lua.ignition)       hints.push('onActivate()');

    if (lua.evPhase)     hints.push('onPhase()');

    if (lua.catToHand)   hints.push('searchDeck() or salvage()');
    if (lua.catDraw)     hints.push('drawCards()');
    if (lua.catDestroy)  hints.push('destroyMonsters() or destroyCards()');
    if (lua.catDamage)   hints.push('dealDamage()');
    if (lua.catSsSummon) hints.push('specialSummonFrom*()');
    if (lua.catBanish)   hints.push('banish()/banishFromGY()/banishUntil()');
    if (lua.catEquip)    hints.push('equipTo()');
    if (lua.oncePer)     hints.push('once_per_turn (oncePerTurn()/quickEffect()) or oncePerDuel()');
    if (lua.quickEffect) hints.push('quickEffect() — spell_speed: 2');

    return hints;
}

// ── 3. GRADE AN ENTRY ────────────────────────────────────────────────────────

/**
 * @param {object}  lua         output of parseLua()
 * @param {boolean} inEffects   true if the entry lives in (or would live in) effectsRegistry
 * @param {boolean} inTriggers  true if the entry lives in (or would live in) triggerRegistry
 * @param {string}  cardName    for error messages only
 * @returns {{status: 'PASS'|'WARN'|'FAIL'|'MISSING', details: string}}
 */
function gradeEntry(lua, inEffects, inTriggers, cardName) {
    const expected = expectedPrimitive(lua);

    if (expected.length === 0) return { status: 'MISSING', details: 'No Lua file found or card has no effects' };

    const hasWarn = expected.some(e => e.includes('WARN'));
    const inEither = inEffects || inTriggers;

    if (!inEither) return { status: 'FAIL', details: `Not in any registry. Expected: ${expected.join(', ')}` };

    // Basic type match: trigger effects belong in triggerRegistry
    const shouldBeTrigger = expected.some(e => ['onDestroy()','onBattleDamage()','onAttackDeclared()'].includes(e));
    const shouldBeEffect   = !shouldBeTrigger || expected.some(e => ['onActivate()','oncePerTurn()','continuous() or whileOnField()'].includes(e));

    if (shouldBeTrigger && !inTriggers && !inEffects) {
        return { status: 'FAIL', details: `Should be in triggerRegistry. Expected: ${expected.join(', ')}` };
    }
    if (hasWarn) return { status: 'WARN', details: `Some effect types have no factory primitive. Expected: ${expected.join(', ')}` };
    return { status: 'PASS', details: `Matches expected types: ${expected.join(', ')}` };
}

module.exports = { LUA_PATTERNS, parseLua, expectedPrimitive, gradeEntry };
