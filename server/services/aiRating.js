const { GoogleGenerativeAI } = require('@google/generative-ai');
const AIQueue = require('./AIQueue');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const validateSquad = (team) => {
    const players = team.playersAcquired || [];
    const squadSize = players.length;

    if (squadSize < 18) return { valid: false, reason: `Squad has only ${squadSize} players. Minimum 18 required.` };

    let overseas = 0;
    players.forEach(p => {
        let playerDoc = null;
        if (p.player && typeof p.player === 'object') playerDoc = p.player;
        else if (p.role || p.nationality) playerDoc = p;

        if (playerDoc) {
            const nation = (playerDoc.nationality || '').toLowerCase().trim();
            if (nation && !['india', 'indian', 'ind'].includes(nation)) {
                overseas++;
            }
        }
    });

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

    const modelName = process.env.GEMINI_MODEL || 'gemini-flash-latest';
    const model = genAI.getGenerativeModel({ model: modelName });

    let playing11 = (team.playing11 && team.playing11.length >= 11) ? team.playing11 : [];
    let impactPlayers = (team.impactPlayers && team.impactPlayers.length >= 4) ? team.impactPlayers : [];

    if (playing11.length < 11 || impactPlayers.length < 4) {
        console.log(`--- Auto-selecting Playing 11 for ${team.teamName} ---`);
        try {
            const autoSelection = await selectPlaying11AndImpact(team.teamName, team.playersAcquired);
            playing11 = autoSelection.playing11 || [];
            impactPlayers = autoSelection.impactPlayers || [];
        } catch (selErr) {
            console.error('Auto-selection failed:', selErr.message);
            const ids = team.playersAcquired.map(p => String(p.id || p._id));
            playing11 = ids.slice(0, 11);
            impactPlayers = ids.slice(11, 15);
        }
    }

    const bench = team.playersAcquired.filter(
        p => !playing11.concat(impactPlayers).includes(String(p.id || p._id))
    );

    const prompt = `
You are an IPL Historian, Auction Analyst, and T20 Strategy Expert.

Your goal is to evaluate the drafted squad based on their HISTORICAL IPL IMPACT, peak performance level, and tactical squad construction.

IMPORTANT RULES

1. Ignore the player's current age or fitness.
Treat every player as their IPL PRIME version.

2. Focus strongly on:
- Historical match-winning ability
- Consistency across IPL seasons
- High pressure performances
- Powerplay / Middle / Death contributions
- IPL legacy impact

3. Emerging Player Rule
For players with little IPL history evaluate ONLY:
- Strike Rate
- Batting Average

Interpretation:
High SR = aggressive impact
High Avg + decent SR = stable
Low SR/Avg = risky pick

4. Batting Evaluation
Analyze:
- Opening strength
- Middle order
- Finishers
- Left-right combinations
- Powerplay scoring
- Spin vs pace ability

Highlight if:
- Too many anchors
- No finishers
- Poor left-right balance

5. Bowling Evaluation
Analyze:
- Pace vs spin balance
- Left arm vs right arm bowlers
- Wrist spin vs finger spin
- Death bowlers
- Powerplay wicket takers

Highlight lack of variation.

6. Role Balance
Check if team has:
- Openers
- Anchor
- Finisher
- Wicketkeeper
- 5 bowling options
- Death bowling

7. Like-for-like backups
Check if bench has replacements for:
- Openers
- Finishers
- Spinners
- Death bowlers

8. Home ground suitability
Analyze if squad suits IPL home conditions such as:
- Spin friendly tracks
- Flat batting tracks
- Slow pitches
- Swing conditions

9. Auction Strategy Review
If team overspent on same type of players or ignored roles, roast the strategy like a cricket analyst.

TEAM DETAILS

Team Name: ${team.teamName}
Budget Remaining: ₹${team.currentPurse || team.budgetRemaining}L

PLAYING 11
${playing11.map(id => {
        const p = team.playersAcquired.find(pa => pa.id === id);
        if (!p) return \`Unknown Player\`;
        const s = p.stats || {};
        return \`\${p.name} (\${p.role}) | SR \${s.strikeRate} Avg \${s.average} Wkts \${s.wickets} Econ \${s.economy}\`;
    }).join('\\n')}

IMPACT PLAYERS
${impactPlayers.map(id => {
        const p = team.playersAcquired.find(pa => pa.id === id);
        if (!p) return \`Unknown Player\`;
        const s = p.stats || {};
        return \`\${p.name} (\${p.role}) | SR \${s.strikeRate} Econ \${s.economy}\`;
    }).join('\\n')}

BENCH
${bench.map(p => \`\${p.name} (\${p.role}) | SR \${p.stats?.strikeRate || 0} Econ \${p.stats?.economy || 0}\`).join('\\n')}

Respond ONLY with JSON:

{
  "battingScore": 1-10,
  "bowlingScore": 1-10,
  "balanceScore": 1-10,
  "impactScore": 1-10,
  "overallScore": 1-100,
  "starPlayer": "Name",
  "hiddenGem": "Name",
  "playing11": ["Name"],
  "impactPlayers": ["Name"],
  "tacticalVerdict": "Detailed analysis",
  "weakness": "Biggest structural weakness",
  "benchAnalysis": "Bench and backups analysis",
  "historicalContext": "Comparison to famous IPL team"
}

Return ONLY JSON.
`;

    try {
        const text = await AIQueue.enqueue(async () => {
            const result = await model.generateContent(prompt);
            const response = await result.response;
            return response.text();
        });

        const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleanedText);

    } catch (err) {
        console.error(`AI evaluation failed for ${team.teamName}`, err);
        return {
            overallScore: 50,
            tacticalVerdict: "AI failed, fallback score."
        };
    }
};

const selectPlaying11AndImpact = async (teamName, players) => {

    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `
You are a T20 head coach.

Team: ${teamName}

Select:
- Best Playing 11
- 4 Impact Players

Players:
${players.map(p =>
        \`ID:${p.id} Name:${p.name} Role:${p.role} SR:${p.stats?.strikeRate} Econ:${p.stats?.economy}\`
    ).join('\\n')}

Return JSON:
{
"playing11":["id"],
"impactPlayers":["id"]
}
`;

    try {

        const result = await model.generateContent(prompt);
        const text = result.response.text();

        const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();

        return JSON.parse(cleaned);

    } catch {

        return {
            playing11: players.slice(0, 11).map(p => String(p.id)),
            impactPlayers: players.slice(11, 15).map(p => String(p.id))
        };

    }
};

const evaluateAllTeams = async (teamsData) => {

    const evaluations = await Promise.all(
        teamsData.map(async team => {

            if (team.evaluation && team.evaluation.overallScore > 0) {
                return team;
            }

            let evaluation;

            try {
                evaluation = await evaluateTeam(team);
            } catch {
                evaluation = { overallScore: 50 };
            }

            return { ...team, evaluation };

        })
    );

    return evaluations.sort((a, b) => b.evaluation.overallScore - a.evaluation.overallScore);

};

module.exports = {
    evaluateAllTeams,
    selectPlaying11AndImpact,
    evaluateTeam,
    validateSquad
};
