#!/usr/bin/env node
/**
 * scripts/validateEffects.js
 *
 * For every passcode registered in effectsRegistry.js and triggerRegistry.js:
 *  1. Fetches the YGOPro Lua script from GitHub
 *  2. Parses Lua to identify effect types and categories
 *  3. Compares against what our registries actually implement
 *  4. Outputs scripts/validation-report.json
 *  5. Prints a summary to terminal
 *
 * Usage:  node scripts/validateEffects.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT       = path.join(__dirname, '..');
const SRC        = path.join(ROOT, 'src', 'data');
const REPORT_OUT = path.join(__dirname, 'validation-report.json');

const LUA_BASE   = 'https://raw.githubusercontent.com/Fluorohydride/ygopro-scripts/master/c{id}.lua';
const YGOPRO_API = 'https://db.ygoprodeck.com/api/v7/cardinfo.php?id={id}';

// ── 1. EXTRACT PASSCODES FROM REGISTRY FILES ─────────────────────────────────

function extractPasscodes(filePath) {
    const src = fs.readFileSync(filePath, 'utf8');
    const codes = new Set();

    // Match bare integer keys at the start of an object property, e.g.:
    //   12345678: [...]   or   '12345678_materials': ...
    const keyRe = /^\s{4}['"]?(\d{5,9})['"]?\s*:/gm;
    let m;
    while ((m = keyRe.exec(src)) !== null) {
        codes.add(parseInt(m[1], 10));
    }
    return [...codes];
}

// ── 2. LUA PARSING ──────────────────────────────────────────────────────────

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

// ── 3. MAP LUA → EXPECTED FACTORY PRIMITIVE ──────────────────────────────────

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

    if (lua.catToHand)   hints.push('searchDeck() or hand add');
    if (lua.catDraw)     hints.push('drawCards()');
    if (lua.catDestroy)  hints.push('destroyMonsters()');
    if (lua.catDamage)   hints.push('dealDamage()');
    if (lua.catSsSummon) hints.push('specialSummonFrom*()');
    if (lua.catBanish)   hints.push('banish() — WARN: primitive missing');
    if (lua.catEquip)    hints.push('equipTo() — WARN: primitive missing');
    if (lua.oncePer)     hints.push('once_per_turn: true');
    if (lua.quickEffect) hints.push('spell_speed: 2 — WARN: not tracked');

    return hints;
}

// ── 4. COMPARE AGAINST ACTUAL REGISTRY ──────────────────────────────────────

function loadRegistrySource(filePath) {
    return fs.readFileSync(filePath, 'utf8');
}

function codeHasPasscode(src, passcode) {
    // Check for numeric key or string key in the registry object
    const numRe  = new RegExp(`^\\s{4}${passcode}\\s*:`, 'm');
    const strRe  = new RegExp(`^\\s{4}'${passcode}'\\s*:`, 'm');
    return numRe.test(src) || strRe.test(src);
}

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

// ── 5. FETCH HELPERS ────────────────────────────────────────────────────────

async function fetchText(url) {
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) return null;
        return await res.text();
    } catch { return null; }
}

async function fetchCardName(passcode) {
    try {
        const url = YGOPRO_API.replace('{id}', passcode);
        const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
        if (!res.ok) return `Unknown (${passcode})`;
        const json = await res.json();
        return json.data?.[0]?.name ?? `Unknown (${passcode})`;
    } catch { return `Unknown (${passcode})`; }
}

// ── 6. MAIN ─────────────────────────────────────────────────────────────────

(async () => {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  Duel Disk OS — Effect Validation Tool');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const effectsPath  = path.join(SRC, 'effectsRegistry.js');
    const triggersPath = path.join(SRC, 'triggerRegistry.js');

    const effectsSrc  = loadRegistrySource(effectsPath);
    const triggersSrc = loadRegistrySource(triggersPath);

    const effectCodes  = extractPasscodes(effectsPath);
    const triggerCodes = extractPasscodes(triggersPath);
    const allCodes     = [...new Set([...effectCodes, ...triggerCodes])];

    console.log(`  Found ${effectCodes.length} passcodes in effectsRegistry`);
    console.log(`  Found ${triggerCodes.length} passcodes in triggerRegistry`);
    console.log(`  Total unique: ${allCodes.length}\n`);
    console.log('  Fetching Lua scripts and card names (this may take ~30s)...\n');

    const results = [];
    const CONCURRENCY = 6;

    for (let i = 0; i < allCodes.length; i += CONCURRENCY) {
        const batch = allCodes.slice(i, i + CONCURRENCY);
        const batchResults = await Promise.all(batch.map(async (code) => {
            const luaUrl  = LUA_BASE.replace('{id}', code);
            const [lua, cardName] = await Promise.all([fetchText(luaUrl), fetchCardName(code)]);

            const inEffects  = codeHasPasscode(effectsSrc,  code);
            const inTriggers = codeHasPasscode(triggersSrc, code);

            if (!lua) {
                return {
                    passcode: code,
                    cardName,
                    status: 'MISSING',
                    details: 'No Lua script found at YGOPro repository (vanilla card or wrong passcode)',
                    inEffects,
                    inTriggers,
                };
            }

            const luaInfo = parseLua(lua);
            const grade   = gradeEntry(luaInfo, inEffects, inTriggers, cardName);
            return { passcode: code, cardName, ...grade, inEffects, inTriggers, luaInfo };
        }));
        results.push(...batchResults);

        const done = Math.min(i + CONCURRENCY, allCodes.length);
        process.stdout.write(`  Progress: ${done}/${allCodes.length}\r`);
    }

    console.log('\n');

    // ── Summary ─────────────────────────────────────────────────────────────
    const counts = { PASS: 0, FAIL: 0, WARN: 0, MISSING: 0 };
    for (const r of results) counts[r.status] = (counts[r.status] || 0) + 1;

    console.log('  ┌──────────────────────────────────────────────┐');
    console.log(`  │  PASS    ${String(counts.PASS).padStart(4)}   — effect type matches Lua      │`);
    console.log(`  │  FAIL    ${String(counts.FAIL).padStart(4)}   — structural mismatch           │`);
    console.log(`  │  WARN    ${String(counts.WARN).padStart(4)}   — Lua has unsupported type      │`);
    console.log(`  │  MISSING ${String(counts.MISSING).padStart(4)}   — no Lua file found           │`);
    console.log('  └──────────────────────────────────────────────┘\n');

    // Print FAIL and WARN cards
    const problems = results.filter(r => r.status === 'FAIL' || r.status === 'WARN');
    if (problems.length > 0) {
        console.log('  Cards needing attention:');
        for (const r of problems) {
            const tag = r.status === 'FAIL' ? '✗ FAIL' : '⚠ WARN';
            console.log(`    ${tag}  [${r.passcode}] ${r.cardName}`);
            console.log(`           ${r.details}`);
        }
        console.log();
    }

    fs.writeFileSync(REPORT_OUT, JSON.stringify(results, null, 2));
    console.log(`  Report saved to: scripts/validation-report.json`);
    console.log(`  Total: ${results.length} cards checked\n`);
})();
