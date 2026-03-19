import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Plane, X, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useSession } from '../context/SessionContext';

const SquadSelection = () => {
    const { roomCode } = useParams();
    const navigate = useNavigate();
    const { socket } = useSocket();

    const [squad, setSquad] = useState([]);
    const [playing11, setPlaying11] = useState([]);
    const [impactPlayers, setImpactPlayers] = useState([]);
    const [selectionMode, setSelectionMode] = useState('playing11'); // 'playing11' or 'impact'
    
    // Derived state for validation
    const getRoleType = (role = "") => {
        const r = role.toLowerCase();
        if (r.includes("wk") || r.includes("wicket") || r.includes("keeper")) return "wk";
        if (r.includes("all") || r.includes("ar")) return "ar";
        if (r.includes("bowl") || r.includes("bw")) return "bowl";
        return "bat";
    };

    const xiPlayers = squad.filter(p => playing11.includes(p.player));
    const impactSubs = squad.filter(p => impactPlayers.includes(p.player));
    
    const xiOverseas = xiPlayers.filter(p => p.isOverseas).length;
    const impactOverseas = impactSubs.filter(p => p.isOverseas).length;
    const hasWK = xiPlayers.some(p => getRoleType(p.role) === 'wk');
    const [timer, setTimer] = useState(120);
    const [evaluationTimer, setEvaluationTimer] = useState(0);
    const [isEvaluating, setIsEvaluating] = useState(false);
    const [isAutoSelecting, setIsAutoSelecting] = useState(false);
    const [isConfirmed, setIsConfirmed] = useState(false);
    const [roomState, setRoomState] = useState(null);
    const [toast, setToast] = useState(null);
    const { userId, isReady: isSessionReady } = useSession();
    const [isSocketReady, setIsSocketReady] = useState(false);

    // Local timer interpolation
    useEffect(() => {
        const interval = setInterval(() => {
            setTimer((prev) => (prev > 0 ? prev - 1 : 0));
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (!socket || !roomCode || !isSessionReady) return;
        setIsSocketReady(true);

        const fetchState = async () => {
            try {
                const apiUrl = import.meta.env.VITE_API_URL || '';
                const res = await fetch(`${apiUrl}/api/room/${roomCode}`);
                if (!res.ok) throw new Error("Room not found");
                const data = await res.json();
                setRoomState(data);

                const myTeam = data.franchisesInRoom.find(t => t.ownerUserId === userId);
                if (myTeam) {
                    setSquad(myTeam.playersAcquired || []);
                    if (myTeam.playing11?.length === 11 && myTeam.impactPlayers?.length === 4) {
                        setPlaying11(myTeam.playing11);
                        setImpactPlayers(myTeam.impactPlayers);
                        setIsConfirmed(true);
                    }
                }
            } catch (err) {
                console.error("Failed to fetch room state:", err);
                setToast({ message: "Failed to connect to room. Redirecting...", type: 'error' });
                setTimeout(() => navigate('/'), 3000);
            }
        };

        fetchState();
        socket.emit('join_room', { roomCode });

        socket.on('room_joined', ({ state }) => {
            setRoomState(state);
            const myTeam = state.teams?.find(t => t.ownerUserId === userId);
            if (myTeam) {
                setSquad(myTeam.playersAcquired || []);
                if (myTeam.playing11?.length === 11 && myTeam.impactPlayers?.length === 4) {
                    setPlaying11(myTeam.playing11);
                    setImpactPlayers(myTeam.impactPlayers);
                    setIsConfirmed(true);
                }
            }
        });

        socket.on('selection_timer_tick', ({ timer }) => setTimer(timer));

        socket.on('selection_confirmed', ({ playing11, impactPlayers }) => {
            setPlaying11(playing11);
            setImpactPlayers(impactPlayers);
            setIsConfirmed(true);
            setIsAutoSelecting(false);
        });

        // Evaluation phase: fires when all squads are done and AI evaluation starts
        socket.on('evaluation_started', ({ timer }) => {
            setIsEvaluating(true);
            setEvaluationTimer(timer);
        });

        socket.on('evaluation_timer_tick', ({ timer }) => {
            setEvaluationTimer(timer);
        });

        socket.on('results_ready', () => navigate(`/results/${roomCode}`));

        socket.on('error', (msg) => {
            if (msg.includes('AI Selection failed')) setIsAutoSelecting(false);
            setToast({ message: msg, type: 'error' });
        });

        return () => {
            socket.off('room_joined');
            socket.off('selection_timer_tick');
            socket.off('selection_confirmed');
            socket.off('evaluation_started');
            socket.off('evaluation_timer_tick');
            socket.off('results_ready');
            socket.off('error');
        };
    }, [socket, roomCode, navigate, isSessionReady, userId]);

    const togglePlayer = (id) => {
        if (isConfirmed) return;

        // If player is already in either list, remove them
        if (playing11.includes(id)) {
            setPlaying11(playing11.filter(i => i !== id));
            return;
        }
        if (impactPlayers.includes(id)) {
            setImpactPlayers(impactPlayers.filter(i => i !== id));
            return;
        }

        const player = squad.find(p => p.player === id);
        if (!player) return;

        // Add to active selection pool
        if (selectionMode === 'playing11') {
            if (playing11.length < 11) {
                // Overseas check
                if (player.isOverseas && xiOverseas >= 4) {
                    setToast({ message: "Maximum 4 Overseas players allowed in Playing 11.", type: 'warning' });
                    return;
                }
                // Impact Sub override check: if any impact subs are overseas, max 3 overseas in XI is a common strategy but IPL rule says
                // "A team can only play 4 overseas players in the playing 11. If 4 overseas are in the XI, the impact sub must be Indian."
                // "If fewer than 4 overseas are in the XI, the impact sub can be overseas."
                if (player.isOverseas && impactOverseas > 0 && xiOverseas >= 3) {
                    setToast({ message: "You already have Overseas players in Impact Subs. Limit XI to 3 Overseas.", type: 'warning' });
                    return;
                }

                setPlaying11([...playing11, id]);
            } else {
                setToast({ message: "Playing 11 is full. Switch to Impact Players.", type: 'warning' });
            }
        } else {
            if (impactPlayers.length < 4) {
                // Overseas Impact Sub Rule
                if (player.isOverseas && xiOverseas >= 4) {
                    setToast({ message: "Playing 11 already has 4 Overseas players. Impact Subs must be Indian.", type: 'warning' });
                    return;
                }
                setImpactPlayers([...impactPlayers, id]);
            } else {
                setToast({ message: "Impact Players (4) already selected.", type: 'warning' });
            }
        }
    };

    const handleManualSubmit = () => {
        if (playing11.length < 11 || impactPlayers.length < 4) {
            setToast({ message: "Please select 11 starters and 4 impact players.", type: 'warning' });
            return;
        }
        socket.emit('manual_select_squad', {
            roomCode,
            playing11Ids: playing11,
            impactPlayerIds: impactPlayers
        });
    };

    const handleAutoSelect = () => {
        setIsAutoSelecting(true);
        socket.emit('auto_select_squad', { roomCode });
    };

    const formatTime = (seconds) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    };

    if (!isSessionReady || !isSocketReady || !roomState) {
        return (
            <div className="min-h-screen bg-darkBg flex flex-col items-center justify-center p-6 text-center text-white">
                <div className="w-16 h-16 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mb-8"></div>
                <h2 className="text-xl font-black uppercase tracking-[0.3em]">Analyzing Squad Data</h2>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-darkBg text-white p-4 sm:p-8 font-sans">
            <div className="max-w-7xl mx-auto">
                <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-8 md:mb-12 gap-6">
                    <div className="w-full sm:w-auto text-center sm:text-left">
                        <h1 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] mb-2">Auction Phase 2 / Final Selection</h1>
                        <h2 className="text-4xl md:text-6xl font-black italic tracking-tighter uppercase leading-none">
                            Draft <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">War-Room</span>
                        </h2>
                    </div>
                    <div className="w-full sm:w-auto flex flex-col items-center sm:items-end bg-white/5 sm:bg-transparent p-4 sm:p-0 rounded-2xl border border-white/5 sm:border-none">
                        <div className={`text-3xl md:text-5xl font-black font-mono mb-1 ${isEvaluating ? 'text-purple-400' : 'text-yellow-500'}`}>
                            {formatTime(isEvaluating ? evaluationTimer : timer)}
                        </div>
                        <div className={`text-[10px] font-black uppercase tracking-widest ${isEvaluating ? 'text-purple-400' : 'text-slate-500'}`}>
                            {isEvaluating ? '🤖 Evaluation Timer' : 'Selection Timer'}
                        </div>
                    </div>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                    {/* Left: Player Pool */}
                    <div className="lg:col-span-2 space-y-6">
                        <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                            <h3 className="text-base sm:text-lg font-black uppercase tracking-tight">Acquired Players ({squad.length})</h3>
                            <div className="flex gap-2 w-full sm:w-auto">
                                <button
                                    onClick={() => setSelectionMode('playing11')}
                                    className={`flex-1 sm:flex-none px-4 py-2.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${selectionMode === 'playing11' ? 'bg-blue-600 border-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.3)] text-white' : 'bg-white/5 border border-white/10 text-slate-400'}`}
                                >
                                    Select XI
                                </button>
                                <button
                                    onClick={() => setSelectionMode('impact')}
                                    className={`flex-1 sm:flex-none px-4 py-2.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${selectionMode === 'impact' ? 'bg-purple-600 border-purple-400 shadow-[0_0_15px_rgba(147,51,234,0.3)] text-white' : 'bg-white/5 border border-white/10 text-slate-400'}`}
                                >
                                    Select Impact
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                            {squad.map((entry, idx) => {
                                const isXI = playing11.includes(entry.player);
                                const isImpact = impactPlayers.includes(entry.player);
                                return (
                                    <motion.div
                                        key={idx}
                                        whileHover={!isConfirmed ? { scale: 1.02 } : {}}
                                        onClick={() => togglePlayer(entry.player)}
                                        className={`
                                            p-3.5 rounded-2xl border cursor-pointer transition-all flex items-center justify-between
                                            ${isXI ? 'bg-blue-600/20 border-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.2)]' :
                                                isImpact ? 'bg-purple-600/20 border-purple-500 shadow-[0_0_10px_rgba(147,51,234,0.2)]' :
                                                    'bg-white/5 border-white/5 hover:border-white/20'}
                                            ${isConfirmed ? 'opacity-70 cursor-default' : ''}
                                        `}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${isXI ? 'bg-blue-500 border-blue-400' : isImpact ? 'bg-purple-500 border-purple-400' : 'border-white/20'}`}>
                                                {(isXI || isImpact) && <div className="w-1.5 h-1.5 bg-white rounded-full"></div>}
                                            </div>
                                            <div>
                                                <div className="font-bold text-xs flex items-center gap-2">
                                                    {entry.name}
                                                    {entry.isOverseas && <Plane className="w-2.5 h-2.5 text-yellow-500" />}
                                                </div>
                                                <div className="text-[9px] text-slate-500 uppercase font-black">{entry.role}</div>
                                            </div>
                                        </div>
                                        {isXI && <span className="text-[8px] font-black text-blue-400 uppercase">Starters</span>}
                                        {isImpact && <span className="text-[8px] font-black text-purple-400 uppercase">Impact</span>}
                                    </motion.div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Right: Selection Summary & Actions */}
                    <div className="lg:col-span-2 space-y-6">
                        <div className="glass-card p-6 rounded-[32px] border-white/10">
                            <h3 className="text-base font-black uppercase tracking-widest mb-6 border-b border-white/5 pb-4">Squad Composition</h3>

                            <div className="space-y-6">
                                <div>
                                    <div className="flex justify-between text-[10px] font-black uppercase tracking-widest mb-3 text-blue-400">
                                        <span>Playing 11</span>
                                        <span>{playing11.length} / 11</span>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {[...Array(11)].map((_, i) => {
                                            const pId = playing11[i];
                                            const p = squad.find(s => s.player === pId);
                                            return (
                                                <div key={i} className={`w-8 h-8 rounded-lg border flex items-center justify-center text-[10px] font-black ${p ? 'bg-blue-600/20 border-blue-500 text-white' : 'bg-white/5 border-dashed border-white/10 text-slate-600'}`}>
                                                    {p ? p.name.charAt(0) : i + 1}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div>
                                    <div className="flex justify-between text-[10px] font-black uppercase tracking-widest mb-3 text-purple-400">
                                        <span>Impact subs</span>
                                        <span>{impactPlayers.length} / 4</span>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {[...Array(4)].map((_, i) => {
                                            const pId = impactPlayers[i];
                                            const p = squad.find(s => s.player === pId);
                                            return (
                                                <div key={i} className={`w-8 h-8 rounded-lg border flex items-center justify-center text-[10px] font-black ${p ? 'bg-purple-600/20 border-purple-500 text-white' : 'bg-white/5 border-dashed border-white/10 text-slate-600'}`}>
                                                    {p ? p.name.charAt(0) : i + 1}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4 mt-6 pt-4 border-t border-white/5">
                                    <div className={`p-3 rounded-2xl border ${xiOverseas > 4 ? 'bg-red-500/10 border-red-500/30' : 'bg-white/5 border-white/10'}`}>
                                        <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Overseas (XI)</div>
                                        <div className={`text-lg font-black ${xiOverseas > 4 ? 'text-red-400' : 'text-white'}`}>{xiOverseas} / 4</div>
                                    </div>
                                    <div className={`p-3 rounded-2xl border ${!hasWK && playing11.length > 0 ? 'bg-amber-500/10 border-amber-500/30' : 'bg-white/5 border-white/10'}`}>
                                        <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Wicketkeeper</div>
                                        <div className={`text-sm font-black uppercase tracking-tight ${hasWK ? 'text-green-400' : 'text-amber-400'}`}>
                                            {hasWK ? '✓ Selected' : 'Missing'}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-8 space-y-4">
                                <button
                                    onClick={handleAutoSelect}
                                    disabled={isConfirmed || isAutoSelecting}
                                    className={`w-full py-4 rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] transition-all flex items-center justify-center gap-2
                                        ${isAutoSelecting ? 'bg-white/5 text-slate-500 animate-pulse' : 'bg-gradient-to-r from-purple-600 to-blue-600 hover:scale-[1.02] shadow-xl shadow-blue-900/20'}
                                        ${isConfirmed ? 'opacity-50 grayscale' : ''}
                                    `}
                                >
                                    {isAutoSelecting ? '🤖 Strategizing...' : '🤖 AI Optimal Selection'}
                                </button>

                                <button
                                    onClick={handleManualSubmit}
                                    disabled={isConfirmed || isAutoSelecting || playing11.length < 11 || impactPlayers.length < 4 || !hasWK}
                                    className={`w-full py-4 rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] transition-all
                                        ${(isConfirmed) ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-white/10 text-white hover:bg-white/20'}
                                        ${(playing11.length < 11 || impactPlayers.length < 4 || !hasWK) && !isConfirmed ? 'opacity-30 cursor-not-allowed' : ''}
                                    `}
                                >
                                    {isConfirmed ? '✓ Selection Locked' : 'Confirm Tactical Roster'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Toast Notification Modal */}
            <AnimatePresence>
                {toast && (
                    <motion.div
                        initial={{ opacity: 0, y: -20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -20, scale: 0.95 }}
                        className="fixed top-4 left-1/2 -translate-x-1/2 z-[300] w-[calc(100%-2rem)] max-w-sm"
                    >
                        <div
                            className={`flex items-center gap-2 sm:gap-3 p-2.5 sm:p-4 rounded-xl sm:rounded-2xl border shadow-2xl backdrop-blur-xl ${
                                toast.type === "error"
                                ? "bg-red-500/20 border-red-500/30"
                                : toast.type === "warning"
                                    ? "bg-yellow-500/20 border-yellow-500/30 text-yellow-500"
                                    : "bg-yellow-400/20 border-yellow-400/30 text-yellow-400"
                                }`}
                        >
                            {/* Icon */}
                            <div
                                className={`shrink-0 w-7 h-7 sm:w-10 sm:h-10 rounded-full flex items-center justify-center ${
                                    toast.type === "error"
                                    ? "bg-red-500/30"
                                    : toast.type === "warning"
                                        ? "bg-yellow-500/30"
                                        : "bg-yellow-400/30"
                                    }`}
                            >
                                {toast.type === "error" ? (
                                    <X className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-red-500" />
                                ) : toast.type === "success" ? (
                                    <CheckCircle2 className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-yellow-400" />
                                ) : (
                                    <AlertTriangle className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-yellow-500" />
                                )}
                            </div>

                            {/* Message */}
                            <div className="flex-1 min-w-0">
                                <p className={`text-[10px] sm:text-sm font-black leading-tight tracking-tight uppercase ${
                                    toast.type === "error" ? "text-red-400" : "text-yellow-50"
                                }`}>
                                    {toast.message}
                                </p>
                            </div>

                            {/* Large Hit Area Close Button */}
                            <button
                                onClick={() => setToast(null)}
                                className="shrink-0 -mr-1 p-3 active:scale-95 transition-all text-white/40 hover:text-white"
                                aria-label="Close notification"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default SquadSelection;
