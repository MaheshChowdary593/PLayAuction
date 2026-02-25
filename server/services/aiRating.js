const { GoogleGenAI } = require('@google/genai');
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const evaluateTeam = async (team) => {
    const prompt = `
You are an elite T20 Franchise Cricket Analyst (like an expert on a TV broadcast). Evaluate the following team's IPL auction draft.

Team Name: ${team.teamName}
Total Budget: ₹12000L
Budget Remaining: ₹${team.budgetRemaining}L

Drafted Squad:
${team.playersAcquired.map(p => `- ${p.player.name} (${p.player.role}, ${p.player.nationality}) | Bought: ₹${p.boughtFor}L | Base: ₹${p.player.basePrice}L | Stats: ${JSON.stringify(p.player.stats)}`).join('\n')}

Analyze the squad deeply based on:
1. Core Balance: Ratio of specialist batters, bowlers, and genuine all-rounders.
2. Firepower & Anchors: Powerplay aggressors vs middle-order stabilizers.
3. Bowling Arsenal: Pace vs spin mix, death-overs utility.
4. Value for Money: Did they overpay or find hidden steals?
5. Overseas Slots: Effective utilization of the 4 overseas spots.

RESPOND ONLY WITH A VALID JSON OBJECT matching this EXACT structure:
{
  "battingScore": <number 1-10>,
  "bowlingScore": <number 1-10>,
  "balanceScore": <number 1-10>,
  "formScore": <number 1-10>,
  "overallScore": <number 1-100>,
  "starPlayer": "<Name of biggest match-winner>",
  "bestValuePick": "<Name of best value signing>",
  "summary": "<3-4 sentences of deep tactical praise. Sound like an expert pundit.>",
  "weakness": "<1-2 sentences identifying the glaring hole or risk in this squad.>"
}
No other text before or after the JSON.
`;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                temperature: 0.3,
            }
        });

        const text = response.text;
        // Clean JSON formatting if Gemini adds markdown codeblocks
        const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleanedText);
    } catch (error) {
        console.error('Error in AI evaluation:', error);
        return {
            battingScore: 0, bowlingScore: 0, balanceScore: 0, formScore: 0, overallScore: 0,
            starPlayer: "N/A", summary: "Evaluation failed.", weakness: "Unknown"
        };
    }
};

const evaluateAllTeams = async (teamsData) => {
    // Process all teams in parallel
    const evaluations = await Promise.all(
        teamsData.map(async (team) => {
            const evaluation = await evaluateTeam(team);
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

module.exports = { evaluateAllTeams };
