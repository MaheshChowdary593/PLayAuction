import React, { useEffect, useState, useRef } from 'react';
import { useLocation, useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { toPng } from 'html-to-image';
import TeamShareCard from '../components/TeamShareCard';
import GlobalResultCard from '../components/GlobalResultCard';
import { fmtCr } from '../utils/playerUtils';

const ResultsReveal = () => {
    const { roomCode } = useParams();
    const navigate = useNavigate();
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedTeam, setSelectedTeam] = useState(null);
    const [error, setError] = useState(null);
    const [allPlayersMap, setAllPlayersMap] = useState({});
    const [isSharing, setIsSharing] = useState(false); // Global locking state for any sharing
    const [toast, setToast] = useState(null);
    const shareRef = useRef(null);

    useEffect(() => {
        // Fetch players to create a fallback name map
        const apiUrl = import.meta.env.VITE_API_URL || '';
        fetch(`${apiUrl}/api/players`)
            .then(res => res.json())
            .then(data => {
                const map = {};
                data.forEach(p => {
                    map[p._id] = p;
                    if (p.playerId) map[p.playerId] = p;
                });
                setAllPlayersMap(map);
            })
            .catch(err => console.error("Failed to fetch players for map:", err));
    }, []);

    useEffect(() => {
        const fetchResults = async () => {
            try {
                const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5050';
                const response = await fetch(`${apiUrl}/api/room/${roomCode}/results`);
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

    const handleShareTeamCard = async () => {
        if (!selectedTeam || isSharing) return;
        setIsSharing(true);

        try {
            console.log("Starting share card generation for:", selectedTeam.teamName);
            // Wait for images to potentially load and layout to stabilize
            await new Promise(resolve => setTimeout(resolve, 800));

            const node = document.getElementById('team-share-card');
            if (!node) throw new Error("Share card element not found in DOM");

            // Generate PNG data URL with better settings for high quality
            const dataUrl = await toPng(node, {
                cacheBust: true,
                pixelRatio: 3, // Higher quality
                skipFonts: false,
                backgroundColor: selectedTeam.teamThemeColor || '#000000',
            });

            if (!dataUrl || dataUrl.length < 100) {
                throw new Error("Generated image is empty or too small");
            }

            const fileName = `${selectedTeam.teamName.replace(/\s+/g, '_')}_Squad.png`;

            // Convert dataUrl to blob
            const blobResponse = await fetch(dataUrl);
            const blob = await blobResponse.blob();
            const file = new File([blob], fileName, { type: 'image/png' });

            const shareData = {
                title: `${selectedTeam.teamName} Squad - IPL Auction Verdict`,
                text: `Verified: My ${selectedTeam.teamName} squad! Final Score: ${selectedTeam.evaluation?.overallScore}/100. Star Player: ${selectedTeam.evaluation?.starPlayer}. #IPLAuctionVerdict`,
                files: [file]
            };

            // Check if Web Share API with files is supported
            if (navigator.canShare && navigator.canShare(shareData)) {
                await navigator.share(shareData);
            } else {
                // Fallback: Download and provide WhatsApp link
                const link = document.createElement('a');
                link.href = dataUrl;
                link.download = fileName;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);

                // Open WhatsApp fallback
                const whatsappMsg = encodeURIComponent(shareData.text);
                setTimeout(() => {
                    window.open(`https://wa.me/?text=${whatsappMsg}`, '_blank');
                }, 500);
            }
        } catch (err) {
            console.error("DEBUG: Sharing failed deeply:", err);
            setToast({
                message: `Share failed: ${err.message || 'Unknown render error'}. Hint: Ensure you have a stable connection.`,
                type: 'error'
            });
        } finally {
            // Add a 1.2s cooldown before allowing the next share to let the OS UI settle
            setTimeout(() => setIsSharing(false), 1200);
        }
    };

    const handleShareGlobalCard = async () => {
        if (!results || results.length === 0 || isSharing) return;
        setIsSharing(true);

        try {
            await new Promise(resolve => setTimeout(resolve, 800));

            const node = document.getElementById('global-result-card');
            if (!node) throw new Error("Global share card element not found");

            const dataUrl = await toPng(node, {
                cacheBust: true,
                pixelRatio: 2,
                backgroundColor: '#1a1205',
            });

            const fileName = `IPL_Auction_Final_Verdict.png`;
            const blobResponse = await fetch(dataUrl);
            const blob = await blobResponse.blob();
            const file = new File([blob], fileName, { type: 'image/png' });

            const shareData = {
                title: `IPL Auction 2026 - Final Verdicts`,
                text: `The Auction is Over! Here are the Final Squad Verdicts and AI Ratings. #IPLAuction #VercelVerdict`,
                files: [file]
            };

            if (navigator.canShare && navigator.canShare(shareData)) {
                await navigator.share(shareData);
            } else {
                const link = document.createElement('a');
                link.href = dataUrl;
                link.download = fileName;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);

                setToast({ message: "Global Verdict downloaded! You can now share it.", type: 'success' });
            }
        } catch (err) {
            console.error("Global sharing failed:", err);
            // Ignore AbortError (user cancelled)
            if (err.name !== 'AbortError') {
                setToast({ message: `Sharing failed: ${err.message}`, type: 'error' });
            }
        } finally {
            setTimeout(() => setIsSharing(false), 1200);
        }
    };

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
        <div className="min-h-screen bg-darkBg text-white p-4 sm:p-8 relative overflow-hidden font-sans">

            {/* Hidden TeamShareCard for capture */}
            {/* Stabilized hidden container for capture */}
            <div
                style={{
                    position: 'fixed',
                    left: '-3000px',
                    top: '0',
                    zIndex: -1,
                    visibility: 'visible',
                    pointerEvents: 'none'
                }}
            >
                <TeamShareCard team={selectedTeam} allPlayersMap={allPlayersMap} />
                <GlobalResultCard results={results} allPlayersMap={allPlayersMap} />
            </div>

            {/* Background elements */}
            <div className="fixed inset-0 pointer-events-none">
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-purple-600/10 blur-[150px] rounded-full"></div>
                <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-blue-600/10 blur-[150px] rounded-full"></div>
            </div>

            <div className="relative z-10 max-w-7xl mx-auto">
                <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-8 md:mb-16 gap-6">
                    <div className="w-full sm:w-auto text-center sm:text-left">
                        <h1 className="text-[8px] md:text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] mb-2">Auction Concluded / Final Review</h1>
                        <h2 className="text-4xl sm:text-5xl lg:text-7xl font-black italic tracking-tighter uppercase leading-none">
                            The <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">Verdict</span>
                        </h2>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
                        <button
                            onClick={handleShareGlobalCard}
                            disabled={isSharing}
                            className={`px-6 py-4 bg-[#D4AF37] text-[#1a1205] rounded-2xl font-black uppercase tracking-widest shadow-lg hover:bg-[#FFE58F] transition-all flex items-center justify-center gap-2 ${isSharing ? 'opacity-50' : ''}`}
                        >
                            {isSharing ? <span className="animate-spin h-3 w-3 border-2 border-[#1a1205]/30 border-t-[#1a1205] rounded-full"></span> : '🏆'} Global Verdict
                        </button>
                        <button
                            onClick={() => navigate('/')}
                            className="px-6 py-4 glass-panel rounded-2xl border-white/10 hover:bg-white/10 transition-colors text-[10px] font-black uppercase tracking-widest shadow-lg"
                        >
                            Back to Lobby
                        </button>
                    </div>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                    {/* Left: Team List */}
                    <div className="space-y-4">
                        <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Final Rankings</h3>
                        {results.map((team, index) => (
                            <motion.div
                                key={team.teamId || team.teamName || index}
                                initial={{ x: -50, opacity: 0 }}
                                animate={{ x: 0, opacity: 1 }}
                                transition={{ delay: index * 0.1 }}
                                onClick={() => setSelectedTeam(team)}
                                className={`
                                    glass-card p-6 rounded-3xl border-white/5 cursor-pointer transition-all relative overflow-hidden group
                                    ${selectedTeam?.teamId === team.teamId ? 'border-white/20 bg-white/10 scale-105' : 'hover:bg-white/5'}
                                `}
                            >
                                <div className="absolute top-0 left-0 w-1.5 h-full" style={{ backgroundColor: team.teamThemeColor }}></div>
                                <div className="flex justify-between items-center">
                                    <div>
                                        <div className="mb-2 flex items-center gap-2">
                                            {team.evaluation?.overallScore === 0 ? (
                                                <span className="text-[10px] font-black uppercase tracking-widest text-red-500 bg-red-500/10 px-3 py-1 rounded-full border border-red-500/20">❌ Disqualified</span>
                                            ) : (
                                                <div className="flex items-center gap-4">
                                                    {team.rank === 1 && (
                                                        <div className="flex items-center gap-3 bg-gradient-to-r from-yellow-500/30 to-yellow-600/10 border border-yellow-500/50 px-6 py-2 rounded-2xl shadow-[0_0_20px_rgba(234,179,8,0.2)]">
                                                            <span className="text-6xl drop-shadow-2xl translate-y-[-4px]">🥇</span>
                                                            <div className="flex flex-col">
                                                                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-yellow-500/70">Winner</span>
                                                                <span className="text-sm font-black uppercase tracking-widest text-yellow-400">CHAMPION</span>
                                                            </div>
                                                        </div>
                                                    )}
                                                    {team.rank === 2 && (
                                                        <div className="flex items-center gap-3 bg-gradient-to-r from-slate-400/30 to-slate-500/10 border border-slate-400/50 px-6 py-2 rounded-2xl shadow-[0_0_20px_rgba(148,163,184,0.2)]">
                                                            <span className="text-6xl drop-shadow-2xl translate-y-[-4px]">🥈</span>
                                                            <div className="flex flex-col">
                                                                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400/70">Finalist</span>
                                                                <span className="text-sm font-black uppercase tracking-widest text-slate-300">RUNNER UP</span>
                                                            </div>
                                                        </div>
                                                    )}
                                                    {team.rank === 3 && (
                                                        <div className="flex items-center gap-3 bg-gradient-to-r from-orange-600/30 to-orange-700/10 border border-orange-600/50 px-6 py-2 rounded-2xl shadow-[0_0_20px_rgba(234,88,12,0.2)]">
                                                            <span className="text-6xl drop-shadow-2xl translate-y-[-4px]">🥉</span>
                                                            <div className="flex flex-col">
                                                                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-600/70">Podium</span>
                                                                <span className="text-sm font-black uppercase tracking-widest text-orange-500">3RD PLACE</span>
                                                            </div>
                                                        </div>
                                                    )}
                                                    {team.rank > 3 && (
                                                        <span className="text-[11px] font-black uppercase tracking-[0.3em] opacity-60" style={{ color: team.teamThemeColor }}>
                                                            #{team.rank} RANKED
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                        <div className={`text-xl font-black uppercase tracking-tight ${team.evaluation?.overallScore === 0 ? 'text-red-500/50 line-through' : ''}`}>{team.teamName}</div>
                                        <div className="text-[10px] text-slate-500 font-bold uppercase">{team.ownerName}</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-3xl font-black font-mono" style={{ color: team.evaluation?.overallScore === 0 ? '#ef4444' : team.teamThemeColor }}>{team.evaluation?.overallScore}</div>
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
                                    className="glass-card rounded-[32px] md:rounded-[40px] p-6 md:p-10 border-white/10 relative overflow-hidden h-full flex flex-col"
                                >
                                    {/* Team Header */}
                                    <div className="flex flex-col md:flex-row justify-between items-start mb-8 md:mb-12 gap-8">
                                        <div className="flex-1 min-w-0 w-full">
                                            <div className="flex items-center gap-4 mb-4">
                                                <div className="w-3 h-6 md:w-4 md:h-12 rounded-full shrink-0" style={{ backgroundColor: selectedTeam.teamThemeColor }}></div>
                                                <h2 className="text-2xl sm:text-3xl lg:text-4xl xl:text-5xl font-black uppercase tracking-tighter italic truncate">{selectedTeam.teamName}</h2>
                                            </div>
                                            <p className="text-slate-300 font-bold max-w-lg leading-relaxed text-[11px] md:text-sm">
                                                {selectedTeam.evaluation?.tacticalVerdict || selectedTeam.evaluation?.summary}
                                            </p>
                                            <p className="text-blue-400/60 font-black text-[9px] md:text-[10px] uppercase tracking-widest mt-4">
                                                {selectedTeam.evaluation?.historicalContext}
                                            </p>

                                            {selectedTeam.tieBreakerReason && (
                                                <div className="mt-4 p-4 bg-blue-500/10 border border-blue-500/20 rounded-2xl">
                                                    <div className="text-[8px] font-black text-blue-400 uppercase tracking-widest mb-1">Tie-Breaker Logic</div>
                                                    <p className="text-[10px] md:text-[11px] font-bold text-blue-200 italic">"{selectedTeam.tieBreakerReason}"</p>
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex flex-row md:flex-col items-center gap-4 w-full md:w-auto">
                                            <div className="flex-1 md:flex-none glass-panel p-4 md:p-6 rounded-3xl border-white/5 text-center px-6 md:px-10 bg-white/5">
                                                <div className="text-4xl md:text-6xl font-black tracking-tighter" style={{ color: selectedTeam.teamThemeColor }}>{selectedTeam.evaluation?.overallScore}</div>
                                                <div className="text-[9px] md:text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mt-2">Score</div>
                                            </div>
                                            <button
                                                onClick={handleShareTeamCard}
                                                disabled={isSharing}
                                                className={`btn-premium w-full !py-4 md:!py-3 !text-[10px] flex items-center justify-center gap-2 shadow-xl ${isSharing ? 'opacity-50 cursor-not-allowed' : ''}`}
                                            >
                                                {isSharing ? (
                                                    <span className="animate-spin h-3 w-3 border-2 border-white/30 border-t-white rounded-full"></span>
                                                ) : '📤'} Share Squad
                                            </button>
                                        </div>
                                    </div>

                                    {/* Breakdown */}
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4 mb-8">
                                        <div className="glass-panel rounded-2xl md:rounded-3xl p-3 md:p-4 border-white/5 text-center">
                                            <div className="text-[8px] md:text-[9px] text-slate-400 font-black uppercase tracking-widest mb-1">Batting</div>
                                            <div className="text-xl md:text-2xl font-black">{selectedTeam.evaluation?.battingScore}</div>
                                        </div>
                                        <div className="glass-panel rounded-2xl md:rounded-3xl p-3 md:p-4 border-white/5 text-center">
                                            <div className="text-[8px] md:text-[9px] text-slate-400 font-black uppercase tracking-widest mb-1">Bowling</div>
                                            <div className="text-xl md:text-2xl font-black">{selectedTeam.evaluation?.bowlingScore}</div>
                                        </div>
                                        <div className="glass-panel rounded-2xl md:rounded-3xl p-3 md:p-4 border-white/5 text-center">
                                            <div className="text-[8px] md:text-[9px] text-slate-400 font-black uppercase tracking-widest mb-1">Balance</div>
                                            <div className="text-xl md:text-2xl font-black">{selectedTeam.evaluation?.balanceScore}</div>
                                        </div>
                                        <div className="glass-panel rounded-2xl md:rounded-3xl p-3 md:p-4 border-white/5 text-center">
                                            <div className="text-[8px] md:text-[9px] text-slate-400 font-black uppercase tracking-widest mb-1">Impact</div>
                                            <div className="text-xl md:text-2xl font-black">{selectedTeam.evaluation?.impactScore || selectedTeam.evaluation?.formScore}</div>
                                        </div>
                                    </div>

                                    <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-2xl mb-8">
                                        <div className="text-[9px] font-black text-red-500 uppercase tracking-widest mb-1">Tactical Weakness</div>
                                        <p className="text-red-300 text-xs font-bold leading-relaxed">{selectedTeam.evaluation?.weakness}</p>
                                    </div>

                                    {/* Squad List */}
                                    <div className="flex-1 overflow-y-auto custom-scrollbar pr-4">
                                        <div className="flex justify-between items-center mb-4">
                                            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Team Profile</h3>
                                            <div className="flex gap-4">
                                                <div className="text-[10px] font-black text-yellow-500 uppercase tracking-widest bg-yellow-500/10 px-2 py-1 rounded">⭐ Star: {selectedTeam.evaluation?.starPlayer}</div>
                                                <div className="text-[10px] font-black text-green-400 uppercase tracking-widest bg-green-400/10 px-2 py-1 rounded">💎 Gem: {selectedTeam.evaluation?.hiddenGem || selectedTeam.evaluation?.bestValuePick}</div>
                                            </div>
                                        </div>

                                        {selectedTeam.evaluation?.playing11 && (
                                            <div className="mb-6 p-6 bg-blue-600/5 border border-blue-500/20 rounded-3xl">
                                                <h4 className="text-[10px] font-black text-blue-400 uppercase tracking-[0.3em] mb-4 text-center">Final Playing 11</h4>
                                                <div className="flex flex-wrap justify-center gap-2">
                                                    {selectedTeam.evaluation.playing11.map((name, idx) => (
                                                        <span key={`${name}-${idx}`} className="bg-blue-600/10 text-blue-200 px-3 py-1 rounded-full text-[9px] font-black border border-blue-500/10 uppercase tracking-widest">
                                                            {name}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {selectedTeam.evaluation?.impactPlayers && (
                                            <div className="mb-8 p-6 bg-purple-600/5 border border-purple-500/20 rounded-3xl">
                                                <h4 className="text-[10px] font-black text-purple-400 uppercase tracking-[0.3em] mb-4 text-center">Strategic Impact Subs</h4>
                                                <div className="flex flex-wrap justify-center gap-2">
                                                    {selectedTeam.evaluation.impactPlayers.map((name, idx) => (
                                                        <span key={`${name}-${idx}`} className="bg-purple-600/10 text-purple-200 px-3 py-1 rounded-full text-[9px] font-black border border-purple-500/10 uppercase tracking-widest">
                                                            {name}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {selectedTeam.evaluation?.benchAnalysis && (
                                            <div className="mb-8 p-6 glass-panel border border-white/5 rounded-3xl">
                                                <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Bench Strength Analysis</h4>
                                                <p className="text-xs font-bold text-slate-300 leading-relaxed italic">"{selectedTeam.evaluation.benchAnalysis}"</p>
                                            </div>
                                        )}

                                        <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Full Squad</h3>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            {selectedTeam.playersAcquired.map((entry, idx) => (
                                                <div key={entry.player?._id || entry.player || idx} className="glass-panel p-3 rounded-2xl border-white/5 flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center font-black text-[10px] text-slate-500">
                                                            {idx + 1}
                                                        </div>
                                                        <div className="text-sm font-bold text-white truncate max-w-[150px]">
                                                            {entry.name || (entry.player && allPlayersMap[entry.player]) || (entry.player?.name) || (allPlayersMap[entry.player?._id]) || "Unknown Player"}
                                                        </div>
                                                    </div>
                                                    <div className="text-xs font-mono font-black text-slate-400">{fmtCr(entry.boughtFor)}</div>
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

            {/* Toast Notification Modal */}
            <AnimatePresence>
                {toast && (
                    <motion.div
                        initial={{ opacity: 0, y: -40, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -30, scale: 0.95 }}
                        className="fixed top-6 left-1/2 -translate-x-1/2 z-[250] w-full max-w-sm px-4"
                    >
                        <div
                            className={`flex items-start gap-4 p-5 rounded-2xl border shadow-2xl backdrop-blur-md ${toast.type === "error"
                                ? "bg-red-500/10 border-red-500/30"
                                : toast.type === "warning"
                                    ? "bg-yellow-500/10 border-yellow-500/30"
                                    : toast.type === "success"
                                        ? "bg-green-500/10 border-green-500/30"
                                        : "bg-blue-500/10 border-blue-500/30"
                                }`}
                        >
                            {/* Icon */}
                            <div
                                className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${toast.type === "error"
                                    ? "bg-red-500/20"
                                    : toast.type === "warning"
                                        ? "bg-yellow-500/20"
                                        : toast.type === "success"
                                            ? "bg-green-500/20"
                                            : "bg-blue-500/20"
                                    }`}
                            >
                                {toast.type === "error" ? (
                                    <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                ) : toast.type === "success" ? (
                                    <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                                    </svg>
                                ) : toast.type === "warning" ? (
                                    <svg className="w-5 h-5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                                    </svg>
                                ) : (
                                    <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                )}
                            </div>

                            {/* Message */}
                            <p
                                className={`flex-1 text-sm font-bold leading-relaxed ${toast.type === "error"
                                    ? "text-red-300"
                                    : toast.type === "warning"
                                        ? "text-yellow-300"
                                        : toast.type === "success"
                                            ? "text-green-300"
                                            : "text-blue-200"
                                    }`}
                            >
                                {toast.message}
                            </p>

                            {/* Dismiss */}
                            <button
                                onClick={() => setToast(null)}
                                className="shrink-0 text-slate-500 hover:text-white transition-colors mt-0.5"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default ResultsReveal;
