import React, { memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { getFlagUrl, fmtCr } from "../utils/playerUtils";

const TeamRow = memo(({
  t,
  i,
  currentBidTeamId,
  expandedTeamId,
  setExpandedTeamId,
  allPlayersMap,
  onlineMap,
  isHost,
  isPrimaryHost,
  coHostUserIds,
  mySocketId,
  onKick,
  onToggleCoHost,
  roster = [] // New prop: lazy-loaded players
}) => {
  const isExpanded = expandedTeamId === t.franchiseId;
  const isActive = currentBidTeamId === t.franchiseId;
  const teamOwnerId = t.ownerUserId;

  // Use lightweight role counts from server or calculate if roster available
  const counts = t.roleCounts || (roster || []).reduce((acc, p) => {
    const playerRecord = allPlayersMap[p.player] || allPlayersMap[p._id] || {};
    const role = (p.role || playerRecord.role || p.playerRole || "").toLowerCase();

    if (role.includes("wk") || role.includes("wicket") || role.includes("keeper")) acc.wk++;
    else if (role.includes("all") || role.includes("ar")) acc.ar++;
    else if (role.includes("bowl") || role.includes("bw")) acc.bowl++;
    else acc.bat++;

    const nationality = p.nationality || playerRecord.nationality || "";
    const isOverseas = p.isOverseas || p.overseas || playerRecord.isOverseas ||
      (nationality && !["india", "ind"].includes(nationality.toLowerCase().trim()));
    if (isOverseas) acc.fr++;

    return acc;
  }, { bat: 0, bowl: 0, ar: 0, wk: 0, fr: 0 });

  return (
    <motion.div
      onClick={() => setExpandedTeamId(isExpanded ? null : t.franchiseId)}
      initial={{ x: -20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ delay: i * 0.05 }}
      className={`
        p-3 flex flex-col relative transition-all duration-300 cursor-pointer rounded-2xl
        ${isActive
          ? "bg-gradient-to-br from-[#D4AF37]/20 to-[#1a1205]/40 border-[#D4AF37]/40 shadow-[0_10px_30px_rgba(212,175,55,0.15)]"
          : "bg-[#1a1205]/40 hover:bg-[#1a1205]/60 border-[#D4AF37]/10"}
        border backdrop-blur-md
      `}
    >
      {/* Active Glow Effect */}
      {isActive && (
        <div className="absolute inset-x-0 -bottom-px h-px bg-gradient-to-r from-transparent via-[#FFE58F] to-transparent shadow-[0_0_20px_#FFE58F]"></div>
      )}

      <div className="flex justify-between items-center z-10">
        <div className="flex items-center gap-3">
          {t.teamLogo && (
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center p-1.5 border border-[#D4AF37]/10 shadow-lg">
                <img
                  src={t.teamLogo}
                  alt={t.teamName}
                  className="w-full h-full object-contain"
                />
              </div>
              <span
                className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#07090f] ${onlineMap[t.ownerUserId] === false
                  ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]"
                  : "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]"
                  }`}
              />
            </div>
          )}
          <div className="flex flex-col">
            <span
              className="font-black text-[11px] lg:text-[12px] tracking-wider uppercase leading-none mb-1"
              style={{ color: t.teamThemeColor }}
            >
              {t.teamName}
            </span>
            <span className="text-[9px] font-bold text-[#D4AF37]/50 uppercase tracking-widest truncate max-w-[120px] flex items-center gap-1">
              {t.ownerName}
              {(mySocketId && (t.ownerSocketId === mySocketId || t.ownerUserId === mySocketId)) ? "(You)" : ""}
              {t.isHost ? "(Host)" : coHostUserIds.includes(t.ownerUserId) ? "(Co-Host)" : ""}
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end">
          <span className="font-mono font-black text-lg lg:text-xl text-white leading-none">
            {fmtCr(t.currentPurse)}
          </span>
          <span className="text-[8px] font-black text-[#D4AF37]/30 tracking-tighter uppercase mt-1">
            PURSE REMAINING
          </span>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-[#D4AF37]/10 pt-3 z-10">
        <div className="flex flex-wrap items-center gap-1.5">
          {t.acquiredCount > 0 || t.playersAcquired?.length > 0 ? (
            <>
              {counts.bat > 0 && <span className="bg-[#D4AF37]/10 border border-[#D4AF37]/20 px-1.5 py-0.5 rounded text-[8px] font-black text-[#FFE58F]">Bat {counts.bat}</span>}
              {counts.bowl > 0 && <span className="bg-[#996515]/10 border border-[#996515]/20 px-1.5 py-0.5 rounded text-[8px] font-black text-[#D4AF37]">Bow {counts.bowl}</span>}
              {counts.ar > 0 && <span className="bg-[#D4AF37]/20 border border-[#D4AF37]/30 px-1.5 py-0.5 rounded text-[8px] font-black text-[#FFE58F]">Ar {counts.ar}</span>}
              {counts.wk > 0 && <span className="bg-[#FFE58F]/10 border border-[#FFE58F]/20 px-1.5 py-0.5 rounded text-[8px] font-black text-[#D4AF37]">Wk {counts.wk}</span>}
              {counts.fr > 0 && <span className="bg-white/10 border border-white/20 px-1.5 py-0.5 rounded text-[8px] font-black text-white">Fr {counts.fr}</span>}
            </>
          ) : (
            <span className="text-[8px] font-black text-[#D4AF37]/20 tracking-widest uppercase italic">Building Squad...</span>
          )}
        </div>
        <div className={`px-2 py-0.5 rounded-full text-[9px] font-black tracking-widest uppercase border ${(t.acquiredCount || t.playersAcquired?.length || 0) >= 25 ? 'bg-red-500/10 border-red-500/30 text-red-500 animate-pulse' : 'bg-white/5 border-[#D4AF37]/10 text-[#D4AF37]/40'}`}>
          {t.acquiredCount || t.playersAcquired?.length || 0}/25
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (t.acquiredCount > 0 || (roster && roster.length > 0)) && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="mt-3 border-t border-[#D4AF37]/10 pt-3 flex flex-col gap-1.5 z-10 overflow-hidden"
          >
            {(!roster || roster.length === 0) ? (
              <div className="text-[10px] text-[#D4AF37]/50 italic text-center py-2 animate-pulse">Loading roster...</div>
            ) : roster.map((p, idx) => {
              const playerRecord = allPlayersMap[p.player] || allPlayersMap[p._id] || {};
              let displayName = p.name || playerRecord.name || playerRecord.player || p.player || "Unknown";
              const role = (p.role || playerRecord.role || "").toLowerCase();
              let roleIcon = "🏏";
              if (role.includes("wk")) roleIcon = "🧤";
              else if (role.includes("all") || role.includes("ar")) roleIcon = "🏏⚾";
              else if (role.includes("bowl")) roleIcon = "⚾";

              const nationality = p.nationality || playerRecord.nationality || "";
              const isOverseas = p.isOverseas || p.overseas || playerRecord.isOverseas ||
                (nationality && !["india", "ind"].includes(nationality.toLowerCase().trim()));

              return (
                <div
                  key={idx}
                  className="flex justify-between items-center text-[10px] font-bold bg-[#1a1205]/40 px-2.5 py-1.5 rounded-xl border border-[#D4AF37]/10 hover:bg-[#1a1205]/60 transition-colors"
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    {isOverseas && <span className="shrink-0 text-[10px]">✈️</span>}
                    <span className="truncate text-[#FFE58F]/80">{displayName}</span>
                    <span className="shrink-0 opacity-60">{roleIcon}</span>
                  </div>
                  <span className="text-[#FFE58F] font-mono">{fmtCr(p.boughtFor)}</span>
                </div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Host Action Overlay */}
      <div className="absolute top-2 right-2 flex items-center gap-2 z-20">
        {isPrimaryHost && t.ownerUserId !== mySocketId && onToggleCoHost && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleCoHost(t.ownerUserId);
            }}
            className={`px-2 py-1 rounded-md text-[8px] font-black uppercase tracking-widest border transition-all ${coHostUserIds.includes(t.ownerUserId)
              ? "bg-[#FFE58F] text-[#1a1205] border-[#FFE58F]"
              : "bg-transparent text-[#D4AF37]/60 border-[#D4AF37]/20 hover:bg-[#D4AF37]/10"
              }`}
            title={coHostUserIds.includes(t.ownerUserId) ? "Remove Co-Host" : "Make Co-Host"}
          >
            {coHostUserIds.includes(t.ownerUserId) ? "Co-Host" : "+ Co-Host"}
          </button>
        )}

        {isHost && t.ownerSocketId !== mySocketId && onKick && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onKick(t.ownerSocketId, t.ownerName);
            }}
            className="w-7 h-7 rounded-full bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white flex items-center justify-center transition-all border border-red-500/20 shadow-lg"
            title={`Kick ${t.ownerName}`}
          >
            <X size={12} strokeWidth={3} />
          </button>
        )}
      </div>
    </motion.div>
  );
});

export const TeamList = memo(
  ({
    teams,
    currentBidTeamId,
    expandedTeamId,
    setExpandedTeamId,
    allPlayersMap,
    onlineMap = {},
    isHost = false,
    isPrimaryHost = false,
    coHostUserIds = [],
    mySocketId = null,
    onKick = null,
    onToggleCoHost = null,
    teamRosters = {},
  }) => (
    <div className="flex-1 overflow-y-auto px-4 pb-8 space-y-3 custom-scrollbar">
      {teams.map((t, i) => (
        <TeamRow
          key={t.franchiseId || i}
          roster={teamRosters[t.id || t.franchiseId]}
          t={t}
          i={i}
          currentBidTeamId={currentBidTeamId}
          expandedTeamId={expandedTeamId}
          setExpandedTeamId={setExpandedTeamId}
          allPlayersMap={allPlayersMap}
          onlineMap={onlineMap}
          isHost={isHost}
          isPrimaryHost={isPrimaryHost}
          coHostUserIds={coHostUserIds}
          mySocketId={mySocketId}
          onKick={onKick}
          onToggleCoHost={onToggleCoHost}
        />
      ))}
    </div>
  ),
);

export const BidHistory = memo(({ bidHistory }) => (
  <div className="flex-1 overflow-y-auto px-4 pb-4 flex flex-col-reverse gap-2.5 custom-scrollbar pt-4">
    <div className="flex flex-col-reverse gap-2.5">
      {bidHistory.map((bid) => (
        <motion.div
          key={bid.id}
          initial={{ x: 20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          className="relative group lg:px-0 px-2"
        >
          <div className="bg-[#D4AF37]/5 backdrop-blur-md border border-[#D4AF37]/30 p-2.5 rounded-xl shadow-[0_5px_15px_rgba(0,0,0,0.3)] relative overflow-hidden flex items-center gap-3 hover:bg-[#D4AF37]/10 transition-colors">
            {/* Left accent line */}
            <div
              className="absolute left-0 top-0 bottom-0 w-1 shadow-[0_0_10px_rgba(212,175,55,0.5)]"
              style={{ backgroundColor: bid.teamColor }}
            ></div>

            <div className="w-9 h-9 shrink-0 bg-white/5 rounded-full flex items-center justify-center p-1.5 border border-[#D4AF37]/20 shadow-inner">
              {bid.teamLogo ? (
                <img src={bid.teamLogo} alt="" className="w-full h-full object-contain" />
              ) : (
                <span className="text-[10px] font-black text-white">{bid.teamName.charAt(0)}</span>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-center mb-0.5">
                <span className="text-[10px] font-black uppercase tracking-wider truncate" style={{ color: bid.teamColor }}>
                  {bid.teamName}
                </span>
                <span className="text-[8px] text-[#FFE58F]/60 font-bold">{bid.time}</span>
              </div>
              <div className="flex justify-between items-end">
                <span className="text-[9px] font-bold text-[#FFE58F]/40 uppercase tracking-widest truncate">{bid.ownerName}</span>
                <span className="text-[13px] font-black font-mono text-white tracking-tight drop-shadow-sm">{fmtCr(bid.amount)}</span>
              </div>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
    {bidHistory.length === 0 && (
      <div className="flex-1 flex flex-col items-center justify-center py-10 opacity-30">
        <div className="text-[10px] font-black uppercase tracking-[0.3em] text-[#D4AF37] animate-pulse">
          Awaiting Initial Bid
        </div>
      </div>
    )}
  </div>
));

export const ChatSection = memo(
  ({
    chatMessages,
    myTeam,
    chatEndRef,
    chatInput,
    setChatInput,
    handleSendMessage,
    isSpectator,
    onClose,
  }) => (
    <div className="flex-1 flex flex-col min-h-0 bg-transparent w-full relative">
      <div className="px-6 py-4 flex items-center justify-between border-b border-[#D4AF37]/30 bg-[#1a1205] backdrop-blur-md sticky top-0 z-20">
        <div>
          <h2 className="text-[9px] font-black text-[#FFE58F] uppercase tracking-[0.25em]">
            War Room Chat
          </h2>
        </div>
        {onClose && (
          <button onClick={onClose} className="lg:hidden p-2 rounded-full hover:bg-white/10 text-[#D4AF37]">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {chatMessages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-[#D4AF37]/40 text-[10px] font-black uppercase tracking-[.2em] px-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-full border border-[#D4AF37]/30 flex items-center justify-center opacity-60 bg-[#D4AF37]/5">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
            </div>
            <span className="text-[#FFE58F]/40">Secured Communication Line</span>
          </div>
        ) : (
          chatMessages.map((msg) => {
            const isMe =
              msg.senderName === (myTeam?.ownerName || "Host") &&
              msg.senderTeam === (myTeam?.teamName || "System");
            return (
              <div key={msg.id} className={`flex flex-col ${isMe ? "items-end" : "items-start"} gap-1.5`}>
                <div className="flex items-center gap-2 mb-0.5 px-2">
                  {!isMe && msg.senderLogo && (
                    <img src={msg.senderLogo} alt="" className="w-3.5 h-3.5 object-contain" />
                  )}
                  <span className="text-[9px] font-black uppercase tracking-wider" style={{ color: msg.senderColor || "#D4AF37" }}>
                    {msg.senderName}
                    {msg.senderTeam && <span className="text-[#D4AF37]/40 ml-1.5 font-bold">[{msg.senderTeam}]</span>}
                  </span>
                  <span className="text-[8px] text-[#D4AF37]/30 font-bold">{msg.timestamp}</span>
                </div>
                <div
                  className={`max-w-[88%] px-4 py-2.5 rounded-2xl text-[11px] font-medium leading-relaxed shadow-lg
                        ${isMe
                      ? "bg-gradient-to-br from-[#FFE58F] to-[#D4AF37] text-[#1a1205] rounded-tr-sm shadow-[0_5px_15px_rgba(212,175,55,0.2)]"
                      : "bg-[#1a1205]/60 text-[#FFE58F]/90 rounded-tl-sm border border-[#D4AF37]/20 backdrop-blur-md"}
                  `}
                >
                  {msg.message}
                </div>
              </div>
            );
          })
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Chat Input Area */}
      <div className="p-4 border-t border-[#D4AF37]/30 bg-[#1a1205] backdrop-blur-xl">
        {isSpectator ? (
          <div className="py-2.5 px-4 bg-yellow-500/5 border border-yellow-500/10 rounded-xl text-center">
            <span className="text-[9px] font-black text-[#D4AF37]/40 uppercase tracking-widest">
              Communication link reserved for owners
            </span>
          </div>
        ) : (
          <form onSubmit={handleSendMessage} className="flex items-center gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Strategic communication..."
              className="flex-1 bg-[#0a0702]/40 border border-[#D4AF37]/30 rounded-full px-5 py-2.5 text-[11px] text-[#FFE58F] placeholder-[#D4AF37]/40 focus:outline-none focus:border-[#D4AF37]/60 transition-all shadow-inner"
            />
            <button
              type="submit"
              disabled={!chatInput.trim()}
              className="w-10 h-10 rounded-full bg-gradient-to-br from-[#FFE58F] via-[#D4AF37] to-[#996515] hover:scale-105 active:scale-95 disabled:grayscale disabled:opacity-30 flex items-center justify-center transition-all shadow-[0_5px_15px_rgba(212,175,55,0.3)] shrink-0"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1a1205" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="ml-0.5"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
            </button>
          </form>
        )}
      </div>
    </div>
  ),
);
