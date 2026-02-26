const { GoogleGenerativeAI } = require('@google/generative-ai');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const evaluateTeam = async (team) => {
    const model = genAI.getGenerativeModel({ model: 'gemini-flash-latest' });

    const prompt = `
You are an elite T20 Franchise Cricket Analyst and Talent Scout. Evaluate the following team's IPL auction draft with strictly unbiased, data-driven rigor.

Team Name: ${team.teamName}
Total Budget: ₹12000L
Budget Remaining: ₹${team.currentPurse || team.budgetRemaining}L

Drafted Squad (Playing 15):
${team.playersAcquired.map(p => {
        const s = p.stats || {};
        return `- ${p.name || 'Unknown'} (${p.role}, ${p.nationality}) | Matches: ${s.matches}, Runs: ${s.runs}, SR: ${s.strikeRate}, Wickets: ${s.wickets}, Econ: ${s.economy} | Price: ₹${p.boughtFor}L`;
    }).join('\n')}

Analyze this squad deeply:
1. **Unbiased Tactical Balance**: Evaluate the core stability. Do they have enough bowling options (min 6)? Do they have a reliable WK? **CRITICAL**: If the squad has fewer than 11 players, provide a scathing tactical critique of the failure to utilize the budget effectively.
2. **Historical IPL Impact**: Analyze the players based on their career impact. Are the stars proven match-winners or high-risk investments?
3. **Firepower & Versatility**: Assess the depth of batting (till what number?) and the variety in bowling (LFM, RF, SLA, OB, LB).
4. **Playing 11 Quality & Completeness**: How strong is their likely starting 11? If they can't even form an 11, the overall score must reflect this severe failure.

RESPOND ONLY WITH A VALID JSON OBJECT matching this EXACT structure:
{
  "battingScore": <1-10>,
  "bowlingScore": <1-10>,
  "balanceScore": <1-10>,
  "impactScore": <1-10>,
  "overallScore": <1-100 (Be strict: 0-10 if they didn't even buy 11 players)>,
  "starPlayer": "<Name of biggest match-winner or 'None' if squad empty>",
  "hiddenGem": "<Name of a high-value steal>",
  "playing11": ["Name1", "Name2", ... (Up to 11 names)],
  "tacticalVerdict": "3-4 sentences of unbiased analysis. Critique the lack of depth if applicable.",
  "weakness": "1-2 sentences identifying the primary risk or the reason for a low score.",
  "historicalContext": "Briefly mention how this squad (or lack thereof) compares to IPL standards."
}
No other text. Be objective and critical.
`;

    try {
        console.log(`--- AI Evaluation Starting for ${team.teamName} ---`);
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        console.log(`--- AI Response received for ${team.teamName} ---`);
        console.log("RAW AI TEXT:", text);
        // Clean JSON formatting if Gemini adds markdown codeblocks
        const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleanedText);
    } catch (error) {
        console.error('Error in AI evaluation:', error);
        return {
            battingScore: 0, bowlingScore: 0, balanceScore: 0, impactScore: 0, overallScore: 0,
            starPlayer: "N/A", hiddenGem: "N/A", playing11: [],
            tacticalVerdict: "Evaluation failed due to technical error or incomplete roster analysis.",
            weakness: "No data available.",
            historicalContext: "N/A"
        };
    }
};

const calculateHeuristicScore = (team) => {
    const players = team.playersAcquired;
    const roles = {
        'batsman': 0,
        'Bowler': 0,
        'All-Rounder': 0,
        'Wicketkeeper': 0
    };

    players.forEach(p => {
        const role = (p.role || 'Batsman').toLowerCase();
        if (role.includes('keep')) roles['Wicketkeeper']++;
        else if (role.includes('all')) roles['All-Rounder']++;
        else if (role.includes('bowl')) roles['Bowler']++;
        else roles['batsman']++; // Default
    });

    // Simple IPL squad balance heuristic
    let balancePoints = 0;
    if (roles['batsman'] >= 5) balancePoints += 20;
    if (roles['Bowler'] >= 4) balancePoints += 20;
    if (roles['All-Rounder'] >= 2) balancePoints += 20;
    if (roles['Wicketkeeper'] >= 1) balancePoints += 20;
    if (players.length >= 11) balancePoints += 20;

    return balancePoints;
};

