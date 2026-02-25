import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';
import { motion, AnimatePresence } from 'framer-motion';

const IPL_TEAMS = [
    { id: 'MI', name: 'Mumbai Indians', color: '#004BA0' },
    { id: 'CSK', name: 'Chennai Super Kings', color: '#FFFF3C' },
    { id: 'RCB', name: 'Royal Challengers Bengaluru', color: '#EC1C24' },
    { id: 'KKR', name: 'Kolkata Knight Riders', color: '#2E0854' },
    { id: 'DC', name: 'Delhi Capitals', color: '#00008B' },
    { id: 'PBKS', name: 'Punjab Kings', color: '#ED1B24' },
    { id: 'RR', name: 'Rajasthan Royals', color: '#EA1A85' },
    { id: 'DCG', name: 'Deccan Chargers', color: '#D1E1EF' },
    { id: 'KTK', name: 'Kochi Tuskers Kerala', color: '#F15A24' },
    { id: 'PWI', name: 'Pune Warriors India', color: '#40E0D0' },
    { id: 'SRH', name: 'Sunrisers Hyderabad', color: '#FF822A' },
    { id: 'RPS', name: 'Rising Pune Supergiant', color: '#D11D70' },
    { id: 'GL', name: 'Gujarat Lions', color: '#E04F16' },
    { id: 'LSG', name: 'Lucknow Super Giants', color: '#00D1FF' },
    { id: 'GT', name: 'Gujarat Titans', color: '#1B2133' },
];

