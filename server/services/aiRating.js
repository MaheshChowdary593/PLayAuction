const { GoogleGenerativeAI } = require('@google/generative-ai');
const AIQueue = require('./AIQueue');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const validateSquad = (team) => {
    const players = team.playersAcquired || [];
    const squadSize = players.length;

    // Minimum 15 players (11 starters + 4 impact)
    if (squadSize < 15) return { valid: false, reason: `Squad has only ${squadSize} players. Minimum 15 required for evaluation.` };
    if (squadSize > 25) return { valid: false, reason: `Squad has ${squadSize} players. Maximum 25 allowed.` };

    let bowlersOrAR = 0;
    let overseas = 0;

    players.forEach(p => {
        /**
         * Robust Player Detection:
         * 1. If p.player is an object (nested populate), use it.
         * 2. If p is an object with role/nationality (flattened or manual eval), use it.
         * 3. Ignore if p.player is just a string/ID (missing data).
         */
        let playerDoc = null;
        if (p.player && typeof p.player === 'object') playerDoc = p.player;
        else if (p.role || p.nationality) playerDoc = p;

        if (!playerDoc) {
            console.warn(`[AI-VAL] Skipping player with missing data: ${p.id || p._id || 'unknown'}`);
            return;
        }

        const role = (playerDoc.role || '').toLowerCase().trim();
        const nation = (playerDoc.nationality || '').toLowerCase().trim();

        // More flexible role matching for bowlers/all-rounders
        if (
            role.includes('bowl') ||
            role.includes('all') ||
            role.includes('all-rounder') ||
            role.includes('spinner') ||
            role.includes('pacer') ||
            role.includes('seamer')
        ) {
            bowlersOrAR++;
        }

        // More flexible overseas matching
        if (nation && !['india', 'indian', 'ind'].includes(nation)) {
            overseas++;
        }
    });

    if (bowlersOrAR < 5) return { valid: false, reason: `Squad has only ${bowlersOrAR} Bowler(s)/All-rounder(s) detected. Minimum 5 required.` };
    if (overseas > 8) return { valid: false, reason: `Squad has ${overseas} Overseas players. Maximum 8 allowed.` };

    return { valid: true };
};

