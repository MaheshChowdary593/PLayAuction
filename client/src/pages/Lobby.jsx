import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';
import { motion, AnimatePresence } from 'framer-motion';

const IPL_TEAMS = [
    { id: 'MI', name: 'Mumbai Indians', color: '#004BA0', logoUrl: 'https://upload.wikimedia.org/wikipedia/en/thumb/c/cd/Mumbai_Indians_Logo.svg/1200px-Mumbai_Indians_Logo.svg.png' },
    { id: 'CSK', name: 'Chennai Super Kings', color: '#FFFF3C', logoUrl: 'https://upload.wikimedia.org/wikipedia/en/thumb/2/2b/Chennai_Super_Kings_Logo.svg/1200px-Chennai_Super_Kings_Logo.svg.png' },
    { id: 'RCB', name: 'Royal Challengers Bengaluru', color: '#EC1C24', logoUrl: 'https://upload.wikimedia.org/wikipedia/en/thumb/2/2a/Royal_Challengers_Bangalore_2020.svg/1200px-Royal_Challengers_Bangalore_2020.svg.png' },
    { id: 'KKR', name: 'Kolkata Knight Riders', color: '#2E0854', logoUrl: 'https://upload.wikimedia.org/wikipedia/en/thumb/4/4c/Kolkata_Knight_Riders_Logo.svg/1200px-Kolkata_Knight_Riders_Logo.svg.png' },
    { id: 'DC', name: 'Delhi Capitals', color: '#00008B', logoUrl: 'https://upload.wikimedia.org/wikipedia/en/thumb/f/f5/Delhi_Capitals_Logo.svg/1200px-Delhi_Capitals_Logo.svg.png' },
    { id: 'PBKS', name: 'Punjab Kings', color: '#ED1B24', logoUrl: 'https://upload.wikimedia.org/wikipedia/en/thumb/d/d4/Punjab_Kings_Logo.svg/1200px-Punjab_Kings_Logo.svg.png' },
    { id: 'RR', name: 'Rajasthan Royals', color: '#EA1A85', logoUrl: 'https://upload.wikimedia.org/wikipedia/en/thumb/6/60/Rajasthan_Royals_Logo.svg/1200px-Rajasthan_Royals_Logo.svg.png' },
    { id: 'SRH', name: 'Sunrisers Hyderabad', color: '#FF822A', logoUrl: 'https://upload.wikimedia.org/wikipedia/en/thumb/8/81/Sunrisers_Hyderabad.svg/1200px-Sunrisers_Hyderabad.svg.png' },
    { id: 'LSG', name: 'Lucknow Super Giants', color: '#00D1FF', logoUrl: 'https://upload.wikimedia.org/wikipedia/en/thumb/a/a9/Lucknow_Super_Giants_IPL_Logo.svg/1200px-Lucknow_Super_Giants_IPL_Logo.svg.png' },
    { id: 'GT', name: 'Gujarat Titans', color: '#1B2133', logoUrl: 'https://upload.wikimedia.org/wikipedia/en/thumb/0/09/Gujarat_Titans_Logo.svg/1200px-Gujarat_Titans_Logo.svg.png' },
    { id: 'DCG', name: 'Deccan Chargers', color: '#D1E1EF', logoUrl: 'https://upload.wikimedia.org/wikipedia/en/thumb/a/aa/Deccan_Chargers_Logo.svg/1200px-Deccan_Chargers_Logo.svg.png' },
    { id: 'KTK', name: 'Kochi Tuskers Kerala', color: '#F15A24', logoUrl: 'https://upload.wikimedia.org/wikipedia/en/thumb/8/8b/Kochi_Tuskers_Kerala_Logo.svg/1200px-Kochi_Tuskers_Kerala_Logo.svg.png' },
    { id: 'PWI', name: 'Pune Warriors India', color: '#40E0D0', logoUrl: 'https://upload.wikimedia.org/wikipedia/en/thumb/4/4b/Pune_Warriors_India_Logo.svg/1200px-Pune_Warriors_India_Logo.svg.png' },
    { id: 'RPS', name: 'Rising Pune Supergiant', color: '#D11D70', logoUrl: 'https://upload.wikimedia.org/wikipedia/en/thumb/7/75/Rising_Pune_Supergiant_Logo.svg/1200px-Rising_Pune_Supergiant_Logo.svg.png' },
    { id: 'GL', name: 'Gujarat Lions', color: '#E04F16', logoUrl: 'https://upload.wikimedia.org/wikipedia/en/thumb/3/30/Gujarat_Lions_Logo.svg/1200px-Gujarat_Lions_Logo.svg.png' },
];

