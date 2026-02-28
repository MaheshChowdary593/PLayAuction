import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSocket } from "../context/SocketContext";
import { motion, AnimatePresence } from "framer-motion";

const PublicRooms = () => {
  const [publicRooms, setPublicRooms] = useState([]);
  const [playerName, setPlayerName] = useState(
    localStorage.getItem("playerName") || "",
  );
  const [error, setError] = useState("");

  const socket = useSocket();
  const navigate = useNavigate();

  useEffect(() => {
    if (!socket) return;

    socket.emit("fetch_public_rooms");

    socket.on("public_rooms_update", (rooms) => {
      setPublicRooms(rooms);
    });

    return () => {
      socket.off("public_rooms_update");
    };
  }, [socket]);

  const handleJoin = (roomCode) => {
    if (!playerName) {
      setError("Please enter your name first!");
      return;
    }
    localStorage.setItem("playerName", playerName);
    navigate("/", { state: { autoJoinRoomCode: roomCode } });
  };

  const handleSpectate = (roomCode) => {
    if (!playerName) {
      setError("Please enter your name first!");
      return;
    }
    localStorage.setItem("playerName", playerName);
    navigate("/", { state: { autoSpectateRoomCode: roomCode } });
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-6 relative overflow-hidden bg-darkBg">
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-blue-900/10 to-transparent pointer-events-none"></div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-2xl glass-card rounded-[32px] md:rounded-[40px] p-6 md:p-10 border-white/5 relative z-10"
      >
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={() => navigate("/")}
            className="text-slate-400 hover:text-white transition-colors flex items-center gap-2 font-bold text-[10px] uppercase tracking-widest bg-white/5 px-4 py-2 rounded-xl"
          >
            <svg
              className="w-4 h-4"
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
            Back to Lobby
          </button>
          <h2 className="text-xl md:text-2xl font-black text-white uppercase tracking-widest">
            Active <span className="text-blue-400">Public Rooms</span>
          </h2>
        </div>

        <div className="space-y-4 mb-8 bg-white/5 p-6 rounded-2xl border border-white/10">
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
            The Gaffer's Name{" "}
            <span className="text-blue-500 lowercase normal-case">
              (Required to Join)
            </span>
          </label>
          <input
            type="text"
            placeholder="Enter your name..."
            className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 focus:outline-none focus:border-blue-500/50 text-white font-bold transition-all mb-2 mt-2"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
          />
          {error && (
            <p className="text-red-500 text-[10px] font-black uppercase tracking-widest mt-1">
              {error}
            </p>
          )}
        </div>

        {publicRooms.length > 0 ? (
          <div className="space-y-3 max-h-96 overflow-y-auto custom-scrollbar pr-2">
            {publicRooms.map((room) => (
              <div
                key={room.roomCode}
                className="flex items-center justify-between bg-white/5 border border-white/10 rounded-xl p-4 hover:bg-white/10 transition-colors"
              >
                <div>
                  <div className="text-white font-bold text-base md:text-lg mb-1">
                    {room.hostName}'s Room
                  </div>
                  <div className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">
                    <span
                      className={
                        room.teamsCount >= room.maxTeams
                          ? "text-red-400"
                          : "text-green-400"
                      }
                    >
                      {room.teamsCount} / {room.maxTeams}
                    </span>{" "}
                    Franchises Claimed
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleJoin(room.roomCode)}
                    disabled={room.teamsCount >= room.maxTeams}
                    className={`px-4 py-2.5 rounded-xl font-black text-[10px] tracking-wider uppercase transition-all ${room.teamsCount >= room.maxTeams ? "bg-slate-700 text-slate-500 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_15px_rgba(37,99,235,0.4)]"}`}
                  >
                    {room.teamsCount >= room.maxTeams ? "Full" : "Join"}
                  </button>
                  <button
                    onClick={() => handleSpectate(room.roomCode)}
                    className="px-4 py-2.5 rounded-xl font-black text-[10px] tracking-wider uppercase transition-all bg-purple-600/20 hover:bg-purple-600/40 border border-purple-500/30 text-purple-400 hover:text-purple-300"
                  >
                    👁 Watch
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-slate-500 text-[10px] font-bold uppercase tracking-widest bg-white/5 border border-white/5 rounded-2xl">
            <div className="mb-4">
              <svg
                className="w-12 h-12 mx-auto text-slate-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.5"
                  d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                />
              </svg>
            </div>
            No public rooms currently active.
            <br />
            Head back and create one!
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default PublicRooms;