const selectTop15 = async (teamName, players) => {
    const model = genAI.getGenerativeModel({ model: 'gemini-flash-latest' });

    const prompt = `
You are an elite T20 Franchise Cricket Head Coach. Your team "${teamName}" has drafted ${players.length} players.
You must select the BEST "Playing 15" for the upcoming IPL season.

Drafted Players with Stats:
${players.map((p, i) => `ID: [${p.player?._id || p.player}] | Name: ${p.player?.player || p.name} | Role: ${p.player?.role} | Matches: ${p.player?.stats?.matches || 0}, Runs: ${p.player?.stats?.runs || 0}, SR: ${p.player?.stats?.strikeRate || 0}, Wickets: ${p.player?.stats?.wickets || 0}, Econ: ${p.player?.stats?.economy || 0}`).join('\n')}

Select exactly 15 players that provide the best balance of:
1. Explosive openers and middle-order anchors.
2. At least one world-class wicket-keeper.
3. Genuine all-rounders.
4. Tactical bowling variety (Pace, Left-arm, Leg-spin, Off-spin).

RESPOND ONLY WITH A VALID JSON ARRAY containing ONLY the 15 IDs (strings) of the players you selected:
["id1", "id2", ..., "id15"]
No other text. Strictly return a JSON array of strings.
`;

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const selectedIds = JSON.parse(cleanedText);

        if (Array.isArray(selectedIds) && selectedIds.length > 0) {
            return selectedIds;
        }
        return players.slice(0, 15).map(p => String(p.player?._id || p.player));
    } catch (error) {
        console.error('Error in AI player selection:', error);
        return players.slice(0, 15).map(p => String(p.player?._id || p.player));
    }
};

const evaluateAllTeams = async (teamsData) => {
    // Process all teams in parallel
    const evaluations = await Promise.all(
        teamsData.map(async (team) => {
            // If playing15 is set, only evaluate those players
            // Otherwise use playersAcquired
            const squadToEvaluate = (team.playing15 && team.playing15.length > 0)
                ? team.playersAcquired.filter(p => team.playing15.includes(String(p.id)))
                : team.playersAcquired;

            const hScore = calculateHeuristicScore({ ...team, playersAcquired: squadToEvaluate });
            let evaluation;
            try {
                console.log(`--- EVALUATING SQUAD FOR ${team.teamName} (${squadToEvaluate.length} players) ---`);
                evaluation = await evaluateTeam({ ...team, playersAcquired: squadToEvaluate });
                // Blend with heuristic or ensure overallScore isn't 0 if AI fails
                if (evaluation.overallScore === 0) evaluation.overallScore = hScore;
            } catch (e) {
                evaluation = {
                    battingScore: Math.round(hScore / 10),
                    bowlingScore: Math.round(hScore / 10),
                    balanceScore: Math.round(hScore / 10),
                    impactScore: 7,
                    starPlayer: "N/A",
                    hiddenGem: "N/A",
                    playing11: squadToEvaluate.slice(0, 11).map(p => p.name || "Unknown"),
                    tacticalVerdict: "Heuristic evaluation complete. Squad meets minimum requirements for a competitive season.",
                    weakness: "Manual analysis recommended for deeper tactical insight.",
                    historicalContext: "Standard squad composition."
                };
            }
            return {
                ...team,
                evaluation
            };
        })
    );

    // Sort by overall score descending
    evaluations.sort((a, b) => b.evaluation.overallScore - a.evaluation.overallScore);

    // Assign ranks
    evaluations.forEach((team, index) => {
        team.rank = index + 1;
    });

    return evaluations;
};

module.exports = { evaluateAllTeams, selectTop15 };
