import { io } from "socket.io-client";
import store from '../Store/store';
import { get_opponent_id, get_opponent_deck } from '../Store/actions/serverActions'
import { NORMAL_SUMMON, SET_SUMMON } from '../Store/actions/actionTypes'
import { normal_summon, set_summon, tribute, initialize_environment } from '../Store/actions/environmentActions'
import { opponent_attack_start, opponent_attack_ack } from '../Store/actions/battleMetaActions'
import { change_phase, initialize_meta } from '../Store/actions/gameMetaActions'
import Core from "../Core";
import { ENVIRONMENT, SIDE } from "../Components/Card/utils/constant";

/**
 * The address of the websocket server.
 * Change this to your server URL when deploying.
 */
const ENDPOINT = "http://127.0.0.1:4001";

// ─── RECONNECTION IDENTITY ────────────────────────────────────────────────────
// We save our stable player ID to localStorage after every match.
// On page load we send it back to the server so it can restore our session.

const STORAGE_KEY = "dueldisk_player_id";

const saveMyId = (id) => {
    try { localStorage.setItem(STORAGE_KEY, id); } catch(e) {}
};

const loadMyId = () => {
    try { return localStorage.getItem(STORAGE_KEY); } catch(e) { return null; }
};

const clearMyId = () => {
    try { localStorage.removeItem(STORAGE_KEY); } catch(e) {}
};

// ─── SOCKET ───────────────────────────────────────────────────────────────────

const socket = io(ENDPOINT, {
    // Disable socket.io's built-in reconnect — we handle it manually
    reconnection: false
});

const getCurrentEnvironment = () => store.getState().environmentReducer.environment;

// ─── CONNECTION ───────────────────────────────────────────────────────────────

socket.on("connect", () => {
    console.log(`[Socket] Connected as ${socket.id}`);

    const savedId = loadMyId();

    if (savedId) {
        // We have a saved ID — try to rejoin our previous session
        console.log(`[Reconnect] Attempting to rejoin as ${savedId}`);
        socket.emit("reconnect_attempt", { originalId: savedId });
    } else {
        // Fresh connection — join the matchmaking queue
        socket.emit("find_match");
    }
});

// ─── RECONNECTION EVENTS ──────────────────────────────────────────────────────

socket.on("reconnected", (data) => {
    console.log(`[Reconnect] Session restored!`);

    const info = {
        my_id: data.my_id,
        opponent_id: data.opponent_id,
        player_starts: data.player_starts
    };
    store.dispatch(get_opponent_id(info));

    // If the server has a saved game state, restore it
    if (data.gameState) {
        console.log(`[Reconnect] Restoring game state`);
        store.dispatch(initialize_environment(data.gameState.environment));
        store.dispatch(initialize_meta(data.gameState.game_meta));
    }
});

socket.on("reconnect_failed", () => {
    // Session expired or doesn't exist — clear saved ID and find a new match
    console.log(`[Reconnect] No session found, starting fresh`);
    clearMyId();
    socket.emit("find_match");
});

socket.on("opponent_reconnected", () => {
    console.log(`[Session] Opponent reconnected!`);
    // Could show a toast/notification here in future
});

socket.on("opponent_disconnected", (data) => {
    console.log(`[Session] ${data.message}`);
    // Could show a "waiting for opponent" overlay here in future
});

socket.on("opponent_disconnected_final", (data) => {
    console.log(`[Session] ${data.message}`);
    clearMyId();
    // Could show a "you win by forfeit" screen here in future
});

// ─── MATCHMAKING ──────────────────────────────────────────────────────────────

socket.on("matched", (data) => {
    console.log(`Matched with ${data.opponent}`);
    socket.opponent = data.opponent;

    // Save our stable ID so we can reconnect after a refresh
    saveMyId(data.my_id);

    const info = {
        my_id: data.my_id,
        opponent_id: data.opponent,
        player_starts: data.player_starts
    };
    store.dispatch(get_opponent_id(info));
});

// ─── DECK EXCHANGE ────────────────────────────────────────────────────────────

socket.on("receive_deck", (data) => {
    console.log(`Received opponent's deck!`);
    store.dispatch(get_opponent_deck({ deck: data.deck }));
});

// ─── GAME EVENTS ──────────────────────────────────────────────────────────────

socket.on("opponent_summon", (data) => {
    const environment = getCurrentEnvironment();
    Core.Summon.summon(data.data, data.data.type, environment);
});

socket.on("opponent_move_card_to_graveyard", (data) => {
    const { cards, side, src } = data.data;
    const environment = getCurrentEnvironment();
    Core.Misc.move_cards_to_graveyard(cards, side, src, environment);
});

socket.on("opponent_change_phase", (data) => {
    store.dispatch(change_phase(data.data));
});

socket.on("opponent_attack_start", (data) => {
    store.dispatch(opponent_attack_start(data.data));
});

socket.on("opponent_attack_ack", (data) => {
    const info = { environment: store.getState().environmentReducer.environment };
    store.dispatch(opponent_attack_ack(info));
});

socket.on("opponent_card_activate", (data) => {
    const environment = getCurrentEnvironment();
    Core.Effect.opponent_activate(data, environment);
});

socket.on("card_operate", (data) => {
    const environment = getCurrentEnvironment();
    Core.Effect.operate(data, environment);
});

socket.on("opponent_card_operated", (data) => {
    const environment = getCurrentEnvironment();
    Core.Effect.opponent_operated(data, environment);
});

socket.on("opponent_effect_ack", (data) => {
    const environment = getCurrentEnvironment();
    Core.Effect.opponent_effect_ack(data, environment);
});

// ─── STATE SYNC ───────────────────────────────────────────────────────────────
// Periodically send game state to server so it can restore after a reconnect.
// Only syncs when a game is actually in progress.

setInterval(() => {
    const state = store.getState();
    const { environment } = state.environmentReducer;
    const { game_meta } = state.gameMetaReducer;

    if (environment && game_meta && game_meta.current_phase) {
        socket.emit("sync_state", {
            gameState: { environment, game_meta }
        });
    }
}, 5000); // every 5 seconds

export default socket;