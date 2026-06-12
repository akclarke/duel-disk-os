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
 * Model backend (in order of preference):
 *   1. ANTHROPIC_API_KEY set        — metered Anthropic HTTP API
 *   2. Claude Code CLI (`claude -p`) — free with a Claude subscription; found on
 *      PATH, via CLAUDE_CLI_PATH, or bundled inside the VS Code extension
 *
 * For each passcode:
 *  a. Fetches card data from YGOPRODeck
 *  b. Fetches YGOPro Lua script from GitHub
 *  c. Calls Claude (claude-fable-5) to generate an effectsRegistry / triggerRegistry entry,
 *     using few-shot examples from our existing PASS entries plus the Lua script as reference
 *  d. Self-validates the generated entry with the same grading logic as validateEffects.js
 *  e. Displays the generated entry + self-validation result, and asks to add / skip / edit
 *  f. Optionally appends the entry to the correct registry file
 */

'use strict';

const fs       = require('fs');
const path     = require('path');
const readline = require('readline');
const { execSync, execFileSync } = require('child_process');
const { parseLua, gradeEntry } = require('./lib/effectGrader');

const SRC           = path.join(__dirname, '..', 'src', 'data');
const EFFECTS_FILE  = path.join(SRC, 'effectsRegistry.js');
const TRIGGERS_FILE = path.join(SRC, 'triggerRegistry.js');

const YGOPRO_API = 'https://db.ygoprodeck.com/api/v7/cardinfo.php?id=';
const LUA_BASE   = 'https://raw.githubusercontent.com/Fluorohydride/ygopro-scripts/master/c';
const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';

const API_KEY = process.env.ANTHROPIC_API_KEY;

// Fallback backend when no API key is set: the Claude Code CLI (`claude -p`),
// which runs on the local Claude subscription login instead of metered billing.
function resolveClaudeCli() {
    if (process.env.CLAUDE_CLI_PATH && fs.existsSync(process.env.CLAUDE_CLI_PATH)) {
        return process.env.CLAUDE_CLI_PATH;
    }
    try {
        const cmd = process.platform === 'win32' ? 'where claude' : 'command -v claude';
        const hit = execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] })
            .toString().split(/\r?\n/)[0].trim();
        if (hit) return hit;
    } catch { /* not on PATH */ }
    // The VS Code extension ships the CLI as a native binary
    const extDir = path.join(require('os').homedir(), '.vscode', 'extensions');
    try {
        const exe = process.platform === 'win32' ? 'claude.exe' : 'claude';
        const hit = fs.readdirSync(extDir)
            .filter(d => d.startsWith('anthropic.claude-code-'))
            .sort().reverse()
            .map(d => path.join(extDir, d, 'resources', 'native-binary', exe))
            .find(p => fs.existsSync(p));
        if (hit) return hit;
    } catch { /* no extensions dir */ }
    return null;
}

const CLAUDE_CLI = API_KEY ? null : resolveClaudeCli();

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
  banish(opts, label)                — remove from play to banish zone (field/GY/etc, opts.from)
  banishFromGY(opts, label)          — banish n cards from own GY matching opts.filter
  banishUntil(opts, label)           — TEMPORARY banish; returns at opts.returnPhase
                                       (default PHASE.STANDBY_PHASE, ownTurnOnly: true)
  banishFaceDown(opts)               — banish face-down (from deck/GY/field)
  millCards(n, side)                 — send top n cards from deck to GY
  sendToGY(opts)                     — send to GY WITHOUT destroying (costs, materials —
                                       no destroy triggers; use destroy* for "destroy")
  salvage(opts, label)               — add card(s) from your GY to your hand (selector)
  toDeck(opts)                       — return cards to deck (placement: 'shuffle'|'top'|'bottom')
  shuffleDeck(side)                  — shuffle a deck
  destroyCards(opts, label)          — TARGETED destroy with player selection
                                       (zone: 'MONSTER_FIELD'|'SPELL_FIELD'|'ANY', count)
  summonToken(opts)                  — summon token monsters ({name, atk, def, level, count})
  takeControl(opts, label)           — take control of an opponent monster
                                       (until: PHASE.* for temporary control)
  tributeCost(n, opts, label)        — send your own monsters to GY as a cost
  addCounter(name, n, opts)          — place counters on a monster (cardEnv.counters)
  removeCounter(name, n, opts)       — remove counters (cost payment)
  getCounter(cardEnv, name)          — read a counter value (for conditions)
  boostStats(amounts, opts)          — timed stat change that SURVIVES engine stat resets:
                                       boostStats({atk: 500}, {side:'MINE', until: PHASE.END_PHASE})
                                       (until: null = permanent while on field)
  setStats(amounts, opts)            — set ATK/DEF to fixed values (same opts)
  changeBattlePosition(opts)         — change monster to ATK or DEF position
  copyEffect(opts)                   — copy another on-field card's first effect operation
  conditionalEffect(condFn, thenOp, elseOp) — branch between two operations

