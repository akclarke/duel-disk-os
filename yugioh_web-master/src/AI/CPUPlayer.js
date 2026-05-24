/**
 * CPUPlayer.js — src/AI/CPUPlayer.js
 * Dispatches directly to Redux — no socket emits.
 */

import store from '../Store/store';
import { change_phase } from '../Store/actions/gameMetaActions';
import { direct_attack, others_attack } from '../Store/actions/battleMetaActions';
import Core from '../Core';
import { ENVIRONMENT, SIDE, CARD_TYPE, CARD_POS } from '../Components/Card/utils/constant';
import { PHASE, DST_DIRECT_ATTACK } from '../Components/PlayerGround/utils/constant';
import { NORMAL_SUMMON } from '../Store/actions/actionTypes';
import { get_unique_id_from_ennvironment } from '../Components/PlayerGround/utils/utils';

const THINK_DELAY = 800;
const PHASE_DELAY = 1400;
const sleep = (ms) => new Promise(res => setTimeout(res, ms));

const getEnv = () => store.getState().environmentReducer.environment;

const getMonsters = (env, side) =>
    (env[side][ENVIRONMENT.MONSTER_FIELD] || [])
        .filter(c => c !== CARD_TYPE.PLACEHOLDER && c?.card);

const getHand = (env, side) =>
    (env[side][ENVIRONMENT.HAND] || []).filter(c => c?.card);

const hasEmptyMonsterSlot = (env, side) =>
    (env[side][ENVIRONMENT.MONSTER_FIELD] || [])
        .some(s => s === CARD_TYPE.PLACEHOLDER);

const isExtraDeckType = (ct) =>
    ['MONSTER_FUSION','MONSTER_SYNCHRO','MONSTER_XYZ','MONSTER_LINK'].includes(ct);

class CPUPlayer {
    constructor(side) {
        this.side = side;
        this.active = false;
        this._normalSummonUsed = false;
    }

    _advancePhase(nextPhase) {
        store.dispatch(change_phase({ next_phase: nextPhase }));
    }

    async _tryNormalSummon() {
        if (this._normalSummonUsed) return false;
        const env = getEnv();
        if (!hasEmptyMonsterSlot(env, this.side)) return false;

        const fieldCount = getMonsters(env, this.side).length;
        const hand = getHand(env, this.side);

        const eligible = hand.filter(c => {
            const ct = c.card.card_type;
            if (!ct?.startsWith('MONSTER')) return false;
            if (isExtraDeckType(ct)) return false;
            const level = c.card.level || 1;
            if (level <= 4) return true;
            if (level <= 6) return fieldCount >= 1;
            return fieldCount >= 2;
        });

        if (!eligible.length) return false;

        const best = eligible.reduce((a, b) =>
            (b.card.atk || 0) > (a.card.atk || 0) ? b : a, eligible[0]);

        await sleep(THINK_DELAY);
        console.log(`[CPU ${this.side}] Summoning ${best.card.name} (ATK:${best.card.atk})`);

        const freshEnv = getEnv();
        // Tribute if needed
        const level = best.card.level || 1;
        if (level >= 5) {
            const myMonsters = getMonsters(freshEnv, this.side);
            const toTribute = level >= 7 ? myMonsters.slice(0, 2) : myMonsters.slice(0, 1);
            if (toTribute.length > 0) {
                // tribute() expects unique_id strings
                const tributeIds = toTribute.map(m => get_unique_id_from_ennvironment(m));
                Core.Summon.tribute(tributeIds, this.side, ENVIRONMENT.MONSTER_FIELD, freshEnv);
                await sleep(300);
            }
        }

        Core.Summon.summon(
            { side: this.side, card: best, src_location: ENVIRONMENT.HAND },
            NORMAL_SUMMON,
            getEnv()
        );
        this._normalSummonUsed = true;
        return true;
    }

    async _doBattlePhase() {
        const opp = this.side === SIDE.MINE ? SIDE.OPPONENT : SIDE.MINE;

        const attackers = getMonsters(getEnv(), this.side).filter(c =>
            c.current_pos === CARD_POS.FACE || c.current_pos === CARD_POS.UNSURE
        );

        for (const attacker of attackers) {
            await sleep(THINK_DELAY * 1.5); // wait for previous battle to resolve
            const env = getEnv();
            const oppMonsters = getMonsters(env, opp);
            const myAtk = attacker.current_atk ?? attacker.card.atk ?? 0;
            const uid = get_unique_id_from_ennvironment(attacker);

            if (oppMonsters.length === 0) {
                console.log(`[CPU ${this.side}] ${attacker.card.name} direct attacks`);
                store.dispatch(direct_attack({
                    src_monster: uid,
                    dst: DST_DIRECT_ATTACK,
                    side: this.side,
                }));
            } else {
                const target = oppMonsters.reduce((weakest, c) =>
                    (c.current_atk ?? c.card.atk ?? 0) < (weakest.current_atk ?? weakest.card.atk ?? 0)
                        ? c : weakest,
                    oppMonsters[0]
                );
                const targetAtk = target.current_atk ?? target.card.atk ?? 0;
                if (myAtk >= targetAtk) {
                    console.log(`[CPU ${this.side}] ${attacker.card.name} attacks ${target.card.name}`);
                    store.dispatch(others_attack({
                        src_monster: uid,
                        dst: get_unique_id_from_ennvironment(target),
                        side: this.side,
                    }));
                }
            }
        }
    }

    async takeTurn() {
        if (this.active) return;
        this.active = true;
        this._normalSummonUsed = false;

        try {
            console.log(`[CPU ${this.side}] Turn starting`);
            // Game.jsx auto-advances Draw → Standby → MP1 for the active player.
            // We wait for that before acting.
            await sleep(PHASE_DELAY * 3);

            // Main Phase 1 — summon only (no spells to avoid side-mismatch bugs)
            console.log(`[CPU ${this.side}] Main Phase 1`);
            await this._tryNormalSummon();
            await sleep(PHASE_DELAY);

            // Battle Phase (only if we have monsters)
            const env = getEnv();
            if (getMonsters(env, this.side).length > 0) {
                console.log(`[CPU ${this.side}] → Battle Phase`);
                this._advancePhase(PHASE.BATTLE_PHASE);
                await sleep(PHASE_DELAY);
                await this._doBattlePhase();
                await sleep(PHASE_DELAY);

                console.log(`[CPU ${this.side}] → Main Phase 2`);
                this._advancePhase(PHASE.MAIN_PHASE_2);
                await sleep(PHASE_DELAY);
            }

            // End Phase
            await sleep(PHASE_DELAY);
            console.log(`[CPU ${this.side}] → End Phase`);
            this._advancePhase(PHASE.END_PHASE);

        } catch (err) {
            console.error(`[CPU ${this.side}] Error during turn:`, err);
            this._advancePhase(PHASE.END_PHASE);
        } finally {
            this.active = false;
        }
    }
}

export default CPUPlayer;