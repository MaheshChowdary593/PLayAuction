// Web Audio API Synthesizer for high-quality, zero-latency sound effects without external assets

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

export const playBidSound = () => {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, audioCtx.currentTime); // Pitch
    osc.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.1); // Quick up-slide

    gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.3, audioCtx.currentTime + 0.05);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);

    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.2);
};

const TEAM_AUDIO_MAP = {
    'mumbai indians': 'Sold to Mumbai India.mp3',
    'chennai super kings': 'Sold to Chennai Supe.mp3',
    'royal challengers bengaluru': 'Sold to Royal Challe.mp3',
    'kolkata knight riders': 'Sold to Kolkatha Kni.mp3',
    'delhi capitals': 'Sold to Delhi capita.mp3',
    'punjab kings': 'Sold to Punjab kings.mp3',
    'rajasthan royals': 'Sold to rajasthan ro.mp3',
    'sunrisers hyderabad': 'Sold to Sunrises Hyd.mp3',
    'lucknow super giants': 'Sold to Lucknow Supe.mp3',
    'gujarat titans': 'Sold to Gujarat tita.mp3',
    'deccan chargers': 'Sold to deccan charg.mp3',
    'kochi tuskers kerala': 'Sold to kochi tusker.mp3',
    'pune warriors india': 'Sold to pune warrior.mp3',
    'rising pune supergiant': 'Sold to rising pune .mp3',
    'gujarat lions': 'Sold to gujarat lion.mp3'
};

export const playCustomSlam = (type, teamName) => {
    if (audioCtx.state === 'suspended') audioCtx.resume();

    let filename = '';

    if (type === 'UNSOLD') {
        filename = 'Unsold.mp3';
    } else if (type === 'SOLD' && teamName) {
        const key = teamName.toLowerCase().trim();
        filename = TEAM_AUDIO_MAP[key];
    } else {
        return playHammerSlam();
    }

    if (filename) {
        // Encode URI to handle spaces in filenames
        const audio = new Audio(`/sounds/${encodeURIComponent(filename)}`);
        audio.play().catch(e => {
            console.warn(`Could not play custom sound /sounds/${filename}, falling back to synth.`);
            playHammerSlam();
        });
    } else {
        playHammerSlam();
    }
};

export const playHammerSlam = () => {
    if (audioCtx.state === 'suspended') audioCtx.resume();

    // Impact Sound
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(100, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);

    gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);

    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.5);

    // Rumble (Noise)
    const bufferSize = audioCtx.sampleRate * 0.5; // 0.5 seconds
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }

    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;

    const noiseFilter = audioCtx.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.value = 400;

    const noiseGain = audioCtx.createGain();
    noiseGain.gain.setValueAtTime(0.5, audioCtx.currentTime);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(audioCtx.destination);

    noise.start();
};

export const playWarningBeep = () => {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(300, audioCtx.currentTime);

    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);

    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.3);
};
