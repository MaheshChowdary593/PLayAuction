import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';
import { motion, AnimatePresence } from 'framer-motion';

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

    // Local timer interpolation to prevent "stopping" feeling if connection hiccups
    useEffect(() => {
        const interval = setInterval(() => {
            setTimer((prev) => (prev > 0 ? prev - 1 : 0));
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (!socket) return;

        // Fetch initial state
        const fetchState = async () => {
            try {
                const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5050';
                const res = await fetch(`${apiUrl}/api/room/${roomCode}`);
                const data = await res.json();
                setRoomState(data);

                const myTeam = data.franchisesInRoom.find(t => t.ownerSocketId === socket.id);
                if (myTeam) {
                    setSquad(myTeam.playersAcquired);
                    if (myTeam.playing15 && myTeam.playing15.length > 0) {
                        setSelectedIds(myTeam.playing15);
                        setIsConfirmed(true);
                    }
                }
            } catch (err) {
                console.error("Failed to fetch room state:", err);
            }
        };

        fetchState();

        socket.on('selection_timer_tick', ({ timer }) => {
            // Sync local timer with server authority
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
            alert(msg);
        });

        return () => {
            socket.off('selection_timer_tick');
            socket.off('selection_confirmed');
            socket.off('results_ready');
            socket.off('error');
        };
    }, [socket, roomCode, navigate]);

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
            alert("Please select exactly 15 players (or all if you have fewer).");
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

    return (
        <div className="min-h-screen bg-darkBg text-white p-8 font-sans">
            <div className="max-w-6xl mx-auto">
                <header className="flex justify-between items-end mb-12">
                    <div>
                        <h1 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] mb-2">Auction Concluded / Phase 2</h1>
                        <h2 className="text-6xl font-black italic tracking-tighter uppercase leading-none">
                            Squad <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">Selection</span>
                        </h2>
                    </div>
                    <div className="text-right">
                        <div className="text-4xl font-black font-mono text-yellow-500 mb-1">{formatTime(timer)}</div>
                        <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Time Remaining</div>
                    </div>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
                    <div className="lg:col-span-2">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg lg:text-xl font-black uppercase tracking-tight">Your Drafted Squad ({squad.length} Players)</h3>
                            <div className="text-xs lg:text-sm font-bold text-slate-400">
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
                                                <div className="font-bold text-sm flex items-center gap-1">
                                                    {entry.name}
                                                    {entry.isOverseas && <span title="Overseas Player">✈️</span>}
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
                        <div className="glass-card p-8 rounded-[32px] border-white/10 sticky top-8">
                            <h3 className="text-lg font-black uppercase tracking-widest mb-6">Selection Method</h3>

                            <button
                                onClick={handleAutoSelect}
                                disabled={isConfirmed || isAutoSelecting}
                                className={`w-full py-4 rounded-xl font-black uppercase tracking-widest text-xs mb-4 transition-all flex items-center justify-center gap-2
                                    ${isAutoSelecting ? 'bg-white/5 text-slate-500 animate-pulse' : 'bg-gradient-to-r from-purple-600 to-blue-600 hover:scale-[1.02] shadow-lg shadow-blue-900/20'}
                                    ${isConfirmed ? 'opacity-50 grayscale' : ''}
                                `}
                            >
                                {isAutoSelecting ? '🤖 AI Strategizing...' : '🤖 Auto Select (Gemini AI)'}
                            </button>

                            <p className="text-[10px] text-slate-500 font-bold leading-relaxed mb-8 px-2">
                                * AI uses real-world player stats, T20 logic, and tactical balance to pick your optimal 15.
                            </p>

                            <div className="h-px bg-white/5 mb-8"></div>

                            <button
                                onClick={handleManualSubmit}
                                disabled={isConfirmed || isAutoSelecting || (selectedIds.length < 15 && squad.length >= 15)}
                                className={`w-full py-4 rounded-xl font-black uppercase tracking-widest text-xs transition-all
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
        </div>
    );
};

export default SquadSelection;
