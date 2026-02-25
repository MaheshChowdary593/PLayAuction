import React, { useEffect, useState } from 'react';
import { useLocation, useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

const ResultsReveal = () => {
    const { roomCode } = useParams();
    const navigate = useNavigate();
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedTeam, setSelectedTeam] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchResults = async () => {
            try {
                const response = await fetch(`http://localhost:5050/api/room/${roomCode}/results`);
                const data = await response.json();
                if (response.ok) {
                    const sorted = data.teams.sort((a, b) => a.rank - b.rank);
                    setResults(sorted);
                    setSelectedTeam(sorted[0]);
                    setLoading(false);
                } else {
                    setError(data.error);
                    setLoading(false);
                }
            } catch (err) {
                console.error('Error fetching results:', err);
                setError("Failed to reach server");
                setLoading(false);
            }
        };

        fetchResults();
    }, [roomCode]);

    if (loading) return (
        <div className="min-h-screen bg-darkBg flex flex-col items-center justify-center text-white">
            <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                className="w-16 h-16 border-4 border-white/10 border-t-blue-500 rounded-full mb-8"
            />
            <h2 className="text-xl font-black uppercase tracking-[0.3em] animate-pulse">Gemini AI Evaluating Squads...</h2>
            <p className="text-slate-500 text-sm mt-2 font-bold uppercase tracking-widest">Analyzing Tactical Balance & Firepower</p>
        </div>
    );

    if (error) return (
        <div className="min-h-screen bg-darkBg flex flex-col items-center justify-center text-white">
            <h1 className="text-4xl font-black text-red-500 mb-4 uppercase tracking-tighter">Evaluation Error</h1>
            <p className="text-slate-400 mb-8">{error}</p>
            <button onClick={() => navigate('/')} className="btn-premium">Return Home</button>
        </div>
    );

    return (
        <div className="min-h-screen bg-darkBg text-white p-8 relative overflow-hidden font-sans">

            {/* Background elements */}
            <div className="fixed inset-0 pointer-events-none">
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-purple-600/10 blur-[150px] rounded-full"></div>
                <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-blue-600/10 blur-[150px] rounded-full"></div>
            </div>

            <div className="relative z-10 max-w-7xl mx-auto">
                <header className="flex justify-between items-end mb-16">
                    <div>
                        <h1 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] mb-2">Auction Concluded / Final Review</h1>
                        <h2 className="text-7xl font-black italic tracking-tighter uppercase leading-none">
                            The <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">Verdict</span>
                        </h2>
                    </div>
                    <button
                        onClick={() => navigate('/')}
                        className="px-6 py-3 glass-panel rounded-xl border-white/10 hover:bg-white/10 transition-colors text-[10px] font-black uppercase tracking-widest"
                    >
                        Back to Lobby
                    </button>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                    {/* Left: Team List */}
                    <div className="space-y-4">
                        <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Final Rankings</h3>
                        {results.map((team, i) => (
                            <motion.div
                                key={team.teamId}
                                initial={{ x: -50, opacity: 0 }}
                                animate={{ x: 0, opacity: 1 }}
                                transition={{ delay: i * 0.1 }}
                                onClick={() => setSelectedTeam(team)}
                                className={`
                                    glass-card p-6 rounded-3xl border-white/5 cursor-pointer transition-all relative overflow-hidden group
                                    ${selectedTeam?.teamId === team.teamId ? 'border-white/20 bg-white/10 scale-105' : 'hover:bg-white/5'}
                                `}
                            >
                                <div className="absolute top-0 left-0 w-1.5 h-full" style={{ backgroundColor: team.teamThemeColor }}></div>
                                <div className="flex justify-between items-center">
                                    <div>
                                        <div className="text-[9px] font-black uppercase tracking-widest opacity-50 mb-1" style={{ color: team.teamThemeColor }}>#{team.rank} {team.rank === 1 ? 'Winner' : 'Ranked'}</div>
                                        <div className="text-xl font-black uppercase tracking-tight">{team.teamName}</div>
                                        <div className="text-[10px] text-slate-500 font-bold uppercase">{team.ownerName}</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-3xl font-black font-mono" style={{ color: team.teamThemeColor }}>{team.evaluation?.overallScore}</div>
                                        <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Global Score</div>
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </div>

                    {/* Right: Squad Card Detail */}
                    <div className="lg:col-span-2">
                        <AnimatePresence mode="wait">
                            {selectedTeam ? (
                                <motion.div
                                    key={selectedTeam.teamId}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    className="glass-card rounded-[40px] p-10 border-white/10 relative overflow-hidden h-full flex flex-col"
                                >
                                    {/* Team Header */}
                                    <div className="flex justify-between items-start mb-12">
                                        <div>
                                            <div className="flex items-center gap-4 mb-4">
                                                <div className="w-4 h-12 rounded-full" style={{ backgroundColor: selectedTeam.teamThemeColor }}></div>
                                                <h2 className="text-5xl font-black uppercase tracking-tighter italic">{selectedTeam.teamName}</h2>
                                            </div>
                                            <p className="text-slate-300 font-bold max-w-lg leading-relaxed text-sm">
                                                {selectedTeam.evaluation?.summary}
                                            </p>
                                        </div>
                                        <div className="flex flex-col items-center gap-4">
                                            <div className="glass-panel p-6 rounded-[30px] border-white/5 text-center px-10">
                                                <div className="text-5xl font-black tracking-tighter" style={{ color: selectedTeam.teamThemeColor }}>{selectedTeam.evaluation?.overallScore}</div>
                                                <div className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mt-2">Overall Rating</div>
                                            </div>
                                            <button
                                                onClick={() => {
                                                    const shareText = `Check out my IPL 2025 Draft for ${selectedTeam.teamName}!\nOverall Rating: ${selectedTeam.evaluation?.overallScore}/100\nStar Player: ${selectedTeam.evaluation?.starPlayer}\nBest Value: ${selectedTeam.evaluation?.bestValuePick}`;
                                                    if (navigator.share) {
                                                        navigator.share({ title: 'My IPL Squad', text: shareText });
                                                    } else {
                                                        navigator.clipboard.writeText(shareText);
                                                        alert('Squad stats copied to clipboard!');
                                                    }
                                                }}
                                                className="btn-premium w-full !py-2 !text-[10px]"
                                            >
                                                📤 Share Team Card
                                            </button>
                                        </div>
                                    </div>

                                    {/* Breakdown */}
                                    <div className="grid grid-cols-4 gap-4 mb-8">
                                        <div className="glass-panel rounded-3xl p-4 border-white/5 text-center">
                                            <div className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-1">Batting</div>
                                            <div className="text-2xl font-black">{selectedTeam.evaluation?.battingScore}</div>
                                        </div>
                                        <div className="glass-panel rounded-3xl p-4 border-white/5 text-center">
                                            <div className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-1">Bowling</div>
                                            <div className="text-2xl font-black">{selectedTeam.evaluation?.bowlingScore}</div>
                                        </div>
                                        <div className="glass-panel rounded-3xl p-4 border-white/5 text-center">
                                            <div className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-1">Balance</div>
                                            <div className="text-2xl font-black">{selectedTeam.evaluation?.balanceScore}</div>
                                        </div>
                                        <div className="glass-panel rounded-3xl p-4 border-white/5 text-center">
                                            <div className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-1">Form</div>
                                            <div className="text-2xl font-black">{selectedTeam.evaluation?.formScore}</div>
                                        </div>
                                    </div>

                                    <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-2xl mb-8">
                                        <div className="text-[9px] font-black text-red-500 uppercase tracking-widest mb-1">Tactical Weakness</div>
                                        <p className="text-red-300 text-xs font-bold leading-relaxed">{selectedTeam.evaluation?.weakness}</p>
                                    </div>

                                    {/* Squad List */}
                                    <div className="flex-1 overflow-y-auto custom-scrollbar pr-4">
                                        <div className="flex justify-between items-center mb-4">
                                            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Drafted Squad</h3>
                                            <div className="flex gap-4">
                                                <div className="text-[10px] font-black text-yellow-500 uppercase tracking-widest bg-yellow-500/10 px-2 py-1 rounded">⭐ Star: {selectedTeam.evaluation?.starPlayer}</div>
                                                <div className="text-[10px] font-black text-green-400 uppercase tracking-widest bg-green-400/10 px-2 py-1 rounded">💎 Steal: {selectedTeam.evaluation?.bestValuePick}</div>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            {selectedTeam.playersAcquired.map((entry, idx) => (
                                                <div key={idx} className="glass-panel p-3 rounded-2xl border-white/5 flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center font-black text-[10px] text-slate-500">
                                                            {idx + 1}
                                                        </div>
                                                        <div className="text-sm font-bold text-white truncate max-w-[150px]">
                                                            {entry.player?.name || "Unknown Player"}
                                                        </div>
                                                    </div>
                                                    <div className="text-xs font-mono font-black text-slate-400">₹{entry.boughtFor}L</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                </motion.div>
                            ) : null}
                        </AnimatePresence>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ResultsReveal;
