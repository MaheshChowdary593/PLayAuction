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
import { Users, Layout, MessageSquare, Play, Pause, Square, ListChecks, AlertTriangle, Settings, Plane, X } from 'lucide-react';
import GavelSlam from "../components/GavelSlam";
import {
    TeamList,
    BidHistory,
    ChatSection,
} from "../components/AuctionSubComponents";

import { playBidSound, playWarningBeep } from "../utils/soundEngine";
import { getFlagUrl, getRoleDisplayName, fmtCr } from "../utils/playerUtils";

const AuctionPodium = () => {
    const { roomCode } = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const { socket } = useSocket();
    const [isSocketReady, setIsSocketReady] = useState(false);

    const [gameState, setGameState] = useState(location.state?.roomState || null);
    // Track if we have a valid room session. On tab restore, location.state is gone
    // so gameState will be null until socket reconnects and room_joined fires.
    const didJoinViaState = useRef(!!location.state?.roomState);
    // If user joined as a spectator (passed via navigate state), keep them in spectator mode
    const forceSpectator = location.state?.isSpectator === true;
    const { playerName, userId, isReady: isSessionReady } = useSession();
    const [currentPlayer, setCurrentPlayer] = useState(null);
    const currentPlayerRef = useRef(null); // Needed for safety-net sync timeouts
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
    const [coHostUserIds, setCoHostUserIds] = useState(location.state?.roomState?.coHostUserIds || []);

    useEffect(() => {
        // Fetch players to create a fallback name map in case backend only sends IDs
        const apiUrl = import.meta.env.VITE_API_URL || "";
        fetch(`${apiUrl}/api/players`)
            .then((res) => res.json())
            .then((data) => {
                if (!Array.isArray(data)) throw new Error("Invalid player data format");
                const map = {};
                data.forEach((p) => {
                    map[p._id] = p;
                    if (p.playerId) map[p.playerId] = p;
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
    // Timer settings dropdown (host only)
    const [showTimerSettings, setShowTimerSettings] = useState(false);
    const [currentTimerDuration, setCurrentTimerDuration] = useState(10);
    // Toast notification: { message, type } or null
    const [toast, setToast] = useState(null);
    // Pool View State
    const [showPoolModal, setShowPoolModal] = useState(false);
    const [upcomingPlayers, setUpcomingPlayers] = useState([]);
    const [poolTab, setPoolTab] = useState("live"); // "live", "sold", or "unsold"
    const [unsoldHistory, setUnsoldHistory] = useState([]);
    const [skippedHistory, setSkippedHistory] = useState([]);

    // Interest Voting State
    const [votingSession, setVotingSession] = useState(null);
    const [showVotingModal, setShowVotingModal] = useState(false);
    const [selectedVotes, setSelectedVotes] = useState([]);

    // Chat State
    const [chatMessages, setChatMessages] = useState([]);
    const [chatInput, setChatInput] = useState("");
    const chatEndRef = useRef(null);

    // Tabs state for Mobile UI
    const [activeTab, setActiveTab] = useState("podium"); // "teams", "podium", "chat"

    useEffect(() => {
        if (!votingSession || !votingSession.active) return;
        const interval = setInterval(() => {
            setVotingSession(prev => {
                if (!prev || prev.timer <= 0) {
                    clearInterval(interval);
                    return prev;
                }
                return { ...prev, timer: prev.timer - 1 };
            });
        }, 1000);
        return () => clearInterval(interval);
    }, [votingSession?.active]);

    // Scroll chat to bottom when new messages arrive
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [chatMessages]);

    // Periodic sync guard: if socket is ready but currentPlayer is still null,
    // retry the sync every 3s. Stops once a player is found (or the auction hasn't started).
    useEffect(() => {
        if (!isSocketReady || !socket || !roomCode) return;
        if (currentPlayer) return; // Player already loaded, no need to retry

        const interval = setInterval(() => {
            if (currentPlayerRef.current) {
                clearInterval(interval);
                return;
            }
            console.log("[AUTO-SYNC] Retrying auction sync — currentPlayer still null");
            socket.emit("request_auction_sync", { roomCode });
        }, 3000);

        // Stop after 30 seconds (10 retries) to avoid infinite spam
        const timeout = setTimeout(() => clearInterval(interval), 30000);

        return () => {
            clearInterval(interval);
            clearTimeout(timeout);
        };
    }, [isSocketReady, socket, roomCode, currentPlayer]);

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

            if (state.coHostUserIds) setCoHostUserIds(state.coHostUserIds);

            // High-reliability restoration: check for activePlayer directly in join payload
            if (state.activePlayer) {
                console.log("Restoring active player from join payload:", state.activePlayer.name);
                setCurrentPlayer(state.activePlayer);
                currentPlayerRef.current = state.activePlayer;
                if (state.activeBid) setCurrentBid(state.activeBid);
            }
            // Fallback for older server versions or edge cases
            else if (state.players && state.players.length > 0 && state.players[state.currentIndex]) {
                setCurrentPlayer(state.players[state.currentIndex]);
                currentPlayerRef.current = state.players[state.currentIndex];
                setCurrentBid(state.currentBid || { amount: 0, teamId: null, teamName: null });
            }
            // If still missing but auction is live, request a fresh sync
            else if (['Auctioning', 'Paused'].includes(state.status)) {
                console.log("Auction is live but player missing, requesting sync...");
                socket.emit("request_auction_sync", { roomCode });
            }

            // If the page was loaded fresh (tab restore) and we're now back in the game,
            // schedule a second sync as a safety net in case the first one was missed.
            if (!didJoinViaState.current) {
                setTimeout(() => {
                    if (!currentPlayerRef.current) {
                        console.log("[TAB RESTORE] Safety-net sync emitted");
                        socket.emit("request_auction_sync", { roomCode });
                    }
                }, 1500);
            }
        };

        const handleNewPlayer = ({ player, nextPlayers, timer, skippedHistory: incomingSkipped }) => {
            console.log("Received new_player sync!", player?.name);
            setCurrentPlayer(player);
            currentPlayerRef.current = player;
            setTimer(timer);
            setCurrentBid({
                amount: 0,
                teamId: null,
                teamName: null,
                teamColor: null,
            });
            setSoldEvent(null);
            setBidHistory([]);
            if (incomingSkipped) setSkippedHistory(incomingSkipped);

            if (nextPlayers) {
                setUpcomingPlayers(nextPlayers);
                nextPlayers.forEach(p => {
                    const url = p.imagepath || p.image_path || p.photoUrl;
                    if (url) new Image().src = url;
                });
            }
        };

        const handleTimerTick = ({ timer, t }) => {
            const val = t !== undefined ? t : timer;
            setTimer(prev => {
                if (val > 0 && val <= 3 && val !== prev) playWarningBeep();
                return val;
            });
        };

        const handleBidPlaced = (payload) => {
            // Handle compact payload (bp/cb) or legacy (bid_placed/currentBid)
            const cb = payload.cb || payload.currentBid;
            const t = payload.t !== undefined ? payload.t : payload.timer;

            const mappedBid = {
                amount: cb.a || cb.amount,
                teamId: cb.tid || cb.teamId,
                teamName: cb.tn || cb.teamName,
                teamColor: cb.tc || cb.teamColor,
                teamLogo: cb.tl || cb.teamLogo,
                ownerName: cb.on || cb.ownerName
            };

            setCurrentBid(mappedBid);
            setTimer(t);
            setBidHistory(prev => [{
                id: Date.now(),
                ...mappedBid,
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
                teamLogo: winningBid.teamLogo,
                teamColor: winningBid.teamColor,
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

        const handleSettingsUpdated = ({ timerDuration }) => {
            console.log("Settings updated! New duration:", timerDuration);
            setGameState(prev => prev ? { ...prev, timerDuration } : null);
            setCurrentTimerDuration(timerDuration);
        };

        const handleHostChanged = ({ newHost }) => {
            console.log("Host changed! New host:", newHost.name);
            setGameState(prev => prev ? {
                ...prev,
                host: newHost.socketId,
                hostName: newHost.name,
                hostUserId: newHost.userId
            } : null);
            setToast({ message: `Auctioneer changed: ${newHost.name} is now moderating.`, type: 'info' });
        };

        const handleCoHostsUpdated = ({ coHostUserIds }) => {
            setCoHostUserIds(coHostUserIds);
            setGameState(prev => prev ? { ...prev, coHostUserIds } : null);
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
        socket.on("tt", handleTimerTick);
        socket.on("bid_placed", handleBidPlaced);
        socket.on("bp", handleBidPlaced);
        socket.on("player_sold", handlePlayerSold);
        socket.on("player_unsold", handlePlayerUnsold);
        socket.on("interest_voting_started", ({ players, timer }) => {
            setVotingSession({ players, timer, active: true });
            setSelectedVotes([]);
            setShowVotingModal(true);
        });
        socket.on("interest_voting_completed", ({ skippedCount, message }) => {
            setShowVotingModal(false);
            setVotingSession(null);
            setToast({ message, type: "info" });
        });
        socket.on("auction_finished", handleAuctionFinished);
        socket.on("settings_updated", handleSettingsUpdated);
        socket.on("host_changed", handleHostChanged);
        socket.on("auction_paused", () => setIsPaused(true));
        socket.on("auction_resumed", () => setIsPaused(false));
        socket.on("cohosts_updated", handleCoHostsUpdated);
        socket.on("receive_chat_message", (msg) => setChatMessages(prev => [...prev.slice(-49), msg])); // Keep last 50 for performance
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
            socket.off("tt", handleTimerTick);
            socket.off("bid_placed", handleBidPlaced);
            socket.off("bp", handleBidPlaced);
            socket.off("player_sold", handlePlayerSold);
            socket.off("player_unsold", handlePlayerUnsold);
            socket.off("auction_finished", handleAuctionFinished);
            socket.off("settings_updated", handleSettingsUpdated);
            socket.off("host_changed", handleHostChanged);
            socket.off("auction_paused");
            socket.off("auction_resumed");
            socket.off("cohosts_updated");
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

    // Dynamic Increment Logic — matches server-side validation exactly
    const getMinIncrement = () => {
        if (!currentPlayer) return 25;
        const poolID = currentPlayer.poolID || '';
        const curAmt = currentBid.amount;
        const lowerPool = poolID.toLowerCase();

        if (lowerPool.startsWith('marquee') || lowerPool.includes('pool1') || lowerPool.includes('pool2')) {
            return 25; // flat 25L
        } else if (lowerPool.includes('emerging') || lowerPool.includes('pool3') || lowerPool.includes('pool4')) {
            // Emerging, Pool 3, Pool 4: 5L up to 2Cr, then 25L
            return curAmt < 200 ? 5 : 25;
        }
        return 25; // safe fallback
    };

    // Base price per pool if no bid placed yet
    const getPoolBasePrice = () => {
        if (!currentPlayer) return 50;
        const poolID = currentPlayer.poolID || '';
        if (poolID === 'marquee') return currentPlayer.basePrice || 200;
        if (poolID === 'pool1_batsmen' || poolID === 'pool1_bowlers') return currentPlayer.basePrice || 150;
        if (poolID === 'emerging_players') return currentPlayer.basePrice || 30;
        if (poolID === 'pool2_batsmen' || poolID === 'pool2_bowlers') return currentPlayer.basePrice || 100;
        return currentPlayer.basePrice || 50; // pool3, pool4
    };

    const minIncrement = getMinIncrement();
    const targetAmount =
        currentBid.amount === 0
            ? getPoolBasePrice()
            : currentBid.amount + minIncrement;


    const handleBid = useCallback(() => {
        if (!socket || !myTeam || timer < 0 || soldEvent || isPaused) return;
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

    const isPrimaryHost = useMemo(() => (userId && gameState?.hostUserId === userId) || gameState?.host === socket?.id, [userId, gameState?.hostUserId, gameState?.host, socket?.id]);
    const isCoHostUser = useMemo(() => userId && coHostUserIds.includes(userId), [userId, coHostUserIds]);
    const isModerator = isPrimaryHost || isCoHostUser;
    const isHost = isModerator;

    const handleToggleCoHost = useCallback((targetUserId) => {
        socket.emit("toggle_cohost", { roomCode, userId: targetUserId });
    }, [socket, roomCode]);

    const handleKick = useCallback((socketId, name) => {
        setKickTarget({ socketId, name });
    }, []);

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

    // Timer color: use leading team's color, fall back to urgency colors at end
    let timerColor = currentBid.teamColor || "#00d2ff";
    if (timer <= 1) timerColor = "#ef4444"; // Flash red only in final 1s for urgency

    if (!isSessionReady || !isSocketReady) {
        return (
            <div className="min-h-screen bg-[#0a0702] flex flex-col items-center justify-center p-6 text-center">
                <div className="w-16 h-16 border-4 border-[#D4AF37]/20 border-t-[#D4AF37] rounded-full animate-spin mb-6"></div>
                <h2 className="text-xl font-black text-white uppercase tracking-[0.2em] mb-2">
                    Preparing Podium Interface
                </h2>
                <p className="text-[#D4AF37]/50 text-sm max-w-xs leading-relaxed">
                    Synchronizing auction state and reconciling your session...
                </p>
                {!isSessionReady && (
                    <p className="text-[#D4AF37]/60 text-[10px] uppercase font-bold tracking-widest mt-4">
                        Hydrating Local Session
                    </p>
                )}
                {isSessionReady && !isSocketReady && (
                    <p className="text-[#D4AF37]/60 text-[10px] uppercase font-bold tracking-widest mt-4">
                        Establishing Secure Bridge
                    </p>
                )}
            </div>
        );
    }

    return (
        <div className="flex flex-col lg:flex-row h-[100dvh] bg-[var(--dark-depth)] bg-sweeping-lines text-slate-100 font-sans selection:bg-yellow-500/30 overflow-hidden relative">
            {/* Cinematic Background Elements */}
            <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-yellow-600/10 blur-[150px] rounded-full"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-yellow-500/10 blur-[150px] rounded-full"></div>

                {/* Orbital Lines - Image 2 Style */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] border border-yellow-500/5 rounded-full"></div>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[1000px] border border-yellow-500/5 rounded-full"></div>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1200px] h-[1200px] border border-yellow-500/5 rounded-full"></div>

                {/* Diagonal Sweeping Lines */}
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10"></div>
            </div>

            {/* Left Sidebar: Franchises (Responsive) */}
            <div
                className={`
                fixed lg:relative inset-y-0 left-0 z-[150] lg:z-10
                w-full lg:w-80 xl:w-96 bg-[#07090f]/95 lg:bg-transparent backdrop-blur-xl lg:backdrop-blur-none border-r border-yellow-500/10 lg:border-none
                transition-transform duration-300 transform pb-16 lg:pb-0
                ${activeTab === "teams" ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
                flex flex-col h-[100dvh] lg:h-auto
            `}
            >
                <div className="lg:hidden h-14 bg-[var(--darker-depth)] shrink-0"></div>
                <div className="px-6 mb-6 flex justify-between items-center z-10 pt-4">
                    <div>
                        <h2 className="text-[10px] font-black text-yellow-600/70 uppercase tracking-[0.3em] mb-1 drop-shadow-md">
                            Live Budgets
                        </h2>
                        <div className="h-[1px] w-12 bg-gradient-to-r from-yellow-500/50 to-transparent"></div>
                    </div>
                    <button
                        onClick={() => setActiveTab('podium')}
                        className="lg:hidden text-[#D4AF37]/50 hover:text-white p-2"
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
                        isHost={isHost}
                        isPrimaryHost={isPrimaryHost}
                        coHostUserIds={coHostUserIds}
                        mySocketId={socket?.id}
                        onKick={handleKick}
                        onToggleCoHost={handleToggleCoHost}
                    />
                </div>
            </div>

            {/* Middle Section: Header, Ticker, Arena & Interaction Bar */}
            <div className={`flex-1 flex-col min-w-0 h-[100dvh] relative overflow-hidden pb-16 lg:pb-0 z-20 ${activeTab === 'podium' ? 'flex' : 'hidden lg:flex'}`}>
                {/* Header (Refined for Mobile) */}
                <header className="relative z-[60] glass-panel border-b border-[#D4AF37]/20 bg-[#1a1205]/95 backdrop-blur-md">
                    <div className="max-w-[2000px] mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between">
                        <div className="flex items-center gap-2 sm:gap-6">
                            <button
                                onClick={() => setShowLeaveConfirm(true)}
                                className="text-[#D4AF37]/60 hover:text-white bg-white/5 hover:bg-white/10 border border-[#D4AF37]/20 p-2 sm:p-2.5 rounded-full transition-all group z-20"
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
                            <div className="flex flex-col">
                                <div className="text-[6px] font-black text-yellow-600/70 uppercase tracking-[0.3em] mb-0.5">
                                    Room ID
                                </div>
                                <div className="px-3 py-1 rounded-full bg-yellow-500/10 border border-yellow-500/30 text-[10px] sm:text-sm font-black font-mono text-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.1)]">
                                    {roomCode}
                                </div>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <div className="flex items-center gap-1.5 px-3 py-1 bg-red-900/30 border border-red-500/30 rounded-full shadow-[0_0_10px_rgba(239,68,68,0.1)]">
                                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_5px_rgba(239,68,68,0.8)]"></div>
                                    <span className="text-[7px] sm:text-[10px] font-black uppercase tracking-widest text-red-500">
                                        Live
                                    </span>
                                </div>
                                <button
                                    onClick={() => setShowPoolModal(true)}
                                    className="p-1.5 sm:p-2 rounded-full bg-yellow-500/10 border border-yellow-500/30 text-yellow-500 hover:bg-yellow-500/20 transition-all shadow-[0_0_10px_rgba(234,179,8,0.1)]"
                                    title="View Current & Next Pool"
                                >
                                    <Users className="w-3.5 h-3.5" />
                                </button>
                                {isPaused && (
                                    <div className="flex items-center gap-1 px-1.5 py-0.5 sm:px-2 sm:py-1 bg-yellow-500/10 border border-yellow-500/20 rounded-full animate-pulse ml-1 sm:ml-2">
                                        <Pause className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-yellow-500 shrink-0" fill="currentColor" />
                                        <span className="hidden sm:inline lg:hidden text-[8px] font-black uppercase tracking-widest text-yellow-500">Paused</span>
                                        <span className="hidden lg:inline text-[9px] font-black uppercase tracking-widest text-yellow-500">Auction paused by host</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center gap-2 sm:gap-4">
                            {isModerator && joinRequests.length > 0 && (
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
                            {isModerator && (
                                <div className="flex items-center gap-1.5 p-1 glass-panel rounded-xl">
                                    {currentPlayer?.poolID === 'pool2_bowlers' && upcomingPlayers.some(p => ['pool3', 'pool4'].includes(p.poolID)) && (
                                        <button
                                            onClick={() => socket.emit("start_interest_voting", { roomCode })}
                                            className="p-2 lg:p-2.5 rounded-full hover:bg-yellow-500/20 border border-transparent hover:border-yellow-500/30 text-[#D4AF37]/60 hover:text-yellow-500 transition-all flex items-center justify-center"
                                            title="Start Interest Voting (Pool 3 & 4)"
                                        >
                                            <ListChecks className="w-4 h-4" />
                                        </button>
                                    )}
                                    <button
                                        onClick={() =>
                                            socket.emit(
                                                isPaused ? "resume_auction" : "pause_auction",
                                                { roomCode },
                                            )
                                        }
                                        className={`p-2 lg:p-2.5 rounded-full transition-all flex items-center justify-center border ${isPaused ? "bg-yellow-500 border-yellow-400 text-[#080400] shadow-[0_0_15px_rgba(234,179,8,0.4)]" : "bg-yellow-500/10 border-yellow-500/30 text-yellow-500 hover:bg-yellow-500/20 shadow-[0_0_10px_rgba(234,179,8,0.1)]"}`}
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
                                        className="p-2 lg:p-2.5 rounded-full bg-yellow-500/10 border border-yellow-500/30 text-yellow-500 hover:bg-red-500/20 hover:text-red-500 hover:border-red-500/30 transition-all flex items-center justify-center shadow-[0_0_10px_rgba(234,179,8,0.1)]"
                                        title="Force End Auction"
                                    >
                                        <Square className="w-4 h-4" fill="currentColor" />
                                    </button>
                                    {/* Timer Settings */}
                                    <div className="relative">
                                        <button
                                            onClick={() => setShowTimerSettings(v => !v)}
                                            className={`p-2 lg:p-2.5 rounded-full transition-all flex items-center justify-center border ${showTimerSettings ? 'bg-yellow-500 border-yellow-400 text-[#080400] shadow-[0_0_15px_rgba(234,179,8,0.4)]' : 'bg-yellow-500/10 border-yellow-500/30 text-yellow-500 hover:bg-yellow-500/20 shadow-[0_0_10px_rgba(234,179,8,0.1)]'}`}
                                            title="Timer Settings"
                                        >
                                            <Settings className="w-4 h-4" />
                                        </button>
                                        {showTimerSettings && (
                                            <div className="absolute right-0 top-full mt-2 z-[300] bg-[#1a1205] border border-[#D4AF37]/20 rounded-2xl p-3 shadow-2xl min-w-[140px]">
                                                <div className="text-[9px] font-black text-[#D4AF37]/40 uppercase tracking-widest mb-2 px-1">Bid Timer</div>
                                                {[3, 5, 7, 10].map(sec => (
                                                    <button
                                                        key={sec}
                                                        onClick={() => {
                                                            socket.emit('update_settings', { roomCode, timerDuration: sec });
                                                            setCurrentTimerDuration(sec);
                                                            setShowTimerSettings(false);
                                                        }}
                                                        className={`w-full text-left px-3 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all mb-1 ${currentTimerDuration === sec
                                                            ? 'bg-[#D4AF37] text-[#1a1205] shadow-[0_0_10px_rgba(212,175,55,0.4)]'
                                                            : 'text-[#FFE58F]/60 hover:bg-white/5'
                                                            }`}
                                                    >
                                                        {sec}s {currentTimerDuration === sec ? '✓' : ''}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </header>

                {/* Premium Live Auction Ticker */}
                <div className="relative h-8 sm:h-10 bg-[#1a1205]/95 backdrop-blur-sm border-b border-yellow-500/20 z-40 flex items-center overflow-hidden">
                    <div className="bg-gradient-to-r from-yellow-700 via-yellow-500 to-yellow-800 h-full px-4 sm:px-6 flex items-center justify-center z-10 shadow-[5px_0_15px_rgba(234,179,8,0.15)]">
                        <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] whitespace-nowrap text-[#080400]">
                            Live Highlights
                        </span>
                    </div>

                    <div className="flex-1 relative overflow-hidden h-full flex items-center border-l border-yellow-500/30">
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
                                            <span className="text-[8px] font-black text-[#FFE58F] uppercase tracking-widest mr-2">
                                                RECENT:
                                            </span>
                                            <span className="text-[10px] font-bold text-[#FFE58F] uppercase">
                                                {s.name}
                                            </span>
                                            <span className="mx-2 text-[#D4AF37]/60">→</span>
                                            {s.teamLogo && (
                                                <img src={s.teamLogo} alt="" className="w-4 h-4 object-contain rounded-sm mr-1 shrink-0" />
                                            )}
                                            <span className="text-[10px] font-black uppercase" style={{ color: s.teamColor || '#eab308' }}>
                                                {s.team}
                                            </span>
                                            <span className="ml-2 text-[10px] font-mono font-black text-white/50">
                                                {fmtCr(s.price)}
                                            </span>
                                        </div>
                                    ))}

                                    {/* Top Buys */}
                                    {activeTeams
                                        .flatMap((t) =>
                                            t.playersAcquired.map((p) => ({
                                                ...p,
                                                team: t.teamName,
                                                teamLogo: t.teamLogo,
                                                teamThemeColor: t.teamThemeColor,
                                            })),
                                        )
                                        .sort((a, b) => b.boughtFor - a.boughtFor)
                                        .slice(0, 10)
                                        .map((s, i) => (
                                            <div
                                                key={`top-${loopIdx}-${i}`}
                                                className="inline-flex items-center mx-8"
                                            >
                                                <span className="text-[8px] font-black text-[#FFE58F] uppercase tracking-widest mr-2">
                                                    TOP BUY:
                                                </span>
                                                <span className="text-[10px] font-bold text-white uppercase">
                                                    {s.name}
                                                </span>
                                                <span className="mx-2 text-[#D4AF37]/40">→</span>
                                                {s.teamLogo && (
                                                    <img src={s.teamLogo} alt="" className="w-4 h-4 object-contain rounded-sm mr-1 shrink-0" />
                                                )}
                                                <span className="text-[10px] font-black uppercase" style={{ color: s.teamThemeColor || '#D4AF37' }}>
                                                    {s.team}
                                                </span>
                                                <span className="ml-2 text-[10px] font-mono font-black text-white/50">
                                                    {fmtCr(s.boughtFor)}
                                                </span>
                                            </div>
                                        ))}

                                    {/* Top Unsold (Marquee/Pool 1) */}
                                    {unsoldHistory
                                        .filter(p => ['marquee', 'pool1_batsmen', 'pool1_bowlers'].includes(p.poolID))
                                        .map((p, i) => (
                                            <div
                                                key={`unsold-${loopIdx}-${i}`}
                                                className="inline-flex items-center mx-8"
                                            >
                                                <span className="text-[8px] font-black text-red-400 uppercase tracking-widest mr-2">
                                                    TOP UNSOLD:
                                                </span>
                                                <span className="text-[10px] font-bold text-white uppercase">
                                                    {p.name || p.player}
                                                </span>
                                                <span className="mx-2 text-[#D4AF37]/50">→</span>
                                                <span className="text-[10px] font-black text-red-500 uppercase">
                                                    UNSOLD
                                                </span>
                                                <span className="ml-2 text-[10px] font-mono font-black text-white/50">
                                                    {fmtCr(p.basePrice)}
                                                </span>
                                            </div>
                                        ))}
                                </React.Fragment>
                            ))}

                            {/* Decorative Spacer */}
                            {recentSold.length === 0 && activeTeams.length === 0 && (
                                <span className="text-[10px] font-black text-[#D4AF37]/50 uppercase tracking-widest mx-10">
                                    Waiting for first hammers...
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Lobby Info Header - Desktop Only (Redundant on mobile) */}
                <div className="hidden lg:flex absolute top-2 left-1/2 -translate-x-1/2 items-center gap-4 z-20">
                    <div className="px-4 py-1.5 rounded-full border border-[#D4AF37]/20 glass-panel text-[10px] font-black uppercase tracking-widest text-[#D4AF37]/60">
                        Room: {roomCode}
                    </div>
                    <div className="px-4 py-1.5 rounded-full border border-[#D4AF37]/20 bg-red-500/10 text-red-500 text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"></div>
                        Live Auction
                    </div>
                </div>

                {/* Host Controls - Desktop Only (Redundant on mobile header) */}
                {isModerator && (
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
                            onClick={() => {
                                setToast({ message: "Synchronizing state...", type: 'info' });
                                socket.emit("join_room", { roomCode, asSpectator: forceSpectator });
                            }}
                            className="px-4 py-2 rounded-xl transition-all bg-yellow-600/30 hover:bg-yellow-500/40 text-yellow-500 border border-yellow-500/50 backdrop-blur-md flex items-center justify-center min-w-[56px]"
                            title="Re-sync Room State"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                        </button>
                        {/* Claim Host Button (if host is offline) */}
                        {!isPrimaryHost && gameState?.hostUserId && onlineMap[gameState.hostUserId] === false && (
                            <button
                                onClick={handleClaimHost}
                                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest animate-pulse shadow-lg flex items-center gap-2"
                                title="Host is offline. Take control of the auction."
                            >
                                <AlertTriangle className="w-4 h-4" />
                                Take Control
                            </button>
                        )}
                        <button
                            onClick={() => setShowForceEndConfirm(true)}
                            className="px-4 py-2 rounded-xl transition-all bg-red-600/30 hover:bg-red-500/40 text-red-500 border border-red-500/50 backdrop-blur-md flex items-center justify-center min-w-[56px]"
                            title="Force End Auction"
                        >
                            <Square className="w-6 h-6" fill="currentColor" />
                        </button>
                    </div>
                )}

                <div className="flex-1 flex flex-col items-center justify-evenly lg:justify-center p-2 pt-2 sm:p-4 sm:pt-8 md:p-8 lg:p-12 z-10 overflow-hidden lg:overflow-y-auto custom-scrollbar relative w-full sm:pt-12 lg:pt-0">
                    <AnimatePresence mode="wait">
                        {!currentPlayer ? (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="flex flex-col items-center justify-center h-full"
                            >
                                <div className="text-4xl font-black text-white/10 uppercase tracking-[0.5em] animate-pulse">
                                    Preparing Podium...
                                </div>
                            </motion.div>
                        ) : (
                            <div className="flex-1 flex flex-col lg:flex-row items-center lg:items-center justify-start lg:justify-center w-full max-w-6xl gap-2 sm:gap-8 md:gap-12 lg:gap-20 pb-4 lg:pb-0">
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
                                    className="w-[240px] sm:w-[380px] aspect-[3/4.2] cinematic-glow-border relative group cursor-pointer shrink-0 flex flex-col mx-auto lg:mx-0 shadow-[0_20px_50px_rgba(0,0,0,0.8)] mt-0 sm:mt-4 md:mt-8"
                                >
                                    {/* Frame Corner Ornaments */}

                                    {/* Premium Glowing Role Badge - Top Right */}
                                    <div className="absolute top-8 right-6 sm:right-8 z-30 flex flex-col items-center gap-1.5 drop-shadow-md">
                                        <div className="px-3 sm:px-4 py-1 bg-gradient-to-r from-[#FFE58F] to-[#D4AF37] text-[#080400] rounded-[4px] font-black font-sans text-[9px] sm:text-[11px] tracking-widest uppercase whitespace-nowrap shadow-sm">
                                            {getRoleDisplayName(currentPlayer.role)}
                                        </div>
                                        {/* Nationality flag right below it */}
                                        {getFlagUrl(currentPlayer.nationality) && (
                                            <img
                                                onError={(e) => {
                                                    e.target.style.display = 'none';
                                                }}
                                                src={getFlagUrl(currentPlayer.nationality)}
                                                alt={currentPlayer.nationality}
                                                className="w-6 sm:w-8 mt-1 h-auto rounded-sm border border-yellow-500/50 object-contain shadow-[0_0_15px_rgba(0,0,0,0.8)]"
                                                title={currentPlayer.nationality}
                                            />
                                        )}
                                    </div>

                                    {/* Layout Split: Left Col (Name) & Right Col (Image + Stats) */}

                                    {/* Left Column: Vertical Name */}
                                    <div className="absolute left-3 sm:left-6 top-6 sm:top-8 bottom-[20%] w-6 sm:w-10 flex flex-col items-center justify-start pt-8 sm:pt-12 pb-4 z-40 pointer-events-none">
                                        <h1 className="text-vertical text-[8px] sm:text-[11px] font-serif text-[#FFE58F] tracking-[0.3em] sm:tracking-[0.4em] uppercase whitespace-nowrap opacity-90 overflow-hidden font-medium drop-shadow-sm">
                                            {currentPlayer.player ||
                                                currentPlayer.name ||
                                                "Unknown Player"}
                                        </h1>
                                    </div>

                                    {/* Right Column: Image */}
                                    <div className="absolute right-6 sm:right-8 top-6 sm:top-8 bottom-[24%] sm:bottom-[20%] left-12 sm:left-20 flex flex-col z-10 pointer-events-none overflow-hidden rounded-t-lg">
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
                                            className="w-full h-full object-cover object-top drop-shadow-[0_-5px_15px_rgba(234,179,8,0.25)]" // Rim lighting effect
                                        />
                                        {/* Cinematic Smoke/Fog fade at the bottom of the image */}
                                        <div className="absolute inset-x-0 bottom-0 h-[50%] bg-gradient-to-t from-[#0e111a] via-[#0e111a]/80 to-transparent"></div>
                                        <div className="absolute inset-x-0 bottom-0 h-[30%] bg-gradient-to-t from-[var(--dark-depth)] to-transparent"></div>
                                    </div>

                                    {/* Stats Overlay at the Bottom Right */}
                                    <div className="absolute right-0 bottom-0 top-[68%] sm:top-[74%] left-6 sm:left-14 flex flex-col items-center justify-center pb-2 px-1 sm:px-4 z-20 pointer-events-none bg-gradient-to-t from-[#07090f] via-[#07090f]/95 to-transparent rounded-br-[12px]">
                                        {/* Dynamic Role-Based Stats Grid */}
                                        <div className="w-full h-full flex items-center justify-around px-2">
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

                                                const gridCols = "grid-cols-3";

                                                return (
                                                    <div className={`grid ${gridCols} gap-x-2 sm:gap-x-6 gap-y-1 sm:gap-y-3 w-full py-1`}>
                                                        {statsToDisplay.map((stat, i) => (
                                                            <div key={i} className="flex flex-col items-center justify-center">
                                                                <div className={`${isAll ? 'text-[12px] sm:text-[16px]' : 'text-[16px] sm:text-[22px]'} font-serif font-black text-[#D4AF37] drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] leading-none text-center mb-0.5 bg-clip-text text-transparent bg-gradient-to-b from-[#FFE58F] to-[#D4AF37]`}>
                                                                    {stat.val}
                                                                </div>
                                                                <div className={`font-black uppercase tracking-[0.1em] sm:tracking-[0.15em] font-sans text-[#D4AF37]/60 ${isAll ? 'text-[6px] sm:text-[8px]' : 'text-[7px] sm:text-[9px]'} text-center leading-none`}>
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
                                <div className="flex-1 flex w-full max-w-4xl mx-auto items-center justify-center mt-6 sm:mt-12 lg:mt-0 px-4">
                                    {/* Bidding Core */}
                                    <div className="flex flex-row lg:flex-row items-center gap-4 sm:gap-6 lg:gap-16 w-full justify-center">
                                        <div className="flex flex-col items-center lg:items-start text-center lg:text-left">
                                            <div className="text-[9px] text-zinc-500 font-black uppercase tracking-[0.2em] mb-2 sm:mb-3">
                                                Current Highest Bid
                                            </div>

                                            {currentBid.teamName ? (
                                                <div className="flex flex-col items-center gap-3">
                                                    {/* Bid Info Sticker */}
                                                    <motion.div
                                                        initial={{ opacity: 0, y: -10 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        className="flex items-center gap-3 px-4 py-2 rounded-xl bg-[#1a1205]/80 border border-[#D4AF37]/30 backdrop-blur-md shadow-xl z-20"
                                                    >
                                                        {currentBid.teamLogo && (
                                                            <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center p-1 shadow-inner shrink-0">
                                                                <img src={currentBid.teamLogo} alt="" className="w-full h-full object-contain" />
                                                            </div>
                                                        )}
                                                        <div className="flex flex-col items-start leading-none">
                                                            <div className="text-[10px] font-black uppercase tracking-widest text-[#FFE58F] flex items-center gap-2">
                                                                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                                                                {currentBid.teamName} LEADING
                                                            </div>
                                                            <div className="text-[9px] font-bold text-[#D4AF37]/70 uppercase tracking-widest mt-1">
                                                                {currentBid.ownerName}
                                                            </div>
                                                        </div>
                                                    </motion.div>

                                                    {/* Golden Amount Badge */}
                                                    <div className="bg-gradient-to-br from-[#FFE58F] via-[#D4AF37] to-[#996515] p-2 sm:p-5 shadow-[0_15px_40px_rgba(212,175,55,0.3)] relative overflow-hidden flex items-center justify-center min-w-[140px] sm:min-w-[240px]"
                                                        style={{ clipPath: 'polygon(15px 0, calc(100% - 15px) 0, 100% 15px, 100% calc(100% - 15px), calc(100% - 15px) 100%, 15px 100%, 0 calc(100% - 15px), 0 15px)' }}>
                                                        <div className="absolute inset-[2px] bg-gradient-to-br from-[#E6B800] to-[#B38000] pointer-events-none z-0" style={{ clipPath: 'polygon(14px 0, calc(100% - 14px) 0, 100% 14px, 100% calc(100% - 14px), calc(100% - 14px) 100%, 14px 100%, 0 calc(100% - 14px), 0 14px)' }}></div>
                                                        <div className="absolute inset-0 bg-gradient-to-tr from-white/40 through-transparent to-black/10 pointer-events-none z-0"></div>

                                                        <motion.div
                                                            key={currentBid.amount}
                                                            initial={{ scale: 1.2, opacity: 0 }}
                                                            animate={{ scale: 1, opacity: 1 }}
                                                            className="text-2xl sm:text-6xl font-black font-serif tracking-tighter text-[#1a1205] drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)] relative z-10"
                                                        >
                                                            {fmtCr(currentBid.amount)}
                                                        </motion.div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col items-center justify-center p-2 sm:p-6 bg-gradient-to-br from-[#FFE58F] via-[#D4AF37] to-[#996515] shadow-[0_10px_30px_rgba(234,179,8,0.15)] min-w-[130px] sm:min-w-[220px] relative overflow-hidden" style={{ clipPath: 'polygon(12px 0, calc(100% - 12px) 0, 100% 12px, 100% calc(100% - 12px), calc(100% - 12px) 100%, 12px 100%, 0 calc(100% - 12px), 0 12px)' }}>
                                                    <div className="absolute inset-[2px] bg-gradient-to-br from-[#E6B800] to-[#B38000] pointer-events-none z-0" style={{ clipPath: 'polygon(10px 0, calc(100% - 10px) 0, 100% 10px, 100% calc(100% - 10px), calc(100% - 10px) 100%, 10px 100%, 0 calc(100% - 10px), 0 10px)' }}></div>
                                                    <div className="absolute inset-0 bg-gradient-to-tr from-white/30 to-transparent pointer-events-none z-0"></div>
                                                    <div className="text-2xl sm:text-6xl font-black font-serif text-[#1a1205] tracking-tighter drop-shadow-[0_1px_1px_rgba(255,255,255,0.5)] relative z-10 leading-none">
                                                        {fmtCr(currentPlayer.basePrice)}
                                                    </div>
                                                    <div className="mt-2 text-[9px] sm:text-xs font-black uppercase tracking-[0.25em] text-[#1a1205]/80 relative z-10">
                                                        Starting Price
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Premium Timer Circle OR Stamp */}
                                        <div className="relative w-16 h-16 sm:w-32 sm:h-32 flex items-center justify-center shrink-0">
                                            {!soldEvent ? (
                                                <>
                                                    <svg viewBox="0 0 128 128" className="w-full h-full transform -rotate-90 absolute scroll-smooth">
                                                        <motion.circle
                                                            cx="64"
                                                            cy="64"
                                                            r={ringRadius}
                                                            fill="transparent"
                                                            stroke="#FFD700"
                                                            strokeWidth="3"
                                                            strokeLinecap="round"
                                                            strokeDasharray={ringCircumference}
                                                            animate={{
                                                                strokeDashoffset: timerDashoffset,
                                                                stroke: timerColor,
                                                            }}
                                                            transition={{ duration: 1, ease: "linear" }}
                                                            className=""
                                                        />
                                                    </svg>
                                                    <motion.div
                                                        key={`timer-${timer}`}
                                                        animate={timer <= 3 ? { scale: [1, 1.2, 1] } : {}}
                                                        className="text-sm xs:text-base sm:text-4xl font-black font-mono z-10"
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
                                                        playerImage={
                                                            soldEvent.player?.imagepath ||
                                                            soldEvent.player?.image_path ||
                                                            soldEvent.player?.photoUrl
                                                        }
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
                {
                    activeTab === 'podium' && myTeam && (
                        <div className="relative lg:hidden border-t border-[#D4AF37]/20 glass-panel p-2 xs:p-4 flex items-center justify-between z-50">
                            <div className="flex items-center gap-3">
                                {myTeam.teamLogo && (
                                    <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center p-1 border border-[#D4AF37]/20 shadow-lg shrink-0">
                                        <img src={myTeam.teamLogo} alt="" className="w-full h-full object-contain" />
                                    </div>
                                )}
                                <div className="flex flex-col min-w-0 text-left">
                                    <div className="text-[8px] font-black text-[#D4AF37]/60 uppercase tracking-widest leading-none mb-1">Signed As</div>
                                    <div className="text-xs font-black text-[#FFE58F] uppercase truncate leading-none mb-1">{myTeam.teamName}</div>
                                    <div className="text-[10px] font-bold text-[#FFE58F] leading-none">{fmtCr(myTeam.currentPurse)}</div>
                                </div>
                            </div>

                            <div className="flex items-center gap-4">
                                <div className="text-right mr-16 sm:mr-20">
                                    <div className="text-[8px] font-black text-[#D4AF37]/60 uppercase tracking-widest leading-none mb-1">Next Bid</div>
                                    <div className="text-lg font-black text-[#FFE58F] leading-none">{fmtCr(targetAmount)}</div>
                                </div>
                                {/* Mobile Paddle: Round Logo Badge & Stick */}
                                <div className="absolute bottom-0 right-2 xs:right-4 flex flex-col items-center justify-end z-30 pointer-events-none">
                                    <button
                                        onClick={handleBid}
                                        disabled={soldEvent || (myTeam.currentPurse < targetAmount)}
                                        className={`pointer-events-auto flex flex-col items-center group outline-none transition-all duration-300 origin-bottom hover:-translate-y-2 pb-0 ${soldEvent || (myTeam.currentPurse < targetAmount) ? 'opacity-50 grayscale cursor-not-allowed' : 'active:scale-95'}`}
                                    >
                                        <div className="w-16 h-16 border-[2px] border-[#FFE58F]/80 bg-[#1a1205] shadow-[0_0_15px_rgba(0,0,0,0.8)] z-10 flex items-center justify-center rounded-full transition-all group-hover:shadow-[0_0_20px_rgba(251,191,36,0.6)] group-hover:border-[#FFF3B0] relative">
                                            <div className="w-[88%] h-[88%] border border-[#FFF3B0]/50 shadow-inner flex items-center justify-center bg-gradient-to-br from-[#FFE58F] via-[#D4AF37] to-[#996515] rounded-full overflow-hidden relative">
                                                <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/30 to-transparent pointer-events-none z-10"></div>

                                                <div className="flex items-center justify-center absolute w-full h-full z-20">
                                                    <div className="flex flex-col items-center justify-center text-center pt-0.5">
                                                        {myTeam?.playersAcquired?.length >= 25 ? (
                                                            <span className="text-[10px] font-black text-[#1a1205] leading-none uppercase drop-shadow-sm">FULL</span>
                                                        ) : myTeam?.teamLogo ? (
                                                            <>
                                                                <img src={myTeam.teamLogo} alt="" className="w-8 h-8 object-contain drop-shadow-md mb-0.5" />
                                                            </>
                                                        ) : (
                                                            <span className="text-[12px] font-black text-[#1a1205] uppercase tracking-tighter drop-shadow-sm font-serif">BID</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        {/* Golden Stick */}
                                        <div className="w-3 h-10 -mt-2 bg-gradient-to-b from-[#FFE58F] via-[#D4AF37] to-[#805411] border-x-[1.5px] border-b-[1.5px] border-[#FFE58F]/80 z-0 transition-all relative"></div>
                                    </button>
                                </div>
                            </div>
                        </div>
                    )
                }

                {/* Bottom Interaction Bar (Desktop Only) */}
                <div className="hidden lg:flex h-28 bg-[linear-gradient(90deg,#2a1f00_0%,#d4af37_50%,#2a1f00_100%)] items-center justify-between px-12 z-20 shrink-0 shadow-[0_-10px_30px_rgba(0,0,0,0.8)] relative border-t border-[#FFE58F]/50">
                    {/* Inner highlight line */}
                    <div className="absolute top-0 left-0 right-0 h-[1px] bg-white/30"></div>
                    <div className="flex items-center gap-6">
                        {myTeam && (
                            <div className="flex items-center gap-5">
                                <div
                                    className="w-1.5 h-16 rounded-full"
                                    style={{ backgroundColor: myTeam.teamThemeColor }}
                                ></div>
                                {myTeam.teamLogo && (
                                    <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center p-2 border border-[#D4AF37]/20 shadow-lg shrink-0">
                                        <img
                                            src={myTeam.teamLogo}
                                            alt={myTeam.teamName}
                                            className="w-full h-full object-contain drop-shadow-md"
                                        />
                                    </div>
                                )}
                                <div className="flex flex-col justify-center min-w-0">
                                    <div className="text-[10px] text-[#D4AF37]/60 font-black uppercase tracking-[0.2em] mb-1">
                                        Signed As
                                    </div>
                                    <div
                                        className="text-2xl font-black tracking-tight uppercase leading-none truncate text-[#FFE58F]"
                                    >
                                        {myTeam.teamName}
                                    </div>
                                    <div className="text-xs font-bold text-[#D4AF37]/60 uppercase tracking-[0.15em] mt-1.5 truncate">
                                        {myTeam.ownerName}{" "}
                                        <span className="text-[#D4AF37]/40 px-1">|</span>{" "}
                                        <span className="text-[#FFE58F]">{fmtCr(myTeam.currentPurse)}</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-8 justify-end">
                        {myTeam ? (
                            <>
                                <div className="text-right flex flex-col items-end mr-32 xl:mr-48 z-10 relative">
                                    <div className="text-[10px] text-[#2c1d05] font-black uppercase tracking-widest mb-1">
                                        Next Bid
                                    </div>
                                    <div className="text-4xl font-black font-serif text-[#1a1103] tracking-tighter drop-shadow-[0_1px_1px_rgba(255,255,255,0.4)]">
                                        {fmtCr(targetAmount)}
                                    </div>
                                </div>
                                {/* Desktop Paddle: Round Logo Badge & Stick */}
                                <div className="absolute bottom-[-4px] right-12 flex flex-col items-center justify-end z-30 pointer-events-none">
                                    <button
                                        onClick={handleBid}
                                        disabled={
                                            !myTeam ||
                                            timer < 0 ||
                                            soldEvent ||
                                            targetAmount > (myTeam?.currentPurse || 0) ||
                                            currentBid.teamId === myTeam?.franchiseId ||
                                            myTeam?.playersAcquired?.length >= 25 ||
                                            (currentPlayer?.isOverseas &&
                                                (myTeam?.overseasCount || 0) >= 8)
                                        }
                                        className={`
                                        pointer-events-auto flex flex-col items-center group outline-none focus:outline-none hover:-translate-y-4 active:scale-95 transition-all duration-300 origin-bottom pb-0
                                        ${!myTeam ||
                                                timer < 0 ||
                                                soldEvent ||
                                                targetAmount > (myTeam?.currentPurse || 0) ||
                                                currentBid.teamId === myTeam?.franchiseId ||
                                                isPaused ||
                                                myTeam?.playersAcquired?.length >= 25 ||
                                                (currentPlayer?.isOverseas &&
                                                    (myTeam?.overseasCount || 0) >= 8)
                                                ? "opacity-50 grayscale cursor-not-allowed"
                                                : "cursor-pointer"
                                            }
                                    `}
                                    >
                                        {/* Golden Round Paddle Outer Frame */}
                                        <div className="w-40 h-40 border-[4px] border-[#FFE58F]/80 bg-[#1a1205] shadow-[0_0_35px_rgba(0,0,0,0.8)] z-10 flex items-center justify-center rounded-full transition-all group-hover:shadow-[0_0_45px_rgba(251,191,36,0.6)] group-hover:border-[#FFF3B0] relative">
                                            {/* Pure Gold Inner Circle */}
                                            <div className="w-[92%] h-[92%] border border-[#FFF3B0]/50 shadow-inner flex items-center justify-center bg-gradient-to-br from-[#FFE58F] via-[#D4AF37] to-[#996515] rounded-full overflow-hidden relative">
                                                {/* Glossy Overlay */}
                                                <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/30 to-transparent pointer-events-none z-10"></div>

                                                {/* Content Container */}
                                                <div className="flex items-center justify-center absolute w-full h-full z-20">
                                                    <div className="flex flex-col items-center justify-center text-center mt-1 sm:mt-2">
                                                        {myTeam?.playersAcquired?.length >= 25 ? (
                                                            <span className="text-xl sm:text-2xl font-black text-[#1a1205] leading-none uppercase drop-shadow-sm">FULL</span>
                                                        ) : myTeam?.teamLogo ? (
                                                            <>
                                                                <img src={myTeam.teamLogo} alt="" className="w-20 h-20 object-contain drop-shadow-md mb-0.5 hover:scale-105 transition-transform" />
                                                            </>
                                                        ) : (
                                                            <span className="text-3xl sm:text-5xl font-black text-[#1a1205] uppercase tracking-tighter drop-shadow-sm font-serif">BID</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Golden Stick */}
                                        <div className="w-5 h-20 -mt-2 bg-gradient-to-b from-[#FFE58F] via-[#D4AF37] to-[#805411] border-x-[3px] border-b-[3px] border-[#FFE58F]/80 z-0 transition-all relative"></div>
                                    </button>
                                </div>
                            </>
                        ) : (
                            <div className="flex flex-col items-end gap-2 p-4 rounded-2xl bg-[#D4AF37]/5 border border-[#D4AF37]/20 relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-[#FFE58F]/10 blur-3xl rounded-full"></div>
                                <div className="text-xs font-black text-[#FFE58F] tracking-widest uppercase animate-pulse flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-[#FFE58F] shadow-[0_0_10px_#FFE58F]"></div>
                                    Spectator Mode
                                </div>
                                <div className="text-[10px] font-bold text-[#D4AF37]/80 mb-2 mt-1 max-w-[200px] text-right">
                                    You are watching the live auction. If a franchise has
                                    disconnected, you can request to take over.
                                </div>
                                <button
                                    onClick={handleRequestJoin}
                                    disabled={hasRequested}
                                    className={`px-4 py-2 text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-lg ${hasRequested
                                        ? "bg-white/10 text-white/50 cursor-not-allowed border border-white/5"
                                        : "bg-[#D4AF37] text-[#1a1205] hover:bg-[#FFE58F] hover:shadow-[0_0_15px_rgba(212,175,55,0.25)] cursor-pointer hover:scale-105"
                                        }`}
                                >
                                    {hasRequested ? "Request Pending..." : "Request to Join"}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div >
            {/* Right Sidebar: History & Chat */}
            <div className={`
                fixed inset-y-0 right-0 z-[250] lg:relative lg:z-10 bg-[#1a1205]/95 lg:bg-[#1a1205] backdrop-blur-xl lg:backdrop-blur-none
                w-[85vw] sm:w-[340px] lg:w-72 xl:w-[340px] flex flex-col h-[100dvh] transition-transform duration-300 transform shadow-2xl lg:shadow-none
                ${activeTab === 'chat' ? 'translate-x-0' : 'translate-x-full lg:translate-x-0 flex'}
                ${activeTab === 'chat' ? 'flex' : 'hidden lg:flex'}
            `}>
                {/* Left ornate edge of sidebar */}
                <div className="absolute left-0 top-0 bottom-0 w-[1px] bg-gradient-to-b from-transparent via-[#D4AF37]/30 to-transparent"></div>

                {/* Auction History Panel */}
                <div className="hidden lg:flex h-[35%] flex flex-col relative overflow-hidden border-b border-[#D4AF37]/10">
                    <div className="px-5 py-4 flex items-center justify-between bg-black/40 border-b border-[#D4AF37]/10">
                        <div className="text-[9px] font-sans font-black text-[#FFE58F] uppercase tracking-[0.25em] relative z-10">
                            Auction History
                        </div>
                    </div>
                    <div className="flex-1 overflow-hidden flex flex-col relative z-10">
                        <BidHistory bidHistory={bidHistory} />
                    </div>
                </div>

                {/* Horizontal Divider */}
                <div className="hidden lg:block w-[80%] mx-auto h-[1px] bg-gradient-to-r from-transparent via-[#D4AF37]/10 to-transparent"></div>

                {/* War Room Chat Panel */}
                <div className="flex-1 flex flex-col relative overflow-hidden">
                    <ChatSection
                        chatMessages={chatMessages}
                        myTeam={myTeam}
                        chatEndRef={chatEndRef}
                        chatInput={chatInput}
                        setChatInput={setChatInput}
                        handleSendMessage={handleSendMessage}
                        isSpectator={!myTeam && !gameState?.host === socket.id}
                        onClose={() => setActiveTab('podium')}
                    />
                </div>
            </div >

            {/* Mobile Bottom Navigation (Refined Alignment) */}
            < div className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-[#1a1205]/95 backdrop-blur-xl border-t border-[#D4AF37]/20 flex items-center justify-around z-[200] pb-safe shadow-[0_-10px_30px_rgba(0,0,0,0.5)]" >
                <button
                    onClick={() => setActiveTab('teams')}
                    className={`flex flex-col items-center justify-center gap-1 transition-all flex-1 h-full ${activeTab === 'teams' ? 'text-[#FFE58F] bg-[#1a1205]' : 'text-[#D4AF37]/60'}`}
                >
                    <Users className="w-5 h-5" />
                    <span className="text-[9px] font-black uppercase tracking-widest">Franchises</span>
                    {activeTab === 'teams' && <motion.div layoutId="activeTabUnderline" className="absolute bottom-0 w-8 h-1 bg-[#D4AF37] rounded-t-full" />}
                </button>
                <button
                    onClick={() => setActiveTab('podium')}
                    className={`flex flex-col items-center justify-center gap-1 transition-all flex-1 h-full relative ${activeTab === 'podium' ? 'text-[#FFE58F] bg-[#1a1205]' : 'text-[#D4AF37]/60'}`}
                >
                    <Layout className="w-5 h-5" />
                    <span className="text-[9px] font-black uppercase tracking-widest">Podium</span>
                    {activeTab === 'podium' && <motion.div layoutId="activeTabUnderline" className="absolute bottom-0 w-8 h-1 bg-[#D4AF37] rounded-t-full" />}
                </button>
                <button
                    onClick={() => setActiveTab('chat')}
                    className={`flex flex-col items-center justify-center gap-1 transition-all flex-1 h-full relative ${activeTab === 'chat' ? 'text-[#FFE58F] bg-[#1a1205]' : 'text-[#D4AF37]/60'}`}
                >
                    <MessageSquare className="w-5 h-5" />
                    <span className="text-[9px] font-black uppercase tracking-widest">War Room</span>
                    {activeTab === 'chat' && <motion.div layoutId="activeTabUnderline" className="absolute bottom-0 w-8 h-1 bg-[#D4AF37] rounded-t-full" />}
                </button>
            </div >

            <style
                dangerouslySetInnerHTML={{
                    __html: `
                    @keyframes ticker {
                        0% { transform: translateX(0); }
                        100% { transform: translateX(-50%); }
                    }
                    .animate-ticker {
                        display: inline-flex;
                        animation: ticker 80s linear infinite;
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
                            className="bg-[#1a1205] max-w-md w-full p-6 rounded-3xl border border-[#D4AF37]/20 shadow-2xl relative overflow-hidden flex flex-col max-h-[80vh] backdrop-blur-xl"
                        >
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-xl font-black text-yellow-500 uppercase tracking-widest flex items-center gap-2">
                                    <span className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></span>
                                    Pending Requests
                                </h3>
                                <button
                                    onClick={() => setShowHostRequests(false)}
                                    className="text-[#D4AF37]/50 hover:text-white transition-colors"
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
                                    <div className="text-center text-[#D4AF37]/50 text-sm font-bold p-4">
                                        No pending requests right now.
                                    </div>
                                ) : (
                                    joinRequests.map((req) => (
                                        <div
                                            key={req.socketId}
                                            className="p-4 rounded-2xl bg-white/5 border border-[#D4AF37]/20 flex flex-col gap-3"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="relative w-10 h-10">
                                                    <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center border border-slate-600">
                                                        <span className="text-sm font-black text-[#D4AF37]/60">
                                                            {req.name?.charAt(0)}
                                                        </span>
                                                    </div>
                                                    {/* Online status dot (using stable userId) */}
                                                    <span
                                                        className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#1a1205] ${onlineMap[req.userId] === false
                                                            ? "bg-red-500 shadow-[0_0_6px_#ef4444]"
                                                            : "bg-green-500 shadow-[0_0_6px_#22c55e]"
                                                            }`}
                                                        title={onlineMap[req.userId] === false ? "Offline" : "Online"}
                                                    />
                                                </div>
                                                <div>
                                                    <div className="text-sm font-black text-white">
                                                        {req.name}
                                                    </div>
                                                    <div className="text-[10px] text-[#D4AF37]/50 uppercase tracking-widest font-bold">
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
                            <p className="text-sm text-[#D4AF37]/70 text-center mb-6 font-medium">
                                The Host has invited you. Select an abandoned franchise to take
                                over instantly.
                            </p>

                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[50vh] overflow-y-auto p-2 custom-scrollbar">
                                {gameState?.availableTeams?.map((team) => (
                                    <button
                                        key={team.shortName}
                                        onClick={() => setSelectedTeamId(team.shortName)}
                                        className={`p-3 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 ${selectedTeamId === team.shortName ? "bg-[#D4AF37]/20 border-[#D4AF37] scale-105 shadow-[0_0_20px_rgba(212,175,55,0.3)]" : "bg-white/5 border-[#D4AF37]/20 hover:border-white/30"}`}
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
                                    <div className="col-span-full py-8 text-center text-[#D4AF37]/50 text-sm font-bold">
                                        No franchises available currently.
                                    </div>
                                )}
                            </div>

                            <div className="mt-8 flex gap-4">
                                <button
                                    onClick={() => setShowClaimModal(false)}
                                    className="flex-1 py-3 bg-[#D4AF37]/5 text-[#D4AF37]/70 hover:text-[#FFE58F] rounded-xl text-xs font-black uppercase tracking-widest border border-[#D4AF37]/20 transition-colors"
                                >
                                    CANCEL
                                </button>
                                <button
                                    onClick={handleClaimTeamMidAuction}
                                    disabled={!selectedTeamId}
                                    className={`flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${!selectedTeamId ? "bg-[#D4AF37]/30 text-[#D4AF37]/50 cursor-not-allowed" : "bg-[#D4AF37] text-[#1a1205] shadow-[0_0_20px_rgba(212,175,55,0.5)] hover:bg-[#FFE58F]"}`}
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
                                ? "bg-[#FF4C4C]/10 border-[#FF4C4C]/30"
                                : toast.type === "warning"
                                    ? "bg-[#D4AF37]/10 border-[#D4AF37]/30"
                                    : "bg-[#FFE58F]/10 border-[#FFE58F]/30"
                                }`}
                        >
                            {/* Icon */}
                            <div
                                className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${toast.type === "error"
                                    ? "bg-[#FF4C4C]/20"
                                    : toast.type === "warning"
                                        ? "bg-[#D4AF37]/20"
                                        : toast.type === "success"
                                            ? "bg-[#FFE58F]/20"
                                            : "bg-[#D4AF37]/20"
                                    }`}
                            >
                                {toast.type === "error" ? (
                                    <svg className="w-5 h-5 text-[#FF4C4C]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                ) : toast.type === "success" ? (
                                    <svg className="w-5 h-5 text-[#FFE58F]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                                    </svg>
                                ) : toast.type === "warning" ? (
                                    <svg className="w-5 h-5 text-[#D4AF37]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                                    </svg>
                                ) : (
                                    <svg className="w-5 h-5 text-[#FFE58F]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                )}
                            </div>

                            {/* Message */}
                            <p
                                className={`flex-1 text-sm font-bold leading-relaxed ${toast.type === "error"
                                    ? "text-[#FF4C4C]"
                                    : toast.type === "warning"
                                        ? "text-[#FFE58F]"
                                        : toast.type === "success"
                                            ? "text-[#FFE58F]"
                                            : "text-[#FFE58F]"
                                    }`}
                            >
                                {toast.message}
                            </p>

                            {/* Dismiss */}
                            <button
                                onClick={() => setToast(null)}
                                className="shrink-0 text-[#D4AF37]/50 hover:text-white transition-colors mt-0.5"
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
                            className="glass-card max-w-sm w-full p-8 rounded-3xl border border-[#D4AF37]/20 shadow-2xl relative overflow-hidden"
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
                                    <p className="text-[#D4AF37]/60 text-sm font-medium">
                                        Are you sure you want to kick{" "}
                                        <span className="text-white font-black">{kickTarget?.name}</span>{" "}
                                        from the live auction?
                                    </p>
                                </div>

                                <div className="flex w-full gap-4 text-[10px] font-black uppercase tracking-widest">
                                    {/* Cancel (Red X) */}
                                    <button
                                        onClick={() => setKickTarget(null)}
                                        className="flex-1 py-4 flex flex-col items-center justify-center gap-2 rounded-2xl bg-white/5 border border-[#D4AF37]/20 text-[#D4AF37]/70 hover:bg-white/10 hover:text-white transition-all group"
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
                                        className="flex-1 py-4 flex flex-col items-center justify-center gap-2 rounded-2xl bg-white/5 border border-[#D4AF37]/20 text-[#D4AF37]/70 hover:bg-white/10 hover:text-white transition-all group"
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
                            className="glass-card max-w-sm w-full p-8 rounded-3xl border border-[#D4AF37]/20 shadow-2xl relative overflow-hidden"
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
                                    <p className="text-[#D4AF37]/60 text-sm font-medium">
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
                                        className="flex-1 py-4 flex flex-col items-center justify-center gap-2 rounded-2xl bg-white/5 border border-[#D4AF37]/20 text-[#D4AF37]/70 hover:bg-white/10 hover:text-white transition-all group"
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
                {showVotingModal && votingSession && (
                    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="w-full max-w-2xl bg-[#1a1205] border border-[#D4AF37]/20 rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh] backdrop-blur-xl"
                        >
                            <div className="p-6 border-b border-[#D4AF37]/20 flex justify-between items-center bg-slate-800/50">
                                <div>
                                    <h2 className="text-xl font-black text-white uppercase tracking-widest">Interest Voting</h2>
                                    <p className="text-xs text-[#D4AF37]/60 uppercase tracking-widest mt-1">Select players you want to bring to auction</p>
                                </div>
                                <div className="px-4 py-2 bg-[#D4AF37] rounded-xl text-[#1a1205] font-mono font-bold animate-pulse">
                                    {votingSession.timer}s
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {votingSession.players.map(p => (
                                        <button
                                            key={p.id}
                                            onClick={() => {
                                                if (selectedVotes.includes(p.id)) {
                                                    setSelectedVotes(selectedVotes.filter(id => id !== p.id));
                                                } else {
                                                    setSelectedVotes([...selectedVotes, p.id]);
                                                }
                                            }}
                                            className={`p-4 rounded-xl border transition-all text-left flex items-center justify-between ${selectedVotes.includes(p.id) ? 'bg-[#D4AF37]/20 border-[#D4AF37] text-white shadow-[0_0_15px_rgba(212,175,55,0.3)]' : 'bg-white/5 border-white/5 text-[#D4AF37]/40 hover:bg-white/10 hover:border-[#D4AF37]/20'}`}
                                        >
                                            <div>
                                                <div className="text-sm font-bold uppercase">{p.name}</div>
                                                <div className="text-[10px] font-black text-[#D4AF37]/50 uppercase tracking-widest mt-0.5">{p.poolID.replace(/_/g, ' ')}</div>
                                            </div>
                                            {selectedVotes.includes(p.id) && <div className="w-5 h-5 bg-[#D4AF37] rounded-full flex items-center justify-center shadow-lg"><ListChecks className="w-3 h-3 text-[#1a1205]" /></div>}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="p-6 border-t border-[#D4AF37]/20 bg-[#1a1205]/40">
                                <div className="flex flex-col sm:flex-row gap-3">
                                    <button
                                        onClick={() => {
                                            socket.emit("submit_interest_votes", { roomCode, playerIds: [] });
                                            setShowVotingModal(false);
                                            setSelectedVotes([]);
                                        }}
                                        className="flex-1 py-4 bg-[#1a1205] hover:bg-[#2a1205] text-[#D4AF37]/60 rounded-xl font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 active:scale-95 border border-[#D4AF37]/20"
                                    >
                                        Skip / No Interest
                                    </button>
                                    <button
                                        onClick={() => {
                                            socket.emit("submit_interest_votes", { roomCode, playerIds: selectedVotes });
                                            setShowVotingModal(false);
                                        }}
                                        className="flex-[2] py-4 bg-[#D4AF37] hover:bg-yellow-500 text-[#1a1205] rounded-xl font-black uppercase tracking-widest transition-all shadow-[0_10px_20px_rgba(212,175,55,0.3)] flex items-center justify-center gap-3 active:scale-95"
                                    >
                                        Submit Interests ({selectedVotes.length})
                                    </button>
                                </div>
                                <p className="text-center text-[10px] text-[#D4AF37]/50 uppercase tracking-widest mt-4">Players with zero votes across all teams will be skipped</p>
                            </div>
                        </motion.div>
                    </div>
                )}
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
                            className="glass-card max-w-sm w-full p-8 rounded-3xl border border-[#D4AF37]/20 shadow-2xl relative overflow-hidden"
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
                                    <p className="text-[#D4AF37]/60 text-sm font-medium">
                                        Are you sure you want to <span className="text-red-400">Force End</span> the auction? This will skip all remaining players.
                                    </p>
                                </div>

                                <div className="flex w-full gap-4 text-[10px] font-black uppercase tracking-widest">
                                    {/* Cancel (Red X) */}
                                    <button
                                        onClick={() => setShowForceEndConfirm(false)}
                                        className="flex-1 py-4 flex flex-col items-center justify-center gap-2 rounded-2xl bg-white/5 border border-[#D4AF37]/20 text-[#D4AF37]/70 hover:bg-white/10 hover:text-white transition-all group"
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
                            className="max-w-2xl w-full max-h-[80vh] flex flex-col rounded-3xl border border-[#D4AF37]/30 shadow-2xl relative overflow-hidden bg-[#1a1205] backdrop-blur-xl"
                        >
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#FFE58F] via-[#D4AF37] to-[#1a1205]"></div>

                            {/* Modal Header */}
                            <div className="p-6 border-b border-[#D4AF37]/30 flex justify-between items-center bg-[#1a1205]">
                                <div>
                                    <h3 className="text-xl font-black text-[#FFE58F] uppercase tracking-wider">Player Pools</h3>
                                    <p className="text-[10px] text-[#D4AF37]/60 font-bold uppercase tracking-widest mt-1">Auction Sequence Preview</p>
                                </div>
                                <button
                                    onClick={() => setShowPoolModal(false)}
                                    className="p-2 rounded-full hover:bg-white/10 text-[#D4AF37]/60 transition-colors"
                                >
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>

                            {/* Tab Switcher */}
                            <div className="px-6 py-2 flex gap-4 border-b border-[#D4AF37]/30 bg-[#1a1205]">
                                <button
                                    onClick={() => setPoolTab("live")}
                                    className={`pb-2 text-[10px] font-black uppercase tracking-widest transition-all relative ${poolTab === "live" ? "text-[#FFE58F]" : "text-[#D4AF37]/50 hover:text-[#D4AF37]"}`}
                                >
                                    Live & Upcoming
                                    {poolTab === "live" && <motion.div layoutId="poolTab" className="absolute bottom-0 left-0 w-full h-0.5 bg-[#D4AF37]" />}
                                </button>
                                <button
                                    onClick={() => setPoolTab("sold")}
                                    className={`pb-2 text-[10px] font-black uppercase tracking-widest transition-all relative ${poolTab === "sold" ? "text-[#FFE58F]" : "text-[#D4AF37]/50 hover:text-[#D4AF37]"}`}
                                >
                                    Sold History
                                    {poolTab === "sold" && <motion.div layoutId="poolTab" className="absolute bottom-0 left-0 w-full h-0.5 bg-[#D4AF37]" />}
                                </button>
                                <button
                                    onClick={() => setPoolTab("unsold")}
                                    className={`pb-2 text-[10px] font-black uppercase tracking-widest transition-all relative ${poolTab === "unsold" ? "text-[#FFE58F]" : "text-[#D4AF37]/50 hover:text-[#D4AF37]"}`}
                                >
                                    Unsold
                                    {poolTab === "unsold" && <motion.div layoutId="poolTab" className="absolute bottom-0 left-0 w-full h-0.5 bg-[#D4AF37]" />}
                                </button>
                                <button
                                    onClick={() => setPoolTab("skipped")}
                                    className={`pb-2 text-[10px] font-black uppercase tracking-widest transition-all relative ${poolTab === "skipped" ? "text-[#FFE58F]" : "text-[#D4AF37]/50 hover:text-[#D4AF37]"}`}
                                >
                                    Skipped
                                    {poolTab === "skipped" && <motion.div layoutId="poolTab" className="absolute bottom-0 left-0 w-full h-0.5 bg-[#D4AF37]" />}
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                                {poolTab === "live" ? (
                                    <div className="space-y-10">
                                        {/* Current Pool Players */}
                                        <div>
                                            <div className="flex items-center gap-3 mb-4">
                                                <div className="w-2 h-2 rounded-full bg-[#FFE58F] shadow-[0_0_10px_#FFE58F] animate-pulse"></div>
                                                <h4 className="text-[10px] font-black text-[#FFE58F] uppercase tracking-[0.3em]">Current Auction</h4>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                {currentPlayer ? (
                                                    <div className="glass-panel p-4 rounded-2xl border-[#D4AF37]/30 bg-[#D4AF37]/5 flex items-center justify-between col-span-1 md:col-span-2 shadow-lg shadow-[0_0_15px_rgba(212,175,55,0.1)]">
                                                        <div className="flex items-center gap-4">
                                                            <div className="w-12 h-12 rounded-full border-2 border-[#D4AF37]/30 flex items-center justify-center overflow-hidden bg-white/5 relative shadow-lg shadow-[0_0_15px_rgba(212,175,55,0.2)]">
                                                                {(currentPlayer.imagepath || currentPlayer.image_path || currentPlayer.photoUrl) ? (
                                                                    <>
                                                                        <img
                                                                            src={currentPlayer.imagepath || currentPlayer.image_path || currentPlayer.photoUrl}
                                                                            alt={currentPlayer.name}
                                                                            className="w-full h-full object-cover"
                                                                        />
                                                                        <div className="absolute inset-x-0 bottom-0 bg-[#D4AF37]/90 text-[6px] font-black text-[#1a1205] text-center py-0.5 uppercase tracking-tighter">LIVE</div>
                                                                    </>
                                                                ) : (
                                                                    <div className="w-full h-full flex items-center justify-center bg-[#D4AF37] font-black text-[10px] text-[#1a1205]">NOW</div>
                                                                )}
                                                            </div>
                                                            <div>
                                                                <div className="text-sm font-black text-[#FFE58F] uppercase tracking-tight">
                                                                    {currentPlayer.name || currentPlayer.player}
                                                                </div>
                                                                <div className="text-[9px] font-black text-[#D4AF37]/80 uppercase tracking-widest mt-0.5">
                                                                    {currentPlayer.poolName || currentPlayer.role || "Player"} • {currentPlayer.country}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="text-sm font-mono font-black text-[#FFE58F]">{fmtCr(currentPlayer.basePrice)}</div>
                                                    </div>
                                                ) : (
                                                    <div className="col-span-2 text-center py-4 text-[#D4AF37]/50 text-xs font-bold italic">No active player on podium.</div>
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
                                                        <div className="h-[1px] flex-1 bg-gradient-to-r from-[#D4AF37]/50 to-transparent"></div>
                                                        <h4 className="text-[9px] font-black text-[#D4AF37] uppercase tracking-[0.4em] whitespace-nowrap bg-[#D4AF37]/10 px-3 py-1 rounded-full border border-[#D4AF37]/20">
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
                                                                        <div className="w-8 h-8 rounded-full border border-[#D4AF37]/20 flex items-center justify-center overflow-hidden bg-[#1a1205] group-hover:border-[#D4AF37]/50 transition-colors">
                                                                            {imageUrl ? (
                                                                                <img src={imageUrl} alt={p.name} className="w-full h-full object-cover" />
                                                                            ) : (
                                                                                <span className="font-black text-[8px] text-[#D4AF37]/50">#{pIdx + 1}</span>
                                                                            )}
                                                                        </div>
                                                                        <div className="text-[11px] font-bold text-[#D4AF37]/70 truncate group-hover:text-[#FFE58F] transition-colors">
                                                                            {p.name || p.player}
                                                                        </div>
                                                                    </div>
                                                                    <div className="text-[9px] font-mono font-black text-[#D4AF37]/60 group-hover:text-[#FFE58F]">{fmtCr(p.basePrice)}</div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="text-center py-12 text-[#D4AF37]/50 text-xs font-bold italic">
                                                {currentPlayer ? "Final player on auction catalog." : "Syncing with catalog..."}
                                            </div>
                                        )}
                                    </div>
                                ) : poolTab === "skipped" ? (
                                    <div className="space-y-6">
                                        <div className="flex items-center gap-3 mb-4">
                                            <div className="w-2 h-2 rounded-full bg-[#D4AF37]"></div>
                                            <h4 className="text-[10px] font-black text-[#D4AF37] uppercase tracking-[0.3em]">Skipped Category</h4>
                                        </div>
                                        {skippedHistory && skippedHistory.length > 0 ? (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                {skippedHistory.map((p, idx) => (
                                                    <div key={idx} className="glass-panel p-3 rounded-2xl border-[#D4AF37]/30 flex items-center justify-between group bg-[#D4AF37]/5 hover:bg-[#D4AF37]/10 transition-colors shadow-lg shadow-[0_0_15px_rgba(212,175,55,0.05)]">
                                                        <div className="flex items-center gap-4">
                                                            <div className="w-10 h-10 rounded-full border border-[#D4AF37]/20 flex items-center justify-center overflow-hidden bg-[#0a0702] group-hover:border-[#D4AF37]/50 transition-colors">
                                                                {(p.imagepath || p.image_path || p.photoUrl) ? (
                                                                    <img src={p.imagepath || p.image_path || p.photoUrl} alt="" className="w-full h-full object-cover" />
                                                                ) : (
                                                                    <div className="text-[10px] font-black text-[#D4AF37]/50">SKIP</div>
                                                                )}
                                                            </div>
                                                            <div>
                                                                <div className="text-xs font-black text-[#FFE58F] uppercase tracking-tight">
                                                                    {p.name || p.player}
                                                                </div>
                                                                <div className="text-[8px] font-black text-[#D4AF37]/70 uppercase tracking-widest mt-1">
                                                                    {p.poolName || p.originalPool || "Pool 3/4"}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="text-xs font-mono font-black text-[#D4AF37]">{fmtCr(p.basePrice)}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="text-center py-20">
                                                <div className="text-[#D4AF37]/40 text-xs font-bold uppercase tracking-[0.2em]">No players skipped yet</div>
                                                <p className="text-[#FFE58F]/40 text-[10px] mt-2 max-w-xs mx-auto">Players from Pool 3 and 4 who receive zero votes during interest sensing will appear here.</p>
                                            </div>
                                        )}
                                        {skippedHistory && skippedHistory.length > 0 && (
                                            <div className="bg-[#D4AF37]/5 border border-[#D4AF37]/10 p-4 rounded-2xl">
                                                <p className="text-[10px] font-bold text-[#FFE58F] text-center leading-relaxed">
                                                    NOTE: These skipped players, along with all unsold players, will return for a final voting round at the end of the auction.
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                ) : poolTab === "sold" ? (
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-3 mb-4">
                                            <div className="w-2 h-2 rounded-full bg-[#FFE58F]"></div>
                                            <h4 className="text-[10px] font-black text-[#FFE58F] uppercase tracking-[0.3em]">Completed Auctions</h4>
                                        </div>
                                        <div className="grid grid-cols-1 gap-2">
                                            {activeTeams.flatMap(t => t.playersAcquired.map(p => ({ ...p, teamBought: t.teamName, teamColor: t.themeColor, teamLogo: t.teamLogo }))).length > 0 ? (
                                                activeTeams.flatMap(t => t.playersAcquired.map(p => ({ ...p, teamBought: t.teamName, teamColor: t.themeColor, teamLogo: t.teamLogo })))
                                                    .sort((a, b) => b.boughtFor - a.boughtFor) // Show highest buys first
                                                    .map((p, idx) => {
                                                        const playerRecord = allPlayersMap[p.player] || allPlayersMap[p._id] || {};
                                                        const imageUrl = p.imagepath || p.image_path || p.photoUrl || playerRecord.imagepath || playerRecord.photoUrl;
                                                        return (
                                                            <div key={idx} className="glass-panel p-3 rounded-xl border-[#D4AF37]/30 flex items-center justify-between bg-[#D4AF37]/5 hover:bg-[#D4AF37]/10 transition-colors shadow-lg shadow-[0_0_15px_rgba(212,175,55,0.05)]">
                                                                <div className="flex items-center gap-4">
                                                                    <div
                                                                        className="w-10 h-10 rounded-full border-2 flex items-center justify-center overflow-hidden shadow-inner transition-colors"
                                                                        style={{
                                                                            borderColor: `#D4AF3750`,
                                                                            backgroundColor: `#1a1205`
                                                                        }}
                                                                    >
                                                                        {imageUrl ? (
                                                                            <img src={imageUrl} alt={p.name} className="w-full h-full object-cover" />
                                                                        ) : (
                                                                            <div className="font-black text-[10px] uppercase text-[#D4AF37]">{p.teamName?.charAt(0) || "SOLD"}</div>
                                                                        )}
                                                                    </div>
                                                                    <div>
                                                                        <div className="text-sm font-black text-[#FFE58F] uppercase">{p.name || p.player || playerRecord.name}</div>
                                                                        <div
                                                                            className="text-[9px] font-black uppercase tracking-widest mt-0.5 flex items-center gap-2 text-[#D4AF37]"
                                                                        >
                                                                            {p.teamLogo && <img src={p.teamLogo} className="w-3.5 h-3.5 object-contain" alt="" />}
                                                                            {p.teamBought}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                <div className="text-right">
                                                                    <div className="text-sm font-mono font-black text-[#FFE58F]">{fmtCr(p.boughtFor)}</div>
                                                                    <div className="text-[8px] font-bold text-[#D4AF37]/50 uppercase">Base: {fmtCr(p.basePrice || playerRecord.basePrice)}</div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })
                                            ) : (
                                                <div className="text-center py-12 text-[#D4AF37]/40 text-sm font-bold italic">No players sold yet in this session.</div>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-3 mb-4">
                                            <div className="w-2 h-2 rounded-full bg-[#D4AF37]"></div>
                                            <h4 className="text-[10px] font-black text-[#D4AF37] uppercase tracking-[0.3em]">Unsold Catalog</h4>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                            {unsoldHistory.length > 0 ? (
                                                unsoldHistory.map((p, idx) => {
                                                    const playerRecord = allPlayersMap[p.player] || allPlayersMap[p._id] || {};
                                                    const imageUrl = p.imagepath || p.image_path || p.photoUrl || playerRecord.imagepath || playerRecord.photoUrl;
                                                    return (
                                                        <div key={idx} className="glass-panel p-3 rounded-xl border-[#D4AF37]/30 flex items-center justify-between bg-[#D4AF37]/5 hover:bg-[#D4AF37]/10 transition-colors shadow-lg shadow-[0_0_15px_rgba(212,175,55,0.05)]">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-10 h-10 rounded-full border border-[#D4AF37]/30 flex items-center justify-center overflow-hidden bg-[#1a1205]">
                                                                    {imageUrl ? (
                                                                        <img src={imageUrl} alt={p.name} className="w-full h-full object-cover" />
                                                                    ) : (
                                                                        <div className="font-black text-[10px] text-[#D4AF37]/60 uppercase">SKIP</div>
                                                                    )}
                                                                </div>
                                                                <div>
                                                                    <div className="text-sm font-bold text-[#FFE58F] truncate max-w-[120px]">{p.name || p.player || playerRecord.name}</div>
                                                                    <div className="text-[8px] font-black text-[#D4AF37]/60 uppercase tracking-widest">{p.role || playerRecord.role || "Player"}</div>
                                                                </div>
                                                            </div>
                                                            <div className="text-right text-[10px] font-mono font-black text-[#D4AF37] uppercase">{fmtCr(p.basePrice || playerRecord.basePrice)}</div>
                                                        </div>
                                                    );
                                                })
                                            ) : (
                                                <div className="col-span-2 text-center py-12 text-[#D4AF37]/40 text-sm font-bold italic">Every player has received bids so far.</div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Modal Footer */}
                            <div className="p-4 bg-[#1a1205] border-t border-[#D4AF37]/30 text-center">
                                <p className="text-[9px] font-black text-[#D4AF37]/50 uppercase tracking-widest">
                                    Catalog reflects the official IPL 2025 sequence logic
                                </p>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div >
    );
};

export default AuctionPodium;