const evaluateTeam = async (team) => {
    const validation = validateSquad(team);
    if (!validation.valid) {
        console.log(`--- Evaluation Disqualified for ${team.teamName}: ${validation.reason} ---`);
        return {
            battingScore: 0, bowlingScore: 0, balanceScore: 0, impactScore: 0, overallScore: 0,
            starPlayer: "N/A", hiddenGem: "N/A", playing11: [], impactPlayers: [],
            tacticalVerdict: `DISQUALIFIED: ${validation.reason}`,
            weakness: validation.reason,
            historicalContext: "Failed to meet mandatory squad composition requirements."
        };
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-flash-latest' });

    // --- Auto-select Playing 11 + Impact if user hasn't done so ---
    let playing11 = (team.playing11 && team.playing11.length >= 11) ? team.playing11 : [];
    let impactPlayers = (team.impactPlayers && team.impactPlayers.length >= 4) ? team.impactPlayers : [];

    if (playing11.length < 11 || impactPlayers.length < 4) {
        console.log(`--- Auto-selecting Playing 11 for ${team.teamName} (user did not select) ---`);
        try {
            const autoSelection = await selectPlaying11AndImpact(team.teamName, team.playersAcquired);
            playing11 = autoSelection.playing11 || [];
            impactPlayers = autoSelection.impactPlayers || [];
        } catch (selErr) {
            console.error('Auto-selection failed, using first 15 as fallback:', selErr.message);
            // Simple fallback: first 11 + next 4
            const ids = team.playersAcquired.map(p => String(p.id || p._id));
            playing11 = ids.slice(0, 11);
            impactPlayers = ids.slice(11, 15);
        }
    }

    const bench = team.playersAcquired.filter(p => !playing11.concat(impactPlayers).includes(String(p.id || p._id)));


    const prompt = `
You are an IPL Historian & Analytics Expert. Your goal is to evaluate the drafted squad based on their HISTORICAL IPL IMPACT and performance trends. 

IMPORTANT: 
1. Ignore the actual age or current physical state of the players. Treat them as the "Prime" or "Peak" versions of themselves based on their best IPL contributions.
2. Focus on their past impacts, match-winning performances, and legacy in the IPL.
3. Evaluate how their styles complement each other in a modern T20 context.

Team Name: ${team.teamName}
Total Budget: ₹12000L
Budget Remaining: ₹${team.currentPurse || team.budgetRemaining}L

SELECTED PLAYING 11:
${playing11.map(id => {
        const p = team.playersAcquired.find(pa => pa.id === id);
        if (!p) return `- [Unknown ID: ${id}]`;
        const s = p.stats || {};
        return `- ${p.name} (${p.role}, ${p.nationality}) | Matches: ${s.matches}, Runs: ${s.runs}, SR: ${s.strikeRate}, Avg: ${s.average}, Wickets: ${s.wickets}, Econ: ${s.economy}`;
    }).join('\n')}

IMPACT PLAYERS (4):
${impactPlayers.map(id => {
        const p = team.playersAcquired.find(pa => pa.id === id);
        if (!p) return `- [Unknown ID: ${id}]`;
        const s = p.stats || {};
        return `- ${p.name} (${p.role}, ${p.nationality}) | SR: ${s.strikeRate}, Econ: ${s.economy}`;
    }).join('\n')}

BENCH STRENGTH (${bench.length} players):
${bench.map(p => `- ${p.name} (${p.role}) | SR: ${p.stats?.strikeRate || 0}, Econ: ${p.stats?.economy || 0}`).join('\n')}

CRITICAL EVALUATION METRICS:
1. **Historical Dominance**: Do the core players have a history of winning matches?
2. **Phase Mastery**: How well do they control Powerplay, Middle Overs, and Death?
3. **Synergy**: Do the playing styles of the $11+4$ combine for a complete T20 unit?
4. **Impact Factor**: How much did these players influence IPL games in their peak seasons?

DIRECTIONS:
1. **Judgment**: Use the provided stats AND your knowledge of their peak IPL performance. 
2. **No Ageism**: Do NOT call out players for being "old" or "retired". Focus on their historical impact.
3. **JSON Structure**: You MUST respond with ONLY a JSON object matching the exact structure below.

RESPOND ONLY WITH A VALID JSON OBJECT matching this EXACT structure:
{
  "battingScore": <1-10>,
  "bowlingScore": <1-10>,
  "balanceScore": <1-10>,
  "impactScore": <1-10>,
  "overallScore": <1-100 (Be extremely precise)>,
  "starPlayer": "<Name of biggest historical match-winner>",
  "hiddenGem": "<Name of a high-value steal based on historical data>",
  "playing11": ["Name1", "Name2", ... (The 11 starters)],
  "impactPlayers": ["Name1", "Name2", "Name3", "Name4"],
  "tacticalVerdict": "Analysis of the team's balance/impact based on historical IPL performances.",
  "weakness": "Gap in the team's historical composition.",
  "benchAnalysis": "How reliable the backups were in their prime.",
  "historicalContext": "A comparison to a legendary IPL season or team."
}
No other text. Be an expert, be accurate, focus on legacy and impact.
`;

    // Retry Gemini up to 3 times with exponential backoff before any fallback
    const MAX_RETRIES = 3;
    let lastError = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            console.log(`--- AI Evaluation for ${team.teamName} (attempt ${attempt}/${MAX_RETRIES}) ---`);
            const text = await AIQueue.enqueue(async () => {
                const result = await model.generateContent(prompt);
                const response = await result.response;
                return response.text();
            });
            const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(cleanedText);
            console.log(`--- AI Evaluation SUCCESS for ${team.teamName} on attempt ${attempt} ---`);
            return parsed;
        } catch (err) {
            lastError = err;
            console.warn(`--- AI Evaluation attempt ${attempt} FAILED for ${team.teamName}: ${err.message} ---`);
            if (attempt < MAX_RETRIES) {
                const waitMs = attempt * 2000; // 2s, 4s
                console.log(`Retrying in ${waitMs / 1000}s...`);
                await new Promise(resolve => setTimeout(resolve, waitMs));
            }
        }
    }

    // All 3 Gemini attempts failed — use stat-based fallback as last resort
    console.error(`All ${MAX_RETRIES} Gemini attempts failed for ${team.teamName}. Using stat-based fallback.`, lastError?.message);

    const players = team.playersAcquired || [];
    const squadSize = players.length;

    let totalRuns = 0, totalWickets = 0, totalSR = 0, totalEcon = 0, srCount = 0, econCount = 0;
    let wkCount = 0, bowlCount = 0, batCount = 0, arCount = 0;

    players.forEach(p => {
        const s = p.stats || {};
        const role = (p.role || '').toLowerCase();
        totalRuns += (s.runs || 0);
        totalWickets += (s.wickets || 0);
        if (s.strikeRate) { totalSR += s.strikeRate; srCount++; }
        if (s.economy) { totalEcon += s.economy; econCount++; }
        if (role.includes('wk') || role.includes('keep')) wkCount++;
        else if (role.includes('all')) arCount++;
        else if (role.includes('bowl')) bowlCount++;
        else batCount++;
    });

    const avgSR = srCount ? totalSR / srCount : 120;
    const avgEcon = econCount ? totalEcon / econCount : 8;

    const battingScore = Math.min(10, Math.max(1, Math.round((avgSR - 100) / 5 + 5)));
    const bowlingScore = Math.min(10, Math.max(1, Math.round((10 - avgEcon) + 2)));
    const balanceScore = Math.min(10, Math.max(1, Math.round((arCount + bowlCount) / 2)));
    const impactScore = Math.min(10, Math.max(1, Math.round((totalRuns / 500 + totalWickets / 20) / 2)));
    const overallScore = Math.min(75, Math.max(40, Math.round(
        (battingScore * 10 + bowlingScore * 10 + balanceScore * 5 + impactScore * 5) / 4
    )));

    const starPlayer = [...players].sort((a, b) => (b.stats?.runs || 0) - (a.stats?.runs || 0))[0]?.name || 'N/A';

    return {
        battingScore, bowlingScore, balanceScore, impactScore, overallScore,
        starPlayer, hiddenGem: 'N/A',
        playing11: [], impactPlayers: [],
        tacticalVerdict: `Stat-based estimate (Gemini unavailable after ${MAX_RETRIES} attempts). Squad: ${batCount} Bat, ${arCount} AR, ${bowlCount} Bowl, ${wkCount} WK.`,
        weakness: 'AI rating unavailable after retries — stat-based fallback used.',
        historicalContext: 'N/A'
    };
};


