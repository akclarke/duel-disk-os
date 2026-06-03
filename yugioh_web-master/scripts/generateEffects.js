#!/usr/bin/env node
/**
 * scripts/generateEffects.js
 *
 * AI-powered card effect generator.
 *
 * Usage:
 *   node scripts/generateEffects.js 26202165 40044918
 *   ANTHROPIC_API_KEY=sk-... node scripts/generateEffects.js 26202165
 *
 * For each passcode:
 *  a. Fetches card data from YGOPRODeck
 *  b. Fetches YGOPro Lua script from GitHub
 *  c. Calls Claude claude-sonnet-4-6 to generate an effectsRegistry / triggerRegistry entry
 *  d. Displays the generated entry and asks to add / skip / edit
 *  e. Optionally appends the entry to the correct registry file
 */

'use strict';

const fs       = require('fs');
const path     = require('path');
const readline = require('readline');
const { execSync } = require('child_process');

const SRC           = path.join(__dirname, '..', 'src', 'data');
const EFFECTS_FILE  = path.join(SRC, 'effectsRegistry.js');
const TRIGGERS_FILE = path.join(SRC, 'triggerRegistry.js');

const YGOPRO_API = 'https://db.ygoprodeck.com/api/v7/cardinfo.php?id=';
const LUA_BASE   = 'https://raw.githubusercontent.com/Fluorohydride/ygopro-scripts/master/c';
const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';

const API_KEY = process.env.ANTHROPIC_API_KEY;

// ── HELPERS ──────────────────────────────────────────────────────────────────

async function fetchJSON(url) {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.json();
}

async function fetchText(url) {
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) return null;
        return res.text();
    } catch { return null; }
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(res => rl.question(q, res));

// ── FACTORY PRIMITIVES SUMMARY ───────────────────────────────────────────────

const FACTORY_SUMMARY = `
Available effectFactory.js primitives and wrappers:

OPERATION FACTORIES (return an operation function (env, side) => void|Promise):
  searchDeck(opts, label)            — add matching card from deck to hand
  drawCards(n)                       — draw n cards from deck
  discardFromHand(n, opts, label)    — player selects n cards to discard
  gainLP(amount)                     — gain life points
  payLP(amount)                      — pay life points
  dealDamage(amount)                 — deal damage to opponent
  destroyMonsters(opts)              — destroy monsters (opts.side: 'MINE'|'OPPONENT'|'BOTH')
  destroySpellsTraps(opts)           — destroy spells/traps
  specialSummonFromDeck(opts, label) — SS from deck
  specialSummonFromHand(opts, label) — SS from hand
  specialSummonFromGY(opts, label)   — SS from GY
  passiveBoost(amount, opts, stat)   — passive ATK/DEF boost while on field
  sequence(...operations)            — run operations in order
  when(conditionFn, operation)       — conditional execution
  bounce(opts, label)                — return monster(s) to hand
  banish(opts, label)                — remove from play to banish zone
  millCards(n, side)                 — send top n cards from deck to GY
  changeBattlePosition(opts)         — change monster to ATK or DEF position

TRIGGER/EFFECT WRAPPERS (return an effects array entry):
  onActivate(operation, conditionFn) — hand/field activation (spell/trap)
  continuous(passiveOp, activateOp, conditionFn) — continuous spell/trap
  onSummon(operation, conditionFn)   — fires when this monster is summoned
  oncePerTurn(operation, conditionFn) — once-per-turn field effect
  onDestroy(operation, conditionFn)  — fires when this card is sent to GY
  onBattleDamage(operation)          — fires when this monster inflicts battle damage
  onAttackDeclared(operation, conditionFn) — fires when attack declared (set traps)
  whileOnField(cardKey, passiveFn)   — passive while on field
  floater(opts, label)               — on destroy: SS from deck
  recruiter(opts, label)             — on destroy: add from deck to hand
  drawSpell(n)                       — activate to draw n cards
  nuke()                             — destroy all monsters
  raigeki()                          — destroy all opponent monsters
  burn(amount)                       — deal fixed damage
  collectiveBoost(amount, filter, cardKey) — collective ATK boost

FILTER OPTIONS for buildFilter (used in opts):
  { type: 'MONSTER'|'SPELL'|'TRAP', nameIncludes, nameExcludes,
    atk: {min, max}, def: {min, max}, level, attribute, race, key, custom }

TARGETING:
  Use \`sourceList: [...]\` in openSelector calls.
  Target declaration happens inside operation(env, side).

SIDES:
  SIDE.MINE = 'MINE', SIDE.OPPONENT = 'OPPONENT'

ENVIRONMENTS:
  ENVIRONMENT.HAND, ENVIRONMENT.DECK, ENVIRONMENT.MONSTER_FIELD,
  ENVIRONMENT.SPELL_FIELD, ENVIRONMENT.GRAVEYARD, ENVIRONMENT.EXTRA_DECK

CARD_POS:
  CARD_POS.FACE (ATK face-up), CARD_POS.DEFENSE (DEF face-up), CARD_POS.SET (face-down)

REGISTRIES:
  effectsRegistry.js  — activated effects, on-summon effects, continuous spells/traps
  triggerRegistry.js  — on-destroy, on-battle-damage, on-attack-declared, ON_MONSTER_SUMMONED
`;

