import React, { useState, useEffect } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import { useSocket } from "../context/SocketContext";
import { useSession } from "../context/SessionContext";
import { Copy, Check } from "lucide-react";
import { FaWhatsapp } from "react-icons/fa";
import { motion, AnimatePresence } from "framer-motion";

const IPL_TEAMS = [
  { id: 'MI', name: 'Mumbai Indians', color: '#004BA0', logoUrl: 'https://upload.wikimedia.org/wikipedia/en/thumb/c/cd/Mumbai_Indians_Logo.svg/1200px-Mumbai_Indians_Logo.svg.png' },
  { id: 'CSK', name: 'Chennai Super Kings', color: '#FFFF3C', logoUrl: 'https://upload.wikimedia.org/wikipedia/en/thumb/2/2b/Chennai_Super_Kings_Logo.svg/1200px-Chennai_Super_Kings_Logo.svg.png' },
  { id: 'RCB', name: 'Royal Challengers Bengaluru', color: '#EC1C24', logoUrl: 'https://upload.wikimedia.org/wikipedia/en/thumb/d/d4/Royal_Challengers_Bengaluru_Logo.svg/1200px-Royal_Challengers_Bengaluru_Logo.svg.png' },
  { id: 'KKR', name: 'Kolkata Knight Riders', color: '#2E0854', logoUrl: 'https://upload.wikimedia.org/wikipedia/en/thumb/4/4c/Kolkata_Knight_Riders_Logo.svg/1200px-Kolkata_Knight_Riders_Logo.svg.png' },
  { id: 'DC', name: 'Delhi Capitals', color: '#00008B', logoUrl: 'https://upload.wikimedia.org/wikipedia/en/thumb/2/2f/Delhi_Capitals.svg/1200px-Delhi_Capitals.svg.png' },
  { id: 'PBKS', name: 'Punjab Kings', color: '#ED1B24', logoUrl: 'https://upload.wikimedia.org/wikipedia/en/thumb/d/d4/Punjab_Kings_Logo.svg/1200px-Punjab_Kings_Logo.svg.png' },
  { id: 'RR', name: 'Rajasthan Royals', color: '#EA1A85', logoUrl: 'https://scores.iplt20.com/ipl/teamlogos/RR.png' },
  { id: 'SRH', name: 'Sunrisers Hyderabad', color: '#FF822A', logoUrl: 'https://upload.wikimedia.org/wikipedia/en/thumb/1/1c/Sunrisers_Hyderabad_Logo.svg/1200px-Sunrisers_Hyderabad_Logo.svg.png' },
  { id: 'LSG', name: 'Lucknow Super Giants', color: '#00D1FF', logoUrl: 'https://upload.wikimedia.org/wikipedia/en/thumb/a/a9/Lucknow_Super_Giants_IPL_Logo.svg/1200px-Lucknow_Super_Giants_IPL_Logo.svg.png' },
  { id: 'GT', name: 'Gujarat Titans', color: '#1B2133', logoUrl: 'https://upload.wikimedia.org/wikipedia/en/thumb/0/09/Gujarat_Titans_Logo.svg/1200px-Gujarat_Titans_Logo.svg.png' },
  { id: 'DCG', name: 'Deccan Chargers', color: '#D1E1EF', logoUrl: 'https://upload.wikimedia.org/wikipedia/en/thumb/a/a6/HyderabadDeccanChargers.png/500px-HyderabadDeccanChargers.png' },
  { id: 'KTK', name: 'Kochi Tuskers Kerala', color: '#F15A24', logoUrl: 'https://upload.wikimedia.org/wikipedia/en/thumb/9/96/Kochi_Tuskers_Kerala_Logo.svg/1200px-Kochi_Tuskers_Kerala_Logo.svg.png' },
  { id: 'PWI', name: 'Pune Warriors India', color: '#40E0D0', logoUrl: 'https://upload.wikimedia.org/wikipedia/en/thumb/4/4a/Pune_Warriors_India_IPL_Logo.png/500px-Pune_Warriors_India_IPL_Logo.png' },
  { id: 'RPS', name: 'Rising Pune Supergiant', color: '#D11D70', logoUrl: 'https://upload.wikimedia.org/wikipedia/en/thumb/2/27/Rising_Pune_Supergiant.png/1200px-Rising_Pune_Supergiant.png' },
  { id: 'GL', name: 'Gujarat Lions', color: '#E04F16', logoUrl: 'https://upload.wikimedia.org/wikipedia/en/thumb/c/c4/Gujarat_Lions.png/1200px-Gujarat_Lions.png' },
];

