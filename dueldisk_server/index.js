/**
 * Duel Disk OS — Game Server
 * Supports reconnection — a refreshed tab rejoins within the grace period.
 */

const { Server } = require("socket.io");
const http = require("http");

const PORT = 4001;
const RECONNECT_GRACE_MS = 60_000; // 60 seconds to reconnect before session dies

const httpServer = http.createServer();
const io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// ─── STATE ────────────────────────────────────────────────────────────────────

let waitingPlayer = null;

// sessionId -> session object
const sessions = {};

// current socketId -> sessionId
const socketToSession = {};

// originalId (stable) -> sessionId
const originalIdToSession = {};

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const getOpponentSocket = (socketId) => {
    const sessionId = socketToSession[socketId];
    if (!sessionId) return null;
    const session = sessions[sessionId];
    if (!session) return null;
    const opponentId = session.player1 === socketId ? session.player2 : session.player1;
    return io.sockets.sockets.get(opponentId) || null;
};

const coinFlip = () => Math.random() < 0.5;

const destroySession = (sessionId) => {
    const session = sessions[sessionId];
    if (!session) return;
    delete socketToSession[session.player1];
    delete socketToSession[session.player2];
    delete originalIdToSession[session.originalId1];
    delete originalIdToSession[session.originalId2];
    delete sessions[sessionId];
    console.log(`[Session] Destroyed ${sessionId}`);
};

// ─── CONNECTION ───────────────────────────────────────────────────────────────

io.on("connection", (socket) => {
    console.log(`[Connect] ${socket.id}`);

    // ── RECONNECT ─────────────────────────────────────────────────────────────
    // Client sends its saved originalId from localStorage on every page load.
    // If we find an active session for that ID, restore them without matchmaking.

    socket.on("reconnect_attempt", ({ originalId }) => {
        const sessionId = originalIdToSession[originalId];
        if (!sessionId) {
            socket.emit("reconnect_failed");
            return;
        }

        const session = sessions[sessionId];
        const slot = session.originalId1 === originalId ? 1 : 2;

        // Cancel the grace period timer
        if (session.disconnectTimers?.[slot]) {
            clearTimeout(session.disconnectTimers[slot]);
            delete session.disconnectTimers[slot];
        }

        // Remap socket ID
        const oldSocketId = slot === 1 ? session.player1 : session.player2;
        delete socketToSession[oldSocketId];
        if (slot === 1) session.player1 = socket.id;
        else            session.player2 = socket.id;
        socketToSession[socket.id] = sessionId;

        console.log(`[Reconnect] ${originalId} back as ${socket.id}`);

        socket.emit("reconnected", {
            my_id: originalId,
            opponent_id: slot === 1 ? session.originalId2 : session.originalId1,
            player_starts: session.playerStarts,
            gameState: session.gameState || null
        });

        const opponent = getOpponentSocket(socket.id);
        if (opponent) opponent.emit("opponent_reconnected");
    });

    // ── MATCHMAKING ──────────────────────────────────────────────────────────

    socket.on("find_match", () => {
        if (!waitingPlayer) {
            waitingPlayer = socket;
            console.log(`[Waiting] ${socket.id}`);
        } else {
            const p1 = waitingPlayer;
            const p2 = socket;
            waitingPlayer = null;

            const sessionId = `${p1.id}-${p2.id}`;
            const p1Starts = coinFlip();

            sessions[sessionId] = {
                player1: p1.id,  player2: p2.id,
                originalId1: p1.id, originalId2: p2.id,
                playerStarts: p1Starts ? p1.id : p2.id,
                gameState: null,
                disconnectTimers: {}
            };

            socketToSession[p1.id] = sessionId;
            socketToSession[p2.id] = sessionId;
            originalIdToSession[p1.id] = sessionId;
            originalIdToSession[p2.id] = sessionId;

            const matchData = (me, opp) => ({
                my_id: me.id,
                opponent: opp.id,
                player_starts: p1Starts ? p1.id : p2.id
            });

            p1.emit("matched", matchData(p1, p2));
            p2.emit("matched", matchData(p2, p1));

            console.log(`[Matched] ${p1.id} vs ${p2.id} | Starts: ${p1Starts ? 'P1' : 'P2'}`);
        }
    });

    // ── STATE SYNC ────────────────────────────────────────────────────────────
    // Client sends current game state periodically so server can restore on reconnect

    socket.on("sync_state", ({ gameState }) => {
        const sessionId = socketToSession[socket.id];
        if (sessionId) sessions[sessionId].gameState = gameState;
    });

    // ── RELAY EVENTS (unchanged from original) ────────────────────────────────

    const relay = (eventIn, eventOut) => {
        socket.on(eventIn, (data) => {
            const opponent = getOpponentSocket(socket.id);
            if (opponent) opponent.emit(eventOut, { data });
        });
    };

    relay("exchange_deck",           "receive_deck");
    relay("summon",                  "opponent_summon");
    relay("move_card_to_graveyard",  "opponent_move_card_to_graveyard");
    relay("change_phase",            "opponent_change_phase");
    relay("attack_start",            "opponent_attack_start");
    relay("attack_ack",              "opponent_attack_ack");
    relay("effect_ack",              "opponent_effect_ack");
    relay("card_finish_operate",     "opponent_card_operated");

    // Effects also echo back to the activating player
    socket.on("activate_effect", (data) => {
        const opponent = getOpponentSocket(socket.id);
        if (!opponent) return;
        opponent.emit("opponent_card_activate", { data });
        socket.emit("card_operate", { data });
    });

    // ── DISCONNECT ────────────────────────────────────────────────────────────

    socket.on("disconnect", () => {
        console.log(`[Disconnect] ${socket.id}`);

        if (waitingPlayer?.id === socket.id) {
            waitingPlayer = null;
            return;
        }

        const sessionId = socketToSession[socket.id];
        if (!sessionId) return;
        const session = sessions[sessionId];
        if (!session) return;

        const slot = session.player1 === socket.id ? 1 : 2;
        const originalId = slot === 1 ? session.originalId1 : session.originalId2;

        const opponent = getOpponentSocket(socket.id);
        if (opponent) {
            opponent.emit("opponent_disconnected", {
                message: "Opponent disconnected. Waiting for reconnect...",
                grace_ms: RECONNECT_GRACE_MS
            });
        }

        if (!session.disconnectTimers) session.disconnectTimers = {};
        session.disconnectTimers[slot] = setTimeout(() => {
            console.log(`[Grace expired] ${originalId}`);
            const opSock = getOpponentSocket(socket.id);
            if (opSock) opSock.emit("opponent_disconnected_final", {
                message: "Opponent did not reconnect. Duel over."
            });
            destroySession(sessionId);
        }, RECONNECT_GRACE_MS);

        console.log(`[Grace] ${originalId} has ${RECONNECT_GRACE_MS / 1000}s to reconnect`);
    });
});

httpServer.listen(PORT, () => {
    console.log(`\n🎴 Duel Disk OS Server running on port ${PORT}`);
    console.log(`   Reconnect grace period: ${RECONNECT_GRACE_MS / 1000}s\n`);
});