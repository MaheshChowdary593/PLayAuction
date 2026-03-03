/**
 * ValidationLayer.js
 * Principal Engineering Spec: O(1) Guards.
 * Never performs loops or heavy DB calls in the hot path.
 */
const PlayerCache = require('./PlayerCache');

class ValidationLayer {

    /**
     * validateBid
     * @param {object} state - Room State
     * @param {string} userId - Auth'd User ID
     * @param {number} amount - Bid amount in L
     */
    validateBid(state, userId, amount) {
        if (!state || state.status !== 'Auctioning') {
            return { valid: false, error: 'Auction inactive' };
        }

        // O(1) Lookup: Who is this user in this room?
        const team = state.userToTeam[userId];
        if (!team) {
            return { valid: false, error: 'You are a spectator' };
        }

        // 1. Current Bidder Check
        if (state.currentBid.teamId === team.franchiseId) {
            return { valid: false, error: 'Already highest' };
        }

        // 2. Increment Logic (Stateless/Calculated)
        const player = PlayerCache.getPlayer(state.currentPlayerId);
        const poolID = (player.poolID || '').toLowerCase();
        const curAmt = state.currentBid.amount;

        let minIncrement = 25;
        if (poolID.includes('emerging') || poolID.includes('pool3') || poolID.includes('pool4')) {
            minIncrement = curAmt < 200 ? 5 : 25;
        }

        const requiredBid = curAmt === 0 ? player.basePrice : curAmt + minIncrement;

        // Smart Increment Logic: If amount is null/undefined or -1, treat as "next valid step"
        const finalAmount = (amount === null || amount === undefined || amount === -1) ? requiredBid : amount;

        if (finalAmount < requiredBid) {
            return { valid: false, error: `Need ${requiredBid}L` };
        }

        // 3. Financial & Squad Guards
        if (finalAmount > team.currentPurse) {
            return { valid: false, error: 'No purse left' };
        }

        if (team.playersAcquired.length >= 25) {
            return { valid: false, error: 'Squad full' };
        }

        if (player.isOverseas && (team.overseasCount >= 8)) {
            return { valid: false, error: 'Overseas limit reached' };
        }

        return { valid: true, team, finalAmount };
    }

    sanitize(str) {
        return str ? String(str).trim().substring(0, 50) : '';
    }
}

module.exports = new ValidationLayer();
