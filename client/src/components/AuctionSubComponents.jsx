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
            {(!roster || roster.length === 0) && (!t.playersAcquired || t.playersAcquired.length === 0) ? (
              <div className="text-[10px] text-[#D4AF37]/50 italic text-center py-2 animate-pulse">Building squad...</div>
            ) : (roster && roster.length > 0 ? roster : t.playersAcquired).map((p, idx) => {
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
                <span className="text-[10px] font-black text-white">{(bid.teamName || '?').charAt(0)}</span>
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

const ChatMessage = memo(({ msg, isMe }) => {
  const isSold = msg.type === 'sold';

  // --- Standard Chat Message ---
  if (!msg.type || msg.type === 'chat') {
    return (
      <div className={`flex flex-col ${isMe ? "items-end" : "items-start"} gap-1.5 w-full`}>
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
  }

  // --- BIDDING WAR Alert ---
  if (msg.type === 'bidding_war') {
    const poolLabel =
      (msg.poolID || '').toLowerCase().startsWith('marquee') ? 'Marquee' :
      (msg.poolID || '').toLowerCase().includes('pool1') ? 'Pool 1' : 'Emerging';
    return (
      <div className="w-full py-1.5 px-2">
        <div className="relative bg-[#1a0d00]/80 backdrop-blur-md border border-orange-500/50 rounded-xl p-3 shadow-[0_0_30px_rgba(249,115,22,0.3)] overflow-hidden">
          {/* Animated amber glow pulse */}
          <div className="absolute inset-0 rounded-xl bg-orange-500/5 animate-pulse pointer-events-none" />

          {/* Top banner */}
          <div className="flex items-center gap-2 mb-2.5">
            <span className="text-[9px] font-black uppercase tracking-[0.3em] text-orange-400 animate-pulse">
              🔥 BIDDING WAR ALERT 🔥
            </span>
            <div className="ml-auto text-[8px] font-bold text-orange-400/40">{msg.timestamp}</div>
          </div>

          {/* Player row */}
          <div className="flex items-center gap-3 relative z-10">
            {/* Player image */}
            {msg.playerImage ? (
              <div className="w-11 h-11 rounded-full overflow-hidden border-2 border-orange-500/60 shadow-[0_0_14px_rgba(249,115,22,0.5)] shrink-0 bg-black/40">
                <img src={msg.playerImage} alt="" className="w-full h-full object-cover" />
              </div>
            ) : (
              <div className="w-11 h-11 rounded-full border-2 border-orange-500/50 bg-orange-900/30 flex items-center justify-center shrink-0">
                <span className="text-orange-400 text-xl">🔥</span>
              </div>
            )}

            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-[14px] font-black text-white uppercase tracking-tight truncate leading-none">
                {msg.playerName || 'Player'}
              </span>
              <span className="text-[9px] font-bold text-orange-400/70 uppercase tracking-widest mt-0.5">
                {poolLabel} · Teams are fighting!
              </span>
            </div>


          </div>

          {/* Caption */}
          <div className="mt-2.5 border-t border-orange-500/15 pt-2">
            <span className="text-[8px] font-bold text-orange-400/50 italic">
              ⚔️ The battle is heating up — who will win this one?
            </span>
          </div>

          {/* Left accent */}
          <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-orange-500/70 shadow-[0_0_8px_rgba(249,115,22,0.7)]" />
        </div>
      </div>
    );
  }

  // --- SHOCKING UNSOLD (Marquee / Pool 1 only) ---

  if (msg.type === 'shocking_unsold') {
    return (
      <div className="w-full py-1.5 px-2">
        <div className="relative bg-[#1a0505]/80 backdrop-blur-md border border-red-500/40 rounded-xl p-3 shadow-[0_0_30px_rgba(239,68,68,0.25)] overflow-hidden group">
          {/* Pulsing red ambient glow */}
          <div className="absolute inset-0 rounded-xl bg-red-500/5 animate-pulse pointer-events-none" />

          {/* Top warning strip */}
          <div className="flex items-center gap-1.5 mb-2.5">
            <span className="text-[9px] font-black uppercase tracking-[0.3em] text-red-400 animate-pulse">⚡ SHOCKING UNSOLD ⚡</span>
          </div>

          {/* Player info row */}
          <div className="flex items-center gap-3 relative z-10">
            {/* Player image */}
            {msg.playerImage ? (
              <div className="relative shrink-0">
                <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-red-500/60 shadow-[0_0_15px_rgba(239,68,68,0.5)] bg-black/40">
                  <img src={msg.playerImage} alt="" className="w-full h-full object-cover grayscale contrast-125" />
                </div>
                {/* Red X overlay */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-[18px] font-black text-red-500 drop-shadow-lg opacity-80">✕</span>
                </div>
              </div>
            ) : (
              <div className="w-12 h-12 rounded-full border-2 border-red-500/60 bg-red-900/30 flex items-center justify-center shrink-0 shadow-[0_0_15px_rgba(239,68,68,0.4)]">
                <span className="text-red-400 text-xl font-black">?</span>
              </div>
            )}

            <div className="flex flex-col min-w-0">
              <span className="text-[16px] font-black text-white uppercase tracking-tight truncate leading-none">
                {msg.playerName || 'Unknown Player'}
              </span>
              <span className="text-[9px] font-black text-red-400/70 uppercase tracking-widest mt-0.5">
                {msg.poolID?.toLowerCase().startsWith('marquee') ? 'Marquee' : 'Pool 1'} Player
              </span>
            </div>

            {/* OOPS badge */}
            <div className="ml-auto shrink-0 flex flex-col items-center">
              <span className="text-[20px] leading-none font-black text-red-500 drop-shadow-[0_0_10px_rgba(239,68,68,0.8)] animate-pulse">OOPS!</span>
              <span className="text-[7px] font-black uppercase tracking-[0.2em] text-red-400/60 mt-0.5">No takers</span>
            </div>
          </div>

          {/* Bottom caption */}
          <div className="mt-2.5 border-t border-red-500/15 pt-2 flex items-center justify-between">
            <span className="text-[8px] font-bold text-red-400/50 italic">Nobody bought this star... 😱</span>
            <span className="text-[8px] text-red-400/40 font-bold">{msg.timestamp}</span>
          </div>

          {/* Left accent */}
          <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-red-500/60 shadow-[0_0_8px_rgba(239,68,68,0.6)]" />
        </div>
      </div>
    );
  }

  // --- SOLD Event Styling (Polished Compact Card) ---

  if (isSold) {
    return (
      <div className="w-full py-1.5 px-2">
        <div className="bg-[#1a1c1a]/60 backdrop-blur-md border border-green-500/20 rounded-xl p-2.5 shadow-lg relative overflow-hidden group">
          {/* Left accent border */}
          <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-green-500/50 shadow-[0_0_8px_rgba(34,197,94,0.3)]" />
          
          <div className="flex flex-col gap-1.5 relative z-10">
            {/* Top Line: Player & Team & Price */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                {/* Player Pic */}
                {msg.playerImage && (
                  <div className="w-8 h-8 rounded-full border border-white/10 overflow-hidden shrink-0 shadow-md bg-black/40">
                    <img src={msg.playerImage} alt="" className="w-full h-full object-cover" />
                  </div>
                )}
                
                <div className="flex flex-col min-w-0">
                  <span className="text-[12px] font-black text-white uppercase tracking-tight truncate">
                    {msg.playerName || "Unknown Player"}
                  </span>
                  <div className="flex items-center gap-1 min-w-0">
                    {msg.senderLogo && (
                      <div className="w-3 h-3 shrink-0">
                        <img src={msg.senderLogo} alt="" className="w-full h-full object-contain" />
                      </div>
                    )}
                    <span className="text-[9px] font-bold uppercase tracking-wider truncate text-white/30">
                      {msg.senderTeam || "System"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Price Tag */}
              <div className="bg-green-500/5 border border-green-500/10 px-2 py-1 rounded-lg shrink-0 text-right">
                <div className="text-[7px] font-black text-green-500/40 uppercase tracking-widest leading-none mb-0.5">Final Bid</div>
                <div className="text-[13px] font-black text-green-400 font-mono tracking-tighter leading-none">
                  {msg.amount ? fmtCr(msg.amount) : "N/A"}
                </div>
              </div>
            </div>

            {/* Bottom Line: Congratulations & Verdict */}
            <div className="flex items-center justify-between gap-2 pl-0.5">
              <span className="text-[9px] font-black text-white/40 italic truncate max-w-[60%]">
                {msg.congrats}
              </span>
              
              {msg.verdict && (
                <div className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border shadow-sm ${
                  msg.verdict.includes('Steal') ? 'bg-blue-500/10 border-blue-500/20 text-blue-400/80' :
                  msg.verdict.includes('Huge') ? 'bg-orange-500/10 border-orange-500/20 text-orange-400/80' :
                  msg.verdict.includes('Future') ? 'bg-purple-500/10 border-purple-500/20 text-purple-400/80' :
                  msg.verdict.includes('Good') ? 'bg-green-500/10 border-green-500/20 text-green-400/80' :
                  'bg-white/5 border-white/10 text-white/30'
                }`}>
                  {msg.verdict}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }


  // --- Bid / Unsold Event Styling ---
  const isBid = msg.type === 'bid';
  const isUnsold = msg.type === 'unsold';

  return (
    <div className="w-full py-1.5 px-2">
      <div className="flex items-center gap-3 group">
        {/* SVG Icon Area */}
        <div className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center border transition-all ${
          isUnsold ? "bg-red-500/10 border-red-500/30 text-red-500" :
          "bg-white/5 border-white/10 text-yellow-500/60"
        }`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={isBid ? "animate-pulse" : ""}>
             <path d="m14 13 5 5c.4.4.4 1 0 1.4l-1.6 1.6c-.4.4-1 .4-1.4 0l-5-5" />
             <path d="m3 21 2-2" />
             <path d="m11 10 5-5" />
             <path d="m12 11-2-2" />
             <path d="m8 11.4 6 6" />
             <path d="m13.1 12.3 2 2" />
             <path d="m14 11 2 2" />
             <path d="M11 5 6.4 9.6A2 2 0 0 0 5 11v11" />
          </svg>
        </div>

        {/* Logo (if applicable) */}
        {msg.senderLogo && (
          <div className="shrink-0 w-7 h-7 bg-white/5 rounded-md flex items-center justify-center p-1 border border-white/10 shadow-inner">
             <img src={msg.senderLogo} alt="" className="w-full h-full object-contain" />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-1.5">
            {msg.senderTeam && (
               <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: msg.senderColor }}>
                 {msg.senderTeam.split(' ')[0]}
               </span>
            )}
            <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest leading-none">
              {isBid ? "bid" : "went"}
            </span>
            {isBid ? (
              <span className="text-[11px] font-black text-yellow-500 tracking-tight">
                {fmtCr(msg.amount)}
              </span>
            ) : null}
            <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest leading-none">
              {isBid ? "for" : ""}
            </span>
            <span className={`text-[11px] font-black tracking-tight text-white/80`}>
               {msg.playerName || msg.message}
            </span>
            {isUnsold && (
              <span className="text-[10px] font-black text-red-500 uppercase tracking-[0.2em] ml-1">
                UNSOLD
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

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
            return <ChatMessage key={msg.id} msg={msg} isMe={isMe} />;
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
