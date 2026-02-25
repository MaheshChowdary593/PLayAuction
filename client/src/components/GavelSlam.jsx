import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { playCustomSlam } from '../utils/soundEngine';

const GavelSlam = ({ type, teamName, teamColor, amount, playerName, ownerName }) => {

    useEffect(() => {
        playCustomSlam(type, teamName);

        if (type === 'SOLD') {
            // Trigger confetti after the slam delay
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
    }, [type, teamColor]);

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-xl"
        >
            <motion.div
                className="relative flex flex-col items-center"
                animate={{ x: [0, -30, 30, -15, 15, 0], y: [0, 30, -30, 15, -15, 0] }}
                transition={{ duration: 0.4, delay: 0.15, ease: "easeOut" }}
            >

                {/* The Gavel Icon Slamming */}
                <motion.div
                    initial={{ rotate: -60, y: -300, opacity: 0 }}
                    animate={{ rotate: 0, y: 0, opacity: 1 }}
                    transition={{
                        type: "spring",
                        damping: 10,
                        stiffness: 250,
                        delay: 0.05
                    }}
                    className="mb-12 origin-bottom-right"
                >
                    <svg width="240" height="240" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ filter: 'drop-shadow(0 30px 40px rgba(0,0,0,0.8))' }}>
                        {/* Shadow under hammer block */}
                        <ellipse cx="100" cy="185" rx="70" ry="12" fill="rgba(0,0,0,0.6)" />

                        {/* Sounding Block */}
                        <path d="M30 160 L170 160 L185 180 L15 180 Z" fill={type === 'SOLD' ? teamColor : '#8B0000'} />
                        <path d="M35 150 L165 150 L170 160 L30 160 Z" fill="rgba(255,255,255,0.2)" />

                        {/* Hammer Handle (Wood) */}
                        <rect x="90" y="50" width="20" height="100" rx="5" fill="#5C2E0E" />
                        <rect x="90" y="50" width="8" height="100" rx="4" fill="#8B4513" />
                        <rect x="85" y="130" width="30" height="15" rx="3" fill="#D4AF37" />

                        {/* Hammer Head */}
                        <rect x="50" y="30" width="100" height="45" rx="12" fill="#5C2E0E" />
                        <rect x="50" y="30" width="100" height="15" rx="8" fill="#8B4513" />
                        <rect x="35" y="35" width="25" height="35" rx="6" fill="#3E1D04" />
                        <rect x="140" y="35" width="25" height="35" rx="6" fill="#3E1D04" />

                        {/* Gold Brass Bands */}
                        <rect x="70" y="30" width="12" height="45" fill="#D4AF37" />
                        <rect x="118" y="30" width="12" height="45" fill="#D4AF37" />
                        <rect x="72" y="30" width="2" height="45" fill="#FFF8DC" />
                        <rect x="120" y="30" width="2" height="45" fill="#FFF8DC" />
                    </svg>
                </motion.div>

                <AnimatePresence>
                    <motion.div
                        initial={{ scale: 0.8, opacity: 0, y: 50 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        transition={{ delay: 0.2, type: "spring", stiffness: 300, damping: 20 }}
                        className="text-center"
                    >
                        {type === 'SOLD' ? (
                            <>
                                <h1 className="text-9xl font-black text-white italic tracking-tighter mb-2 overflow-hidden drop-shadow-2xl">
                                    <motion.span
                                        initial={{ y: 150 }}
                                        animate={{ y: 0 }}
                                        transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.3 }}
                                        className="inline-block"
                                    >
                                        SOLD!
                                    </motion.span>
                                </h1>
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: 0.5 }}
                                    className="text-5xl font-black drop-shadow-[0_0_20px_rgba(255,255,255,0.6)] uppercase tracking-tight flex flex-col items-center gap-1 mb-8"
                                    style={{ color: teamColor }}
                                >
                                    <span>{teamName}</span>
                                    {ownerName && (
                                        <span className="text-xl font-bold tracking-[0.3em] opacity-90 text-white drop-shadow-md">
                                            {ownerName}
                                        </span>
                                    )}
                                </motion.div>
                                <motion.div
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.6 }}
                                    className="glass-card px-10 py-5 rounded-[30px] flex items-center justify-center gap-8 border-white/10 shadow-2xl"
                                >
                                    <div className="text-left">
                                        <div className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">Player Acquired</div>
                                        <div className="text-2xl font-black text-white">{playerName}</div>
                                    </div>
                                    <div className="h-12 w-px bg-white/20"></div>
                                    <div className="text-right">
                                        <div className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">Winning Bid</div>
                                        <div className="text-3xl font-mono font-black text-white drop-shadow-lg">₹{amount}L</div>
                                    </div>
                                </motion.div>
                            </>
                        ) : (
                            <motion.div
                                initial={{ scale: 3, opacity: 0, rotate: -20 }}
                                animate={{ scale: 1, opacity: 1, rotate: -10 }}
                                transition={{ type: "spring", stiffness: 200, damping: 10, delay: 0.2 }}
                                className="border-[16px] border-red-600 text-red-600 px-20 py-10 border-double rounded-3xl bg-black/50 backdrop-blur"
                                style={{ filter: 'drop-shadow(0 0 50px rgba(220, 38, 38, 0.4))' }}
                            >
                                <h1 className="text-[140px] font-black uppercase tracking-tighter leading-none">UNSOLD</h1>
                            </motion.div>
                        )}
                    </motion.div>
                </AnimatePresence>
            </motion.div>

            {/* Cinematic Strobe & Flash on Impact */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 0.8, 0.2, 0.6, 0] }}
                transition={{ duration: 0.4, delay: 0.15, times: [0, 0.1, 0.3, 0.6, 1] }}
                className="absolute inset-0 bg-white pointer-events-none mix-blend-overlay"
            />
        </motion.div>
    );
};

export default GavelSlam;