// ── PROMPT BUILDER ───────────────────────────────────────────────────────────

function buildPrompt(card, lua) {
    return `You are generating a Yu-Gi-Oh card effect entry for the game engine "Duel Disk OS."

CARD DATA:
Name: ${card.name}
Type: ${card.type}
Level/Rank: ${card.level ?? card.rank ?? 'N/A'}
ATK: ${card.atk ?? 'N/A'} / DEF: ${card.def ?? 'N/A'}
Attribute: ${card.attribute ?? 'N/A'}
Race: ${card.race ?? 'N/A'}
Description: ${card.desc}

YGOPRO LUA SCRIPT (reference implementation):
\`\`\`lua
${lua ? lua.slice(0, 3000) : '-- No Lua script available'}
\`\`\`

AVAILABLE PRIMITIVES:
${FACTORY_SUMMARY}

INSTRUCTIONS:
1. Analyze the card description and Lua script to determine the correct effect type.
2. Choose the right registry:
   - effectsRegistry: activated effects, on-summon, continuous, once-per-turn field effects
   - triggerRegistry: on-destroy, on-battle-damage, on-attack-declared, reactive triggers
3. Generate a JavaScript entry for the correct registry.
4. Use only the primitives listed above. Do NOT use dispatchEnv() inside operations.
5. For complex effects with no matching primitive, use the log fallback pattern:
   oncePerTurn((env) => { logEvent(LOG_TYPE.EFFECT, '${card.name}: [effect text]'); dispatchEnv(env); })
   (dispatchEnv IS allowed at the top level of operation functions — just not inside factory primitives)
6. Return ONLY valid JSON in this exact format:
   {
     "registry": "effects" or "triggers",
     "entry": "    // ${card.name} (${card.id})\n    ${card.id}: <JS entry here>,"
   }

Do not include any explanation outside the JSON. The entry must be valid JavaScript that
can be pasted directly into the registry object.`;
}

// ── ANTHROPIC API CALL ───────────────────────────────────────────────────────

async function callClaude(prompt) {
    if (!API_KEY) throw new Error('ANTHROPIC_API_KEY environment variable not set');

    const body = {
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
    };

    const res = await fetch(ANTHROPIC_API, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': API_KEY,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Anthropic API error ${res.status}: ${err}`);
    }

    const data = await res.json();
    return data.content?.[0]?.text ?? '';
}

// ── APPEND TO REGISTRY ───────────────────────────────────────────────────────

function appendToRegistry(registryFile, entry) {
    let src = fs.readFileSync(registryFile, 'utf8');
    // Insert just before the closing `};` of the exported object
    const insertPoint = src.lastIndexOf('};');
    if (insertPoint === -1) {
        console.error('  Could not find closing `};` in registry file');
        return false;
    }
    const newSrc = src.slice(0, insertPoint) + '\n' + entry + '\n' + src.slice(insertPoint);
    fs.writeFileSync(registryFile, newSrc, 'utf8');
    return true;
}

