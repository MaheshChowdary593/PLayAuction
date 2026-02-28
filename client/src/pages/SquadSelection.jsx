import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Plane } from 'lucide-react';
import { useSession } from '../context/SessionContext';

const SquadSelection = () => {
    const { roomCode } = useParams();
    const navigate = useNavigate();
    const socket = useSocket();

    const [squad, setSquad] = useState([]);
    const [selectedIds, setSelectedIds] = useState([]);
    const [timer, setTimer] = useState(120);
    const [isAutoSelecting, setIsAutoSelecting] = useState(false);
    const [isConfirmed, setIsConfirmed] = useState(false);
    const [roomState, setRoomState] = useState(null);
    const [toast, setToast] = useState(null);
    const { userId, isReady: isSessionReady } = useSession();
    const [isSocketReady, setIsSocketReady] = useState(false);

    // Local timer interpolation to prevent "stopping" feeling if connection hiccups
    useEffect(() => {
        const interval = setInterval(() => {
            setTimer((prev) => (prev > 0 ? prev - 1 : 0));
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (!socket || !roomCode || !isSessionReady) return;
        setIsSocketReady(true);

        // Fetch initial state via API for fast hydrate
        const fetchState = async () => {
            try {
                const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5050';
                const res = await fetch(`${apiUrl}/api/room/${roomCode}`);
                if (!res.ok) throw new Error("Room not found");
                const data = await res.json();
                setRoomState(data);

                // Use secure userId for team identification
                const myTeam = data.franchisesInRoom.find(t => t.ownerUserId === userId);
                if (myTeam) {
                    setSquad(myTeam.playersAcquired || []);
                    if (myTeam.playing15 && myTeam.playing15.length > 0) {
                        setSelectedIds(myTeam.playing15);
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

        // Also join the room via socket to ensure socket ID is updated on server
        socket.emit('join_room', { roomCode });

        const handleRoomJoined = ({ state }) => {
            setRoomState(state);
            // If we find our team in the live update, sync it
            const myTeam = state.teams?.find(t => t.ownerUserId === userId);
            if (myTeam) {
                setSquad(myTeam.playersAcquired || []);
                if (myTeam.playing15 && myTeam.playing15.length > 0) {
                    setSelectedIds(myTeam.playing15);
                    setIsConfirmed(true);
                }
            }
        };

        socket.on('room_joined', handleRoomJoined);
        socket.on('selection_timer_tick', ({ timer }) => {
            setTimer(timer);
        });

        socket.on('selection_confirmed', ({ playing15 }) => {
            setSelectedIds(playing15);
            setIsConfirmed(true);
            setIsAutoSelecting(false);
        });

        socket.on('results_ready', () => {
            navigate(`/results/${roomCode}`);
        });

        socket.on('error', (msg) => {
            if (msg.includes('AI Selection failed')) {
                setIsAutoSelecting(false);
            }
            setToast({ message: msg, type: 'error' });
        });

        return () => {
            socket.off('room_joined', handleRoomJoined);
            socket.off('selection_timer_tick');
            socket.off('selection_confirmed');
            socket.off('results_ready');
            socket.off('error');
        };
    }, [socket, roomCode, navigate, isSessionReady, userId]);

    const togglePlayer = (id) => {
        if (isConfirmed) return;
        if (selectedIds.includes(id)) {
            setSelectedIds(selectedIds.filter(i => i !== id));
        } else {
            if (selectedIds.length < 15) {
                setSelectedIds([...selectedIds, id]);
            }
        }
    };

    const handleManualSubmit = () => {
        if (selectedIds.length < 15 && squad.length >= 15) {
            setToast({ message: "Please select exactly 15 players (or all if you have fewer).", type: 'warning' });
            return;
        }
        socket.emit('manual_select_playing_15', { roomCode, playerIds: selectedIds });
    };

    const handleAutoSelect = () => {
        setIsAutoSelecting(true);
        socket.emit('auto_select_playing_15', { roomCode });
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
                <h2 className="text-xl font-black uppercase tracking-[0.3em] mb-2">Reconciling Session</h2>
                <p className="text-slate-500 text-sm max-w-xs font-bold uppercase tracking-widest animate-pulse">
                    Restoring your squad data...
                </p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-darkBg text-white p-4 sm:p-8 font-sans">
            <div className="max-w-6xl mx-auto">
                <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-8 md:mb-12 gap-4">
                    <div>
                        <h1 className="text-[8px] md:text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] mb-2">Auction Concluded / Phase 2</h1>
                        <h2 className="text-4xl md:text-5xl lg:text-6xl font-black italic tracking-tighter uppercase leading-none">
                            Squad <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">Selection</span>
                        </h2>
                    </div>
                    <div className="text-left sm:text-right">
                        <div className="text-3xl md:text-4xl font-black font-mono text-yellow-500 mb-1">{formatTime(timer)}</div>
                        <div className="text-[8px] md:text-[10px] font-black text-slate-500 uppercase tracking-widest">Time Remaining</div>
                    </div>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
                    <div className="lg:col-span-2">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-base md:text-lg lg:text-xl font-black uppercase tracking-tight">Your Drafted Squad ({squad.length} Players)</h3>
                            <div className="text-[10px] md:text-xs lg:text-sm font-bold text-slate-400">
                                Selected: <span className={selectedIds.length === 15 ? 'text-green-400' : 'text-yellow-500'}>{selectedIds.length} / 15</span>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {squad.map((entry, idx) => {
                                const isSelected = selectedIds.includes(entry.player);
                                return (
                                    <motion.div
                                        key={idx}
                                        whileHover={{ scale: 1.02 }}
                                        onClick={() => togglePlayer(entry.player)}
                                        className={`
                                            p-4 rounded-2xl border cursor-pointer transition-all flex items-center justify-between
                                            ${isSelected ? 'bg-blue-600/20 border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.2)]' : 'bg-white/5 border-white/5 hover:border-white/20'}
                                            ${isConfirmed ? 'opacity-70 cursor-default' : ''}
                                        `}
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${isSelected ? 'bg-blue-500 border-blue-400' : 'border-white/20'}`}>
                                                {isSelected && <div className="w-2 h-2 bg-white rounded-full"></div>}
                                            </div>
                                            <div>
                                                <div className="font-bold text-sm flex items-center gap-2">
                                                    {entry.name}
                                                    {entry.isOverseas && (
                                                        <Plane
                                                            className="w-3 h-3 text-yellow-500 -rotate-45"
                                                            fill="rgba(234, 179, 8, 0.4)"
                                                        />
                                                    )}
                                                </div>
                                                <div className="text-[10px] text-slate-500 uppercase font-black tracking-widest">₹{entry.boughtFor}L</div>
                                            </div>
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div className="glass-card p-6 md:p-8 rounded-[32px] border-white/10 sticky top-8">
                            <h3 className="text-base md:text-lg font-black uppercase tracking-widest mb-6">Selection Method</h3>

                            <button
                                onClick={handleAutoSelect}
                                disabled={isConfirmed || isAutoSelecting}
                                className={`w-full py-4 rounded-xl font-black uppercase tracking-widest text-[10px] md:text-xs mb-4 transition-all flex items-center justify-center gap-2
                                    ${isAutoSelecting ? 'bg-white/5 text-slate-500 animate-pulse' : 'bg-gradient-to-r from-purple-600 to-blue-600 hover:scale-[1.02] shadow-lg shadow-blue-900/20'}
                                    ${isConfirmed ? 'opacity-50 grayscale' : ''}
                                `}
                            >
                                {isAutoSelecting ? '🤖 AI Strategizing...' : '🤖 Auto Select (Gemini AI)'}
                            </button>

                            <p className="text-[9px] md:text-[10px] text-slate-500 font-bold leading-relaxed mb-6 md:mb-8 px-2">
                                * AI uses real-world player stats, T20 logic, and tactical balance to pick your optimal 15.
                            </p>

                            <div className="h-px bg-white/5 mb-6 md:mb-8"></div>

                            <button
                                onClick={handleManualSubmit}
                                disabled={isConfirmed || isAutoSelecting || (selectedIds.length < 15 && squad.length >= 15)}
                                className={`w-full py-4 rounded-xl font-black uppercase tracking-widest text-[10px] md:text-xs transition-all
                                    ${(isConfirmed || selectedIds.length === 15) ? 'bg-green-500 text-white' : 'bg-white/10 text-white hover:bg-white/20'}
                                    ${(selectedIds.length < 15 && squad.length >= 15) ? 'opacity-30 cursor-not-allowed' : ''}
                                `}
                            >
                                {isConfirmed ? '✓ Selection Confirmed' : 'Confirm Manual Selection'}
                            </button>

                            {isConfirmed && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="mt-6 text-center text-green-400 font-black uppercase text-[10px] tracking-widest animate-pulse"
                                >
                                    Waiting for other franchisers...
                                </motion.div>
                            )}
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
