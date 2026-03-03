/**
 * RoomManager.js
 * Centralized registry for all auction rooms.
 * Uses Maps for O(1) lookups: 
 * - rooms: roomCode -> roomState
 * - userToRoom: userId -> roomCode
 */

class RoomManager {
    constructor() {
        this.rooms = new Map();
        this.userToRoom = new Map(); // Global O(1) lookup for "where is this user?"
    }

    getRoom(roomCode) {
        return this.rooms.get(roomCode);
    }

    getAllRooms() {
        return Array.from(this.rooms.values());
    }

    setRoom(roomCode, state) {
        state.lastActivity = Date.now();
        this.rooms.set(roomCode, state);
    }

    deleteRoom(roomCode) {
        const state = this.rooms.get(roomCode);
        if (state) {
            // Cleanup user mappings
            state.teams.forEach(t => this.userToRoom.delete(t.ownerUserId));
            this.rooms.delete(roomCode);
        }
    }

    recordUserLocation(userId, roomCode) {
        this.userToRoom.set(userId, roomCode);
    }

    getRoomByUserId(userId) {
        const roomCode = this.userToRoom.get(userId);
        return roomCode ? this.rooms.get(roomCode) : null;
    }

    startReaper(io) {
        setInterval(() => {
            const now = Date.now();
            for (const [roomCode, state] of this.rooms.entries()) {
                const room = io.sockets.adapter.rooms.get(roomCode);
                const activeSockets = room ? room.size : 0;

                // Reaper Rule: No sockets + 30 mins inactivity = Purge
                if (activeSockets === 0 && (now - state.lastActivity > 1800000)) {
                    this.deleteRoom(roomCode);
                    console.log(`[Reaper] Purged ghost room: ${roomCode}`);
                }
            }
        }, 600000); // Check every 10 mins
    }
}

module.exports = new RoomManager();
