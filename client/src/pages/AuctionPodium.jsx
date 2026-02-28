import React, {
    useEffect,
    useState,
    useRef,
    useCallback,
    useMemo,
} from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { useSocket } from "../context/SocketContext";
import { useSession } from "../context/SessionContext";
import {
    motion,
    AnimatePresence,
    useMotionValue,
    useSpring,
    useTransform,
} from "framer-motion";
import { Play, Pause, Square, Plane, AlertTriangle, Users, Layout, MessageSquare, Menu, X } from "lucide-react";
import GavelSlam from "../components/GavelSlam";
import {
    TeamList,
    BidHistory,
    ChatSection,
} from "../components/AuctionSubComponents";

import { playBidSound, playWarningBeep } from "../utils/soundEngine";
import { getFlagUrl, getRoleDisplayName } from "../utils/playerUtils";

const AuctionPodium = () => {
    const { roomCode } = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const socket = useSocket();
    const [isSocketReady, setIsSocketReady] = useState(false);

    const [gameState, setGameState] = useState(location.state?.roomState || null);
    // If user joined as a spectator (passed via navigate state), keep them in spectator mode
    const forceSpectator = location.state?.isSpectator === true;
    const { playerName, userId, isReady: isSessionReady } = useSession();
    const [currentPlayer, setCurrentPlayer] = useState(null);
    const [currentBid, setCurrentBid] = useState({
        amount: 0,
        teamId: null,
        teamName: null,
        teamColor: null,
    });
    const [timer, setTimer] = useState(10);
    const [myTeam, setMyTeam] = useState(null);
    const [soldEvent, setSoldEvent] = useState(null);
    const [isPaused, setIsPaused] = useState(false);

    const [activeTeams, setActiveTeams] = useState(gameState?.teams || []);
    const [recentSold, setRecentSold] = useState([]); // Track last 10 sold players
    const [allPlayersMap, setAllPlayersMap] = useState({});
    const [onlineMap, setOnlineMap] = useState({});

    useEffect(() => {
        // Fetch players to create a fallback name map in case backend only sends IDs
        const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:5050";
        fetch(`${apiUrl}/api/players`)
            .then((res) => res.json())
            .then((data) => {
                if (!Array.isArray(data)) throw new Error("Invalid player data format");
                const map = {};
                data.forEach((p) => {
                    map[p._id] = p.name || p.player;
                    if (p.playerId) map[p.playerId] = p.name || p.player;
                });
                setAllPlayersMap(map);
            })
            .catch((err) => {
                console.warn("Falling back for player map:", err.message);
                setAllPlayersMap({});
            });
    }, []);
    const [bidHistory, setBidHistory] = useState([]);
    const [expandedTeamId, setExpandedTeamId] = useState(null);
    const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

    // Spectator & Approval States
    const [spectators, setSpectators] = useState([]);
    const [joinRequests, setJoinRequests] = useState([]);
    const [hasRequested, setHasRequested] = useState(false);
    const [showClaimModal, setShowClaimModal] = useState(false);
    const [selectedTeamId, setSelectedTeamId] = useState("");
    const [showHostRequests, setShowHostRequests] = useState(false);
    // Kick confirmation: { socketId, name } or null
    const [kickTarget, setKickTarget] = useState(null);
    // Force End Confirmation
    const [showForceEndConfirm, setShowForceEndConfirm] = useState(false);
    // Toast notification: { message, type } or null
    const [toast, setToast] = useState(null);
    // Pool View State
    const [showPoolModal, setShowPoolModal] = useState(false);
    const [upcomingPlayers, setUpcomingPlayers] = useState([]);
    const [poolTab, setPoolTab] = useState("live"); // "live", "sold", or "unsold"
    const [unsoldHistory, setUnsoldHistory] = useState([]);

    // Chat State
    const [chatMessages, setChatMessages] = useState([]);
    const [chatInput, setChatInput] = useState("");
    const chatEndRef = useRef(null);

    // Tabs state for Mobile UI
    const [activeTab, setActiveTab] = useState("podium"); // "teams", "podium", "chat"

    // Scroll chat to bottom when new messages arrive
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [chatMessages]);

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
        if (!socket || !roomCode || !isSessionReady) return;
        setIsSocketReady(true);

        // --- Event Handlers ---

        const handleRoomJoined = ({ state }) => {
            console.log("Joined Room:", roomCode, "Status:", state.status);

            // Re-route if auction is already beyond podium phase
            if (state.status === "Selection") {
                return navigate(`/selection/${roomCode}`);
            }
            if (state.status === "Finished") {
                return navigate(`/results/${roomCode}`, { state: { finalTeams: state.teams } });
            }

            setGameState(state);
            setActiveTeams(state.teams);
            setIsPaused(state.isPaused);
            setTimer(state.timer || 10);

            // Re-link team using userId (permanent)
            const myTeamInState = userId
                ? state.teams?.find(t => t.ownerUserId === userId)
                : state.teams?.find(t => t.ownerSocketId === socket.id);

            if (myTeamInState) {
                setMyTeam(myTeamInState);
            }

            if (state.unsoldHistory) {
                setUnsoldHistory(state.unsoldHistory);
            }

            // High-reliability restoration: check for activePlayer directly in join payload
            if (state.activePlayer) {
                console.log("Restoring active player from join payload:", state.activePlayer.name);
                setCurrentPlayer(state.activePlayer);
                if (state.activeBid) setCurrentBid(state.activeBid);
            }
            // Fallback for older server versions or edge cases
            else if (state.players && state.players.length > 0 && state.players[state.currentIndex]) {
                setCurrentPlayer(state.players[state.currentIndex]);
                setCurrentBid(state.currentBid || { amount: 0, teamId: null, teamName: null });
            }
            // If still missing but auction is live, request a fresh sync
            else if (['Auctioning', 'Paused'].includes(state.status)) {
                console.log("Auction is live but player missing, requesting sync...");
                socket.emit("request_auction_sync", { roomCode });
            }
        };

        const handleNewPlayer = ({ player, nextPlayers, timer }) => {
            console.log("Received new_player sync!", player?.name);
            setCurrentPlayer(player);
            setTimer(timer);
            setCurrentBid({
                amount: 0,
                teamId: null,
                teamName: null,
                teamColor: null,
            });
            setSoldEvent(null);
            setBidHistory([]);

            if (nextPlayers) {
                setUpcomingPlayers(nextPlayers);
                nextPlayers.forEach(p => {
                    const url = p.imagepath || p.image_path || p.photoUrl;
                    if (url) new Image().src = url;
                });
            }
        };

        const handleTimerTick = ({ timer }) => {
            setTimer(t => {
                if (timer > 0 && timer <= 3 && timer !== t) playWarningBeep();
                return timer;
            });
        };

        const handleBidPlaced = ({ currentBid, timer }) => {
            setCurrentBid(currentBid);
            setTimer(timer);
            setBidHistory(prev => [{
                id: Date.now(),
                ...currentBid,
                time: new Date().toLocaleTimeString()
            }, ...prev]);
            playBidSound();
        };

        const handlePlayerSold = ({ player, winningBid, teams }) => {
            setSoldEvent({ type: "SOLD", player, winningBid });
            setActiveTeams(teams);
            setRecentSold(prev => [{
                name: player.player || player.name,
                team: winningBid.teamName,
                price: winningBid.amount
            }, ...prev].slice(0, 10));

            const myUpdate = teams.find(t => t.ownerUserId === userId || t.ownerSocketId === socket.id);
            if (myUpdate) setMyTeam(myUpdate);
        };

        const handlePlayerUnsold = ({ player, unsoldHistory: updatedHistory }) => {
            setSoldEvent({ type: "UNSOLD", player });
            if (updatedHistory) setUnsoldHistory(updatedHistory);
        };

        const handleAuctionFinished = ({ teams, status }) => {
            setTimeout(() => {
                if (status === "Selection") navigate(`/selection/${roomCode}`);
                else navigate(`/results/${roomCode}`, { state: { finalTeams: teams } });
            }, 3000);
        };

        const handleLobbyUpdate = ({ teams }) => {
            if (teams) {
                setActiveTeams(teams);
                setGameState(prev => prev ? { ...prev, teams } : null);
                const myUpdate = teams.find(t => t.ownerUserId === userId || t.ownerSocketId === socket.id);
                if (myUpdate) setMyTeam(myUpdate);
            }
        };

        // --- Attachment ---
        const attemptRejoin = () => {
            socket.emit("join_room", { roomCode, asSpectator: forceSpectator });
        };

        if (socket.connected) attemptRejoin();
        else socket.on("connect", attemptRejoin);

        socket.on("room_joined", handleRoomJoined);
        socket.on("lobby_update", handleLobbyUpdate);
        socket.on("new_player", handleNewPlayer);
        socket.on("timer_tick", handleTimerTick);
        socket.on("bid_placed", handleBidPlaced);
        socket.on("player_sold", handlePlayerSold);
        socket.on("player_unsold", handlePlayerUnsold);
        socket.on("auction_finished", handleAuctionFinished);
        socket.on("auction_paused", () => setIsPaused(true));
        socket.on("auction_resumed", () => setIsPaused(false));
        socket.on("receive_chat_message", (msg) => setChatMessages(prev => [...prev, msg]));
        socket.on("spectator_update", ({ spectators }) => setSpectators(spectators));
        socket.on("join_requests_update", ({ roomCode: code, requests }) => {
            if (code === roomCode) setJoinRequests(requests);
        });
        socket.on("player_status_update", ({ onlineMap }) => setOnlineMap(prev => ({ ...prev, ...onlineMap })));
        socket.on("participation_approved", () => {
            setHasRequested(false);
            setShowClaimModal(true);
        });
        socket.on("participation_rejected", () => {
            setHasRequested(false);
            setToast({ message: "The host rejected your request to join.", type: "error" });
        });
        socket.on("kicked_from_room", () => navigate("/"));
        socket.on("room_disbanded", () => navigate("/"));

        return () => {
            // Cleanup: remove listeners
            socket.off("connect", attemptRejoin);
            socket.off("room_joined", handleRoomJoined);
            socket.off("lobby_update", handleLobbyUpdate);
            socket.off("new_player", handleNewPlayer);
            socket.off("timer_tick", handleTimerTick);
            socket.off("bid_placed", handleBidPlaced);
            socket.off("player_sold", handlePlayerSold);
            socket.off("player_unsold", handlePlayerUnsold);
            socket.off("auction_finished", handleAuctionFinished);
            socket.off("auction_paused");
            socket.off("auction_resumed");
            socket.off("receive_chat_message");
            socket.off("spectator_update");
            socket.off("join_requests_update");
            socket.off("player_status_update");
            socket.off("participation_approved");
            socket.off("participation_rejected");
            socket.off("kicked_from_room");
            socket.off("room_disbanded");
        };
    }, [socket, roomCode, isSessionReady, userId, playerName, navigate, forceSpectator]);

    // Dynamic Increment Logic
    const getMinIncrement = () => {
        if (!currentPlayer) return 25;
        // Use poolID for robust matching
        if (currentPlayer.poolID === "pool4") {
            const amount = currentBid.amount || 0;
            if (amount < 100) return 5;
            if (amount < 200) return 10;
            return 25;
        }
        return 25; // Default for other pools
    };

    const minIncrement = getMinIncrement();
    const targetAmount =
        currentBid.amount === 0
            ? currentPlayer?.basePrice || 50
            : currentBid.amount + minIncrement;

    const handleBid = useCallback(() => {
        if (!socket || !myTeam || timer <= 0 || soldEvent || isPaused) return;
        socket.emit("place_bid", { roomCode, amount: targetAmount });
    }, [myTeam, timer, soldEvent, isPaused, socket, roomCode, targetAmount]);

    const handleSendMessage = useCallback(
        (e) => {
            e.preventDefault();
            if (!socket || !chatInput.trim()) return;
            socket.emit("send_chat_message", { roomCode, message: chatInput.trim() });
            setChatInput("");
        },
        [chatInput, socket, roomCode],
    );

    const confirmLeaveRoom = () => {
        if (roomCode) {
            socket.emit("leave_room", { roomCode, playerName });
        }
        setShowLeaveConfirm(false);
        navigate("/");
    };

    const handleRequestJoin = () => {
        if (!socket || !roomCode) return;
        setHasRequested(true);
        socket.emit("request_participation", { roomCode });
    };

    const handleClaimTeamMidAuction = () => {
        if (!selectedTeamId) {
            setToast({ message: "Please select a franchise first.", type: "warning" });
            return;
        }
        // Use the name stored in the spectators list for this socket (not localStorage playerName)
        // This prevents the "wrong name displayed" bug when multiple users share the same device/localStorage
        const mySpectatorEntry = spectators.find((s) => s.socketId === socket.id);
        const nameToUse = mySpectatorEntry?.name || playerName;
        socket.emit("claim_team", {
            roomCode,
            playerName: nameToUse,
            teamId: selectedTeamId,
        });
        setShowClaimModal(false);
    };

    const ringRadius = 45;
    const ringCircumference = 2 * Math.PI * ringRadius;
    const maxTimer = gameState?.timerDuration || 10;
    const timerDashoffset =
        ringCircumference - (timer / maxTimer) * ringCircumference;

    let timerColor = "#00d2ff";
    if (timer <= 5) timerColor = "#ffcc33";
    if (timer <= 3) timerColor = "#ef4444";

    if (!isSessionReady || !isSocketReady || !gameState) {
        return (
            <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
                <div className="w-16 h-16 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mb-6"></div>
                <h2 className="text-xl font-black text-white uppercase tracking-[0.2em] mb-2">
                    Preparing Podium Interface
                </h2>
                <p className="text-slate-500 text-sm max-w-xs leading-relaxed">
                    Synchronizing auction state and reconciling your session...
                </p>
                {!isSessionReady && (
                    <p className="text-blue-500/60 text-[10px] uppercase font-bold tracking-widest mt-4">
                        Hydrating Local Session
                    </p>
                )}
                {isSessionReady && !isSocketReady && (
                    <p className="text-blue-500/60 text-[10px] uppercase font-bold tracking-widest mt-4">
                        Establishing Secure Bridge
                    </p>
                )}
            </div>
        );
    }

    return (
        <div className="flex flex-col lg:flex-row h-[100dvh] bg-slate-950 text-slate-100 font-sans selection:bg-blue-500/30 overflow-hidden relative">
            {/* Cinematic Background Elements */}
            <div className="fixed inset-0 pointer-events-none opacity-40 z-0">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/20 blur-[150px] rounded-full"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/20 blur-[150px] rounded-full"></div>
            </div>

            {/* Left Sidebar: Franchises (Responsive) */}
            <div
                className={`
                fixed lg:relative inset-y-0 left-0 z-[150] lg:z-10
                w-72 sm:w-80 lg:w-96 bg-slate-900 lg:bg-transparent border-r border-white/10 lg:border-none
                transition-transform duration-300 transform pb-16 lg:pb-0
                ${activeTab === "teams" ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
                flex flex-col h-[100dvh] lg:h-auto
            `}
            >
                <div className="lg:hidden h-14 shrink-0"></div>
                <div className="px-6 mb-6 flex justify-between items-center">
                    <div>
                        <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mb-1">
                            Live Budgets
                        </h2>
                        <div className="h-0.5 w-10 bg-white/10"></div>
                    </div>
                    <button
                        onClick={() => setExpandedTeamId(null)}
                        className="lg:hidden text-slate-500 hover:text-white"
                    >
                        <svg
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <TeamList
                        teams={activeTeams}
                        currentBidTeamId={currentBid.teamId}
                        expandedTeamId={expandedTeamId}
                        setExpandedTeamId={setExpandedTeamId}
                        allPlayersMap={allPlayersMap}
                        onlineMap={onlineMap}
                        isHost={gameState?.host === socket.id}
                        mySocketId={socket.id}
                        onKick={(socketId, name) => setKickTarget({ socketId, name })}
                    />
                </div>
            </div>

            {/* Middle Section: Header, Ticker, Arena & Interaction Bar */}
            <div className={`flex-1 flex-col min-w-0 h-[100dvh] relative overflow-hidden pb-16 lg:pb-0 ${activeTab === 'podium' ? 'flex' : 'hidden lg:flex'}`}>
                {/* Header (Refined for Mobile) */}
                <header className="relative z-[60] glass-panel border-b border-white/5 bg-slate-900/80 backdrop-blur-md">
                    <div className="max-w-[2000px] mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between">
                        <div className="flex items-center gap-2 sm:gap-6">
                            <button
                                onClick={() => setShowLeaveConfirm(true)}
                                className="text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 p-2 sm:p-2.5 rounded-full transition-all group z-20"
                                title="Leave Room & Return to Lobby"
                            >
                                <svg
                                    className="w-4 h-4 transform group-hover:-translate-x-1 transition-transform"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth="2"
                                        d="M10 19l-7-7m0 0l7-7m-7 7h18"
                                    />
                                </svg>
                            </button>
                            <div className="hidden xs:flex flex-col">
                                <div className="text-[7px] font-black text-slate-500 uppercase tracking-widest mb-0.5">
                                    Room ID
                                </div>
                                <div className="text-[10px] sm:text-sm font-black font-mono text-purple-400">
                                    {roomCode}
                                </div>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-red-500/10 border border-red-500/20 rounded-full">
                                    <div className="w-1 h-1 rounded-full bg-red-500 animate-pulse"></div>
                                    <span className="text-[7px] sm:text-[10px] font-black uppercase tracking-widest text-red-500">
                                        Live
                                    </span>
                                </div>
                                <button
                                    onClick={() => setShowPoolModal(true)}
                                    className="p-1 rounded-full bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:bg-white/10 transition-all group"
                                    title="View Current & Next Pool"
                                >
                                    <Users className="w-3 h-3" />
                                </button>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 sm:gap-4">
                            {gameState?.host === socket.id && joinRequests.length > 0 && (
                                <button
                                    onClick={() => setShowHostRequests(true)}
                                    className="flex items-center gap-2 px-3 py-1.5 bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 rounded-full hover:bg-yellow-500/20 transition-all shadow-[0_0_10px_rgba(234,179,8,0.2)]"
                                >
                                    <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse"></span>
                                    <span className="text-[10px] sm:text-xs font-black uppercase tracking-widest hidden sm:inline">
                                        {joinRequests.length} Requests
                                    </span>
                                    <span className="text-[10px] sm:text-xs font-black uppercase tracking-widest sm:hidden">
                                        {joinRequests.length}
                                    </span>
                                </button>
                            )}
                            {myTeam && myTeam.ownerSocketId === gameState?.host && (
                                <div className="flex items-center gap-1.5 p-1 glass-panel rounded-xl">
                                    <button
                                        onClick={() =>
                                            socket.emit(
                                                isPaused ? "resume_auction" : "pause_auction",
                                                { roomCode },
                                            )
                                        }
                                        className={`p-2 rounded-lg transition-all flex items-center justify-center ${isPaused ? "bg-green-500 text-white shadow-lg shadow-green-500/20" : "hover:bg-white/5 text-slate-400"}`}
                                        title={isPaused ? "Resume Auction" : "Pause Auction"}
                                    >
                                        {isPaused ? (
                                            <Play className="w-4 h-4" fill="currentColor" />
                                        ) : (
                                            <Pause className="w-4 h-4" fill="currentColor" />
                                        )}
                                    </button>
                                    <button
                                        onClick={() => setShowForceEndConfirm(true)}
                                        className="p-2 rounded-lg hover:bg-red-500/10 text-slate-400 hover:text-red-500 transition-all flex items-center justify-center"
                                        title="Force End Auction"
                                    >
                                        <Square className="w-4 h-4" fill="currentColor" />
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </header>

                {/* Premium Live Auction Ticker */}
                <div className="relative h-8 bg-black/40 backdrop-blur-sm border-b border-white/5 z-40 flex items-center overflow-hidden">
                    <div className="bg-blue-600 h-full px-4 flex items-center justify-center z-10 shadow-[5px_0_15px_rgba(0,0,0,0.5)]">
                        <span className="text-[9px] font-black uppercase tracking-[0.2em] whitespace-nowrap text-white">
                            Live Highlights
                        </span>
                    </div>

                    <div className="flex-1 relative overflow-hidden h-full flex items-center">
                        <div className="flex whitespace-nowrap animate-ticker group-hover:pause">
                            {/* Secondary copy for seamless loop */}
                            {[...Array(2)].map((_, loopIdx) => (
                                <React.Fragment key={`loop-${loopIdx}`}>
                                    {/* Recent Buys */}
                                    {recentSold.map((s, i) => (
                                        <div
                                            key={`recent-${loopIdx}-${i}`}
                                            className="inline-flex items-center mx-8"
                                        >
                                            <span className="text-[8px] font-black text-blue-400 uppercase tracking-widest mr-2">
                                                RECENT:
                                            </span>
                                            <span className="text-[10px] font-bold text-white uppercase">
                                                {s.name}
                                            </span>
                                            <span className="mx-2 text-slate-500">→</span>
                                            <span className="text-[10px] font-black text-yellow-500 uppercase">
                                                {s.team}
                                            </span>
                                            <span className="ml-2 text-[10px] font-mono font-black text-white/50">
                                                ₹{s.price}L
                                            </span>
                                        </div>
                                    ))}

                                    {/* Top Buys */}
                                    {activeTeams
                                        .flatMap((t) =>
                                            t.playersAcquired.map((p) => ({
                                                ...p,
                                                team: t.teamName,
                                            })),
                                        )
                                        .sort((a, b) => b.boughtFor - a.boughtFor)
                                        .slice(0, 10)
                                        .map((s, i) => (
                                            <div
                                                key={`top-${loopIdx}-${i}`}
                                                className="inline-flex items-center mx-8"
                                            >
                                                <span className="text-[8px] font-black text-purple-400 uppercase tracking-widest mr-2">
                                                    TOP BUY:
                                                </span>
                                                <span className="text-[10px] font-bold text-white uppercase">
                                                    {s.name}
                                                </span>
                                                <span className="mx-2 text-slate-500">→</span>
                                                <span className="text-[10px] font-black text-blue-400 uppercase">
                                                    {s.team}
                                                </span>
                                                <span className="ml-2 text-[10px] font-mono font-black text-white/50">
                                                    ₹{s.boughtFor}L
                                                </span>
                                            </div>
                                        ))}
                                </React.Fragment>
                            ))}

                            {/* Decorative Spacer */}
                            {recentSold.length === 0 && activeTeams.length === 0 && (
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mx-10">
                                    Waiting for first hammers...
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Lobby Info Header - Desktop Only (Redundant on mobile) */}
                <div className="hidden lg:flex absolute top-2 left-1/2 -translate-x-1/2 items-center gap-4 z-20">
                    <div className="px-4 py-1.5 rounded-full border border-white/10 glass-panel text-[10px] font-black uppercase tracking-widest text-slate-400">
                        Room: {roomCode}
                    </div>
                    <div className="px-4 py-1.5 rounded-full border border-white/10 bg-red-500/10 text-red-500 text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"></div>
                        Live Auction
                    </div>
                </div>

                {/* Host Controls - Desktop Only (Redundant on mobile header) */}
                {myTeam && myTeam.ownerSocketId === gameState?.host && (
                    <div className="hidden lg:flex absolute top-2 right-8 z-30 items-center gap-4">
                        <button
                            onClick={() =>
                                socket.emit(isPaused ? "resume_auction" : "pause_auction", {
                                    roomCode,
                                })
                            }
                            className={`px-4 py-2 rounded-xl transition-all flex items-center justify-center min-w-[56px] ${isPaused ? "bg-green-600 hover:bg-green-500 text-white shadow-[0_0_15px_rgba(34,197,94,0.4)]" : "bg-yellow-600/30 hover:bg-yellow-500/40 text-yellow-500 border border-yellow-500/50 backdrop-blur-md"}`}
                            title={isPaused ? "Resume Auction" : "Pause Auction"}
                        >
                            {isPaused ? (
                                <Play className="w-6 h-6" fill="currentColor" />
                            ) : (
                                <Pause className="w-6 h-6" fill="currentColor" />
                            )}
                        </button>
                        <button
                            onClick={() => setShowForceEndConfirm(true)}
                            className="px-4 py-2 rounded-xl transition-all bg-red-600/30 hover:bg-red-500/40 text-red-500 border border-red-500/50 backdrop-blur-md flex items-center justify-center min-w-[56px]"
                            title="Force End Auction"
                        >
                            <Square className="w-6 h-6" fill="currentColor" />
                        </button>
                    </div>
                )}

                <div className="flex-1 flex flex-col items-center justify-start p-2 md:p-12 z-10 overflow-y-auto mt-0 custom-scrollbar relative">
                    <AnimatePresence mode="wait">
                        {!currentPlayer ? (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="flex flex-col items-center pt-20"
                            >
                                <div className="text-4xl font-black text-white/10 uppercase tracking-[0.5em] animate-pulse">
                                    Preparing Podium...
                                </div>
                            </motion.div>
                        ) : (
                            <div className="flex flex-col lg:flex-row items-center lg:items-stretch w-full max-w-5xl gap-6 md:gap-12 lg:gap-16 pb-32 lg:pb-0">
                                {/* 3D Perspective Player Card */}
                                <motion.div
                                    key={currentPlayer._id}
                                    layout
                                    style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
                                    onMouseMove={handleMouseMove}
                                    onMouseLeave={handleMouseLeave}
                                    layoutId="player-card"
                                    initial={{ scale: 0.9, opacity: 0, y: 20 }}
                                    animate={{ scale: 1, opacity: 1, y: 0 }}
                                    exit={{ scale: 0.9, opacity: 0, y: -20 }}
                                    transition={{
                                        type: "spring",
                                        stiffness: 260,
                                        damping: 25,
                                        mass: 1,
                                    }}
                                    className="w-[190px] xs:w-[230px] sm:w-[380px] aspect-[3/4.2] gold-ornate-border rounded-xl relative overflow-hidden group cursor-pointer shrink-0 flex flex-col bg-[#0a0600] mx-auto lg:mx-0 shadow-2xl"
                                >
                                    {/* Frame Corner Ornaments */}
                                    <div className="absolute top-2 left-2 w-6 h-6 border-t-2 border-l-2 border-yellow-500 z-30 opacity-70"></div>
                                    <div className="absolute top-2 right-2 w-6 h-6 border-t-2 border-r-2 border-yellow-500 z-30 opacity-70"></div>
                                    <div className="absolute bottom-2 left-2 w-6 h-6 border-b-2 border-l-2 border-yellow-500 z-30 opacity-70"></div>
                                    <div className="absolute bottom-2 right-2 w-6 h-6 border-b-2 border-r-2 border-yellow-500 z-30 opacity-70"></div>

                                    {/* Overseas & Nationality Indicators - Top Right */}
                                    <div className="absolute top-6 right-6 z-30 flex flex-col items-center gap-2 drop-shadow-xl">
                                        {getFlagUrl(currentPlayer.nationality) && (
                                            <img
                                                onError={(e) => {
                                                    e.target.style.display = 'none';
                                                }}
                                                src={getFlagUrl(currentPlayer.nationality)}
                                                alt={currentPlayer.nationality}
                                                className="w-8 h-auto rounded-sm border border-yellow-500/30 object-contain shadow-lg"
                                                title={currentPlayer.nationality}
                                            />
                                        )}
                                        <Plane
                                            className={`w-8 h-8 ${currentPlayer.isOverseas ? "text-yellow-500" : "text-transparent"} -rotate-45 transition-all duration-500`}
                                            fill={currentPlayer.isOverseas ? "rgba(234, 179, 8, 0.4)" : "none"}
                                            title={currentPlayer.isOverseas ? "Overseas Player" : ""}
                                        />
                                    </div>

                                    {/* Layout Split: Left Col (Name) & Right Col (Image + Stats) */}

                                    {/* Left Column: Vertical Name */}
                                    <div className="absolute left-0 top-0 bottom-0 w-10 sm:w-16 flex flex-col items-center justify-start pt-8 pb-4 z-40 pointer-events-none border-r border-yellow-500/10">
                                        <h1 className="text-vertical text-[10px] sm:text-lg font-serif text-yellow-500 tracking-[0.4em] uppercase drop-shadow-md whitespace-nowrap opacity-90 overflow-hidden">
                                            {currentPlayer.player ||
                                                currentPlayer.name ||
                                                "Unknown Player"}
                                        </h1>
                                    </div>

                                    {/* Right Column: Image */}
                                    <div className="absolute right-0 top-0 h-[50%] left-10 sm:left-16 flex flex-col z-10 pointer-events-none overflow-hidden">
                                        <motion.img
                                            initial={{ scale: 1.1 }}
                                            animate={{ scale: 1 }}
                                            transition={{ duration: 0.8 }}
                                            src={(() => {
                                                const url = currentPlayer.image_path ||
                                                    currentPlayer.imagepath ||
                                                    currentPlayer.photoUrl;
                                                // Minimal validation for data URLs
                                                if (url && url.startsWith('data:') && !url.includes('base64,')) {
                                                    return "https://via.placeholder.com/400x600?text=Invalid+Image";
                                                }
                                                return url || "https://via.placeholder.com/400x600?text=No+Photo";
                                            })()}
                                            onError={(e) => {
                                                e.target.src = "https://via.placeholder.com/400x600?text=Image+Load+Error";
                                            }}
                                            alt={
                                                currentPlayer.player || currentPlayer.name || "Player"
                                            }
                                            className="w-full h-full object-cover object-top"
                                        />
                                        {/* Gradient fade at the bottom of the image */}
                                        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#0a0600] to-transparent"></div>
                                    </div>

                                    {/* Stats Overlay at the Bottom Right */}
                                    <div className="absolute right-0 bottom-0 top-[50%] left-10 sm:left-16 flex flex-col items-center justify-center pb-2 px-1 sm:px-4 z-20 pointer-events-none bg-[#0a0600]">
                                        {/* Role label */}
                                        <div className="text-yellow-400 font-serif text-sm sm:text-3xl tracking-[0.2em] uppercase mb-0.5 sm:mb-4 drop-shadow-[0_4px_4px_rgba(0,0,0,0.8)]">
                                            {getRoleDisplayName(currentPlayer.role)}
                                        </div>

                                        {/* Dynamic Role-Based Stats Grid */}
                                        <div className="w-full h-full flex items-center justify-center px-2">
                                            {(() => {
                                                const role = (currentPlayer.role || "").toLowerCase();
                                                const s = currentPlayer.stats || {};

                                                // Normalized Role Detection
                                                const isBat = (role.includes("bat") || role.includes("bt")) && !role.includes("all") && !role.includes("wk") && !role.includes("wicket");
                                                const isBowl = (role.includes("bowl") || role.includes("bw")) && !role.includes("all");
                                                const isAll = role.includes("all") || role.includes("ar");
                                                const isWK = role.includes("wk") || role.includes("wicket") || role.includes("keeper");

                                                // Defining Stats per Role (Strict following user requirements)
                                                let statsToDisplay = [];
                                                if (isAll) {
                                                    // All-Rounder: 9-stat grid
                                                    statsToDisplay = [
                                                        { label: "Mat", val: s.matches },
                                                        { label: "Runs", val: s.runs },
                                                        { label: "Avg", val: s.battingAvg },
                                                        { label: "S/R", val: s.strikeRate },
                                                        { label: "HS", val: s.highestScore || 0 }, // HS included in user requirement
                                                        { label: "Wkts", val: s.wickets },
                                                        { label: "Econ", val: s.economy },
                                                        { label: "B/Avg", val: s.bowlingAvg },
                                                        { label: "B/F", val: s.bestFigures || "0/0" }
                                                    ];
                                                } else if (isWK) {
                                                    // Wicketkeeper: Matches, Runs, Batting Avg, Strike Rate, Catches, Stumpings
                                                    statsToDisplay = [
                                                        { label: "Matches", val: s.matches },
                                                        { label: "Runs", val: s.runs },
                                                        { label: "Avg", val: s.battingAvg },
                                                        { label: "S/R", val: s.strikeRate },
                                                        { label: "Catches", val: s.catches },
                                                        { label: "Stumps", val: s.stumpings }
                                                    ];
                                                } else if (isBowl) {
                                                    // Bowler: Matches, Wickets, Bowling Avg, Economy, Best Figures (BF)
                                                    statsToDisplay = [
                                                        { label: "Matches", val: s.matches },
                                                        { label: "Wickets", val: s.wickets },
                                                        { label: "Avg", val: s.bowlingAvg },
                                                        { label: "Econ", val: s.economy },
                                                        { label: "B/F", val: s.bestFigures || "0/0" }
                                                    ];
                                                } else {
                                                    // Batsman (Default): Matches, Runs, Batting Avg, Strike Rate, Highest Score (HS)
                                                    statsToDisplay = [
                                                        { label: "Matches", val: s.matches },
                                                        { label: "Runs", val: s.runs },
                                                        { label: "Avg", val: s.battingAvg },
                                                        { label: "S/R", val: s.strikeRate },
                                                        { label: "HS", val: s.highestScore || 0 }
                                                    ];
                                                }

                                                const gridCols = isAll ? "grid-cols-3" : statsToDisplay.length > 4 ? "grid-cols-2 lg:grid-cols-3" : "grid-cols-2";

                                                return (
                                                    <div className={`grid ${gridCols} gap-x-4 gap-y-3 w-full py-2`}>
                                                        {statsToDisplay.map((stat, i) => (
                                                            <div key={i} className="flex flex-col items-center">
                                                                <div className={`${isAll ? 'text-sm' : 'text-base'} sm:${isAll ? 'text-xl' : 'text-3xl'} font-serif text-yellow-500 drop-shadow-sm leading-tight text-center`}>
                                                                    {stat.val || 0}
                                                                </div>
                                                                <div className="text-[6px] xs:text-[7px] text-white/60 uppercase tracking-[0.2em] font-black mt-0.5 text-center">
                                                                    {stat.label}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                </motion.div>

                                {/* Bidding Arena */}
                                <div className="flex-1 flex w-full max-w-xl mx-auto items-center justify-center">
                                    {/* Bidding Core */}
                                    <div className="flex items-center gap-12">
                                        <div className="flex-1">
                                            <div className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] mb-2">
                                                Current Highest Bid
                                            </div>
                                            <div className="flex items-baseline gap-2">
                                                <motion.span
                                                    key={currentBid.amount}
                                                    initial={{ scale: 1.5, opacity: 0 }}
                                                    animate={{ scale: 1, opacity: 1 }}
                                                    className="text-4xl xs:text-5xl sm:text-6xl md:text-7xl font-black font-mono tracking-tighter"
                                                    style={{ color: currentBid.teamColor || "white" }}
                                                >
                                                    ₹
                                                    {currentBid.amount === 0
                                                        ? currentPlayer.basePrice || 50
                                                        : currentBid.amount}
                                                </motion.span>
                                                <span className="text-xl md:text-2xl font-black text-slate-500">
                                                    L
                                                </span>
                                            </div>
                                            {currentBid.teamName ? (
                                                <motion.div
                                                    initial={{ opacity: 0, x: -10 }}
                                                    animate={{ opacity: 1, x: 0 }}
                                                    className="mt-2 flex flex-col items-start gap-1"
                                                >
                                                    <div
                                                        className="text-sm font-bold uppercase tracking-widest flex items-center gap-2"
                                                        style={{ color: currentBid.teamColor }}
                                                    >
                                                        <span className="w-1.5 h-1.5 rounded-full bg-current animate-ping"></span>
                                                        {currentBid.teamName} Leading
                                                    </div>
                                                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-3.5">
                                                        {currentBid.ownerName}
                                                    </div>
                                                </motion.div>
                                            ) : (
                                                <div className="mt-2 text-sm font-bold uppercase tracking-widest text-slate-600 italic">
                                                    Starting @ Base Price
                                                </div>
                                            )}
                                        </div>

                                        {/* Premium Timer Circle OR Stamp */}
                                        <div className="relative w-32 h-32 flex items-center justify-center">
                                            {!soldEvent ? (
                                                <>
                                                    <svg className="w-full h-full transform -rotate-90 absolute scroll-smooth">
                                                        <circle
                                                            cx="64"
                                                            cy="64"
                                                            r={ringRadius}
                                                            fill="transparent"
                                                            stroke="rgba(255,255,255,0.05)"
                                                            strokeWidth="8"
                                                        />
                                                        <motion.circle
                                                            cx="64"
                                                            cy="64"
                                                            r={ringRadius}
                                                            fill="transparent"
                                                            stroke={timerColor}
                                                            strokeWidth="8"
                                                            strokeLinecap="round"
                                                            strokeDasharray={ringCircumference}
                                                            animate={{
                                                                strokeDashoffset: timerDashoffset,
                                                                stroke: timerColor,
                                                            }}
                                                            transition={{ duration: 1, ease: "linear" }}
                                                            className="drop-shadow-[0_0_15px_currentColor]"
                                                        />
                                                    </svg>
                                                    <motion.div
                                                        key={`timer-${timer}`}
                                                        animate={timer <= 3 ? { scale: [1, 1.2, 1] } : {}}
                                                        className="text-2xl xs:text-3xl sm:text-4xl font-black font-mono z-10"
                                                        style={{ color: timerColor }}
                                                    >
                                                        {timer}
                                                    </motion.div>
                                                </>
                                            ) : (
                                                <AnimatePresence>
                                                    <GavelSlam
                                                        type={soldEvent.type}
                                                        playerName={
                                                            soldEvent.player?.player ||
                                                            soldEvent.player?.name ||
                                                            "UNKNOWN"
                                                        }
                                                        teamName={soldEvent.winningBid?.teamName}
                                                        teamColor={soldEvent.winningBid?.teamColor}
                                                        teamLogo={
                                                            activeTeams.find(
                                                                (t) =>
                                                                    t.franchiseId ===
                                                                    soldEvent.winningBid?.teamId,
                                                            )?.teamLogo || soldEvent.winningBid?.teamLogo
                                                        }
                                                        winningBid={soldEvent.winningBid}
                                                    />
                                                </AnimatePresence>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </AnimatePresence>
                </div>


                {/* Mobile Podium Controls (Visible only on mobile Podium tab) */}
                {activeTab === 'podium' && myTeam && (
                    <div className="lg:hidden border-t border-white/10 glass-panel p-4 flex items-center justify-between z-50">
                        <div className="flex items-center gap-3">
                            {myTeam.teamLogo && (
                                <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center p-1 border border-white/10 shadow-lg shrink-0">
                                    <img src={myTeam.teamLogo} alt="" className="w-full h-full object-contain" />
                                </div>
                            )}
                            <div className="flex flex-col min-w-0 text-left">
                                <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">Signed As</div>
                                <div className="text-xs font-black text-blue-400 uppercase truncate leading-none mb-1" style={{ color: myTeam.teamThemeColor }}>{myTeam.teamName}</div>
                                <div className="text-[10px] font-bold text-white leading-none">₹{myTeam.currentPurse}L</div>
                            </div>
                        </div>

                        <div className="flex items-center gap-4">
                            <div className="text-right">
                                <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">Next Bid</div>
                                <div className="text-lg font-black text-white leading-none">₹{targetAmount}L</div>
                            </div>
                            <button
                                onClick={handleBid}
                                disabled={soldEvent || (myTeam.currentPurse < targetAmount)}
                                className="relative w-14 h-14 flex items-center justify-center group shrink-0"
                            >
                                <div
                                    className="absolute inset-0 rotate-45 border-2 border-white/20 rounded-sm shadow-lg overflow-hidden flex items-center justify-center transition-all active:scale-95 disabled:opacity-50"
                                    style={{ backgroundColor: myTeam.teamThemeColor || '#004BA0' }}
                                >
                                    <div className="-rotate-45 flex items-center justify-center">
                                        {myTeam.teamLogo ? (
                                            <img src={myTeam.teamLogo} alt="" className="w-8 h-8 object-contain" />
                                        ) : (
                                            <span className="text-[10px] font-black text-white">BID</span>
                                        )}
                                    </div>
                                </div>
                            </button>
                        </div>
                    </div>
                )}

                {/* Bottom Interaction Bar (Desktop Only) */}
                <div className="hidden lg:flex h-32 glass-panel border-t border-white/5 items-center justify-between px-12 z-20 backdrop-blur-3xl shrink-0">
                    <div className="flex items-center gap-6">
                        {myTeam && (
                            <div className="flex items-center gap-5">
                                <div
                                    className="w-1.5 h-16 rounded-full"
                                    style={{ backgroundColor: myTeam.teamThemeColor }}
                                ></div>
                                {myTeam.teamLogo && (
                                    <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center p-2 border border-white/10 shadow-lg shrink-0">
                                        <img
                                            src={myTeam.teamLogo}
                                            alt={myTeam.teamName}
                                            className="w-full h-full object-contain drop-shadow-md"
                                        />
                                    </div>
                                )}
                                <div className="flex flex-col justify-center min-w-0">
                                    <div className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] mb-1">
                                        Signed As
                                    </div>
                                    <div
                                        className="text-2xl font-black tracking-tight uppercase leading-none truncate"
                                        style={{ color: myTeam.teamThemeColor }}
                                    >
                                        {myTeam.teamName}
                                    </div>
                                    <div className="text-xs font-bold text-slate-400 uppercase tracking-[0.15em] mt-1.5 truncate">
                                        {myTeam.ownerName}{" "}
                                        <span className="text-slate-600 px-1">|</span>{" "}
                                        <span className="text-white">₹{myTeam.currentPurse}L</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-8 justify-end">
                        {myTeam ? (
                            <>
                                <div className="text-right flex flex-col items-end">
                                    <div className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-1">
                                        Next Bid
                                    </div>
                                    <div className="text-3xl font-black font-mono text-white tracking-tighter">
                                        ₹{targetAmount}L
                                    </div>
                                </div>
                                <div className="relative w-32 h-44 flex items-center justify-center">
                                    <button
                                        onClick={handleBid}
                                        disabled={
                                            !myTeam ||
                                            timer <= 0 ||
                                            soldEvent ||
                                            targetAmount > (myTeam?.currentPurse || 0) ||
                                            currentBid.teamId === myTeam?.franchiseId ||
                                            myTeam?.playersAcquired?.length >= 25 ||
                                            (currentPlayer?.isOverseas &&
                                                (myTeam?.overseasCount || 0) >= 8)
                                        }
                                        className={`
                                        relative flex items-center justify-center w-full h-full outline-none
                                        ${!myTeam ||
                                                timer <= 0 ||
                                                soldEvent ||
                                                targetAmount > (myTeam?.currentPurse || 0) ||
                                                currentBid.teamId === myTeam?.franchiseId ||
                                                isPaused ||
                                                myTeam?.playersAcquired?.length >= 25 ||
                                                (currentPlayer?.isOverseas &&
                                                    (myTeam?.overseasCount || 0) >= 8)
                                                ? "opacity-30 grayscale cursor-not-allowed"
                                                : "cursor-pointer"
                                            }
                                    `}
                                    >
                                        <div className="absolute bottom-0 w-6 h-20 rounded-b-md shadow-[inset_0_0_10px_rgba(0,0,0,0.8)] z-0" style={{ background: "linear-gradient(to right, #704214, #a0522d, #704214)" }}></div>
                                        <div className="absolute bottom-[4.5rem] w-8 h-1.5 bg-gradient-to-r from-gray-400 via-gray-100 to-gray-500 rounded shadow-md z-10"></div>
                                        <div className="absolute bottom-[4.8rem] w-24 h-24 rotate-45 border-[4px] border-gray-300 shadow-[0_10px_20px_rgba(0,0,0,0.5)] z-20 flex items-center justify-center rounded-sm overflow-hidden" style={{ backgroundColor: myTeam?.teamThemeColor || "#004BA0" }}>
                                            <div className="-rotate-45 flex items-center justify-center absolute w-[141%] h-[141%]">
                                                <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-md border border-black/10 shrink-0">
                                                    {myTeam?.playersAcquired?.length >= 25 ? (
                                                        <span className="text-[10px] font-black text-red-600 leading-none">FULL</span>
                                                    ) : myTeam?.teamLogo ? (
                                                        <img src={myTeam.teamLogo} alt="" className="w-[85%] h-[85%] object-contain drop-shadow-sm" />
                                                    ) : (
                                                        <span className="text-xl font-black text-slate-800 uppercase">BID</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </button>
                                </div>
                            </>
                        ) : (
                            <div className="flex flex-col items-end gap-2 p-4 rounded-2xl bg-white/5 border border-white/10 relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-yellow-500/10 blur-3xl rounded-full"></div>
                                <div className="text-xs font-black text-yellow-500 tracking-widest uppercase animate-pulse flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-yellow-500 shadow-[0_0_10px_#eab308]"></div>
                                    Spectator Mode
                                </div>
                                <div className="text-[10px] font-bold text-slate-400 mb-2 mt-1 max-w-[200px] text-right">
                                    You are watching the live auction. If a franchise has
                                    disconnected, you can request to take over.
                                </div>
                                <button
                                    onClick={handleRequestJoin}
                                    disabled={hasRequested}
                                    className={`px-4 py-2 text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-lg ${hasRequested
                                        ? "bg-white/10 text-white/50 cursor-not-allowed border border-white/5"
                                        : "bg-yellow-500 text-yellow-950 hover:bg-yellow-400 hover:shadow-yellow-500/25 cursor-pointer hover:scale-105"
                                        }`}
                                >
                                    {hasRequested ? "Request Pending..." : "Request to Join"}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Right Sidebar: Split Activity Feed & Chat (Responsive) */}
            <div
                className={`
                fixed lg:relative inset-y-0 right-0 z-[150] lg:z-10
                w-72 sm:w-80 lg:w-96 bg-slate-900 lg:bg-transparent border-r border-white/10 lg:border-none
                transition-transform duration-300 transform pb-16 lg:pb-0
                ${activeTab === "chat" ? "translate-x-0" : "translate-x-full lg:translate-x-0"}
                flex flex-col h-[100dvh] lg:h-auto
            `}
            >
                <div className="lg:hidden h-14 shrink-0"></div>

                {/* Top Half: Auction History (Desktop Only) */}
                <div className="hidden lg:flex flex-1 flex-col pt-8 min-h-0 border-b border-white/10 overflow-hidden">
                    <div className="flex px-6 mb-4 items-center justify-between">
                        <div>
                            <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mb-1">
                                Auction History
                            </h2>
                            <div className="h-0.5 w-10 bg-white/10"></div>
                        </div>
                        <div className="w-2 h-2 rounded-full bg-blue-500 animate-ping"></div>
                    </div>
                    <BidHistory bidHistory={bidHistory} />
                </div>

                {/* Bottom Half: Room Chat */}
                <ChatSection
                    chatMessages={chatMessages}
                    myTeam={myTeam}
                    chatEndRef={chatEndRef}
                    chatInput={chatInput}
                    setChatInput={setChatInput}
                    handleSendMessage={handleSendMessage}
                    isSpectator={!myTeam}
                />
            </div>

            {/* Mobile Bottom Navigation */}
            <div className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-slate-900/95 backdrop-blur-md border-t border-white/10 flex items-center justify-around z-[200] pb-safe">
                <button
                    onClick={() => setActiveTab('teams')}
                    className={`flex flex-col items-center gap-1 transition-all flex-1 py-1 ${activeTab === 'teams' ? 'text-blue-500' : 'text-slate-500'}`}
                >
                    <Users className="w-5 h-5" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Teams</span>
                </button>
                <button
                    onClick={() => setActiveTab('podium')}
                    className={`flex flex-col items-center gap-1 transition-all flex-1 py-1 ${activeTab === 'podium' ? 'text-blue-500' : 'text-slate-500'}`}
                >
                    <Layout className="w-5 h-5" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Podium</span>
                </button>
                <button
                    onClick={() => setActiveTab('chat')}
                    className={`flex flex-col items-center gap-1 transition-all flex-1 py-1 ${activeTab === 'chat' ? 'text-blue-500' : 'text-slate-500'}`}
                >
                    <MessageSquare className="w-5 h-5" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Chat</span>
                </button>
            </div>

            <style
                dangerouslySetInnerHTML={{
                    __html: `
                    @keyframes ticker {
                        0% { transform: translateX(0); }
                        100% { transform: translateX(-50%); }
                    }
                    .animate-ticker {
                        display: inline-flex;
                        animation: ticker 40s linear infinite;
                        will-change: transform;
                    }
                    .animate-ticker:hover {
                        animation-play-state: paused;
                    }
                `,
                }}
            />

            {/* Host Join Requests Modal */}
            <AnimatePresence>
                {showHostRequests && gameState?.host === socket.id && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            className="glass-card max-w-md w-full p-6 rounded-3xl border border-white/10 shadow-2xl relative overflow-hidden flex flex-col max-h-[80vh]"
                        >
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-xl font-black text-yellow-500 uppercase tracking-widest flex items-center gap-2">
                                    <span className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></span>
                                    Pending Requests
                                </h3>
                                <button
                                    onClick={() => setShowHostRequests(false)}
                                    className="text-slate-500 hover:text-white transition-colors"
                                >
                                    <svg
                                        className="w-6 h-6"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth="2"
                                            d="M6 18L18 6M6 6l12 12"
                                        ></path>
                                    </svg>
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-2">
                                {joinRequests.length === 0 ? (
                                    <div className="text-center text-slate-500 text-sm font-bold p-4">
                                        No pending requests right now.
                                    </div>
                                ) : (
                                    joinRequests.map((req) => (
                                        <div
                                            key={req.socketId}
                                            className="p-4 rounded-2xl bg-white/5 border border-white/10 flex flex-col gap-3"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="relative w-10 h-10">
                                                    <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center border border-slate-600">
                                                        <span className="text-sm font-black text-slate-400">
                                                            {req.name?.charAt(0)}
                                                        </span>
                                                    </div>
                                                    <span
                                                        className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-slate-900 ${onlineMap[req.socketId] === false
                                                            ? "bg-red-500 shadow-[0_0_6px_#ef4444]"
                                                            : "bg-green-500 shadow-[0_0_6px_#22c55e]"
                                                            }`}
                                                        title={onlineMap[req.socketId] === false ? "Offline" : "Online"}
                                                    />
                                                </div>
                                                <div>
                                                    <div className="text-sm font-black text-white">
                                                        {req.name}
                                                    </div>
                                                    <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">
                                                        Wants to takeover a franchise
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => {
                                                        socket.emit("approve_participation", {
                                                            roomCode,
                                                            targetSocketId: req.socketId,
                                                        });
                                                    }}
                                                    className="flex-1 py-2 bg-green-500/10 text-green-500 hover:bg-green-500 hover:text-white border border-green-500/20 rounded-xl text-xs font-black uppercase tracking-widest transition-all"
                                                >
                                                    APPROVE
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        socket.emit("reject_participation", {
                                                            roomCode,
                                                            targetSocketId: req.socketId,
                                                        });
                                                    }}
                                                    className="flex-1 py-2 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white border border-red-500/20 rounded-xl text-xs font-black uppercase tracking-widest transition-all"
                                                >
                                                    REJECT
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Spectator Claim Franchise Modal */}
            <AnimatePresence>
                {showClaimModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
                    >
                        <motion.div className="glass-card max-w-lg w-full p-8 rounded-3xl border border-white/20 shadow-2xl relative">
                            <h2 className="text-2xl font-black text-green-400 uppercase tracking-widest text-center mb-2">
                                Request Approved!
                            </h2>
                            <p className="text-sm text-slate-300 text-center mb-6 font-medium">
                                The Host has invited you. Select an abandoned franchise to take
                                over instantly.
                            </p>

                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[50vh] overflow-y-auto p-2 custom-scrollbar">
                                {gameState?.availableTeams?.map((team) => (
                                    <button
                                        key={team.shortName}
                                        onClick={() => setSelectedTeamId(team.shortName)}
                                        className={`p-3 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 ${selectedTeamId === team.shortName ? "bg-blue-600/20 border-blue-500 scale-105 shadow-[0_0_20px_rgba(59,130,246,0.3)]" : "bg-white/5 border-white/10 hover:border-white/30"}`}
                                    >
                                        <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center p-1.5 shadow-inner">
                                            {team.logoUrl ? (
                                                <img
                                                    src={team.logoUrl}
                                                    alt={team.name}
                                                    className="w-full h-full object-contain"
                                                />
                                            ) : (
                                                <span className="text-xs font-black text-slate-800">
                                                    {team.shortName}
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-[10px] font-black text-center text-white uppercase tracking-wider truncate w-full">
                                            {team.shortName}
                                        </div>
                                    </button>
                                ))}
                                {gameState?.availableTeams?.length === 0 && (
                                    <div className="col-span-full py-8 text-center text-slate-500 text-sm font-bold">
                                        No franchises available currently.
                                    </div>
                                )}
                            </div>

                            <div className="mt-8 flex gap-4">
                                <button
                                    onClick={() => setShowClaimModal(false)}
                                    className="flex-1 py-3 bg-white/5 text-slate-400 hover:text-white rounded-xl text-xs font-black uppercase tracking-widest border border-white/10 transition-colors"
                                >
                                    CANCEL
                                </button>
                                <button
                                    onClick={handleClaimTeamMidAuction}
                                    disabled={!selectedTeamId}
                                    className={`flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${!selectedTeamId ? "bg-blue-600/30 text-blue-200/50 cursor-not-allowed" : "bg-blue-600 text-white shadow-[0_0_20px_rgba(37,99,235,0.5)] hover:bg-blue-500"}`}
                                >
                                    TAKE OVER
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

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

            {/* Leave Confirmation Modal */}
            {/* Kick Confirmation Modal */}
            <AnimatePresence>
                {kickTarget && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            className="glass-card max-w-sm w-full p-8 rounded-3xl border border-white/10 shadow-2xl relative overflow-hidden"
                        >
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 to-orange-500"></div>

                            <div className="flex flex-col items-center text-center space-y-6">
                                <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-2">
                                    <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7a4 4 0 11-8 0 4 4 0 018 0zM9 14a6 6 0 00-6 6v1h12v-1a6 6 0 00-6-6zM21 12h-6" />
                                    </svg>
                                </div>

                                <div>
                                    <h3 className="text-xl font-black text-white uppercase tracking-wider mb-2">
                                        Kick Player?
                                    </h3>
                                    <p className="text-slate-400 text-sm font-medium">
                                        Are you sure you want to kick{" "}
                                        <span className="text-white font-black">{kickTarget?.name}</span>{" "}
                                        from the live auction?
                                    </p>
                                </div>

                                <div className="flex w-full gap-4 text-[10px] font-black uppercase tracking-widest">
                                    {/* Cancel (Red X) */}
                                    <button
                                        onClick={() => setKickTarget(null)}
                                        className="flex-1 py-4 flex flex-col items-center justify-center gap-2 rounded-2xl bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-all group"
                                    >
                                        <div className="w-10 h-10 rounded-full bg-red-500/20 group-hover:bg-red-500 flex items-center justify-center transition-colors">
                                            <svg className="w-5 h-5 text-red-500 group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </div>
                                        Cancel
                                    </button>

                                    {/* Confirm (Green Tick) */}
                                    <button
                                        onClick={() => {
                                            if (kickTarget?.socketId) {
                                                socket.emit("kick_player", {
                                                    roomCode,
                                                    targetSocketId: kickTarget.socketId,
                                                });
                                            }
                                            setKickTarget(null);
                                        }}
                                        className="flex-1 py-4 flex flex-col items-center justify-center gap-2 rounded-2xl bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-all group"
                                    >
                                        <div className="w-10 h-10 rounded-full bg-green-500/20 group-hover:bg-green-500 flex items-center justify-center transition-colors">
                                            <svg className="w-5 h-5 text-green-500 group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                                            </svg>
                                        </div>
                                        Kick
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Leave Confirmation Modal */}
            <AnimatePresence>
                {showLeaveConfirm && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            className="glass-card max-w-sm w-full p-8 rounded-3xl border border-white/10 shadow-2xl relative overflow-hidden"
                        >
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 to-orange-500"></div>

                            <div className="flex flex-col items-center text-center space-y-6">
                                <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-2">
                                    <svg
                                        className="w-8 h-8 text-red-500"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth="2"
                                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                                        />
                                    </svg>
                                </div>

                                <div>
                                    <h3 className="text-xl font-black text-white uppercase tracking-wider mb-2">
                                        Leave Live Auction?
                                    </h3>
                                    <p className="text-slate-400 text-sm font-medium">
                                        Are you sure you want to{" "}
                                        {gameState?.host === socket.id
                                            ? "disband this live auction"
                                            : "leave this live auction"}
                                        ?
                                    </p>
                                </div>

                                <div className="flex w-full gap-4 mt-4 text-[10px] font-black uppercase tracking-widest">
                                    <button
                                        onClick={() => setShowLeaveConfirm(false)}
                                        className="flex-1 py-4 flex flex-col items-center justify-center gap-2 rounded-2xl bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-all group"
                                    >
                                        <div className="w-10 h-10 rounded-full bg-red-500/20 group-hover:bg-red-500 flex items-center justify-center transition-colors">
                                            <svg
                                                className="w-5 h-5 text-red-500 group-hover:text-white"
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                            >
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth="3"
                                                    d="M6 18L18 6M6 6l12 12"
                                                />
                                            </svg>
                                        </div>
                                        <span>Cancel</span>
                                    </button>

                                    <button
                                        onClick={confirmLeaveRoom}
                                        className="flex-1 py-4 flex flex-col items-center justify-center gap-2 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500 hover:text-white transition-all group shadow-[0_0_15px_rgba(239,68,68,0.1)]"
                                    >
                                        <div className="w-10 h-10 rounded-full bg-green-500/20 group-hover:bg-green-500 flex items-center justify-center transition-colors">
                                            <svg
                                                className="w-5 h-5 text-green-500 group-hover:text-white"
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                            >
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth="3"
                                                    d="M5 13l4 4L19 7"
                                                />
                                            </svg>
                                        </div>
                                        <span>Confirm</span>
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
            {/* Force End Confirmation Modal */}
            <AnimatePresence>
                {showForceEndConfirm && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            className="glass-card max-w-sm w-full p-8 rounded-3xl border border-white/10 shadow-2xl relative overflow-hidden"
                        >
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-600 to-red-400"></div>

                            <div className="flex flex-col items-center text-center space-y-6">
                                <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-2">
                                    <AlertTriangle className="w-8 h-8 text-red-500" />
                                </div>

                                <div>
                                    <h3 className="text-xl font-black text-white uppercase tracking-wider mb-2">
                                        End Auction?
                                    </h3>
                                    <p className="text-slate-400 text-sm font-medium">
                                        Are you sure you want to <span className="text-red-400">Force End</span> the auction? This will skip all remaining players.
                                    </p>
                                </div>

                                <div className="flex w-full gap-4 text-[10px] font-black uppercase tracking-widest">
                                    {/* Cancel (Red X) */}
                                    <button
                                        onClick={() => setShowForceEndConfirm(false)}
                                        className="flex-1 py-4 flex flex-col items-center justify-center gap-2 rounded-2xl bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-all group"
                                    >
                                        <div className="w-10 h-10 rounded-full bg-red-500/20 group-hover:bg-red-500 flex items-center justify-center transition-colors shadow-lg shadow-red-500/20">
                                            <svg className="w-5 h-5 text-red-500 group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </div>
                                        <span>Cancel</span>
                                    </button>

                                    {/* Confirm (Green Tick) */}
                                    <button
                                        onClick={() => {
                                            socket.emit("force_end_auction", { roomCode });
                                            setShowForceEndConfirm(false);
                                        }}
                                        className="flex-1 py-4 flex flex-col items-center justify-center gap-2 rounded-2xl bg-green-500/10 border border-green-500/20 text-green-400 hover:bg-green-500 hover:text-white transition-all group shadow-lg shadow-green-500/10"
                                    >
                                        <div className="w-10 h-10 rounded-full bg-green-500/20 group-hover:bg-green-500 flex items-center justify-center transition-colors shadow-lg shadow-green-500/20">
                                            <svg className="w-6 h-6 text-green-500 group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                                            </svg>
                                        </div>
                                        <span>Confirm</span>
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Pool Players Modal */}
            <AnimatePresence>
                {showPoolModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            className="glass-card max-w-2xl w-full max-h-[80vh] flex flex-col rounded-3xl border border-white/10 shadow-2xl relative overflow-hidden"
                        >
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-600 to-purple-600"></div>

                            {/* Modal Header */}
                            <div className="p-6 border-b border-white/5 flex justify-between items-center">
                                <div>
                                    <h3 className="text-xl font-black text-white uppercase tracking-wider">Player Pools</h3>
                                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Auction Sequence Preview</p>
                                </div>
                                <button
                                    onClick={() => setShowPoolModal(false)}
                                    className="p-2 rounded-full hover:bg-white/10 text-slate-400 transition-colors"
                                >
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>

                            {/* Tab Switcher */}
                            <div className="px-6 py-2 flex gap-4 border-b border-white/5 bg-white/5">
                                <button
                                    onClick={() => setPoolTab("live")}
                                    className={`pb-2 text-[10px] font-black uppercase tracking-widest transition-all relative ${poolTab === "live" ? "text-blue-400" : "text-slate-500 hover:text-slate-300"}`}
                                >
                                    Live & Upcoming
                                    {poolTab === "live" && <motion.div layoutId="poolTab" className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-400" />}
                                </button>
                                <button
                                    onClick={() => setPoolTab("sold")}
                                    className={`pb-2 text-[10px] font-black uppercase tracking-widest transition-all relative ${poolTab === "sold" ? "text-green-400" : "text-slate-500 hover:text-slate-300"}`}
                                >
                                    Sold History
                                    {poolTab === "sold" && <motion.div layoutId="poolTab" className="absolute bottom-0 left-0 w-full h-0.5 bg-green-400" />}
                                </button>
                                <button
                                    onClick={() => setPoolTab("unsold")}
                                    className={`pb-2 text-[10px] font-black uppercase tracking-widest transition-all relative ${poolTab === "unsold" ? "text-red-400" : "text-slate-500 hover:text-slate-300"}`}
                                >
                                    Unsold
                                    {poolTab === "unsold" && <motion.div layoutId="poolTab" className="absolute bottom-0 left-0 w-full h-0.5 bg-red-400" />}
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                                {poolTab === "live" ? (
                                    <div className="space-y-10">
                                        {/* Current Pool Players */}
                                        <div>
                                            <div className="flex items-center gap-3 mb-4">
                                                <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
                                                <h4 className="text-[10px] font-black text-blue-400 uppercase tracking-[0.3em]">Current Auction</h4>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                {currentPlayer ? (
                                                    <div className="glass-panel p-4 rounded-2xl border-blue-500/30 bg-blue-500/5 flex items-center justify-between col-span-1 md:col-span-2 shadow-lg shadow-blue-500/5">
                                                        <div className="flex items-center gap-4">
                                                            <div className="w-12 h-12 rounded-full border-2 border-blue-500/30 flex items-center justify-center overflow-hidden bg-white/5 relative shadow-lg shadow-blue-500/10">
                                                                {(currentPlayer.imagepath || currentPlayer.image_path || currentPlayer.photoUrl) ? (
                                                                    <>
                                                                        <img
                                                                            src={currentPlayer.imagepath || currentPlayer.image_path || currentPlayer.photoUrl}
                                                                            alt={currentPlayer.name}
                                                                            className="w-full h-full object-cover"
                                                                        />
                                                                        <div className="absolute inset-x-0 bottom-0 bg-blue-500/80 text-[6px] font-black text-white text-center py-0.5 uppercase tracking-tighter">LIVE</div>
                                                                    </>
                                                                ) : (
                                                                    <div className="w-full h-full flex items-center justify-center bg-blue-500 font-black text-[10px] text-white">NOW</div>
                                                                )}
                                                            </div>
                                                            <div>
                                                                <div className="text-sm font-black text-white uppercase tracking-tight">
                                                                    {currentPlayer.name || currentPlayer.player}
                                                                </div>
                                                                <div className="text-[9px] font-black text-blue-400 uppercase tracking-widest mt-0.5">
                                                                    {currentPlayer.poolName || currentPlayer.role || "Player"} • {currentPlayer.country}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="text-sm font-mono font-black text-blue-400">₹{currentPlayer.basePrice}L</div>
                                                    </div>
                                                ) : (
                                                    <div className="col-span-2 text-center py-4 text-slate-500 text-xs font-bold italic">No active player on podium.</div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Grouped Catalog Catalog */}
                                        {upcomingPlayers && upcomingPlayers.length > 0 ? (
                                            Object.entries(upcomingPlayers.reduce((acc, p) => {
                                                const pool = p.poolName || "Other Upcoming Stars";
                                                if (!acc[pool]) acc[pool] = [];
                                                acc[pool].push(p);
                                                return acc;
                                            }, {})).map(([poolName, players], groupIdx) => (
                                                <div key={poolName} className="space-y-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="h-[1px] flex-1 bg-gradient-to-r from-purple-500/50 to-transparent"></div>
                                                        <h4 className="text-[9px] font-black text-purple-400 uppercase tracking-[0.4em] whitespace-nowrap bg-purple-500/5 px-3 py-1 rounded-full border border-purple-500/10">
                                                            {poolName}
                                                        </h4>
                                                        <div className="h-[1px] flex-1 bg-transparent"></div>
                                                    </div>
                                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                                        {players.map((p, pIdx) => {
                                                            const imageUrl = p.imagepath || p.image_path || p.photoUrl;
                                                            return (
                                                                <div key={p._id || `${poolName}-${pIdx}`} className="glass-panel p-2.5 rounded-xl border-white/5 flex items-center justify-between hover:bg-white/10 transition-all group">
                                                                    <div className="flex items-center gap-2.5 min-w-0">
                                                                        <div className="w-8 h-8 rounded-full border border-white/10 flex items-center justify-center overflow-hidden bg-white/5 group-hover:border-purple-500/30 transition-colors">
                                                                            {imageUrl ? (
                                                                                <img src={imageUrl} alt={p.name} className="w-full h-full object-cover" />
                                                                            ) : (
                                                                                <span className="font-black text-[8px] text-slate-500">#{pIdx + 1}</span>
                                                                            )}
                                                                        </div>
                                                                        <div className="text-[11px] font-bold text-slate-300 truncate group-hover:text-white transition-colors">
                                                                            {p.name || p.player}
                                                                        </div>
                                                                    </div>
                                                                    <div className="text-[9px] font-mono font-black text-slate-500 group-hover:text-purple-400">₹{p.basePrice}L</div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="text-center py-12 text-slate-500 text-xs font-bold italic">
                                                {currentPlayer ? "Final player on auction catalog." : "Syncing with catalog..."}
                                            </div>
                                        )}
                                    </div>
                                ) : poolTab === "sold" ? (
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-3 mb-4">
                                            <div className="w-2 h-2 rounded-full bg-green-500"></div>
                                            <h4 className="text-[10px] font-black text-green-400 uppercase tracking-[0.3em]">Completed Auctions</h4>
                                        </div>
                                        <div className="grid grid-cols-1 gap-2">
                                            {activeTeams.flatMap(t => t.playersAcquired.map(p => ({ ...p, teamBought: t.teamName, teamColor: t.themeColor, teamLogo: t.teamLogo }))).length > 0 ? (
                                                activeTeams.flatMap(t => t.playersAcquired.map(p => ({ ...p, teamBought: t.teamName, teamColor: t.themeColor, teamLogo: t.teamLogo })))
                                                    .sort((a, b) => b.boughtFor - a.boughtFor) // Show highest buys first
                                                    .map((p, idx) => {
                                                        const imageUrl = p.imagepath || p.image_path || p.photoUrl;
                                                        return (
                                                            <div key={idx} className="glass-panel p-3 rounded-xl border-white/5 flex items-center justify-between">
                                                                <div className="flex items-center gap-4">
                                                                    <div
                                                                        className="w-10 h-10 rounded-full border-2 flex items-center justify-center overflow-hidden bg-white/5 shadow-inner transition-colors"
                                                                        style={{
                                                                            borderColor: `${p.teamColor}50`, // 30% opacity border
                                                                            backgroundColor: `${p.teamColor}10` // 10% opacity bg
                                                                        }}
                                                                    >
                                                                        {imageUrl ? (
                                                                            <img src={imageUrl} alt={p.name} className="w-full h-full object-cover" />
                                                                        ) : (
                                                                            <div className="font-black text-[10px] uppercase" style={{ color: p.teamColor }}>SOLD</div>
                                                                        )}
                                                                    </div>
                                                                    <div>
                                                                        <div className="text-sm font-black text-white uppercase">{p.name || p.player}</div>
                                                                        <div
                                                                            className="text-[9px] font-black uppercase tracking-widest mt-0.5 flex items-center gap-2"
                                                                            style={{ color: p.teamColor || '#fff' }}
                                                                        >
                                                                            {p.teamLogo && <img src={p.teamLogo} className="w-3 h-3 object-contain" alt="" />}
                                                                            {p.teamBought}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                <div className="text-right">
                                                                    <div className="text-sm font-mono font-black text-yellow-500">₹{p.boughtFor}L</div>
                                                                    <div className="text-[8px] font-bold text-slate-500 uppercase">Base: ₹{p.basePrice}L</div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })
                                            ) : (
                                                <div className="text-center py-12 text-slate-500 text-sm font-bold italic">No players sold yet in this session.</div>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-3 mb-4">
                                            <div className="w-2 h-2 rounded-full bg-red-500"></div>
                                            <h4 className="text-[10px] font-black text-red-400 uppercase tracking-[0.3em]">Unsold Catalog</h4>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                            {unsoldHistory.length > 0 ? (
                                                unsoldHistory.map((p, idx) => {
                                                    const imageUrl = p.imagepath || p.image_path || p.photoUrl;
                                                    return (
                                                        <div key={idx} className="glass-panel p-3 rounded-xl border-white/5 flex items-center justify-between bg-red-500/5">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-10 h-10 rounded-full border border-red-500/20 flex items-center justify-center overflow-hidden bg-white/5">
                                                                    {imageUrl ? (
                                                                        <img src={imageUrl} alt={p.name} className="w-full h-full object-cover" />
                                                                    ) : (
                                                                        <div className="font-black text-[10px] text-red-400 uppercase">SKIP</div>
                                                                    )}
                                                                </div>
                                                                <div>
                                                                    <div className="text-sm font-bold text-white truncate max-w-[120px]">{p.name || p.player}</div>
                                                                    <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest">{p.role || "Player"}</div>
                                                                </div>
                                                            </div>
                                                            <div className="text-right text-[10px] font-mono font-black text-slate-500 uppercase">₹{p.basePrice}L</div>
                                                        </div>
                                                    );
                                                })
                                            ) : (
                                                <div className="col-span-2 text-center py-12 text-slate-500 text-sm font-bold italic">Every player has received bids so far.</div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Modal Footer */}
                            <div className="p-4 bg-white/5 border-t border-white/5 text-center">
                                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                                    Catalog reflects the official IPL 2025 sequence logic
                                </p>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default AuctionPodium;
