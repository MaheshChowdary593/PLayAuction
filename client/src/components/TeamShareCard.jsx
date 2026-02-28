import { ImAirplane } from 'react-icons/im';
import { getFlagUrl } from '../utils/playerUtils';

const TeamShareCard = ({ team, allPlayersMap }) => {
    if (!team) return null;

    // The user wants the "captain" or star player based on the auction result.
    // The AI evaluation provides a 'starPlayer' name.
    const featuredPlayerName = team.evaluation?.starPlayer;

    // Find the player object for the featured player to get their image
    const featuredPlayerEntry = team.playersAcquired.find(entry => {
        const name = entry.name || (entry.player && allPlayersMap[entry.player]) || (entry.player?.name);
        return name === featuredPlayerName;
    });

    // Fallback to the first player if starPlayer is not found or N/A
    const displayPlayerEntry = featuredPlayerEntry || team.playersAcquired[0];
    const displayPlayerName = displayPlayerEntry?.name || (displayPlayerEntry?.player && allPlayersMap[displayPlayerEntry.player]) || (displayPlayerEntry?.player?.name) || "Captain";
    const displayPlayerImage = displayPlayerEntry?.player?.image_path || displayPlayerEntry?.player?.imagepath || displayPlayerEntry?.player?.photoUrl || 'https://via.placeholder.com/400x600?text=Captain';

    const themeColor = team.teamThemeColor || '#2d3401';

    return (
        <div
            id="team-share-card"
            className="w-[800px] min-h-[600px] text-white relative flex font-sans overflow-hidden p-0 m-0"
            style={{
                backgroundColor: themeColor,
                backgroundImage: `linear-gradient(135deg, ${themeColor} 0%, #000000 100%)`,
                backgroundSize: 'cover'
            }}
        >
            {/* Left accent bar */}
            <div className="w-12 bg-white/20 flex flex-col items-center py-8 gap-4 shrink-0 border-r border-white/5">
                <div className="w-2 h-2 rounded-full bg-white opacity-40"></div>
                <div className="w-2 h-2 rounded-full bg-white opacity-40"></div>
                <div className="w-2 h-2 rounded-full bg-white opacity-40"></div>
                <div className="mt-auto flex flex-col gap-4 mb-4">
                    <div className="w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-b-[12px] border-b-white opacity-60"></div>
                    <div className="w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-b-[12px] border-b-white opacity-60"></div>
                    <div className="w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-b-[12px] border-b-white opacity-60"></div>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 p-8 relative flex flex-col">
                {/* Header Section */}
                <div className="flex justify-between items-start mb-8">
                    {/* Featured Player Circle */}
                    <div className="relative">
                        <div className="w-48 h-48 rounded-full border-4 border-white overflow-hidden bg-white/20 relative z-10 shadow-2xl">
                            <img
                                src={displayPlayerImage}
                                alt={displayPlayerName}
                                className="w-full h-full object-cover object-top"
                                crossOrigin="anonymous"
                            />
                        </div>
                        {/* Decorative background logo/circle */}
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 border-[20px] border-white/5 rounded-full z-0"></div>
                    </div>

                    {/* Team Names etc */}
                    <div className="text-right flex-1 pl-8">
                        {team.franchiseId?.logoUrl && (
                            <div className="flex justify-end mb-2">
                                <img
                                    src={team.franchiseId.logoUrl}
                                    alt="logo"
                                    className="h-12 w-auto object-contain brightness-0 invert opacity-60"
                                    crossOrigin="anonymous"
                                />
                            </div>
                        )}
                        <h1 className="text-4xl font-black uppercase tracking-tighter leading-none mb-1 text-white drop-shadow-lg">
                            {team.teamName}
                        </h1>
                        <h2 className="text-6xl font-black uppercase tracking-tighter leading-none text-white opacity-90 drop-shadow-2xl">
                            SQUAD
                        </h2>
                        <p className="text-xl font-bold uppercase tracking-[0.2em] mt-2 text-white/80">
                            FOR IPL 2025
                        </p>
                    </div>
                </div>

                {/* Squad Grid */}
                <div className="grid grid-cols-2 gap-x-8 gap-y-3 flex-1 px-4 z-10">
                    {team.playersAcquired.map((entry, idx) => {
                        const playerName = entry.name || (entry.player && allPlayersMap[entry.player]) || (entry.player?.name) || "Unknown Player";
                        const isOverseas = entry.player?.isOverseas || false;

                        return (
                            <div
                                key={idx}
                                className="bg-black/50 border border-white/10 rounded-full px-5 py-2 flex items-center justify-between"
                            >
                                <div className="flex items-center gap-2 overflow-hidden flex-1 mr-2">
                                    {getFlagUrl(entry.player?.nationality) && (
                                        <img
                                            src={getFlagUrl(entry.player?.nationality)}
                                            onError={(e) => {
                                                e.target.style.display = 'none';
                                            }}
                                            alt=""
                                            className="w-5 h-auto rounded-sm shrink-0 border border-white/10"
                                        />
                                    )}
                                    <span className="font-bold text-lg truncate uppercase italic text-white">{playerName}</span>
                                </div>
                                {isOverseas && (
                                    <ImAirplane className="text-white text-xl shrink-0 -rotate-45" />
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Footer deco */}
                <div className="absolute bottom-4 right-8 opacity-40 text-[10px] font-black tracking-widest uppercase text-white">
                    Generated by IPL Auction Verdict
                </div>
            </div>

            {/* Background "SQUAD" watermark */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[300px] font-black opacity-5 pointer-events-none select-none italic text-white leading-none z-0">
                SQUAD
            </div>

            {/* Team Logo Watermark */}
            {team.franchiseId?.logoUrl && (
                <div className="absolute top-1/2 left-0 -translate-y-1/2 -translate-x-1/4 w-[400px] h-[400px] opacity-[0.07] pointer-events-none select-none z-0 grayscale brightness-200">
                    <img src={team.franchiseId.logoUrl} alt="" className="w-full h-full object-contain" crossOrigin="anonymous" />
                </div>
            )}
        </div>
    );
};

export default TeamShareCard;