TRIGGER/EFFECT WRAPPERS (return an effects array entry):
  onActivate(operation, conditionFn) — hand/field activation (spell/trap)
  continuous(passiveOp, activateOp, conditionFn) — continuous spell/trap
  onSummon(operation, conditionFn)   — fires when this monster is summoned
  oncePerTurn(operation, conditionFn) — once-per-turn field effect
  oncePerDuel(operation, conditionFn) — HARD once (single use while face-up)
  quickEffect(operation, conditionFn, opts) — QUICK EFFECT, Spell Speed 2:
                                       activatable both turns + chainable.
                                       opts: {windUp: true} = single use while face-up.
                                       Use for "(Quick Effect):" and "during either
                                       player's turn" card text.
  counterTrap(operation, conditionFn) — Counter Trap, Spell Speed 3
  onPhase(phase, operation, opts)    — fires automatically at a phase while face-up
                                       (e.g. "during your Standby Phase"); opts.ownTurnOnly
  onFlip(operation)                  — FLIP effect (fires on battle reveal)
  onDestroy(operation, conditionFn)  — fires when this card is sent to GY
  onBattleDamage(operation)          — fires when this monster inflicts battle damage
  onAttackDeclared(operation, conditionFn) — fires when attack declared (set traps)
  whileOnField(cardKey, passiveFn)   — passive while on field
  protectFromBattleDestroy(condFn, onProtect) — "cannot be destroyed by battle"
  damageMultiplier(n)                — battle damage multiplier (Odd-Eyes pattern)
  equipTo(equipKey, targetOpts, {atk, def}, label) — EQUIP SPELL with full lifecycle:
                                       targets 1 monster, boosts only it, goes to GY
                                       when the equipped monster leaves the field
  floater(opts, label)               — on destroy: SS from deck
  recruiter(opts, label)             — on destroy: add from deck to hand
  drawSpell(n)                       — activate to draw n cards
  nuke()                             — destroy all monsters
  raigeki()                          — destroy all opponent monsters
  burn(amount)                       — deal fixed damage
  collectiveBoost(amount, filter, cardKey) — collective ATK boost

PHASES (import PHASE from effectFactory; used by banishUntil/boostStats/onPhase/takeControl):
  PHASE.DRAW_PHASE, PHASE.STANDBY_PHASE, PHASE.MAIN_PHASE_1,
  PHASE.BATTLE_PHASE, PHASE.MAIN_PHASE_2, PHASE.END_PHASE

NOTE: Quick-Play SPELLS get Spell Speed 2 automatically from their card type —
plain onActivate() is correct for them. Use quickEffect() for MONSTER quick
effects and "(Quick Effect):" text.

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

// ── FEW-SHOT EXAMPLES ─────────────────────────────────────────────────────────
// 5 known-correct (card text → registry entry) pairs, pulled verbatim from
// existing PASS entries in effectsRegistry.js / triggerRegistry.js. These show
// the exact factory style — terse shortcuts where one exists, plain primitives
// otherwise, and hand-written passive loops only when no primitive fits.

