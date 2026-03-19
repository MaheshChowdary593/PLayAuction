/**
 * playerNormalizer.js
 * Standardizes player objects from various MongoDB collections into a consistent schema.
 */

const normalizePlayer = (p, collName) => {
    const lowerColl = collName.toLowerCase();

    // Determine basePrice (in lakhs)
    let bp = 50;
    if (lowerColl.startsWith('marquee')) bp = 200; // 2cr
    else if (lowerColl.includes('pool1')) bp = 150; // 1.5cr
    else if (lowerColl.includes('emerging')) bp = 30; // 30L
    else if (lowerColl.includes('pool2')) bp = 100; // 1cr
    else if (lowerColl.includes('pool3')) bp = 50; // 50L
    else if (lowerColl.includes('pool4')) bp = 50; // 50L

    // ---- emerging_players has a unique field schema ----
    if (lowerColl.includes('emerging')) {
        const country = (p.Country || p.nationality || '').toLowerCase().trim();
        const isOverseas = country !== '' && country !== 'india' && country !== 'ind';
        return {
            ...p,
            _id: String(p._id),
            name: p.Player || p.player || p.name || 'Unknown Player',
            role: p.Role || p.role || 'Batsman',
            nationality: p.Country || p.nationality || '',
            isOverseas,
            poolName: 'EMERGING PLAYERS',
            poolID: collName,
            basePrice: p.basePrice || bp, // Use existing if set
            imagepath: p['Image URL'] || p.imagepath || p.image_path || '',
            image: p['Image URL'] || p.image_path || p.image || '/default-player.png',
            stats: {
                battingAvg: parseFloat(p['Batting Avg']) || p.battingAvg || p.batting_avg || 0,
                strikeRate: parseFloat(p['Strike Rate']) || p.strikeRate || p.batting_strike_rate || 0,
                highestScore: parseFloat(p['Highest Runs']) || p.highestScore || p.highest_score || 0,
                bowlingAvg: parseFloat(p['Bowling Avg']) || p.bowlingAvg || p.bowling_avg || 0,
                economy: parseFloat(p['Economy']) || p.economy || p.bowling_economy || 0,
                bestFigures: p['Best Figures'] || p.bestFigures || p.best_bowling_figures || '0/0',
                matches: p.Matches || p.matches || 0,
                runs: p.Runs || p.runs || 0,
                wickets: p.Wickets || p.wickets || 0,
                catches: p.catches || 0,
                stumpings: p.stumpings || 0
            }
        };
    }

    // ---- Standard schema for all other pools ----
    const nationality = p.nationality || '';
    const isOverseas = p.isOverseas !== undefined ? p.isOverseas :
        (nationality && !['india', 'ind'].includes(nationality.toLowerCase().trim()));

    return {
        ...p,
        _id: String(p._id),
        name: p.name || p.player || p.Player || 'Unknown Player',
        role: p.role || p.Role || 'Batsman',
        nationality,
        isOverseas,
        poolName: collName.replace(/_/g, ' ').toUpperCase(),
        poolID: collName,
        basePrice: p.basePrice || bp,
        imagepath: p.image_path || p.imagepath || p.image || '',
        image: p.image_path || p.image || '/default-player.png',
        // Nest stats for UI and AI compatibility
        stats: {
            battingAvg: p.batting_avg || p.battingAvg || 0,
            strikeRate: p.batting_strike_rate || p.strikeRate || 0,
            highestScore: p.highest_score || p.highestScore || 0,
            bowlingAvg: p.bowling_avg || p.bowlingAvg || 0,
            economy: p.bowling_economy || p.economy || 0,
            bestFigures: p.best_bowling_figures || p.bestFigures || '0/0',
            matches: p.matches || 0,
            runs: p.runs || 0,
            wickets: p.wickets || 0,
            catches: p.catches || 0,
            stumpings: p.stumpings || 0
        }
    };
};

module.exports = { normalizePlayer };
