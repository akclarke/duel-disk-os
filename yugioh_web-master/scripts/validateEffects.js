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
const { parseLua, expectedPrimitive, gradeEntry } = require('./lib/effectGrader');

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

// ── 2. COMPARE AGAINST ACTUAL REGISTRY ──────────────────────────────────────

function loadRegistrySource(filePath) {
    return fs.readFileSync(filePath, 'utf8');
}

function codeHasPasscode(src, passcode) {
    // Check for numeric key or string key in the registry object
    const numRe  = new RegExp(`^\\s{4}${passcode}\\s*:`, 'm');
    const strRe  = new RegExp(`^\\s{4}'${passcode}'\\s*:`, 'm');
    return numRe.test(src) || strRe.test(src);
}

// ── 3. FETCH HELPERS ────────────────────────────────────────────────────────

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

// ── 4. MAIN ─────────────────────────────────────────────────────────────────

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