const FEW_SHOT_EXAMPLES = `
EXAMPLE 1 — simple draw effect
Card text: "Draw 2 cards."
{
  "registry": "effects",
  "entry": "    // Pot of Greed (55144522) — draw 2 cards\\n    55144522: drawSpell(2),"
}

EXAMPLE 2 — board wipe
Card text: "Destroy all monsters your opponent controls."
{
  "registry": "effects",
  "entry": "    // Raigeki (12580477) — destroy all OPPONENT monsters\\n    12580477: raigeki(),"
}

EXAMPLE 3 — on-destroy search (triggerRegistry)
Card text: "If this card is sent from the field to the Graveyard: Add 1 monster with 1500 or less ATK from your Deck to your hand."
{
  "registry": "triggers",
  "entry": "    // Sangan (26202165) — on destroy: search 1 monster ATK \\u2264 1500 from deck\\n    26202165: recruiter(\\n        { atk: { max: 1500 }, type: 'MONSTER' },\\n        'Sangan — add 1 monster with ATK \\u2264 1500 from Deck to hand'\\n    ),"
}

EXAMPLE 4 — on-summon search
Card text: "When this card is Normal or Special Summoned: You can add 1 \\"HERO\\" monster from your Deck to your hand, except this card."
{
  "registry": "effects",
  "entry": "    // Elemental HERO Stratos (40044918) — on summon: search 1 HERO monster from deck\\n    40044918: onSummon(\\n        searchDeck({ nameIncludes: 'HERO', type: 'MONSTER' }, 'Stratos — add 1 HERO monster to hand')\\n    ),"
}

EXAMPLE 5 — continuous passive boost (no operation primitive fits, so a small
hand-written loop is used inside whileOnField — this is the preferred style
for "all monsters of type X gain Y ATK" effects)
Card text: "Increase the ATK of all WARRIOR-Type monsters you currently control by 200 points."
{
  "registry": "effects",
  "entry": "    // Command Knight (10375182) — all Warriors (except itself) gain 200 ATK\\n    10375182: whileOnField(10375182, (env, side) => {\\n        for (const m of (env[side][ENVIRONMENT.MONSTER_FIELD] || [])) {\\n            if (m !== CARD_TYPE.PLACEHOLDER &&\\n                m?.card?.race?.toLowerCase().includes('warrior') &&\\n                m?.card?.key !== 10375182) {\\n                m.current_atk = (m.current_atk ?? m.card.atk ?? 0) + 200;\\n            }\\n        }\\n    }),"
}

EXAMPLE 6 — equip spell (equipTo handles targeting, the stat change, and
falling off when the equipped monster leaves)
Card text: "A DARK monster equipped with this card increases its ATK by 400 points and decreases its DEF by 200 points."
{
  "registry": "effects",
  "entry": "    // Sword of Dark Destruction (37120512) — Equip: DARK monster +400 ATK / -200 DEF\\n    37120512: equipTo(\\n        37120512,\\n        { type: 'MONSTER', attribute: 'DARK' },\\n        { atk: 400, def: -200 },\\n        'Sword of Dark Destruction — equip to 1 DARK monster'\\n    ),"
}

EXAMPLE 7 — monster quick effect with temporary banish (quickEffect = Spell
Speed 2, both turns, chainable; banishUntil returns the card via PhaseEvents)
Card text: "During either player's turn: You can target 1 \\"Wind-Up\\" monster you control; banish it until your next Standby Phase. Each \\"Wind-Up\\" monster can only use its effect once while face-up on the field."
{
  "registry": "effects",
  "entry": "    // Wind-Up Rabbit (42874792) — Quick Effect: banish 1 Wind-Up until your next Standby Phase\\n    42874792: quickEffect(\\n        banishUntil(\\n            { filter: { nameIncludes: 'wind-up', type: 'MONSTER' }, returnPhase: PHASE.STANDBY_PHASE, ownTurnOnly: true },\\n            'Wind-Up Rabbit — banish 1 Wind-Up monster until your next Standby Phase'\\n        ),\\n        (env) => (env[SIDE.MINE][ENVIRONMENT.MONSTER_FIELD] || []).some(c =>\\n            c !== CARD_TYPE.PLACEHOLDER && c?.card?.name?.toLowerCase().includes('wind-up')),\\n        { windUp: true }\\n    ),"
}
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

YGOPRO LUA SCRIPT (structural reference — use this to identify the real effect
type/timing/categories; e.g. EFFECT_TYPE_TRIGGER_O + EVENT_TO_GRAVE means
onDestroy(), CATEGORY_SPECIAL_SUMMON means specialSummonFrom*(), SetCountLimit
means once_per_turn, etc.):
\`\`\`lua
${lua ? lua.slice(0, 4000) : '-- No Lua script available'}
\`\`\`

AVAILABLE PRIMITIVES:
${FACTORY_SUMMARY}

FEW-SHOT EXAMPLES (study these closely — match this exact style, terseness,
comment format, and quoting):
${FEW_SHOT_EXAMPLES}

INSTRUCTIONS:
1. Analyze the card description and Lua script to determine the correct effect type.
2. Choose the right registry:
   - effectsRegistry: activated effects, on-summon, continuous, once-per-turn field effects
   - triggerRegistry: on-destroy, on-battle-damage, on-attack-declared, reactive triggers
3. Generate a JavaScript entry for the correct registry, following the style of the
   few-shot examples above: prefer the shortest correct form (a named shortcut like
   drawSpell/raigeki/recruiter/nuke/burn if it fits exactly, otherwise a single
   wrapper + primitive call, otherwise a small hand-written loop like Example 5).
4. Use only the primitives listed above. Do NOT use dispatchEnv() inside operations.
5. The primitive set now covers the full rulebook (quick effects, equips,
   temporary banish, phase triggers, counters, tokens, control, protection,
   timed stat changes) — almost every card should compose real primitives.
   Only as a LAST RESORT, for an effect that genuinely cannot be expressed,
   use the log fallback pattern:
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

const CLAUDE_MODEL = 'claude-fable-5';

async function callClaude(prompt) {
    return API_KEY ? callClaudeApi(prompt) : callClaudeCli(prompt);
}

async function callClaudeApi(prompt) {
    const body = {
        model: CLAUDE_MODEL,
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

function callClaudeCli(prompt) {
    if (!CLAUDE_CLI) {
        throw new Error('No ANTHROPIC_API_KEY set and no Claude Code CLI found');
    }
    // cwd is a temp dir so the nested session does not load this project's
    // CLAUDE.md or MCP servers; the prompt goes in over stdin.
    const out = execFileSync(
        CLAUDE_CLI,
        ['-p', '--model', CLAUDE_MODEL, '--output-format', 'text'],
        {
            input: prompt,
            encoding: 'utf8',
            cwd: require('os').tmpdir(),
            timeout: 300000,
            maxBuffer: 16 * 1024 * 1024,
            windowsHide: true,
        }
    );
    return out.trim();
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

// ── SELF-VALIDATION ──────────────────────────────────────────────────────────

/**
 * Run the same checks validateEffects.js uses against a freshly generated
 * entry that hasn't been written to disk yet — plus a JS syntax check, since
 * a malformed (e.g. truncated) entry would otherwise break the registry file
 * on append.
 *
 * @returns {{ syntax: {ok: boolean, error?: string}, grade: {status: string, details: string} }}
 */
function selfValidate(card, lua, registry, entry) {
    let syntax;
    try {
        // Parse-only: wrapping in an object literal catches braces/quoting
        // problems without needing to import or execute the real registry.
        // eslint-disable-next-line no-new-func
        new Function(`return {\n${entry}\n};`);
        syntax = { ok: true };
    } catch (e) {
        syntax = { ok: false, error: e.message };
    }

    const inEffects  = registry !== 'triggers';
    const inTriggers = registry === 'triggers';

    const grade = lua
        ? gradeEntry(parseLua(lua), inEffects, inTriggers, card.name)
        : { status: 'MISSING', details: 'No Lua script found at YGOPro repository' };

    return { syntax, grade };
}

const GRADE_TAG = { PASS: '✓ PASS', WARN: '⚠ WARN', FAIL: '✗ FAIL', MISSING: '? MISSING' };

// ── PROCESS ONE PASSCODE ─────────────────────────────────────────────────────

async function processPasscode(passcode, opts = {}) {
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
        return { passcode, status: 'ERROR', details: e.message };
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
    console.log(`  Calling Claude (${CLAUDE_MODEL})...`);
    let rawResponse;
    try {
        rawResponse = await callClaude(buildPrompt(card, lua));
    } catch (e) {
        console.error(`  ✗ Claude API error: ${e.message}`);
        return { passcode, cardName: card.name, status: 'ERROR', details: e.message };
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
        return { passcode, cardName: card.name, status: 'ERROR', details: `Unparseable response: ${e.message}` };
    }

    const { registry, entry } = parsed;
    const targetFile = registry === 'triggers' ? TRIGGERS_FILE : EFFECTS_FILE;

    console.log(`\n  Generated entry for ${registry}Registry.js:\n`);
    console.log('  ' + '─'.repeat(56));
    console.log(entry.split('\n').map(l => '  ' + l).join('\n'));
    console.log('  ' + '─'.repeat(56));

    // Self-validate — same checks validateEffects.js performs, run before display/append
    const { syntax, grade } = selfValidate(card, lua, registry, entry);
    console.log('\n  Self-validation:');
    console.log(`    ${syntax.ok ? '✓ Syntax OK' : `✗ SYNTAX ERROR — ${syntax.error}`}`);
    console.log(`    ${GRADE_TAG[grade.status] || grade.status} — ${grade.details}`);
    if (!syntax.ok || grade.status === 'FAIL') {
        console.log('\n  ⚠ This entry failed self-validation — review carefully before adding.');
    }

    const result = { passcode, cardName: card.name, registry, syntaxOk: syntax.ok, status: grade.status, details: grade.details };

    if (opts.dryRun) {
        console.log('\n  [dry-run] Not appended.');
        return result;
    }

    // Prompt user
    const answer = await ask(`\n  Add to ${registry}Registry? [y/n/e(edit)] > `);

    if (answer.trim().toLowerCase() === 'y') {
        if (appendToRegistry(targetFile, entry)) {
            console.log(`  ✓ Appended to ${path.basename(targetFile)}`);
            result.action = 'added';
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
                result.action = 'edited';
            }
        } catch (e) {
            console.error(`  ✗ Editor error: ${e.message}`);
            result.action = 'editor-error';
        }
    } else {
        console.log('  Skipped.');
        result.action = 'skipped';
    }

    return result;
}

// ── MAIN ─────────────────────────────────────────────────────────────────────

(async () => {
    const args = process.argv.slice(2).map(s => s.trim()).filter(Boolean);
    const dryRun = args.includes('--dry-run');
    const passcodes = args.filter(a => a !== '--dry-run');

    if (passcodes.length === 0) {
        console.error('Usage: node scripts/generateEffects.js [--dry-run] <passcode> [passcode2 ...]');
        console.error('Example: node scripts/generateEffects.js 26202165 40044918');
        console.error('  --dry-run  generate + self-validate only; do not prompt or write to registries');
        process.exit(1);
    }

    if (!API_KEY && !CLAUDE_CLI) {
        console.error('\n  ✗ No model backend available.');
        console.error('  Either set ANTHROPIC_API_KEY (metered API), or install the Claude Code');
        console.error('  CLI / VS Code extension so the generator can use your Claude');
        console.error('  subscription via `claude -p`.\n');
        process.exit(1);
    }

    const backend = API_KEY ? 'Anthropic API' : `Claude Code CLI (subscription) — ${CLAUDE_CLI}`;
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  Duel Disk OS — AI Effect Generator');
    console.log(`  Model: ${CLAUDE_MODEL}${dryRun ? '  (dry run)' : ''}`);
    console.log(`  Backend: ${backend}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`  Processing ${passcodes.length} passcode(s): ${passcodes.join(', ')}\n`);

    const results = [];
    for (const code of passcodes) {
        results.push(await processPasscode(parseInt(code, 10), { dryRun }));
    }

    rl.close();

    if (dryRun) {
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('  Dry-run summary (self-validation acceptance)');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        // Grade parity: compare each generated entry's grade against the grade
        // the existing (hand-fixed) entry earns in validation-report.json. For
        // cards whose effects lack factory primitives, WARN is the ceiling —
        // matching the existing grade is full marks there, so "accepted" means
        // syntax OK and graded PASS or WARN (the same bar validateEffects.js
        // applies to the registries: FAILs are defects, WARNs are acceptable).
        let reportByCode = new Map();
        try {
            const rep = JSON.parse(fs.readFileSync(path.join(__dirname, 'validation-report.json'), 'utf8'));
            reportByCode = new Map(rep.map(r => [r.passcode, r.status]));
        } catch { /* no report yet — parity column omitted */ }

        const RANK = { ERROR: 0, MISSING: 0, FAIL: 0, WARN: 1, PASS: 2 };
        const counts = { PASS: 0, WARN: 0, FAIL: 0, MISSING: 0, ERROR: 0 };
        let accepted = 0, parity = 0, parityKnown = 0;
        for (const r of results) {
            counts[r.status] = (counts[r.status] || 0) + 1;
            if (r.syntaxOk !== false && (r.status === 'PASS' || r.status === 'WARN')) accepted++;
            let parityNote = '';
            const existing = reportByCode.get(r.passcode);
            if (existing) {
                parityKnown++;
                if ((RANK[r.status] ?? 0) >= (RANK[existing] ?? 0)) parity++;
                parityNote = `  (existing entry: ${existing})`;
            }
            const tag = GRADE_TAG[r.status] || `? ${r.status}`;
            console.log(`    ${tag}  [${r.passcode}] ${r.cardName ?? 'Unknown'}${r.syntaxOk === false ? '  (SYNTAX ERROR)' : ''}${parityNote}`);
        }
        const total = results.length;
        console.log(`\n  PASS ${counts.PASS} / WARN ${counts.WARN} / FAIL ${counts.FAIL} / MISSING ${counts.MISSING} / ERROR ${counts.ERROR}`);
        console.log(`  Accepted (syntax OK, graded PASS or WARN): ${accepted}/${total} (${total ? ((accepted / total) * 100).toFixed(1) : '0.0'}%)`);
        if (parityKnown) {
            console.log(`  Grade parity vs existing entries: ${parity}/${parityKnown} matched or beat the existing grade`);
        }
        console.log(`  Strict PASS rate: ${total ? ((counts.PASS / total) * 100).toFixed(1) : '0.0'}%\n`);
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  Done. Run node scripts/validateEffects.js to verify.');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
})();