// ── PROCESS ONE PASSCODE ─────────────────────────────────────────────────────

async function processPasscode(passcode) {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  Processing passcode: ${passcode}`);
    console.log(`${'═'.repeat(60)}`);

    // Fetch card data
    let card;
    try {
        const data = await fetchJSON(YGOPRO_API + passcode);
        card = data.data?.[0];
        if (!card) throw new Error('Card not found');
    } catch (e) {
        console.error(`  ✗ Could not fetch card data: ${e.message}`);
        return;
    }
    console.log(`  Card: ${card.name} (${card.type})`);

    // Fetch Lua script
    const luaUrl = `${LUA_BASE}${passcode}.lua`;
    const lua = await fetchText(luaUrl);
    if (lua) {
        console.log(`  Lua: found (${lua.length} bytes)`);
    } else {
        console.log(`  Lua: not found — generating from description only`);
    }

    // Call Claude
    console.log(`  Calling Claude claude-sonnet-4-6...`);
    let rawResponse;
    try {
        rawResponse = await callClaude(buildPrompt(card, lua));
    } catch (e) {
        console.error(`  ✗ Claude API error: ${e.message}`);
        return;
    }

    // Parse JSON response
    let parsed;
    try {
        // Claude may wrap the JSON in markdown code fences
        const jsonMatch = rawResponse.match(/\{[\s\S]*"registry"[\s\S]*"entry"[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON found in response');
        parsed = JSON.parse(jsonMatch[0]);
    } catch (e) {
        console.error(`  ✗ Could not parse Claude response: ${e.message}`);
        console.log('\n  Raw response:');
        console.log(rawResponse);
        return;
    }

    const { registry, entry } = parsed;
    const targetFile = registry === 'triggers' ? TRIGGERS_FILE : EFFECTS_FILE;

    console.log(`\n  Generated entry for ${registry}Registry.js:\n`);
    console.log('  ' + '─'.repeat(56));
    console.log(entry.split('\n').map(l => '  ' + l).join('\n'));
    console.log('  ' + '─'.repeat(56));

    // Prompt user
    const answer = await ask(`\n  Add to ${registry}Registry? [y/n/e(edit)] > `);

    if (answer.trim().toLowerCase() === 'y') {
        if (appendToRegistry(targetFile, entry)) {
            console.log(`  ✓ Appended to ${path.basename(targetFile)}`);
        }
    } else if (answer.trim().toLowerCase() === 'e') {
        const tmpFile = path.join(require('os').tmpdir(), `ddo_effect_${passcode}.js`);
        fs.writeFileSync(tmpFile, entry);
        const editor = process.env.EDITOR || (process.platform === 'win32' ? 'notepad' : 'nano');
        try {
            execSync(`${editor} "${tmpFile}"`, { stdio: 'inherit' });
            const edited = fs.readFileSync(tmpFile, 'utf8');
            if (appendToRegistry(targetFile, edited)) {
                console.log(`  ✓ Edited entry appended to ${path.basename(targetFile)}`);
            }
        } catch (e) {
            console.error(`  ✗ Editor error: ${e.message}`);
        }
    } else {
        console.log('  Skipped.');
    }
}

// ── MAIN ─────────────────────────────────────────────────────────────────────

(async () => {
    const passcodes = process.argv.slice(2).map(s => s.trim()).filter(Boolean);

    if (passcodes.length === 0) {
        console.error('Usage: node scripts/generateEffects.js <passcode> [passcode2 ...]');
        console.error('Example: node scripts/generateEffects.js 26202165 40044918');
        process.exit(1);
    }

    if (!API_KEY) {
        console.error('\n  ✗ ANTHROPIC_API_KEY is not set.');
        console.error('  Set it with: export ANTHROPIC_API_KEY=sk-ant-...\n');
        process.exit(1);
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  Duel Disk OS — AI Effect Generator');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`  Processing ${passcodes.length} passcode(s): ${passcodes.join(', ')}\n`);

    for (const code of passcodes) {
        await processPasscode(parseInt(code, 10));
    }

    rl.close();

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  Done. Run node scripts/validateEffects.js to verify.');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
})();
