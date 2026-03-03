/**
 * GlobalScheduler.js
 * The "Pulse" of the server. 
 * Replaces hundreds of per-room intervals with ONE single loop.
 */
const RoomManager = require('./RoomManager');

class GlobalScheduler {
    constructor() {
        this.interval = null;
        this.tickRate = 200; // 200ms = 5 ticks per second (Free tier friendly)
    }

    start(io) {
        if (this.interval) return;

        console.log(`[Scheduler] Global Pulse started at ${this.tickRate}ms`);
        this.interval = setInterval(() => {
            this.tick(io);
        }, this.tickRate);
    }

    tick(io) {
        const rooms = RoomManager.getAllRooms();
        const now = Date.now();

        rooms.forEach(state => {
            // Hot Path: State-specific logic
            if (state.status === 'Auctioning') {
                this.processAuctionTick(state, now, io);
            } else if (state.status === 'Selection') {
                this.processSelectionTick(state, now, io);
            }
        });
    }

    processAuctionTick(state, now, io) {
        const remaining = Math.max(0, Math.ceil((state.endTime - now) / 1000));

        // Only emit if the floor'd second has changed (Delta Update)
        if (state.displayTimer !== remaining) {
            state.displayTimer = remaining;
            io.to(state.roomCode).emit('tt', { t: remaining });

            if (remaining <= 0) {
                // Trigger Hammer Down via Engine (Atomic)
                const AuctionEngine = require('./AuctionEngine');
                AuctionEngine.processHammerDown(state.roomCode, io);
            }
        }
    }

    processSelectionTick(state, now, io) {
        const remaining = Math.max(0, Math.ceil((state.endTime - now) / 1000));

        if (state.displayTimer !== remaining) {
            state.displayTimer = remaining;
            // Emit to SquadSelection.jsx (which listens for selection_timer_tick)
            io.to(state.roomCode).emit('selection_timer_tick', { timer: remaining });

            if (remaining <= 0) {
                // Timer expired - Auto-finalize squads
                const AuctionEngine = require('./AuctionEngine');
                AuctionEngine.autoFinalizeSelection(state.roomCode, io);
            }
        }
    }

    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }
}

module.exports = new GlobalScheduler();
