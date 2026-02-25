import React, { useEffect, useState, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from 'framer-motion';
import GavelSlam from '../components/GavelSlam';

import { playBidSound, playWarningBeep } from '../utils/soundEngine';

const AuctionPodium = () => {
    const { roomCode } = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const socket = useSocket();

    const [gameState, setGameState] = useState(location.state?.roomState || null);
    const [currentPlayer, setCurrentPlayer] = useState(null);
    const [currentBid, setCurrentBid] = useState({ amount: 0, teamId: null, teamName: null, teamColor: null });
    const [timer, setTimer] = useState(10);
    const [myTeam, setMyTeam] = useState(null);
    const [soldEvent, setSoldEvent] = useState(null);
    const [isPaused, setIsPaused] = useState(false);

    const [activeTeams, setActiveTeams] = useState(gameState?.teams || []);
    const [bidHistory, setBidHistory] = useState([]);
    const [expandedTeamId, setExpandedTeamId] = useState(null);

    // 3D Card Tilt Logic
    const x = useMotionValue(0);
    const y = useMotionValue(0);
    const mouseXSpring = useSpring(x);
    const mouseYSpring = useSpring(y);
    const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], ["10deg", "-10deg"]);
    const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], ["-10deg", "10deg"]);

    const handleMouseMove = (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const width = rect.width;
        const height = rect.height;
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        x.set(mouseX / width - 0.5);
        y.set(mouseY / height - 0.5);
    };

    const handleMouseLeave = () => {
        x.set(0);
        y.set(0);
    };

    useEffect(() => {
        if (!socket || !gameState) return;

        const team = gameState.teams.find(t => t.ownerSocketId === socket.id);
        if (team) setMyTeam(team);

        socket.on('new_player', ({ player, timer }) => {
            setCurrentPlayer(player);
            setTimer(timer);
            setCurrentBid({ amount: 0, teamId: null, teamName: null, teamColor: null });
            setSoldEvent(null);
            setBidHistory([]);
        });

        socket.on('timer_tick', ({ timer }) => {
            setTimer((prevTimer) => {
                // Only beep when it distinctly transitions into a warning second
                if (timer > 0 && timer <= 3 && timer !== prevTimer) {
                    playWarningBeep();
                }
                return timer;
            });
        });

        socket.on('bid_placed', ({ currentBid, timer }) => {
            setCurrentBid(currentBid);
            setTimer(timer);
            setBidHistory(prev => [
                { id: Date.now(), ...currentBid, time: new Date().toLocaleTimeString() },
                ...prev
            ]);
            playBidSound();
        });

        socket.on('player_sold', ({ player, winningBid, teams }) => {
            setSoldEvent({ type: 'SOLD', player, winningBid });
            setActiveTeams(teams);
        });

        socket.on('player_unsold', ({ player }) => {
            setSoldEvent({ type: 'UNSOLD', player });
        });

        socket.on('auction_finished', ({ teams }) => {
            setTimeout(() => {
                navigate(`/results/${roomCode}`, { state: { finalTeams: teams } });
            }, 3000);
        });

        socket.on('auction_paused', () => setIsPaused(true));
        socket.on('auction_resumed', () => setIsPaused(false));
        socket.on('kicked_from_room', () => navigate('/'));

        return () => {
            socket.off('new_player');
            socket.off('timer_tick');
            socket.off('bid_placed');
            socket.off('player_sold');
            socket.off('player_unsold');
            socket.off('auction_finished');
            socket.off('auction_paused');
            socket.off('auction_resumed');
            socket.off('kicked_from_room');
        }
    }, [socket, gameState, navigate, roomCode]);

    if (!gameState) return <div className="text-white flex items-center justify-center h-screen bg-darkBg">
        <div className="flex flex-col items-center">
            <div className="w-12 h-12 border-4 border-white/10 border-t-white rounded-full animate-spin mb-4"></div>
            <p className="text-slate-400 font-bold tracking-widest uppercase text-xs">Authenticating Lobby...</p>
        </div>
    </div>;

    const minIncrement = 5;
    const targetAmount = currentBid.amount === 0 ? currentPlayer?.basePrice : currentBid.amount + minIncrement;

    const handleBid = () => {
        if (!myTeam || timer <= 0 || soldEvent || isPaused) return;
        socket.emit('place_bid', { roomCode, amount: targetAmount });
    };

    const ringRadius = 45;
    const ringCircumference = 2 * Math.PI * ringRadius;
    const timerDashoffset = ringCircumference - (timer / 10) * ringCircumference;

    let timerColor = '#00d2ff';
    if (timer <= 5) timerColor = '#ffcc33';
    if (timer <= 3) timerColor = '#ef4444';

    return (
        <div className="h-screen w-full flex bg-darkBg overflow-hidden text-white font-sans selection:bg-white/20">

            {/* Cinematic Background Elements */}
            <div className="fixed inset-0 pointer-events-none opacity-40">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/20 blur-[150px] rounded-full"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/20 blur-[150px] rounded-full"></div>
            </div>

            {/* Left Sidebar: Franchises */}
            <div className="w-80 glass-panel flex flex-col pt-8 relative z-10 shadow-2xl">
                <div className="px-6 mb-6">
                    <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mb-1">Live Budgets</h2>
                    <div className="h-0.5 w-10 bg-white/10"></div>
                </div>
                <div className="flex-1 overflow-y-auto px-4 pb-8 space-y-3 custom-scrollbar">
                    {activeTeams.map((t, i) => (
                        <motion.div
                            key={i}
                            onClick={() => setExpandedTeamId(expandedTeamId === t.franchiseId ? null : t.franchiseId)}
                            initial={{ x: -20, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            transition={{ delay: i * 0.05 }}
                            className={`
                                rounded-2xl p-4 flex flex-col relative overflow-hidden transition-all duration-300 cursor-pointer
                                ${currentBid.teamId === t.franchiseId ? 'bg-white/10 border-white/20' : 'bg-slate-900/40 border border-white/5 hover:bg-slate-800/60'}
                            `}
                        >
                            <div className="absolute top-0 left-0 w-1 h-full" style={{ backgroundColor: t.teamThemeColor }}></div>

                            <div className="flex justify-between items-center z-10 mb-2">
                                <div className="flex items-center gap-3">
                                    {t.teamLogo && (
                                        <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center p-1 border border-white/10">
                                            <img src={t.teamLogo} alt={t.teamName} className="w-full h-full object-contain" />
                                        </div>
                                    )}
                                    <span className="font-black text-xs tracking-tight uppercase" style={{ color: t.teamThemeColor }}>{t.teamName}</span>
                                </div>
                                <span className="font-mono font-black text-lg text-white">₹{t.currentPurse}L</span>
                            </div>

                            <div className="flex justify-between items-center text-[10px] text-slate-500 mt-1 z-10 font-bold ml-11">
                                <span className="uppercase tracking-widest">{t.ownerName}</span>
                                <span className="bg-white/5 px-2 py-0.5 rounded text-white/50">{t.playersAcquired?.length || 0} / 25</span>
                            </div>

                            <AnimatePresence>
                                {expandedTeamId === t.franchiseId && t.playersAcquired?.length > 0 && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        className="mt-4 border-t border-white/10 pt-3 flex flex-col gap-2 z-10 overflow-hidden"
                                    >
                                        <div className="text-[9px] text-slate-500 font-black uppercase tracking-[0.2em] mb-1">Acquired Players</div>
                                        {t.playersAcquired.map((p, idx) => (
                                            <div key={idx} className="flex justify-between items-center text-[10px] font-bold bg-black/20 p-2 rounded border border-white/5">
                                                <span className="text-white uppercase truncate pr-2">{p.name}</span>
                                                <span className="text-blue-400 shrink-0">₹{p.boughtFor}L</span>
                                            </div>
                                        ))}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </motion.div>
                    ))}
                </div>
            </div>

            {/* Main Auction Arena */}
            <div className="flex-1 flex flex-col relative overflow-hidden">

                {/* Lobby Info Header */}
                <div className="absolute top-8 left-1/2 -translate-x-1/2 flex items-center gap-4 z-20">
                    <div className="px-4 py-1.5 rounded-full border border-white/10 glass-panel text-[10px] font-black uppercase tracking-widest text-slate-400">
                        Room: {roomCode}
                    </div>
                    <div className="px-4 py-1.5 rounded-full border border-white/10 bg-red-500/10 text-red-500 text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"></div>
                        Live Auction
                    </div>
                </div>

                {/* Host Controls */}
                {myTeam && myTeam.ownerSocketId === gameState?.host && (
                    <div className="absolute top-8 right-8 z-30 flex items-center gap-4">
                        <button
                            onClick={() => socket.emit(isPaused ? 'resume_auction' : 'pause_auction', { roomCode })}
                            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${isPaused ? 'bg-green-600 hover:bg-green-500 text-white shadow-[0_0_15px_rgba(34,197,94,0.4)]' : 'bg-yellow-600/30 hover:bg-yellow-500/40 text-yellow-500 border border-yellow-500/50 backdrop-blur-md'}`}
                        >
                            {isPaused ? '▶ Resume Auction' : '⏸ Pause Auction'}
                        </button>
                        <button
                            onClick={() => {
                                if (window.confirm('Are you sure you want to force end the auction early? This will skip the remaining players.')) {
                                    socket.emit('force_end_auction', { roomCode });
                                }
                            }}
                            className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all bg-red-600/30 hover:bg-red-500/40 text-red-500 border border-red-500/50 backdrop-blur-md"
                        >
                            Force End
                        </button>
                    </div>
                )}

                {/* Paused Overlay */}
                <AnimatePresence>
                    {isPaused && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
                        >
                            <div className="text-center flex flex-col items-center">
                                <h1 className="text-7xl font-black text-white tracking-widest uppercase mb-4 animate-pulse">Paused</h1>
                                <p className="text-yellow-500 font-bold uppercase tracking-[0.2em] mb-8">The auctioneer has suspended bidding</p>

                                {myTeam && myTeam.ownerSocketId === gameState?.host && (
                                    <button
                                        onClick={() => socket.emit('resume_auction', { roomCode })}
                                        className="px-8 py-4 bg-green-500 hover:bg-green-400 text-white rounded-2xl font-black uppercase tracking-widest text-sm shadow-[0_0_30px_rgba(34,197,94,0.5)] transition-all hover:scale-105"
                                    >
                                        ▶ Resume Bidding
                                    </button>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <div className="flex-1 flex items-center justify-center p-12 z-10">
                    <AnimatePresence mode='wait'>
                        {!currentPlayer ? (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="flex flex-col items-center"
                            >
                                <div className="text-4xl font-black text-white/10 uppercase tracking-[0.5em] animate-pulse">Preparing Podium...</div>
                            </motion.div>
                        ) : (
                            <div className="flex items-stretch w-full max-w-5xl gap-16">

                                {/* 3D Perspective Player Card */}
                                <motion.div
                                    key={currentPlayer._id}
                                    layout
                                    style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
                                    onMouseMove={handleMouseMove}
                                    onMouseLeave={handleMouseLeave}
                                    initial={{ opacity: 0, scale: 0.9, y: 40 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.9, y: -40 }}
                                    transition={{ type: "spring", stiffness: 300, damping: 25, mass: 1 }}
                                    className="w-[400px] aspect-[3/4.5] glass-card rounded-[40px] relative overflow-hidden group cursor-pointer shadow-2xl"
                                >
                                    <div style={{ transform: "translateZ(50px)" }} className="absolute inset-0">
                                        <motion.img
                                            initial={{ scale: 1.1 }}
                                            animate={{ scale: 1 }}
                                            transition={{ duration: 0.8 }}
                                            src={currentPlayer.photoUrl}
                                            alt={currentPlayer.name}
                                            className="w-full h-full object-cover grayscale-[20%] group-hover:grayscale-0 transition-all duration-[800ms] ease-out"
                                        />
                                        <div className="absolute inset-0 bg-gradient-to-t from-dark-depth via-transparent to-transparent opacity-90"></div>
                                    </div>

                                    <div style={{ transform: "translateZ(80px)" }} className="absolute bottom-10 left-10 right-10">
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="px-2 py-0.5 rounded bg-white/20 text-[10px] font-black uppercase tracking-widest backdrop-blur-md">
                                                {currentPlayer.role}
                                            </span>
                                            <span className="px-2 py-0.5 rounded bg-blue-600/40 text-[10px] font-black uppercase tracking-widest backdrop-blur-md">
                                                {currentPlayer.nationality}
                                            </span>
                                        </div>
                                        <h1 className="text-5xl font-black tracking-tighter leading-[0.9] text-white uppercase italic">
                                            {currentPlayer.name.split(' ').map((n, i) => (
                                                <span key={i} className="block">{n}</span>
                                            ))}
                                        </h1>
                                        <div className="mt-4 flex items-center gap-4 border-t border-white/10 pt-4">
                                            <div className="text-left">
                                                <div className="text-[10px] text-slate-500 font-black uppercase">Age</div>
                                                <div className="text-lg font-black">{currentPlayer.age}</div>
                                            </div>
                                            <div className="h-6 w-px bg-white/10"></div>
                                            <div className="text-left">
                                                <div className="text-[10px] text-slate-500 font-black uppercase">Exp</div>
                                                <div className="text-lg font-black">{currentPlayer.stats.iplSeasonsActive}Y</div>
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>

                                {/* Stats & Bidding Arena */}
                                <div className="flex-1 flex flex-col justify-center py-8">

                                    {/* Stats Grid */}
                                    <div className="grid grid-cols-2 gap-4 mb-12">
                                        <div className="glass-panel rounded-3xl p-6 border-white/5">
                                            <div className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] mb-2">{currentPlayer.role === 'Bowler' ? 'Wickets' : 'Total Runs'}</div>
                                            <div className="text-4xl font-black font-mono">
                                                {currentPlayer.role === 'Bowler' ? currentPlayer.stats.wickets : currentPlayer.stats.runs}
                                            </div>
                                        </div>
                                        <div className="glass-panel rounded-3xl p-6 border-white/5">
                                            <div className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] mb-2">{currentPlayer.role === 'Bowler' ? 'Economy' : 'Average'}</div>
                                            <div className="text-4xl font-black font-mono">
                                                {currentPlayer.role === 'Bowler' ? currentPlayer.stats.economy : currentPlayer.stats.average}
                                            </div>
                                        </div>
                                        <div className="col-span-2 glass-panel rounded-3xl p-6 border-white/5 flex items-center justify-between">
                                            <div>
                                                <div className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] mb-3">Recent Performance (Form)</div>
                                                <div className="flex gap-2">
                                                    {currentPlayer.form?.lastMatches?.map((res, i) => (
                                                        <div key={i} className={`w-2 h-8 rounded-full ${res === 'Excellent' ? 'bg-green-400 shadow-[0_0_10px_#4ade80]' : res === 'Decent' ? 'bg-yellow-400' : 'bg-red-400'}`}></div>
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-3xl font-black text-white">{currentPlayer.form?.score || 0}/10</div>
                                                <div className={`text-[10px] font-black uppercase tracking-widest ${currentPlayer.form?.trend === 'Up' ? 'text-green-400' : 'text-red-400'}`}>
                                                    Trend {currentPlayer.form?.trend === 'Up' ? '↑' : '↓'}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Bidding Core */}
                                    <div className="flex items-center gap-12">
                                        <div className="flex-1">
                                            <div className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] mb-2">Current Highest Bid</div>
                                            <div className="flex items-baseline gap-2">
                                                <motion.span
                                                    key={currentBid.amount}
                                                    initial={{ scale: 1.5, opacity: 0 }}
                                                    animate={{ scale: 1, opacity: 1 }}
                                                    className="text-7xl font-black font-mono tracking-tighter"
                                                    style={{ color: currentBid.teamColor || 'white' }}
                                                >
                                                    ₹{currentBid.amount === 0 ? currentPlayer.basePrice : currentBid.amount}
                                                </motion.span>
                                                <span className="text-2xl font-black text-slate-500">L</span>
                                            </div>
                                            {currentBid.teamName ? (
                                                <motion.div
                                                    initial={{ opacity: 0, x: -10 }}
                                                    animate={{ opacity: 1, x: 0 }}
                                                    className="mt-2 flex flex-col items-start gap-1"
                                                >
                                                    <div className="text-sm font-bold uppercase tracking-widest flex items-center gap-2" style={{ color: currentBid.teamColor }}>
                                                        <span className="w-1.5 h-1.5 rounded-full bg-current animate-ping"></span>
                                                        {currentBid.teamName} Leading
                                                    </div>
                                                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-3.5">
                                                        {currentBid.ownerName}
                                                    </div>
                                                </motion.div>
                                            ) : (
                                                <div className="mt-2 text-sm font-bold uppercase tracking-widest text-slate-600 italic">Starting @ Base Price</div>
                                            )}
                                        </div>

                                        {/* Premium Timer Circle */}
                                        <div className="relative w-32 h-32 flex items-center justify-center">
                                            <svg className="w-full h-full transform -rotate-90 absolute scroll-smooth">
                                                <circle cx="64" cy="64" r={ringRadius} fill="transparent" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
                                                <motion.circle
                                                    cx="64" cy="64" r={ringRadius}
                                                    fill="transparent"
                                                    stroke={timerColor}
                                                    strokeWidth="8"
                                                    strokeLinecap="round"
                                                    strokeDasharray={ringCircumference}
                                                    animate={{ strokeDashoffset: timerDashoffset, stroke: timerColor }}
                                                    transition={{ duration: 1, ease: 'linear' }}
                                                    className="drop-shadow-[0_0_15px_currentColor]"
                                                />
                                            </svg>
                                            <motion.div
                                                key={timer}
                                                animate={timer <= 3 ? { scale: [1, 1.2, 1] } : {}}
                                                className="text-4xl font-black font-mono z-10"
                                                style={{ color: timerColor }}
                                            >
                                                {timer}
                                            </motion.div>
                                        </div>
                                    </div>

                                </div>

                            </div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Bottom Interaction Bar */}
                <div className="h-32 glass-panel border-t border-white/5 flex items-center justify-between px-12 z-20 backdrop-blur-3xl">
                    <div className="flex items-center gap-6">
                        {myTeam && (
                            <div className="flex items-center gap-5">
                                <div className="w-2 h-16 rounded-full" style={{ backgroundColor: myTeam.teamThemeColor }}></div>
                                {myTeam.teamLogo && (
                                    <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center p-2 border border-white/10 shadow-lg shrink-0">
                                        <img src={myTeam.teamLogo} alt={myTeam.teamName} className="w-full h-full object-contain drop-shadow-md" />
                                    </div>
                                )}
                                <div className="flex flex-col justify-center translate-y-0.5">
                                    <div className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] mb-1">Signed As</div>
                                    <div className="text-2xl font-black tracking-tight uppercase leading-none drop-shadow-[0_0_10px_rgba(255,255,255,0.1)]" style={{ color: myTeam.teamThemeColor }}>{myTeam.teamName}</div>
                                    <div className="text-xs font-bold text-slate-400 uppercase tracking-[0.15em] mt-1.5">{myTeam.ownerName} <span className="text-slate-600">|</span> <span className="text-white">₹{myTeam.currentPurse}L</span></div>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-8">
                        <div className="text-right flex flex-col items-end">
                            <div className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-1">Next Bid Amount</div>
                            <div className="text-3xl font-black font-mono text-white tracking-tighter shadow-white drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">₹{targetAmount}L</div>
                        </div>

                        {/* Authentic Diamond Paddle Bid Button */}
                        <button
                            onClick={handleBid}
                            disabled={!myTeam || timer <= 0 || soldEvent || targetAmount > (myTeam?.currentPurse || 0) || currentBid.teamId === myTeam?.franchiseId}
                            className={`
                                relative flex items-center justify-center w-32 h-44 ml-10 -mt-10 outline-none
                                ${(!myTeam || timer <= 0 || soldEvent || targetAmount > (myTeam?.currentPurse || 0) || currentBid.teamId === myTeam?.franchiseId || isPaused)
                                    ? 'opacity-30 grayscale cursor-not-allowed'
                                    : 'cursor-pointer'}
                            `}
                        >
                            {/* Wooden Handle */}
                            <div
                                className="absolute bottom-0 w-6 h-20 rounded-b-md shadow-[inset_0_0_10px_rgba(0,0,0,0.8)] z-0"
                                style={{ background: 'linear-gradient(to right, #704214, #a0522d, #704214)' }}
                            ></div>

                            {/* Silver Collar */}
                            <div className="absolute bottom-[4.5rem] w-8 h-1.5 bg-gradient-to-r from-gray-400 via-gray-100 to-gray-500 rounded shadow-md z-10"></div>

                            {/* Diamond Paddle Head */}
                            <div
                                className="absolute bottom-[4.8rem] w-24 h-24 rotate-45 border-[4px] border-gray-300 shadow-[0_10px_20px_rgba(0,0,0,0.5)] z-20 flex items-center justify-center rounded-sm overflow-hidden"
                                style={{ backgroundColor: myTeam?.teamThemeColor || '#004BA0' }}
                            >
                                {/* Un-rotated inner circle */}
                                <div className="-rotate-45 flex items-center justify-center absolute w-[141%] h-[141%]">
                                    <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-md border border-black/10 shrink-0">
                                        {myTeam?.teamLogo ? (
                                            <img src={myTeam.teamLogo} alt="Logo" className="w-[85%] h-[85%] object-contain drop-shadow-sm" />
                                        ) : (
                                            <span className="text-xl font-black text-slate-800 uppercase">BID</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </button>
                    </div>
                </div>

                {/* Extraordinary Gavel Overlay */}
                <AnimatePresence>
                    {soldEvent && (
                        <GavelSlam
                            type={soldEvent.type}
                            teamName={soldEvent.winningBid?.teamName}
                            teamColor={soldEvent.winningBid?.teamColor}
                            amount={soldEvent.winningBid?.amount}
                            playerName={soldEvent.player?.name}
                            ownerName={soldEvent.winningBid?.ownerName}
                            teamId={soldEvent.winningBid?.teamId}
                        />
                    )}
                </AnimatePresence>
            </div>

            {/* Right Sidebar: Activity Feed */}
            <div className="w-80 glass-panel border-l border-white/5 flex flex-col pt-8 relative z-10">
                <div className="px-6 mb-6 flex items-center justify-between">
                    <div>
                        <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mb-1">Auction History</h2>
                        <div className="h-0.5 w-10 bg-white/10"></div>
                    </div>
                    <div className="w-2 h-2 rounded-full bg-blue-500 animate-ping"></div>
                </div>
                <div className="flex-1 overflow-y-auto px-4 pb-8 flex flex-col-reverse gap-3 custom-scrollbar">
                    <div className="flex flex-col-reverse gap-4">
                        {bidHistory.map((bid) => (
                            <div
                                key={bid.id}
                                className="relative group ml-4 mr-2"
                            >
                                {/* Rhombus Outer Wrapper */}
                                <div className="bg-slate-900/60 border border-white/10 p-3 transform skew-x-[-15deg] shadow-[0_5px_15px_rgba(0,0,0,0.3)] relative overflow-hidden flex items-center gap-4">

                                    {/* Un-skew Inner Content */}
                                    <div className="transform skew-x-[15deg] flex items-center w-full min-w-0">

                                        {/* Logo Container */}
                                        <div className="w-10 h-10 shrink-0 bg-black/40 rounded-full flex items-center justify-center p-1 border border-white/10 mr-4 shadow-inner">
                                            {bid.teamLogo ? (
                                                <img src={bid.teamLogo} alt={bid.teamName} className="w-full h-full object-contain drop-shadow-md" />
                                            ) : (
                                                <span className="text-[10px] font-black text-white">{bid.teamName.charAt(0)}</span>
                                            )}
                                        </div>

                                        {/* Details */}
                                        <div className="flex-1 min-w-0 flex flex-col justify-center">
                                            <div className="flex justify-between items-start mb-1">
                                                <div className="text-[10px] font-black uppercase tracking-widest truncate max-w-[120px]" style={{ color: bid.teamColor }}>
                                                    {bid.teamName}
                                                </div>
                                                <div className="text-[8px] text-slate-500 font-bold tracking-widest bg-black/40 px-1.5 py-0.5 rounded ml-2 shrink-0">
                                                    {bid.time}
                                                </div>
                                            </div>

                                            <div className="flex justify-between items-end">
                                                <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest truncate max-w-[100px]">
                                                    {bid.ownerName}
                                                </div>
                                                <div className="text-lg font-black font-mono text-white tracking-tighter drop-shadow-[0_0_8px_rgba(255,255,255,0.2)]">
                                                    ₹{bid.amount}L
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Left color accent */}
                                    <div className="absolute left-0 top-0 bottom-0 w-1.5" style={{ backgroundColor: bid.teamColor }}></div>
                                </div>
                            </div>
                        ))}
                    </div>
                    {bidHistory.length === 0 && (
                        <div className="flex-1 flex flex-col items-center justify-center text-slate-700">
                            <div className="text-xs font-black uppercase tracking-widest">Awaiting Bids</div>
                        </div>
                    )}
                </div>
            </div>

        </div>
    );
};

export default AuctionPodium;

