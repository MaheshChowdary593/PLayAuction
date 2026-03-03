import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import { playCustomSlam } from '../utils/soundEngine';
import { fmtCr } from '../utils/playerUtils';

const GavelSlam = ({ type, teamName, teamColor, teamLogo, playerName, winningBid, playerImage }) => {

    useEffect(() => {
        playCustomSlam(type, teamName);

        if (type === 'SOLD') {
            const timer = setTimeout(() => {
                const end = Date.now() + 3000;
                const colors = [teamColor || '#ffffff', '#ffffff', '#ffcc33'];

                (function frame() {
                    confetti({
                        particleCount: 3,
                        angle: 60,
                        spread: 55,
                        origin: { x: 0 },
                        colors: colors
                    });
                    confetti({
                        particleCount: 3,
                        angle: 120,
                        spread: 55,
                        origin: { x: 1 },
                        colors: colors
                    });

                    if (Date.now() < end) {
                        requestAnimationFrame(frame);
                    }
                }());
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [type, teamColor, teamName]);

    // Generate the starburst badge outer path
    const getStarburstPath = (cx, cy, outerRadius, innerRadius, points) => {
        let path = '';
        const angleStep = Math.PI / points;
        for (let i = 0; i < 2 * points; i++) {
            const radius = i % 2 === 0 ? outerRadius : innerRadius;
            const angle = i * angleStep;
            const x = cx + radius * Math.cos(angle);
            const y = cy + radius * Math.sin(angle);
            path += (i === 0 ? 'M ' : 'L ') + `${x},${y} `;
        }
        path += 'Z';
        return path;
    };

    const isSold = type === 'SOLD';
    const cx = 140;
    const cy = 140;
    const starburstPath = getStarburstPath(cx, cy, 130, 115, 32);

    // Theme colors
    const badgeColor = isSold ? (teamColor || '#FFEB3B') : '#ef4444'; // Red for UNSOLD
    const accentColor = isSold ? 'white' : 'white';
    const textColor = isSold ? 'white' : 'white';

    return (
        <motion.div
            initial={{ scale: 2, opacity: 0, rotate: isSold ? -20 : 10 }}
            animate={{ scale: 0.5, opacity: 1, rotate: isSold ? -10 : -15 }}
            exit={{ scale: 0, opacity: 0, y: -50 }}
            transition={{ type: "spring", stiffness: 200, damping: 12, delay: 0.1 }}
            className="absolute z-[100] drop-shadow-[0_20px_30px_rgba(0,0,0,0.5)] flex items-center justify-center pointer-events-none"
        >
            <svg width="200" height="200" viewBox="0 0 280 280" className="overflow-visible">
                <defs>
                    <path id="curveTop" d={`M ${cx - 75},${cy} A 75,75 0 0,1 ${cx + 75},${cy}`} fill="transparent" />
                    <path id="curveBottom" d={`M ${cx - 85},${cy} A 85,85 0 0,0 ${cx + 85},${cy}`} fill="transparent" />
                    <filter id="shadowGlow" x="-20%" y="-20%" width="140%" height="140%">
                        <feDropShadow dx="0" dy="4" stdDeviation="6" floodOpacity="0.4" floodColor="#000" />
                    </filter>
                    <clipPath id="avatarClip">
                        <circle cx={cx} cy={cy} r="45" />
                    </clipPath>
                </defs>

                {/* Starburst Base */}
                <path d={starburstPath} fill={badgeColor} stroke="rgba(255,255,255,0.4)" strokeWidth="3" filter="url(#shadowGlow)" />

                {/* Inner Accent Ring */}
                <circle cx={cx} cy={cy} r="105" fill={badgeColor} stroke="rgba(0,0,0,0.2)" strokeWidth="3" />

                {/* Inner Content Area */}
                <circle cx={cx} cy={cy} r="95" fill={badgeColor} stroke={accentColor} strokeWidth="2" strokeDasharray="6 4" />
                <circle cx={cx} cy={cy} r="50" fill="white" stroke="rgba(0,0,0,0.1)" strokeWidth="2" />

                {/* Top Text: Player Name */}
                <text fontSize={playerName && playerName.length > 12 ? "18" : "22"} fontWeight="900" fill={textColor} letterSpacing="1" style={{ fontFamily: 'Outfit, Arial, sans-serif', textShadow: '2px 2px 4px rgba(0,0,0,0.9)', stroke: 'rgba(0,0,0,0.5)', strokeWidth: '0.5px' }}>
                    <textPath href="#curveTop" startOffset="50%" textAnchor="middle">
                        {playerName ? playerName.toUpperCase() : "PLAYER"}
                    </textPath>
                </text>

                {/* Bottom Text: Status */}
                <text fontSize={isSold && teamName && teamName.length > 15 ? "11" : "13"} fontWeight="900" fill={textColor} letterSpacing="0.5" style={{ fontFamily: 'Outfit, Arial, sans-serif', textShadow: '2px 2px 4px rgba(0,0,0,0.9)', stroke: 'rgba(0,0,0,0.5)', strokeWidth: '0.5px' }}>
                    <textPath href="#curveBottom" startOffset="50%" textAnchor="middle">
                        {isSold
                            ? `SOLD TO ${teamName ? teamName.toUpperCase().substring(0, 20) : "FRANCHISE"} • ${fmtCr(winningBid?.amount || 0)}`
                            : "NO BIDS RECEIVED • TRY AGAIN LATER"
                        }
                    </textPath>
                </text>

                {/* Center Content: Team Logo or Player Image for UNSOLD */}
                {isSold ? (
                    teamLogo ? (
                        <image href={teamLogo} x={cx - 40} y={cy - 40} width="80" height="80" preserveAspectRatio="xMidYMid meet" />
                    ) : (
                        <text x={cx} y={cy + 12} fontSize="36" fontWeight="900" textAnchor="middle" fill="#004BA0">
                            {teamName?.charAt(0)}
                        </text>
                    )
                ) : (
                    playerImage ? (
                        <image
                            href={playerImage}
                            x={cx - 45}
                            y={cy - 45}
                            width="90"
                            height="90"
                            preserveAspectRatio="xMidYMid slice"
                            clipPath="url(#avatarClip)"
                        />
                    ) : (
                        <text x={cx} y={cy + 12} fontSize="20" fontWeight="900" textAnchor="middle" fill="#ef4444" style={{ fontFamily: 'Outfit, Arial, sans-serif' }}>
                            UNSOLD
                        </text>
                    )
                )}
            </svg>
        </motion.div>
    );
};

export default GavelSlam;
