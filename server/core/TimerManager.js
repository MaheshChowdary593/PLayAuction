/**
 * TimerManager.js
 * Centralized timer management to prevent "Zombie Intervals".
 * Tracks all active intervals and timeouts by roomCode.
 */

class TimerManager {
    constructor() {
        this.timers = new Map(); // roomCode -> Interval/Timeout ID
    }

    setTimer(roomCode, key, callback, intervalMs) {
        this.clearTimer(roomCode, key);

        const fullKey = `${roomCode}:${key}`;
        const id = setInterval(callback, intervalMs);
        this.timers.set(fullKey, id);
    }

    setTimeout(roomCode, key, callback, delayMs) {
        this.clearTimer(roomCode, key);

        const fullKey = `${roomCode}:${key}`;
        const id = setTimeout(() => {
            this.timers.delete(fullKey);
            callback();
        }, delayMs);
        this.timers.set(fullKey, id);
    }

    clearTimer(roomCode, key) {
        const fullKey = `${roomCode}:${key}`;
        const id = this.timers.get(fullKey);
        if (id) {
            clearInterval(id);
            clearTimeout(id);
            this.timers.delete(fullKey);
        }
    }

    clearAllForRoom(roomCode) {
        for (const fullKey of this.timers.keys()) {
            if (fullKey.startsWith(`${roomCode}:`)) {
                this.clearTimer(roomCode, fullKey.split(':')[1]);
            }
        }
    }
}

module.exports = new TimerManager();
