const { GoogleGenerativeAI } = require('@google/generative-ai');
const Groq = require('groq-sdk');
const AIQueue = require('./AIQueue');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const groq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;

/**
 * Centrally manages AI requests with an automatic fallback mechanism.
 * Tries Gemini (Primary) -> Tries Groq (Secondary) -> Throws/Returns null
 */
async function getAIResponse(prompt, type = 'evaluation') {
    const geminiModelName = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
    const groqModelName = process.env.GROQ_MODEL || 'llama-3.1-70b-versatile';

    // 1. Try Gemini
    try {
        console.log(`--- [AI] Attempting Gemini (${type}) ---`);
        const model = genAI.getGenerativeModel({ model: geminiModelName });
        const text = await AIQueue.enqueue(async () => {
            const result = await model.generateContent(prompt);
            const response = await result.response;
            return response.text();
        });
        if (text) return text;
    } catch (err) {
        console.error(`[AI-ERROR] Gemini failed (${type}):`, err.message);
    }

    // 2. Try Groq (Fallback)
    if (groq) {
        try {
            console.log(`--- [AI] Falling back to Groq (${type}) ---`);
            const chatCompletion = await groq.chat.completions.create({
                messages: [{ role: 'user', content: prompt }],
                model: groqModelName,
            });
            const text = chatCompletion.choices[0]?.message?.content;
            if (text) return text;
        } catch (groqErr) {
            console.error(`[AI-ERROR] Groq fallback failed (${type}):`, groqErr.message);
        }
    } else {
        console.warn(`[AI-WARN] Groq fallback skipped (No GROQ_API_KEY provided)`);
    }

    throw new Error('All AI providers failed');
}