const Lobby = () => {
    const [selectedTeamId, setSelectedTeamId] = useState('');
    const [playerName, setPlayerName] = useState('');
    const [roomCodeInput, setRoomCodeInput] = useState('');
    const [isJoined, setIsJoined] = useState(false);
    const [roomState, setRoomState] = useState(null);
    const [error, setError] = useState('');

    // New state for dynamic team selection during join flow
    const [joinMode, setJoinMode] = useState(false);
    const [availableTeamsForRoom, setAvailableTeamsForRoom] = useState(null);

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

        socket.on('available_teams', ({ teams }) => {
            setAvailableTeamsForRoom(teams);
            setError('');
        });

        socket.on('error', (msg) => {
            setError(msg);
        });

        socket.on('auction_started', ({ state }) => {
            navigate(`/auction/${state.roomCode}`, { state: { roomState: state } });
        });

        socket.on('kicked_from_room', () => {
            setIsJoined(false);
            setRoomState(null);
            setHasClaimedTeam(false);
            setError('You have been removed from the room by the host.');
        });

        return () => {
            socket.off('room_created');
            socket.off('room_joined');
            socket.off('lobby_update');
            socket.off('available_teams');
            socket.off('error');
            socket.off('auction_started');
            socket.off('kicked_from_room');
        };
    }, [socket, navigate]);

    const handleCreate = () => {
        if (!playerName) return setError('Please enter your name');
        socket.emit('create_room', { playerName });
    };

    const handleJoin = () => {
        if (!playerName || !roomCodeInput) return setError('Name and Room Code required');
        socket.emit('join_room', { roomCode: roomCodeInput, playerName });
    };

    const handleClaimTeam = () => {
        if (!selectedTeamId) return setError('Select a franchise first');
        socket.emit('claim_team', { roomCode: roomState.roomCode, playerName, teamId: selectedTeamId });
    };

    const handleStart = () => {
        socket.emit('start_auction', { roomCode: roomState.roomCode });
    };

    const myTeam = roomState?.teams?.find(t => t.ownerSocketId === socket.id);
    const hasClaimedTeam = !!myTeam;

    // Use available teams from state if present, otherwise fallback to IPL_TEAMS
    const displayTeams = availableTeamsForRoom || IPL_TEAMS;

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

                                    <button onClick={handleCreate} className="w-full btn-premium py-4 mt-2">CREATE NEW ROOM</button>
                                </div>

                                <div className="flex items-center gap-4 my-6">
                                    <div className="h-px bg-white/10 flex-1"></div>
                                    <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">OR JOIN EXISTING</span>
                                    <div className="h-px bg-white/10 flex-1"></div>
                                </div>

                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        placeholder="Enter Room Code"
                                        className="w-2/3 bg-white/5 border border-white/10 rounded-2xl px-4 py-4 text-center text-white font-black tracking-[0.2em] focus:outline-none focus:border-purple-500/50 uppercase"
                                        value={roomCodeInput}
                                        onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
                                    />
                                    <button onClick={handleJoin} className="w-1/3 bg-blue-600 hover:bg-blue-500 text-white font-black py-4 rounded-2xl transition-all uppercase text-[10px] tracking-wider shadow-[0_0_20px_rgba(37,99,235,0.4)]">
                                        JOIN
                                    </button>
                                </div>

                                {error && <p className="text-red-500 text-[10px] font-black uppercase tracking-widest text-center mt-2">{error}</p>}
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

                                {!hasClaimedTeam ? (
                                    <div className="space-y-4 bg-white/5 p-4 rounded-3xl border border-white/10">
                                        <h3 className="text-[10px] font-black text-blue-400 uppercase tracking-widest text-center">Step 2: Claim Your Franchise</h3>
                                        <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto custom-scrollbar pr-2">
                                            {displayTeams.map(team => {
                                                const tId = team.shortName || team.id;
                                                const tColor = team.primaryColor || team.color;
                                                return (
                                                    <button
                                                        key={tId}
                                                        onClick={() => setSelectedTeamId(tId)}
                                                        className={`p-2 rounded-xl border text-[9px] font-black tracking-wider uppercase transition-all flex flex-col items-center justify-center gap-2 ${selectedTeamId === tId ? 'bg-blue-500/40 border-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.3)] scale-105 z-10' : 'bg-white/5 border-white/5 hover:bg-white/10'
                                                            }`}
                                                    >
                                                        <img src={team.logoUrl} alt={tId} className="w-10 h-10 object-contain drop-shadow-lg" />
                                                        <span className="truncate w-full text-center text-slate-300">{tId}</span>
                                                    </button>
                                                )
                                            })}
                                        </div>
                                        <button onClick={handleClaimTeam} className="w-full bg-blue-600 text-white font-black py-3 rounded-xl hover:bg-blue-500 transition-all uppercase tracking-widest text-[10px] mt-2">
                                            SECURE FRANCHISE
                                        </button>
                                        {error && <p className="text-red-500 text-[10px] font-black uppercase tracking-widest text-center">{error}</p>}
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Connected Owners</h3>
                                        <div className="grid grid-cols-2 gap-3 max-h-[200px] overflow-y-auto custom-scrollbar pr-2">
                                            {roomState.teams.map((t, i) => (
                                                <div key={i} className="glass-panel p-4 rounded-2xl border-white/5 flex items-center gap-3 relative">
                                                    <div className="w-1.5 h-6 rounded-full" style={{ backgroundColor: t.teamThemeColor }}></div>

                                                    {t.teamLogo ? (
                                                        <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center p-1 border border-white/10 shrink-0">
                                                            <img src={t.teamLogo} alt={t.teamName} className="w-full h-full object-contain" />
                                                        </div>
                                                    ) : (
                                                        <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center shrink-0 border border-white/10">
                                                            <span className="text-[10px] font-black text-white">{t.teamName.charAt(0)}</span>
                                                        </div>
                                                    )}

                                                    <div className="flex-1 overflow-hidden pr-4">
                                                        <div className="text-[9px] font-black text-white uppercase truncate">{t.teamName}</div>
                                                        <div className="text-[10px] text-slate-500 font-bold truncate">{t.ownerName} {t.ownerSocketId === roomState.host && '(Host)'}</div>
                                                    </div>

                                                    {roomState.host === socket.id && t.ownerSocketId !== socket.id && (
                                                        <button
                                                            onClick={() => {
                                                                if (window.confirm(`Are you sure you want to kick ${t.ownerName} from the room?`)) {
                                                                    socket.emit('kick_player', { roomCode: roomState.roomCode, targetSocketId: t.ownerSocketId });
                                                                }
                                                            }}
                                                            className="absolute top-2 right-2 text-slate-500 hover:text-red-500 bg-black/20 hover:bg-red-500/10 w-6 h-6 rounded-full flex items-center justify-center transition-all"
                                                            title="Kick Player"
                                                        >
                                                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                                                <line x1="6" y1="6" x2="18" y2="18"></line>
                                                            </svg>
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>

                                        {roomState.host === socket.id ? (
                                            <button
                                                onClick={handleStart}
                                                className="w-full btn-premium bg-white shadow-[0_0_50px_rgba(255,255,255,0.2)] mt-4"
                                            >
                                                Initiate Auction Loop
                                            </button>
                                        ) : (
                                            <div className="w-full p-6 rounded-2xl bg-white/5 border border-white/10 text-center mt-4">
                                                <div className="text-white/30 text-[10px] font-black uppercase tracking-[0.2em] animate-pulse">Waiting for host to start...</div>
                                            </div>
                                        )}
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