const selectPlaying11AndImpact = async (teamName, players) => {
    const model = genAI.getGenerativeModel({ model: 'gemini-flash-latest' });

    const prompt = `
You are an elite T20 Franchise Cricket Head Coach. Your team "${teamName}" has drafted ${players.length} players.
You must select the BEST "Playing 11" and "4 Impact Players".

Drafted Players with Stats:
${players.map((p, i) => `ID: [${p.player?._id || p.player || p.id}] | Name: ${p.player?.player || p.name} | Role: ${p.player?.role} | SR: ${p.player?.stats?.strikeRate || 0}, Econ: ${p.player?.stats?.economy || 0}`).join('\n')}

Tactical requirements:
1. Balanced Playing 11 (Openers, Middle Order, Finisher, Wicket-keeper, Diverse Bowlers).
2. Exactly 4 Impact Players who provide strategic depth or tactical substitutions.

RESPOND ONLY WITH A VALID JSON OBJECT:
{
  "playing11": ["id1", "id2", ..., "id11"],
  "impactPlayers": ["id12", "id13", "id14", "id15"]
}
No other text. IDs must be the bracketed strings from above.
`;

    try {
        const text = await AIQueue.enqueue(async () => {
            const result = await model.generateContent(prompt);
            const response = await result.response;
            return response.text();
        });
        const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const selection = JSON.parse(cleanedText);

        if (selection.playing11 && selection.impactPlayers) {
            return selection;
        }
        return {
            playing11: players.slice(0, 11).map(p => String(p.player?._id || p.player || p.id)),
            impactPlayers: players.slice(11, 15).map(p => String(p.player?._id || p.player || p.id))
        };
    } catch (error) {
        console.error('Error in AI squad selection:', error);
        return {
            playing11: players.slice(0, 11).map(p => String(p.player?._id || p.player || p.id)),
            impactPlayers: players.slice(11, 15).map(p => String(p.player?._id || p.player || p.id))
        };
    }
};

const evaluateAllTeams = async (teamsData) => {
    const evaluations = await Promise.all(
        teamsData.map(async (team) => {
            // Check if we already have a background evaluation
            if (team.evaluation && team.evaluation.overallScore > 0) {
                return team;
            }

            const validation = validateSquad(team);

            if (!validation.valid) {
                return {
                    ...team,
                    evaluation: {
                        overallScore: 0,
                        tacticalVerdict: `DISQUALIFIED: ${validation.reason}`,
                    }
                };
            }

            let evaluation;
            try {
                console.log(`--- EVALUATING SQUAD FOR ${team.teamName} ---`);
                evaluation = await evaluateTeam(team);
            } catch (e) {
                console.error(`Evaluation Error for ${team.teamName}:`, e);
                evaluation = { overallScore: 50, tacticalVerdict: "AI failed, fallback score." };
            }
            return { ...team, evaluation };
        })
    );

    return await MasterRanker(evaluations);
};

const MasterRanker = async (evaluations) => {
    const model = genAI.getGenerativeModel({ model: 'gemini-flash-latest' });

    const prompt = `
Final Ranking of IPL Teams.
Evaluations:
${evaluations.map(e => `- ${e.teamName}: Score ${e.evaluation.overallScore} | Verdict: ${e.evaluation.tacticalVerdict}`).join('\n')}

CRITICAL: Rank 1 to ${evaluations.length}. No ties.
RESPOND ONLY AS JSON: [{"teamName": "Name", "rank": 1}, ...]
`;

    try {
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const rankings = JSON.parse(cleanedText);

        return evaluations.map(team => {
            const rankData = rankings.find(r => r.teamName === team.teamName);
            return {
                ...team,
                rank: rankData ? rankData.rank : 99
            };
        }).sort((a, b) => a.rank - b.rank);
    } catch (error) {
        return evaluations.sort((a, b) => b.evaluation.overallScore - a.evaluation.overallScore).map((t, i) => ({ ...t, rank: i + 1 }));
    }
};

module.exports = { evaluateAllTeams, selectPlaying11AndImpact, evaluateTeam, validateSquad };