// ── Home Ground Pitch Data ──────────────────────────────────────────────────
// Used to judge whether each team's squad suits their home conditions.
const HOME_GROUND_DATA = {
    'mumbai indians':       { ground: 'Wankhede Stadium, Mumbai',         pitchType: 'Pace-friendly, bouncy, fast outfield', spinFriendly: false, notes: 'Extra bounce helps fast bowlers. Dew factor at night. Batters love big scores but swing early. Needs: quality pacers, aggressive openers.' },
    'mi':                   { ground: 'Wankhede Stadium, Mumbai',         pitchType: 'Pace-friendly, bouncy, fast outfield', spinFriendly: false, notes: 'Extra bounce helps fast bowlers. Dew factor at night. Batters love big scores but swing early. Needs: quality pacers, aggressive openers.' },
    'chennai super kings':  { ground: 'MA Chidambaram Stadium (Chepauk)', pitchType: 'Spin-friendly, slow & low, grips turn',  spinFriendly: true,  notes: 'Classic spin paradise. Off-spinners and leg-spinners dominate. Slow openers struggle. Needs: quality spinners (2-3), experienced batters who play spin well. Overseas pace-heavy teams suffer here.' },
    'csk':                  { ground: 'MA Chidambaram Stadium (Chepauk)', pitchType: 'Spin-friendly, slow & low, grips turn',  spinFriendly: true,  notes: 'Classic spin paradise. Off-spinners and leg-spinners dominate. Slow openers struggle. Needs: quality spinners (2-3), experienced batters who play spin well. Overseas pace-heavy teams suffer here.' },
    'royal challengers bengaluru': { ground: 'M. Chinnaswamy Stadium, Bengaluru', pitchType: 'Batting paradise, flat, small boundaries', spinFriendly: false, notes: 'Small ground = premium on big hitters. High-scoring venue. Short boundaries on sides. Needs: power hitters in every slot, death bowling specialists. Teams without finishers suffer.' },
    'rcb':                  { ground: 'M. Chinnaswamy Stadium, Bengaluru', pitchType: 'Batting paradise, flat, small boundaries', spinFriendly: false, notes: 'Small ground = premium on big hitters. High-scoring venue. Short boundaries on sides. Needs: power hitters in every slot, death bowling specialists. Teams without finishers suffer.' },
    'kolkata knight riders': { ground: 'Eden Gardens, Kolkata',           pitchType: 'Spin-friendly, slow track, big ground',  spinFriendly: true,  notes: 'Large ground makes it harder for big sixes. Spinners excel in second innings under dew. Needs: quality spinners, disciplined batters who rotate strike. Dew is a massive factor.' },
    'kkr':                  { ground: 'Eden Gardens, Kolkata',           pitchType: 'Spin-friendly, slow track, big ground',  spinFriendly: true,  notes: 'Large ground makes it harder for big sixes. Spinners excel in second innings under dew. Needs: quality spinners, disciplined batters who rotate strike. Dew is a massive factor.' },
    'delhi capitals':       { ground: 'Arun Jaitley Stadium (Kotla)',     pitchType: 'Spin-friendly, low & slow, tires quickly', spinFriendly: true, notes: 'Hot conditions tire pitches quickly. Spinners are lethal in overs 6-15. Needs: at least 2 quality spinners + aggressive batters. High-altitude conditions can aid swing early.' },
    'dc':                   { ground: 'Arun Jaitley Stadium (Kotla)',     pitchType: 'Spin-friendly, low & slow, tires quickly', spinFriendly: true, notes: 'Hot conditions tire pitches quickly. Spinners are lethal in overs 6-15. Needs: at least 2 quality spinners + aggressive batters. High-altitude conditions can aid swing early.' },
    'punjab kings':         { ground: 'Punjab Cricket Association IS Bindra Stadium, Mohali', pitchType: 'Flat and batting friendly, average pace', spinFriendly: false, notes: 'Good batting surface. Fast outfield. Medium pacers can move the ball early. Needs: strong batting lineup, all-rounders, good death bowling.' },
    'pbks':                 { ground: 'Punjab Cricket Association IS Bindra Stadium, Mohali', pitchType: 'Flat and batting friendly, average pace', spinFriendly: false, notes: 'Good batting surface. Fast outfield. Medium pacers can move the ball early. Needs: strong batting lineup, all-rounders, good death bowling.' },
    'rajasthan royals':     { ground: 'Sawai Mansingh Stadium, Jaipur',   pitchType: 'Spin-friendly, slow, dry surface',       spinFriendly: true,  notes: 'Dry conditions create dusty pitches that assist spin. Low and slow outfield. Needs: wrist spinners especially, wily batters who manoeuvre spin well. High dew in evening matches.' },
    'rr':                   { ground: 'Sawai Mansingh Stadium, Jaipur',   pitchType: 'Spin-friendly, slow, dry surface',       spinFriendly: true,  notes: 'Dry conditions create dusty pitches that assist spin. Low and slow outfield. Needs: wrist spinners especially, wily batters who manoeuvre spin well. High dew in evening matches.' },
    'sunrisers hyderabad':  { ground: 'Rajiv Gandhi International Stadium, Hyderabad', pitchType: 'Pace early, dries up to assist spin later', spinFriendly: false, notes: 'Good pace early on. Track dries up and assists spinners from over 10. Needs: quality opening pace + 1-2 spinners. Covers toss advantage significantly.' },
    'srh':                  { ground: 'Rajiv Gandhi International Stadium, Hyderabad', pitchType: 'Pace early, dries up to assist spin later', spinFriendly: false, notes: 'Good pace early on. Track dries up and assists spinners from over 10. Needs: quality opening pace + 1-2 spinners. Covers toss advantage significantly.' },
    'lucknow super giants': { ground: 'BRSABV Ekana Cricket Stadium, Lucknow', pitchType: 'Spin-friendly, slow and low',       spinFriendly: true,  notes: 'Excellent for spinners due to slow track. Can be a low-scoring venue. Needs: effective spinners, smart rotators of strike, good fielding unit.' },
    'lsg':                  { ground: 'BRSABV Ekana Cricket Stadium, Lucknow', pitchType: 'Spin-friendly, slow and low',       spinFriendly: true,  notes: 'Excellent for spinners due to slow track. Can be a low-scoring venue. Needs: effective spinners, smart rotators of strike, good fielding unit.' },
    'gujarat titans':       { ground: 'Narendra Modi Stadium, Ahmedabad', pitchType: 'Flat, high-scoring, large ground',     spinFriendly: false, notes: 'Largest cricket stadium in the world. Flat pitch = batting paradise. Large boundary means sixes are fewer so placement and 3s matter. Needs: power hitters + pace attack.' },
    'gt':                   { ground: 'Narendra Modi Stadium, Ahmedabad', pitchType: 'Flat, high-scoring, large ground',     spinFriendly: false, notes: 'Largest cricket stadium in the world. Flat pitch = batting paradise. Large boundary means sixes are fewer so placement and 3s matter. Needs: power hitters + pace attack.' },
    // Legacy teams
    'deccan chargers':      { ground: 'Rajiv Gandhi International Stadium, Hyderabad', pitchType: 'Pace early, dries up to assist spin later', spinFriendly: false, notes: 'Needs quality pace + 1-2 spinners.' },
    'dcg':                  { ground: 'Rajiv Gandhi International Stadium, Hyderabad', pitchType: 'Pace early, dries up to assist spin later', spinFriendly: false, notes: 'Needs quality pace + 1-2 spinners.' },
    'kochi tuskers kerala': { ground: 'Jawaharlal Nehru Stadium, Kochi',  pitchType: 'Humid, pace-friendly, swing in air',   spinFriendly: false, notes: 'Humid coastal conditions. Good for swing bowlers and aggressive batting. Needs: swing bowlers, top-order power.' },
    'ktk':                  { ground: 'Jawaharlal Nehru Stadium, Kochi',  pitchType: 'Humid, pace-friendly, swing in air',   spinFriendly: false, notes: 'Humid coastal conditions. Needs swing bowlers.' },
    'pune warriors india':  { ground: 'Maharashtra Cricket Association Stadium, Pune', pitchType: 'Pace-friendly, bouncy, assists seam', spinFriendly: false, notes: 'Known for pace and bounce. Seam bowlers thrive. Needs: quality pace attack, hard-hitting batters.' },
    'pwi':                  { ground: 'Maharashtra Cricket Association Stadium, Pune', pitchType: 'Pace-friendly, bouncy, assists seam', spinFriendly: false, notes: 'Needs quality pace attack.' },
    'rising pune supergiant': { ground: 'Maharashtra Cricket Association Stadium, Pune', pitchType: 'Pace-friendly, bouncy, assists seam', spinFriendly: false, notes: 'Needs quality pace attack.' },
    'rps':                  { ground: 'Maharashtra Cricket Association Stadium, Pune', pitchType: 'Pace-friendly, bouncy, assists seam', spinFriendly: false, notes: 'Needs quality pace attack.' },
    'gujarat lions':        { ground: 'Saurashtra Cricket Association Stadium, Rajkot', pitchType: 'Flat, good for batting, moderate pace', spinFriendly: false, notes: 'Batting-friendly track. Needs power hitters and all-rounders.' },
    'gl':                   { ground: 'Saurashtra Cricket Association Stadium, Rajkot', pitchType: 'Flat, good for batting, moderate pace', spinFriendly: false, notes: 'Batting-friendly track.' },
};