const Lobby = () => {
    const [selectedTeamId, setSelectedTeamId] = useState('');
    const [playerName, setPlayerName] = useState('');
    const [roomCodeInput, setRoomCodeInput] = useState('');
    const [isJoined, setIsJoined] = useState(false);
    const [roomState, setRoomState] = useState(null);
    const [error, setError] = useState('');
    const socket = useSocket();
    const navigate = useNavigate();

    useEffect(() => {
        if (!socket) return;

        socket.on('room_created', ({ roomCode, state }) => {
            setRoomState(state);
            setIsJoined(true);
            setError('');
        });

        socket.on('room_joined', ({ roomCode, state }) => {
            setRoomState(state);
            setIsJoined(true);
            setError('');
        });

        socket.on('lobby_update', ({ teams }) => {
            setRoomState(prev => prev ? { ...prev, teams } : null);
        });

        socket.on('error', (msg) => {
            setError(msg);
        });

        socket.on('auction_started', ({ state }) => {
            navigate(`/auction/${state.roomCode}`, { state: { roomState: state } });
        });

        return () => {
            socket.off('room_created');
            socket.off('room_joined');
            socket.off('lobby_update');
            socket.off('error');
            socket.off('auction_started');
        };
    }, [socket, navigate]);

    const handleCreate = () => {
        if (!playerName) return setError('Please enter your name');
        if (!selectedTeamId) return setError('Please select a franchise');
        socket.emit('create_room', { playerName, teamId: selectedTeamId });
    };

    const handleJoin = () => {
        if (!playerName || !roomCodeInput) return setError('Name and Room Code required');
        if (!selectedTeamId) return setError('Please select a franchise');
        socket.emit('join_room', { roomCode: roomCodeInput, playerName, teamId: selectedTeamId });
    };

    const handleStart = () => {
        socket.emit('start_auction', { roomCode: roomState.roomCode });
    };

    return (
        <div className="min-h-screen w-full flex items-center justify-center p-6 relative overflow-hidden bg-darkBg">

            {/* Background elements */}
            <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-blue-900/10 to-transparent pointer-events-none"></div>

            <div className="w-full max-w-4xl grid md:grid-cols-2 gap-12 items-center relative z-10">

                {/* Brand Side */}
                <motion.div
                    initial={{ x: -100, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    className="space-y-8"
                >
                    <div>
                        <motion.div
                            initial={{ scale: 0.8 }}
                            animate={{ scale: 1 }}
                            className="bg-white/5 border border-white/10 w-20 h-20 rounded-3xl mb-6 flex items-center justify-center"
                        >
                            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="#00d2ff" />
                                <path d="M2 17L12 22L22 17" stroke="#9333ea" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                <path d="M2 12L12 17L22 12" stroke="#00d2ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </motion.div>
                        <h1 className="text-7xl font-black italic tracking-tighter leading-none text-white uppercase mb-4">
                            IPL <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">Auction</span>
                        </h1>
                        <p className="text-slate-500 text-lg font-bold leading-relaxed max-w-sm">
                            Real-time multiplayer bidding arena. Draft your dream XI against rivals.
                        </p>
                    </div>

                    <div className="flex gap-4">
                        <div className="px-5 py-3 glass-panel rounded-2xl border-white/5 flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Low Latency Engine</span>
                        </div>
                        <div className="px-5 py-3 glass-panel rounded-2xl border-white/5 flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Gemini AI Ratings</span>
                        </div>
                    </div>
                </motion.div>

                {/* Interaction Side */}
                <motion.div
                    initial={{ x: 100, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    className="glass-card rounded-[40px] p-10 border-white/5 relative"
                >
                    <AnimatePresence mode="wait">
                        {!isJoined ? (
                            <motion.div
                                key="entry"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="space-y-6"
                            >
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">The Gaffer's Name</label>
                                        <input
                                            type="text"
                                            placeholder="Enter your name..."
                                            className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 focus:outline-none focus:border-blue-500/50 text-white font-bold transition-all"
                                            value={playerName}
                                            onChange={(e) => setPlayerName(e.target.value)}
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Select Franchise</label>
                                        <div className="grid grid-cols-4 gap-2 max-h-36 overflow-y-auto custom-scrollbar pr-2">
                                            {IPL_TEAMS.map(team => (
                                                <button
                                                    key={team.id}
                                                    onClick={() => setSelectedTeamId(team.id)}
                                                    className={`p-2 rounded-xl border text-[9px] font-black tracking-wider uppercase transition-all flex flex-col items-center justify-center gap-2 ${selectedTeamId === team.id ? 'bg-white/20 border-white/40 shadow-[0_0_15px_rgba(255,255,255,0.1)] scale-105 z-10' : 'bg-white/5 border-white/5 hover:bg-white/10'
                                                        }`}
                                                >
                                                    <div className="w-full h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: team.color }}></div>
                                                    <span className="truncate w-full text-center text-slate-300">{team.id}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <div className="h-px bg-white/5 my-6"></div>

                                <div className="grid grid-cols-2 gap-4">
                                    <button onClick={handleCreate} className="btn-premium flex flex-col items-center justify-center gap-2 p-6 h-auto">
                                        <span className="text-[10px] font-black uppercase tracking-widest opacity-50">Create New</span>
                                        <span className="font-black text-xl">ROOM</span>
                                    </button>
                                    <div className="space-y-4">
                                        <input
                                            type="text"
                                            placeholder="Room Code"
                                            className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-4 text-center text-white font-black tracking-[0.2em] focus:outline-none focus:border-purple-500/50"
                                            value={roomCodeInput}
                                            onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
                                        />
                                        <button onClick={handleJoin} className="w-full bg-white/10 hover:bg-white text-white hover:text-darkBg font-black py-4 rounded-2xl transition-all uppercase text-xs tracking-widest">
                                            Join Room
                                        </button>
                                    </div>
                                </div>
                                {error && <p className="text-red-500 text-[10px] font-black uppercase tracking-widest text-center">{error}</p>}
                            </motion.div>
                        ) : (
                            <motion.div
                                key="lobby"
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="space-y-8"
                            >
                                <div className="text-center">
                                    <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mb-2">Room Assigned</h2>
                                    <div className="text-5xl font-black text-white tracking-[0.1em]">{roomState.roomCode}</div>
                                </div>

                                <div className="space-y-4">
                                    <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Connected Owners</h3>
                                    <div className="grid grid-cols-2 gap-3 max-h-[200px] overflow-y-auto custom-scrollbar pr-2">
                                        {roomState.teams.map((t, i) => (
                                            <div key={i} className="glass-panel p-4 rounded-2xl border-white/5 flex items-center gap-3">
                                                <div className="w-1.5 h-6 rounded-full" style={{ backgroundColor: t.teamThemeColor }}></div>
                                                <div className="overflow-hidden">
                                                    <div className="text-[9px] font-black text-white uppercase truncate">{t.teamName}</div>
                                                    <div className="text-[10px] text-slate-500 font-bold truncate">{t.ownerName} {t.ownerSocketId === roomState.host && '(Host)'}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {roomState.host === socket.id ? (
                                    <button
                                        onClick={handleStart}
                                        className="w-full btn-premium bg-white shadow-[0_0_50px_rgba(255,255,255,0.2)]"
                                    >
                                        Initiate Auction Loop
                                    </button>
                                ) : (
                                    <div className="w-full p-6 rounded-2xl bg-white/5 border border-white/10 text-center">
                                        <div className="text-white/30 text-[10px] font-black uppercase tracking-[0.2em] animate-pulse">Waiting for host to start...</div>
                                    </div>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.div>

            </div>
        </div>
    );
};

export default Lobby;
