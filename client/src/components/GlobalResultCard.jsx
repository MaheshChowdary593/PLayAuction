import React from 'react';

const GlobalResultCard = ({ results, allPlayersMap }) => {
    if (!results || results.length === 0) return null;

    return (
        <div
            id="global-result-card"
            className="w-[1280px] h-[720px] text-white relative flex flex-col font-sans overflow-hidden p-10"
            style={{
                background: 'linear-gradient(135deg, #7b2cbf 0%, #3c096c 50%, #240046 100%)',
            }}
        >
            {/* Header */}
            <header className="text-center mb-6">
                <h1 className="text-3xl font-black uppercase tracking-[0.2em] text-yellow-400 drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
                    IPL 2026 OFFICIAL SQUAD VERDICTS & AI RATINGS
                </h1>
            </header>

            {/* Teams Grid - 2 rows of 5 teams */}
            <div className="grid grid-cols-5 grid-rows-2 gap-x-8 gap-y-10 flex-1">
                {results.slice(0, 10).map((team, idx) => {
                    const score = team.evaluation?.overallScore || 0;
                    const playing11 = team.evaluation?.playing11 || [];
                    const impactPlayers = team.evaluation?.impactPlayers || [];

                    return (
                        <div key={idx} className="flex flex-col items-center">
                            {/* Logo and Score Container */}
                            <div className="relative mb-3 flex flex-col items-center">
                                <div className="w-20 h-20 rounded-full bg-white flex items-center justify-center p-2 shadow-[0_0_20px_rgba(255,255,255,0.2)]">
                                    <img
                                        src={team.logoUrl || team.franchiseId?.logoUrl}
                                        alt={team.teamName}
                                        className="w-full h-full object-contain"
                                    />
                                </div>
                                {/* AI Rating - Placed "in front" (overlayed or right below) */}
                                <div className="mt-2 bg-yellow-400 px-3 py-0.5 rounded-full shadow-lg">
                                    <span className="text-[#240046] text-xs font-black uppercase">Rating: {score}</span>
                                </div>
                            </div>

                            {/* Players List */}
                            <div className="w-full space-y-0.5 text-[9px] font-bold text-yellow-300/90 leading-tight">
                                {playing11.slice(0, 11).map((pId, pIdx) => {
                                    const pData = allPlayersMap[pId];
                                    const name = pData?.name || pData?.player || pId;
                                    return (
                                        <div key={pIdx} className="truncate">
                                            {pIdx + 1}. {name}
                                        </div>
                                    );
                                })}
                                {/* Impact Players */}
                                {impactPlayers.length > 0 && (
                                    <>
                                        <div className="mt-1 pt-0.5 border-t border-yellow-400/20 text-white font-black text-[7px] uppercase tracking-tighter">
                                            Impact: {impactPlayers.slice(0, 4).map((pId, pIdx) => {
                                                const pData = allPlayersMap[pId];
                                                return pData?.name || pData?.player || pId;
                                            }).join(', ')}
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Footer */}
            <footer className="mt-4 border-t border-white/10 pt-4 flex justify-between items-center px-4">
                <div className="text-[10px] font-black uppercase text-white/40">Verified by IPL Auction Engine AI</div>
                <div className="text-[10px] font-black uppercase text-yellow-400">#IPLAuctionVerdict2026</div>
            </footer>
        </div>
    );
};

export default GlobalResultCard;