function getHomeGroundData(teamName) {
    const key = (teamName || '').toLowerCase().trim();
    return HOME_GROUND_DATA[key] || {
        ground: 'Home Ground (Unknown)',
        pitchType: 'Standard T20 pitch',
        spinFriendly: false,
        notes: 'No specific ground data available. General T20 evaluation applied.'
    };
}
// ────────────────────────────────────────────────────────────────────────────

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
    let validationWarning = null;
    
    if (!validation.valid) {
        console.log(`--- [AI-VALIDATION] Squad for ${team.teamName} is technically disqualified: ${validation.reason} ---`);
        validationWarning = validation.reason;
    }


    const homeGround = getHomeGroundData(team.teamName);

    // We always calculate the "Ideal" AI recommendation for display in the Team Profile
    console.log(`--- [AI] Generating Strategic Recommendation for ${team.teamName} ---`);
    let aiRecommendation = { homePlaying11: [], awayPlaying11: [], homeImpactPlayers: [], awayImpactPlayers: [] };
    try {
        aiRecommendation = await selectPlaying11AndImpact(team.teamName, team.playersAcquired);
    } catch (selErr) {
        console.error('AI recommendation failed:', selErr.message);
        const ids = team.playersAcquired.map(p => String(p.id || p._id));
        aiRecommendation.homePlaying11 = ids.slice(0, 11);
        aiRecommendation.awayPlaying11 = ids.slice(0, 11);
        aiRecommendation.homeImpactPlayers = ids.slice(11, 15);
        aiRecommendation.awayImpactPlayers = ids.slice(11, 15);
    }

    // Lineups for the evaluation: We prioritize the USER'S selection for the Verdict/Rating
    const userXI = team.playing11 || [];
    const userImpact = team.impactPlayers || [];

    // ── IPL Impact Player Rule ────────────────────────────────────────────
    // In modern IPL, an Impact Player can be substituted in at any point.
    // This means the BEST impact sub effectively becomes a de-facto 12th player
    // who will contribute substantially. Treat the composite strength as XI + 1.
    // Pick the best (most impactful) of the 4 impact subs as the "12th player".
    const impactPlayerObjects = userImpact.map(id => team.playersAcquired.find(pa => String(pa.id || pa._id) === id)).filter(Boolean);
    const bestImpact = impactPlayerObjects[0]; // First is typically the primary choice
    const remainingBenchImpact = impactPlayerObjects.slice(1);
    // ─────────────────────────────────────────────────────────────────────

    const bench = team.playersAcquired.filter(
        p => !userXI.concat(userImpact).includes(String(p.id || p._id))
    );

    // AI's recommendation for the Team Profile display
    const homePlaying11 = aiRecommendation.homePlaying11;
    const awayPlaying11 = aiRecommendation.awayPlaying11;

    const prompt = `
You are an IPL Historian, Auction Analyst, and T20 Strategy Expert.

Evaluate the drafted squad carefully. The user has locked in their Starting XI and Impact Subs.

${validationWarning ? `⚠️ WARNING: This squad is technically DISQUALIFIED because: ${validationWarning}. Penalise the score significantly.` : ''}

═══════════════════════════════════════════════
HOME GROUND INTELLIGENCE
═══════════════════════════════════════════════
Team: ${team.teamName}
Home Venue: ${homeGround.ground}
Pitch Type: ${homeGround.pitchType}
Spin Friendly: ${homeGround.spinFriendly ? 'YES — spinners dominate here' : 'NO — pace/batting dominates here'}
Key Insight: ${homeGround.notes}

This is CRITICAL for evaluation. Judge whether this team bought the RIGHT type of bowlers, 
batters and all-rounders to dominate at their home ground.

═══════════════════════════════════════════════
IPL IMPACT PLAYER RULE (2024 onwards)
═══════════════════════════════════════════════
An Impact Player can replace any player before the start of any over (batting or bowling).
This means the BEST impact sub is effectively a 12th playing member who WILL contribute
meaningfully. Evaluate the team's EFFECTIVE STRENGTH as Playing 11 + the #1 Impact Sub below.

USER'S SELECTED STARTING XI (11 players):
${userXI.map(id => {
        const p = team.playersAcquired.find(pa => String(pa.id || pa._id) === id);
        if (!p) return `Unknown Player (ID:${id})`;
        const s = p.stats || {};
        return `${p.name} (${p.role}) | SR ${s.strikeRate || 'N/A'} Avg ${s.average || 'N/A'} Wkts ${s.wickets || 'N/A'} Econ ${s.economy || 'N/A'}`;
    }).join('\n')}

#1 IMPACT SUB — ACTS AS 12TH PLAYER (evaluate as part of effective XI):
${bestImpact ? (() => {
        const s = bestImpact.stats || {};
        return `${bestImpact.name} (${bestImpact.role}) | SR ${s.strikeRate || 'N/A'} Avg ${s.average || 'N/A'} Wkts ${s.wickets || 'N/A'} Econ ${s.economy || 'N/A'}`;
    })() : 'No impact player selected'}

REMAINING IMPACT SUBS (rotation/speciality contingency — not primary):
${remainingBenchImpact.length > 0 ? remainingBenchImpact.map(p => {
        const s = p.stats || {};
        return `${p.name} (${p.role}) | SR ${s.strikeRate || 'N/A'} Econ ${s.economy || 'N/A'}`;
    }).join('\n') : 'None'}

BENCH (not selected):
${bench.map(p => `${p.name} (${p.role}) | SR ${p.stats?.strikeRate || 'N/A'} Econ ${p.stats?.economy || 'N/A'}`).join('\n')}

AI COACH'S RECOMMENDED HOME XI:
${homePlaying11.map(id => team.playersAcquired.find(pa => String(pa.id || pa._id) === id)?.name || id).join(', ')}

AI COACH'S RECOMMENDED AWAY XI:
${awayPlaying11.map(id => team.playersAcquired.find(pa => String(pa.id || pa._id) === id)?.name || id).join(', ')}

═══════════════════════════════════════════════
EVALUATION CRITERIA (judge ALL of these strictly)
═══════════════════════════════════════════════
1. EFFECTIVE XI+1 BALANCE: Does the combination of XI + #1 Impact Sub (12 players) cover all roles?
   - At least 1 specialist Wicketkeeper (MS Dhoni, Sanju Samson, Rishabh Pant are keepers).
   - Minimum 5 bowling options in the combined 12.
   - Mix of Anchors + Aggressors in batting order.

2. HOME GROUND SUITABILITY (critical metric):
   - If home is SPIN-FRIENDLY: Do they have 2+ quality spinners? Are their key batters good against spin?
   - If home is PACE-FRIENDLY: Do they have 2+ quality fast bowlers? Can their batters handle pace/bounce?
   - If home is BATTING PARADISE: Do they have power hitters in top 6? Are their bowlers good at defending?
   - PENALISE heavily if their bowling attack doesn't suit their home ground type.
   - REWARD if they obviously built the squad around their home conditions.

3. IMPACT PLAYER STRATEGY: Does the chosen #1 Impact Sub genuinely improve the team?
   - e.g., bringing in a specialist bowler if the XI is bowling-light, or a power hitter for death overs.

4. AUCTION INTELLIGENCE: Did they over-invest in similar profiles? Gap in critical roles?

5. For evaluation, treat every player as their IPL PRIME version.

Respond ONLY with JSON:

{
  "battingScore": 1-10,
  "bowlingScore": 1-10,
  "balanceScore": 1-10,
  "impactScore": 1-10,
  "overallScore": 1-100,
  "starPlayer": "Name",
  "hiddenGem": "Name",
  "homePlaying11": ["Name"],
  "awayPlaying11": ["Name"],
  "homeImpactPlayers": ["Name"],
  "awayImpactPlayers": ["Name"],
  "tacticalVerdict": "Detailed analysis covering XI+1 strength AND home ground suitability",
  "weakness": "Biggest structural weakness",
  "benchAnalysis": "How the bench/remaining impact subs could improve the XI",
  "historicalContext": "Comparison to famous IPL team",
  "homeGroundVerdict": "Specific verdict on whether the squad suits their home conditions"
}

Return ONLY JSON.
`;

    try {
        const text = await getAIResponse(prompt, 'evaluation');
        const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const result = JSON.parse(cleanedText);
        
        if (validationWarning) {
            result.tacticalVerdict = `[RULES VIOLATION] ${validationWarning}. ${result.tacticalVerdict}`;
        }
        return result;

    } catch (err) {
        console.error(`AI evaluation failed for ${team.teamName}`, err.message);
        return {
            overallScore: validationWarning ? 20 : 50,
            tacticalVerdict: `AI service unavailable. ${validationWarning ? `Disqualification noted: ${validationWarning}` : 'Fallback score applied.'}`,
            battingScore: 5, bowlingScore: 5, balanceScore: 5, impactScore: 5,
            homePlaying11: aiRecommendation?.homePlaying11 || [],
            awayPlaying11: aiRecommendation?.awayPlaying11 || [],
            homeImpactPlayers: aiRecommendation?.homeImpactPlayers || [],
            awayImpactPlayers: aiRecommendation?.awayImpactPlayers || []
        };
    }
};