const Lobby = () => {
  const [selectedTeamId, setSelectedTeamId] = useState("");
  // playerName, userId, and initSession come from the secure session context
  const { playerName, userId, initSession } = useSession();
  const [localNameInput, setLocalNameInput] = useState(playerName || "");
  useEffect(() => {
    if (playerName && !localNameInput) {
      setLocalNameInput(playerName);
    }
  }, [playerName]);

  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [isJoined, setIsJoined] = useState(false);
  const [roomState, setRoomState] = useState(null);
  const [timerDuration, setTimerDuration] = useState(10);
  const [error, setError] = useState("");

  // New state for dynamic team selection during join flow
  const [joinMode, setJoinMode] = useState(false);
  const [availableTeamsForRoom, setAvailableTeamsForRoom] = useState(null);
  // True if the user joined as a spectator intentionally
  const [isSpectatorMode, setIsSpectatorMode] = useState(false);

  // Spectator & Approval states
  const [spectators, setSpectators] = useState([]);
  const [joinRequests, setJoinRequests] = useState([]);
  // Online status map: { [ownerSocketId]: boolean }
  const [onlineMap, setOnlineMap] = useState({});

  // Confirmation state for leaving room
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  // Kick confirmation: { socketId, name } or null
  const [kickTarget, setKickTarget] = useState(null);

  const [creatingRoomType, setCreatingRoomType] = useState("private"); // 'private' or 'public'
  const [isDirectJoining, setIsDirectJoining] = useState(false);
  const [isAutoJoining, setIsAutoJoining] = useState(false);

  const socket = useSocket();
  const navigate = useNavigate();
  const location = useLocation();
  const { roomCode: urlRoomCode } = useParams();

  const [copied, setCopied] = useState(false);

  // Auto-fill room code if joined via standard link
  useEffect(() => {
    if (urlRoomCode) {
      const code = urlRoomCode.toUpperCase();
      setRoomCodeInput(code);
      setIsDirectJoining(true);
    } else {
      setIsDirectJoining(false);
    }
  }, [urlRoomCode]);

  const handleCopyLink = () => {
    if (!roomState?.roomCode) return;
    const protocol = window.location.protocol;
    const host = window.location.host;
    const link = `${protocol}//${host}/join/${roomState.roomCode}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShareWhatsapp = () => {
    if (!roomState?.roomCode) return;
    const protocol = window.location.protocol;
    const host = window.location.host;
    const link = `${protocol}//${host}/join/${roomState.roomCode}`;
    const text = `Join my IPL Auction room!\n\nClick the link to enter: ${link}\n\n(If the link doesn't work locally, open ${protocol}//${host} and join with Room Code: ${roomState.roomCode})`;
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(whatsappUrl, '_blank');
  };

  // Auto-join hook when redirecting from /public-rooms
  useEffect(() => {
    if (location.state?.autoJoinRoomCode && playerName && socket) {
      socket.emit("join_room", { roomCode: location.state.autoJoinRoomCode });
      navigate("/", { replace: true, state: {} });
    }
    if (location.state?.autoSpectateRoomCode && playerName && socket) {
      socket.emit("join_room", {
        roomCode: location.state.autoSpectateRoomCode,
        asSpectator: true,
      });
      navigate("/", { replace: true, state: {} });
    }
  }, [location.state, playerName, socket, navigate]);

  useEffect(() => {
    if (!socket) return;

    socket.on("room_created", ({ roomCode, state }) => {
      setRoomState(state);
      setIsJoined(true);
      setError("");
    });

    socket.on("room_joined", ({ roomCode, state }) => {
      setRoomState(state);
      setIsJoined(true);
      setError("");
      setIsAutoJoining(false); // Reset auto-join state
      // Detect if the current user is a spectator (not a team owner)
      const amSpectator = state.spectators?.some((s) => s.socketId === socket.id);
      setIsSpectatorMode(amSpectator || false);
      // If joining a room where the auction is ALREADY live, go straight to the podium
      if (state.status === "Auctioning") {
        navigate(`/auction/${roomCode}`, {
          state: { roomState: state, isSpectator: amSpectator || false },
        });
      }
    });

    socket.on("lobby_update", ({ teams }) => {
      setRoomState((prev) => (prev ? { ...prev, teams } : null));
    });

    socket.on("available_teams", ({ teams }) => {
      setAvailableTeamsForRoom(teams);
      setError("");
    });

    socket.on("spectator_update", ({ spectators }) => {
      setSpectators(spectators);
    });

    socket.on("join_requests_update", ({ roomCode: updatedRoomCode, requests }) => {
      // Ignore updates for other rooms (prevents cross-room contamination)
      const currentRoomCode = roomState?.roomCode;
      if (updatedRoomCode && currentRoomCode && updatedRoomCode !== currentRoomCode) return;
      setJoinRequests(requests);
    });

    socket.on("player_status_update", ({ onlineMap }) => {
      setOnlineMap((prev) => ({ ...prev, ...onlineMap }));
    });

    socket.on("room_disbanded", () => {
      setIsJoined(false);
      setRoomState(null);
      setSelectedTeamId("");
      setShowLeaveConfirm(false);
      setError("The Host has disbanded the room.");
    });

    socket.on("error", (msg) => {
      setError(msg);
      setIsAutoJoining(false); // Reset auto-join state on error
    });

    socket.on("auction_started", ({ state }) => {
      navigate(`/auction/${state.roomCode}`, {
        state: { roomState: state, isSpectator: isSpectatorMode },
      });
    });

    socket.on("kicked_from_room", () => {
      setIsJoined(false);
      setRoomState(null);
      setError("You have been removed from the room by the host.");
    });

    socket.on("settings_updated", ({ timerDuration }) => {
      setTimerDuration(timerDuration);
    });

    return () => {
      socket.off("room_created");
      socket.off("room_joined");
      socket.off("lobby_update");
      socket.off("available_teams");
      socket.off("error");
      socket.off("kicked_from_room");
      socket.off("public_rooms_update");
      socket.off("room_disbanded");
      socket.off("spectator_update");
      socket.off("join_requests_update");
      socket.off("player_status_update");
    };
  }, [socket, navigate]);

  /**
   * Ensures the socket carries the latest JWT before emitting.
   * On a brand-new session (no token when socket was created), triggers a reconnect.
   */
  const reconnectSocketIfNeeded = (newToken) => {
    if (socket && (!socket.auth?.token) && newToken) {
      socket.auth = { token: newToken };
      socket.disconnect().connect();
    }
  };

  const handleCreate = async () => {
    if (!localNameInput.trim()) return setError("Enter your name first");
    try {
      setIsAutoJoining(true);
      const data = await initSession(localNameInput.trim());
      reconnectSocketIfNeeded(data.token);
      // Small delay to let the reconnect finish the handshake
      setTimeout(() => socket.emit("create_room", { roomType: creatingRoomType }), 300);
    } catch (e) {
      setError(e.message || 'Failed to start session');
      setIsAutoJoining(false);
    }
  };

  const handleJoin = async (codeToJoin = roomCodeInput) => {
    if (!localNameInput.trim() || !codeToJoin)
      return setError("Name and Room Code required");
    try {
      setIsAutoJoining(true);
      const data = await initSession(localNameInput.trim());
      reconnectSocketIfNeeded(data.token);
      setTimeout(() => socket.emit("join_room", { roomCode: codeToJoin }), 300);
    } catch (e) {
      setError(e.message || 'Failed to start session');
      setIsAutoJoining(false);
    }
  };

  const handleSpectate = async (codeToJoin = roomCodeInput) => {
    if (!localNameInput.trim() || !codeToJoin)
      return setError("Name and Room Code required");
    try {
      setIsAutoJoining(true);
      const data = await initSession(localNameInput.trim());
      reconnectSocketIfNeeded(data.token);
      setTimeout(() => socket.emit("join_room", { roomCode: codeToJoin, asSpectator: true }), 300);
    } catch (e) {
      setError(e.message || 'Failed to start session');
      setIsAutoJoining(false);
    }
  };

  const handleClaimTeam = () => {
    if (!selectedTeamId) return setError("Select a franchise first");
    // roomCode is determined server-side from the socket's joined rooms
    socket.emit("claim_team", {
      roomCode: roomState?.roomCode,
      teamId: selectedTeamId
    });
  };

  const handleStart = () => {
    socket.emit("start_auction", { roomCode: roomState.roomCode });
  };

  const handleLeaveRoom = () => {
    setShowLeaveConfirm(true);
  };

  const confirmLeaveRoom = () => {
    if (roomState?.roomCode) {
      socket.emit("leave_room", { roomCode: roomState.roomCode });
    }

    // Reset local UI state
    setIsJoined(false);
    setRoomState(null);
    setSelectedTeamId("");
    setError("");
    setShowLeaveConfirm(false);
    setIsSpectatorMode(false);
  };

  const myTeam = roomState?.teams?.find((t) =>
    (socket?.id && t.ownerSocketId === socket.id) ||
    (userId && t.ownerUserId === userId)
  );
  const hasClaimedTeam = !!myTeam;
  const isHost = roomState?.host === socket?.id || (userId && roomState?.hostUserId === userId);

  // Use available teams from state if present, otherwise fallback to IPL_TEAMS
  const displayTeams = availableTeamsForRoom || IPL_TEAMS;

  return (
    <div className="h-screen w-screen flex items-center justify-center p-6 relative overflow-hidden">

      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 items-center relative z-10">
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
              className="bg-white/5 border border-white/10 w-16 h-16 md:w-20 md:h-20 rounded-2xl md:rounded-3xl mb-6 flex items-center justify-center"
            >
              <svg
                width="40"
                height="40"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="#00d2ff" />
                <path
                  d="M2 17L12 22L22 17"
                  stroke="#9333ea"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M2 12L12 17L22 12"
                  stroke="#00d2ff"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </motion.div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-black italic tracking-tighter leading-none text-white uppercase mb-4">
              IPL{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">
                Auction
              </span>
            </h1>
            <p className="text-slate-500 text-base lg:text-lg font-bold leading-relaxed max-w-sm">
              Real-time multiplayer bidding arena. Draft your dream XI against
              rivals.
            </p>
          </div>

          <div className="flex flex-wrap gap-4">
            <div className="px-4 md:px-5 py-2 md:py-3 glass-panel rounded-xl md:rounded-2xl border-white/5 flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
              <span className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-slate-400">
                Low Latency Engine
              </span>
            </div>
            <div className="px-4 md:px-5 py-2 md:py-3 glass-panel rounded-xl md:rounded-2xl border-white/5 flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
              <span className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-slate-400">
                Gemini AI Ratings
              </span>
            </div>
          </div>
        </motion.div>

        {/* Interaction Side */}
        <motion.div
          initial={{ x: 100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          className="glass-card rounded-[32px] md:rounded-[40px] p-6 md:p-10 border-white/5 relative"
        >
          <AnimatePresence mode="wait">
            {!isJoined ? (
              <motion.div
                key={isDirectJoining ? "direct" : "entry"}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="space-y-6"
              >
                {isDirectJoining && (
                  <div className="text-center space-y-2 mb-8">
                    <h2 className="text-[10px] font-black text-blue-400 uppercase tracking-[0.3em]">
                      Direct Invitation
                    </h2>
                    <div className="text-4xl font-black text-white tracking-[0.1em]">
                      {roomCodeInput}
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                      {isDirectJoining ? "Identify Yourself" : "The Gaffer's Name"}
                    </label>
                    <div className="relative group">
                      <input
                        type="text"
                        placeholder="Enter your name..."
                        className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 focus:outline-none focus:border-blue-500/50 text-white font-bold transition-all"
                        value={localNameInput}
                        onChange={(e) => setLocalNameInput(e.target.value)}
                      />
                      {playerName && playerName === localNameInput && (
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-3">
                          <span className="hidden md:inline-block text-[8px] font-black text-blue-400 uppercase tracking-widest bg-blue-500/10 px-2 py-1 rounded-md border border-blue-500/20">
                            Session Active
                          </span>
                          <button
                            onClick={() => {
                              localStorage.removeItem('ipl_session_token');
                              window.location.reload();
                            }}
                            className="text-[8px] font-black text-red-500 hover:text-red-400 uppercase tracking-widest bg-red-500/10 px-2 py-1 rounded-md border border-red-500/20 transition-colors"
                            title="Sign out and join as a different player"
                          >
                            Not you?
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {!isDirectJoining ? (
                    <>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setCreatingRoomType("private")}
                          className={`flex-1 py-3 rounded-xl border font-bold text-[10px] tracking-widest uppercase transition-all ${creatingRoomType === "private" ? "bg-purple-600 border-purple-500 text-white" : "bg-white/5 border-white/10 text-slate-400 hover:bg-white/10"}`}
                        >
                          Private Room
                        </button>
                        <button
                          onClick={() => setCreatingRoomType("public")}
                          className={`flex-1 py-3 rounded-xl border font-bold text-[10px] tracking-widest uppercase transition-all ${creatingRoomType === "public" ? "bg-blue-600 border-blue-500 text-white" : "bg-white/5 border-white/10 text-slate-400 hover:bg-white/10"}`}
                        >
                          Public Room
                        </button>
                      </div>
                      <button
                        onClick={handleCreate}
                        className="w-full btn-premium py-4 mt-2"
                      >
                        CREATE {creatingRoomType.toUpperCase()} ROOM
                      </button>

                      <div className="flex items-center gap-4 my-6">
                        <div className="h-px bg-white/10 flex-1"></div>
                        <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">
                          OR JOIN EXISTING
                        </span>
                        <div className="h-px bg-white/10 flex-1"></div>
                      </div>

                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="text"
                          placeholder="Enter Room Code"
                          className="w-full sm:w-2/3 bg-white/5 border border-white/10 rounded-2xl px-4 py-4 text-center text-white font-black tracking-[0.2em] focus:outline-none focus:border-purple-500/50 uppercase"
                          value={roomCodeInput}
                          onChange={(e) =>
                            setRoomCodeInput(e.target.value.toUpperCase())
                          }
                        />
                        <button
                          onClick={() => handleJoin(roomCodeInput)}
                          className="w-full sm:flex-1 bg-blue-600 hover:bg-blue-500 text-white font-black py-4 rounded-2xl transition-all uppercase text-[10px] tracking-wider shadow-[0_0_20px_rgba(37,99,235,0.4)]"
                        >
                          JOIN
                        </button>
                        <button
                          onClick={() => handleSpectate(roomCodeInput)}
                          className="w-full sm:flex-1 bg-purple-600/20 hover:bg-purple-600/40 border border-purple-500/30 text-purple-400 hover:text-purple-300 font-black py-4 rounded-2xl transition-all uppercase text-[10px] tracking-wider"
                        >
                          👁 SPECTATE
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col gap-3">
                      <button
                        onClick={() => handleJoin(roomCodeInput)}
                        disabled={isAutoJoining}
                        className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-5 rounded-2xl transition-all uppercase text-[12px] tracking-widest shadow-[0_0_20px_rgba(37,99,235,0.4)] disabled:opacity-50"
                      >
                        {isAutoJoining ? "JOINING..." : `ENTER ARENA "${roomCodeInput}"`}
                      </button>
                      <button
                        onClick={() => handleSpectate(roomCodeInput)}
                        disabled={isAutoJoining}
                        className="w-full bg-purple-600/20 hover:bg-purple-600/40 border border-purple-500/30 text-purple-400 hover:text-purple-300 font-black py-4 rounded-2xl transition-all uppercase text-[10px] tracking-wider disabled:opacity-50"
                      >
                        👁 SPECTATE ONLY
                      </button>

                      <button
                        onClick={() => {
                          setIsDirectJoining(false);
                          navigate("/", { replace: true });
                        }}
                        className="text-[10px] font-black text-slate-500 hover:text-white uppercase tracking-[0.2em] transition-colors mt-4"
                      >
                        ← Back to Main Lobby
                      </button>
                    </div>
                  )}
                </div>

                {error && (
                  <p className="text-red-500 text-[10px] font-black uppercase tracking-widest text-center mt-2">
                    {error}
                  </p>
                )}

                {!isDirectJoining && (
                  <div className="mt-8 pt-6 border-t border-white/10">
                    <button
                      onClick={() => navigate("/public-rooms")}
                      className="w-full flex items-center justify-between p-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl transition-all group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                        <span className="text-[10px] font-black text-green-400 uppercase tracking-[0.2em] group-hover:text-green-300 transition-colors">
                          Explore Public Caucuses
                        </span>
                      </div>
                      <svg
                        className="w-5 h-5 text-slate-400 transform -rotate-90 group-hover:translate-x-1 transition-transform"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </button>
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="lobby"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="space-y-8 relative"
              >
                {/* Back / Leave Room Button */}
                <button
                  onClick={handleLeaveRoom}
                  className="absolute -top-2 -left-2 md:-top-6 md:-left-6 text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 p-2 md:p-3 rounded-full transition-all group z-20"
                  title="Leave Room & Return to Lobby"
                >
                  <svg
                    className="w-4 h-4 md:w-5 md:h-5 transform group-hover:-translate-x-1 transition-transform"
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

                <div className="text-center pt-2 relative">
                  <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mb-2 mt-4 md:mt-0">
                    Room Assigned
                  </h2>
                  <div className="flex items-center justify-center gap-3">
                    <div className="text-5xl font-black text-white tracking-[0.1em]">
                      {roomState.roomCode}
                    </div>
                    <button
                      onClick={handleCopyLink}
                      className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-slate-400 hover:text-white transition-all focus:outline-none"
                      title="Copy Join Link"
                    >
                      {copied ? <Check className="w-5 h-5 text-green-400" /> : <Copy className="w-5 h-5" />}
                    </button>
                    <button
                      onClick={handleShareWhatsapp}
                      className="p-2 bg-green-500/10 hover:bg-green-500/20 border border-green-500/20 rounded-xl text-green-500 hover:text-green-400 transition-all focus:outline-none"
                      title="Share via WhatsApp"
                    >
                      <FaWhatsapp className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {isSpectatorMode ? (
                  /* Spectator waiting panel — no franchise selection */
                  <div className="space-y-4 bg-purple-500/5 border border-purple-500/20 p-6 rounded-3xl text-center">
                    <div className="w-14 h-14 rounded-full bg-purple-500/10 flex items-center justify-center mx-auto">
                      <svg className="w-7 h-7 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-purple-300 font-black uppercase tracking-widest text-xs mb-1">Spectator Mode</p>
                      <p className="text-slate-400 text-[11px] font-medium">
                        You're watching this auction as a spectator. You cannot claim a franchise or bid.<br />
                        Once the auction starts, you can request the host to participate.
                      </p>
                    </div>
                    <button
                      onClick={() => setShowLeaveConfirm(true)}
                      className="mt-2 px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:bg-white/10 transition-all text-[10px] font-black uppercase tracking-widest"
                    >
                      Leave Room
                    </button>
                  </div>
                ) : !hasClaimedTeam ? (
                  <div className="space-y-4 bg-white/5 p-4 rounded-3xl border border-white/10">
                    <h3 className="text-[10px] font-black text-blue-400 uppercase tracking-widest text-center">
                      Step 2: Claim Your Franchise
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-48 overflow-y-auto custom-scrollbar pr-2">
                      {IPL_TEAMS.map((team) => {
                        const tId = team.id;
                        // Check if team is already claimed by anyone in the room
                        const isClaimed = roomState?.teams?.some((t) => {
                          // roomState.teams has teamName, franchisdId.
                          // Because franchise IDs sometimes mismatch shortNames depending on DB, matching by name is safer.
                          return t.teamName === team.name;
                        });

                        return (
                          <button
                            key={tId}
                            onClick={() => {
                              if (!isClaimed) setSelectedTeamId(tId);
                            }}
                            disabled={isClaimed}
                            className={`p-2 rounded-xl border text-[9px] font-black tracking-wider uppercase transition-all flex flex-col items-center justify-center gap-2 relative overflow-hidden
                                                            ${isClaimed
                                ? "bg-black/40 border-slate-800 opacity-50 cursor-not-allowed grayscale"
                                : selectedTeamId ===
                                  tId
                                  ? "bg-blue-500/40 border-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.3)] scale-105 z-10"
                                  : "bg-white/5 border-white/5 hover:bg-white/10"
                              }`}
                          >
                            {isClaimed && (
                              <div className="absolute inset-0 bg-red-900/20 flex items-center justify-center backdrop-blur-[1px] z-20">
                                <span className="bg-red-600 text-white text-[8px] px-2 py-0.5 rounded shadow-lg transform -rotate-12">
                                  CLAIMED
                                </span>
                              </div>
                            )}
                            <img
                              src={team.logoUrl}
                              alt={tId}
                              className={`w-10 h-10 object-contain drop-shadow-lg ${isClaimed ? "opacity-40" : ""}`}
                            />
                            <span
                              className={`truncate w-full text-center ${isClaimed ? "text-slate-600 line-through" : "text-slate-300"}`}
                            >
                              {tId}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <button
                      onClick={handleClaimTeam}
                      className="w-full bg-blue-600 text-white font-black py-3 rounded-xl hover:bg-blue-500 transition-all uppercase tracking-widest text-[10px] mt-2"
                    >
                      SECURE FRANCHISE
                    </button>
                    {error && (
                      <p className="text-red-500 text-[10px] font-black uppercase tracking-widest text-center">
                        {error}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                      Connected Owners
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[250px] overflow-y-auto custom-scrollbar pr-2">
                      {roomState.teams.map((t, i) => (
                        <div
                          key={i}
                          className="glass-panel p-4 rounded-2xl border-white/5 flex items-center gap-3 relative"
                        >
                          <div
                            className="w-1.5 h-6 rounded-full"
                            style={{ backgroundColor: t.teamThemeColor }}
                          ></div>

                          {t.teamLogo ? (
                            <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center p-1 border border-white/10 shrink-0">
                              <img
                                src={t.teamLogo}
                                alt={t.teamName}
                                className="w-full h-full object-contain"
                              />
                            </div>
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center shrink-0 border border-white/10">
                              <span className="text-[10px] font-black text-white">
                                {t.teamName.charAt(0)}
                              </span>
                            </div>
                          )}

                          <div className="flex-1 overflow-hidden pr-4">
                            <div className="text-[9px] font-black text-white uppercase truncate">
                              {t.teamName}
                            </div>
                            <div className="text-[10px] text-slate-500 font-bold truncate flex items-center gap-1.5">
                              {/* Online status dot */}
                              <span
                                className={`w-1.5 h-1.5 rounded-full shrink-0 ${onlineMap[t.ownerSocketId] === false
                                  ? "bg-red-500"
                                  : "bg-green-500"
                                  }`}
                                title={onlineMap[t.ownerSocketId] === false ? "Offline" : "Online"}
                              />
                              {t.ownerName}{" "}
                              {t.ownerSocketId === roomState.host && "(Host)"}
                            </div>
                          </div>

                          {isHost &&
                            t.ownerSocketId !== socket.id && (
                              <button
                                onClick={() =>
                                  setKickTarget({
                                    socketId: t.ownerSocketId,
                                    name: t.ownerName,
                                  })
                                }
                                className="absolute top-2 right-2 text-slate-500 hover:text-red-500 bg-black/20 hover:bg-red-500/10 w-6 h-6 rounded-full flex items-center justify-center transition-all"
                                title="Kick Player"
                              >
                                <svg
                                  width="10"
                                  height="10"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="3"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <line x1="18" y1="6" x2="6" y2="18"></line>
                                  <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                              </button>
                            )}
                        </div>
                      ))}
                    </div>

                    {/* Pending Requests for Host */}
                    {isHost &&
                      joinRequests.length > 0 && (
                        <div className="mt-8 space-y-4">
                          <h3 className="text-[10px] font-black text-yellow-500 uppercase tracking-widest ml-1 animate-pulse flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-yellow-500 blur-[2px]"></div>
                            Pending Join Requests ({joinRequests.length})
                          </h3>
                          <div className="space-y-2">
                            {joinRequests.map((req) => (
                              <div
                                key={req.socketId}
                                className="p-3 md:p-4 rounded-2xl bg-yellow-500/5 border border-yellow-500/20 flex flex-col md:flex-row md:items-center justify-between gap-3"
                              >
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full bg-yellow-500/20 flex items-center justify-center border border-yellow-500/30">
                                    <span className="text-xs font-black text-yellow-500">
                                      {req.name?.charAt(0)}
                                    </span>
                                  </div>
                                  <div>
                                    <div className="text-sm font-bold text-yellow-100">
                                      {req.name}
                                    </div>
                                    <div className="text-[9px] text-yellow-600 uppercase tracking-widest font-black">
                                      wants to join
                                    </div>
                                  </div>
                                </div>
                                <div className="flex gap-2 text-xs font-black uppercase tracking-widest">
                                  <button
                                    onClick={() =>
                                      socket.emit("approve_participation", {
                                        roomCode: roomState.roomCode,
                                        targetSocketId: req.socketId,
                                      })
                                    }
                                    className="flex-1 md:flex-none px-4 py-2 bg-green-500/10 text-green-500 hover:bg-green-500 hover:text-white border border-green-500/20 hover:border-green-500 rounded-xl transition-all shadow-[0_0_10px_rgba(34,197,94,0.1)] hover:shadow-[0_0_15px_rgba(34,197,94,0.4)]"
                                  >
                                    Approve
                                  </button>
                                  <button
                                    onClick={() =>
                                      socket.emit("reject_participation", {
                                        roomCode: roomState.roomCode,
                                        targetSocketId: req.socketId,
                                      })
                                    }
                                    className="flex-1 md:flex-none px-4 py-2 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white border border-red-500/20 hover:border-red-500 rounded-xl transition-all"
                                  >
                                    Reject
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                    {/* Spectators List */}
                    {spectators.length > 0 && (
                      <div className="mt-8 space-y-4">
                        <div className="flex items-center justify-between ml-1">
                          <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                            Spectators ({spectators.length})
                          </h3>
                        </div>
                        <div className="space-y-2">
                          {spectators.map((s) => (
                            <div
                              key={s.socketId}
                              className="flex items-center gap-4 p-3 rounded-2xl bg-white/5 border border-white/10 relative group hover:bg-white/10 transition-colors"
                            >
                              {/* Avatar with status dot */}
                              <div className="relative w-8 h-8 shrink-0">
                                <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center border border-slate-600">
                                  <span className="text-[10px] font-black text-slate-400">
                                    {s.name?.charAt(0) || "?"}
                                  </span>
                                </div>
                                <span
                                  className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-slate-900 ${onlineMap[s.socketId] === false
                                    ? "bg-red-500 shadow-[0_0_6px_#ef4444]"
                                    : "bg-green-500 shadow-[0_0_6px_#22c55e]"
                                    }`}
                                  title={onlineMap[s.socketId] === false ? "Offline" : "Online"}
                                />
                              </div>
                              <div className="text-sm font-bold text-slate-300">
                                {s.name}
                                {s.socketId === socket.id && (
                                  <span className="ml-2 text-[10px] font-black text-blue-400 uppercase tracking-widest bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20">
                                    You
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {isHost && (
                      <div className="mt-8 space-y-4">
                        <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                          Auction Timer Settings
                        </h3>
                        <div className="flex gap-4">
                          {[5, 10].map((sec) => (
                            <button
                              key={sec}
                              onClick={() =>
                                socket.emit("update_settings", {
                                  roomCode: roomState.roomCode,
                                  timerDuration: sec,
                                })
                              }
                              className={`flex-1 py-3 rounded-xl border font-black uppercase tracking-widest text-[10px] transition-all
                                                                ${timerDuration ===
                                  sec
                                  ? "bg-blue-600 border-blue-400 text-white shadow-lg shadow-blue-900/40"
                                  : "bg-white/5 border-white/5 text-slate-500 hover:border-white/20"
                                }`}
                            >
                              {sec} Seconds
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {isHost ? (
                      <button
                        onClick={handleStart}
                        className="w-full btn-premium bg-white shadow-[0_0_50px_rgba(255,255,255,0.2)] mt-6"
                      >
                        Initiate Auction Loop
                      </button>
                    ) : (
                      <div className="w-full p-6 rounded-2xl bg-white/5 border border-white/10 text-center mt-4">
                        <div className="text-white/30 text-[10px] font-black uppercase tracking-[0.2em] animate-pulse">
                          Waiting for host to start...
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* Leave Confirmation Modal */}
      <AnimatePresence>
        {/* Kick Confirmation Modal */}
        {kickTarget && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="glass-card max-w-sm w-full p-8 rounded-3xl border border-white/10 shadow-2xl relative overflow-hidden">
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
                    <span className="text-white font-black">{kickTarget.name}</span>{" "}
                    from the waiting room?
                  </p>
                </div>

                <div className="flex w-full gap-4 text-[10px] font-black uppercase tracking-widest">
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

                  <button
                    onClick={() => {
                      socket.emit("kick_player", {
                        roomCode: roomState.roomCode,
                        targetSocketId: kickTarget.socketId,
                      });
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
            </div>
          </div>
        )}

        {/* Leave Confirmation Modal */}
        {showLeaveConfirm && (
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
                    Leave Waiting Room?
                  </h3>
                  <p className="text-slate-400 text-sm font-medium">
                    Are you sure you want to{" "}
                    {isHost &&
                      roomState?.status === "Lobby"
                      ? "disband this waiting room"
                      : "leave this waiting room"}
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
    </div>
  );
};

export default Lobby;
