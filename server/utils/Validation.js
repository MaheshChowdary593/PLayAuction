/**
 * Validation.js
 * Strict server-side validation. Never trust the client.
 */

const validateBid = (state, team, amount) => {
    if (!state || state.status !== 'Auctioning') {
        return { valid: false, error: 'Auction is not active' };
    }

    if (!team) {
        return { valid: false, error: 'You are not assigned to a franchise' };
    }

    // 1. Current Bidder Check
    if (state.currentBid.teamId === team.franchiseId) {
        return { valid: false, error: 'You already hold the highest bid' };
    }

    // 2. Increment Logic (Re-calculated on server)
    const currentPlayer = state.players[state.currentIndex];
    const poolID = (currentPlayer.poolID || '').toLowerCase();
    const curAmt = state.currentBid.amount;

    let minIncrement = 25; // Default
    if (poolID.includes('emerging') || poolID.includes('pool3') || poolID.includes('pool4')) {
        minIncrement = curAmt < 200 ? 5 : 25;
    }

    const requiredBid = curAmt === 0 ? currentPlayer.basePrice : curAmt + minIncrement;

    // 3. Amount Integrity
    if (amount < requiredBid) {
        return { valid: false, error: `Minimum bid is ${requiredBid}L` };
    }

    // 4. Financial Guard
    if (amount > team.currentPurse) {
        return { valid: false, error: 'Insufficient purse limit' };
    }

    // 4a. Trolling/Overflow Guard
    if (amount > 5000) { // No single player is worth 50cr in this economy
        return { valid: false, error: 'Bid amount exceeds realistic limit' };
    }

    // 5. Squad Limit Guard
    if (team.playersAcquired.length >= 25) {
        return { valid: false, error: 'Squad limit reached (max 25)' };
    }

    // 6. Overseas Guard
    if (currentPlayer.isOverseas && (team.overseasCount || 0) >= 8) {
        return { valid: false, error: 'Overseas player limit (8) reached' };
    }

    return { valid: true };
};

const sanitizeString = (str) => {
    return str ? String(str).trim().substring(0, 100) : '';
};

module.exports = { validateBid, sanitizeString };