const selectPlaying11AndImpact = async (teamName, players) => {

    const homeGround = getHomeGroundData(teamName);

    const prompt = `
You are a T20 head coach selecting the optimal squad combinations.

Team: ${teamName}
Home Ground: ${homeGround.ground}
Home Pitch: ${homeGround.pitchType}
Home Strategy: ${homeGround.notes}

Select the absolute best lineups from the available squad:
1. Best HOME Playing 11 — optimise for: ${homeGround.pitchType}
2. Exactly 8 potential HOME Impact Players (Must be unique and exclude Playing 11)
3. Best AWAY Playing 11 — optimise for generic away conditions (pace/bounce)
4. Exactly 8 potential AWAY Impact Players (Must be unique and exclude Playing 11)

MANDATORY RULES:
1. Each Playing 11 MUST include exactly ONE specialist Wicketkeeper.
2. Minimum 5 bowling options in each Playing 11.
3. NO OVERLAP: A player in the Playing 11 CANNOT be an Impact Sub for the SAME mode.
4. Maximum 4 Overseas players in any Playing 11.
5. HOME XI must specifically favour ${homeGround.spinFriendly ? 'SPINNERS — this is a spin-friendly venue. Prioritise quality spin bowlers over pace.' : 'PACE BOWLERS and POWER HITTERS — this venue rewards pace attack and big hitting.'}.
6. The #1 Impact Sub MUST be the player who most improves the XI when brought on (primary tactical sub).

Players:
${players.map(p =>
        `ID:${p.id} Name:${p.name} Role:${p.role} SR:${p.stats?.strikeRate || 'N/A'} Econ:${p.stats?.economy || 'N/A'} Avg:${p.stats?.average || 'N/A'}`
    ).join('\n')}

Return JSON:
{
"homePlaying11":["id"],
"homeImpactPlayers":["id"],
"awayPlaying11":["id"],
"awayImpactPlayers":["id"]
}
`;

    try {
        const text = await getAIResponse(prompt, 'selection');
        const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleaned);

        // Deduplicate: ensure impact subs don't contain players already in the Playing 11
        const home11 = Array.isArray(parsed.homePlaying11) ? parsed.homePlaying11.slice(0, 11) : [];
        const away11 = Array.isArray(parsed.awayPlaying11) ? parsed.awayPlaying11.slice(0, 11) : [];
        const home11Set = new Set(home11.map(String));
        const away11Set = new Set(away11.map(String));

        // Take first unique candidates not in the 11
        let homeImpact = (Array.isArray(parsed.homeImpactPlayers) ? parsed.homeImpactPlayers : [])
            .map(String)
            .filter(id => !home11Set.has(id))
            .filter((val, idx, self) => self.indexOf(val) === idx);

        let awayImpact = (Array.isArray(parsed.awayImpactPlayers) ? parsed.awayImpactPlayers : [])
            .map(String)
            .filter(id => !away11Set.has(id))
            .filter((val, idx, self) => self.indexOf(val) === idx);

        // Fallback: If AI gave too few, fill from bench
        const allPlayerIds = players.map(p => String(p.id || p._id));
        
        if (homeImpact.length < 4) {
            const extra = allPlayerIds.filter(id => !home11Set.has(id) && !homeImpact.includes(id));
            homeImpact = [...homeImpact, ...extra.slice(0, 4 - homeImpact.length)];
        }
        if (awayImpact.length < 4) {
            const extra = allPlayerIds.filter(id => !away11Set.has(id) && !awayImpact.includes(id));
            awayImpact = [...awayImpact, ...extra.slice(0, 4 - awayImpact.length)];
        }

        return {
            homePlaying11: home11,
            homeImpactPlayers: homeImpact.slice(0, 4),
            awayPlaying11: away11,
            awayImpactPlayers: awayImpact.slice(0, 4)
        };

    } catch {
        return {
            homePlaying11: players.slice(0, 11).map(p => String(p.id)),
            homeImpactPlayers: players.slice(11, 15).map(p => String(p.id)),
            awayPlaying11: players.slice(0, 11).map(p => String(p.id)),
            awayImpactPlayers: players.slice(11, 15).map(p => String(p.id))
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

    // Sort descending by score then assign rank (1 = highest score)
    const sorted = evaluations.sort((a, b) => b.evaluation.overallScore - a.evaluation.overallScore);
    sorted.forEach((team, i) => { team.rank = i + 1; });
    return sorted;

};

module.exports = {
    evaluateAllTeams,
    selectPlaying11AndImpact,
    evaluateTeam,
    validateSquad
};


