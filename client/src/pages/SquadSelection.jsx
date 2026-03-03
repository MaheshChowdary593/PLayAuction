import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Plane } from 'lucide-react';
import { useSession } from '../context/SessionContext';

const SquadSelection = () => {
    const { roomCode } = useParams();
    const navigate = useNavigate();
    const { socket } = useSocket();

    const [squad, setSquad] = useState([]);
    const [playing11, setPlaying11] = useState([]);
    const [impactPlayers, setImpactPlayers] = useState([]);
    const [selectionMode, setSelectionMode] = useState('playing11'); // 'playing11' or 'impact'
    const [timer, setTimer] = useState(240);
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

        socket.on('results_ready', () => navigate(`/results/${roomCode}`));

        socket.on('error', (msg) => {
            if (msg.includes('AI Selection failed')) setIsAutoSelecting(false);
            setToast({ message: msg, type: 'error' });
        });

        return () => {
            socket.off('room_joined');
            socket.off('selection_timer_tick');
            socket.off('selection_confirmed');
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

        // Add to active selection pool
        if (selectionMode === 'playing11') {
            if (playing11.length < 11) {
                setPlaying11([...playing11, id]);
            } else {
                setToast({ message: "Playing 11 is full. Switch to Impact Players.", type: 'warning' });
            }
        } else {
            if (impactPlayers.length < 4) {
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
                        <div className="text-3xl md:text-5xl font-black font-mono text-yellow-500 mb-1">{formatTime(timer)}</div>
                        <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Election Deadline</div>
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
                                    disabled={isConfirmed || isAutoSelecting || playing11.length < 11 || impactPlayers.length < 4}
                                    className={`w-full py-4 rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] transition-all
                                        ${(isConfirmed) ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-white/10 text-white hover:bg-white/20'}
                                        ${(playing11.length < 11 || impactPlayers.length < 4) && !isConfirmed ? 'opacity-30 cursor-not-allowed' : ''}
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

export default SquadSelection;
