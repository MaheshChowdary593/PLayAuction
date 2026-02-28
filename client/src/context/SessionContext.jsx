import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const SessionContext = createContext(null);

/**
 * useSession — hook to access the current user's session.
 * Returns: { userId, playerName, token, isReady, initSession }
 */
export const useSession = () => useContext(SessionContext);

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5050';
const SESSION_KEY = 'ipl_session_token';

/**
 * Decode the JWT payload without verifying (client-side only, for reading data).
 * The server will verify the signature; we just need to read claims here.
 */
function decodeJwt(token) {
    try {
        const base64Payload = token.split('.')[1];
        const payload = JSON.parse(atob(base64Payload));
        // Check if token is expired
        if (payload.exp && Date.now() / 1000 > payload.exp) return null;
        return payload;
    } catch {
        return null;
    }
}

export const SessionProvider = ({ children }) => {
    const [userId, setUserId] = useState(null);
    const [playerName, setPlayerName] = useState('');
    const [token, setToken] = useState(null);
    const [isReady, setIsReady] = useState(false);

    // On mount, try to hydrate from localStorage
    useEffect(() => {
        const savedToken = localStorage.getItem(SESSION_KEY);
        if (savedToken) {
            const payload = decodeJwt(savedToken);
            if (payload) {
                // Valid, non-expired token found
                setToken(savedToken);
                setUserId(payload.userId);
                setPlayerName(payload.playerName);
            } else {
                // Expired or malformed — clear it
                localStorage.removeItem(SESSION_KEY);
            }
        }
        setIsReady(true);
    }, []);

    /**
     * initSession(name) — Creates a new session for the given display name.
     * 
     * IDEMPOTENT: If a valid, non-expired token already exists in localStorage,
     * it is returned immediately without creating a new UUID. A new UUID is ONLY
     * generated on the very first login (or after a token expires/is cleared).
     */
    const initSession = useCallback(async (name) => {
        if (!name?.trim()) throw new Error('Player name is required');

        // Check if we already have a valid, non-expired session
        const savedToken = localStorage.getItem(SESSION_KEY);
        if (savedToken) {
            const payload = decodeJwt(savedToken);
            // ONLY reuse if the name matches exactly. If the user typed a new name,
            // they want a new identity or to update their existing one.
            if (payload && payload.playerName === name.trim()) {
                // Valid token exists for this name — update state if needed & return it
                if (!userId) {
                    setToken(savedToken);
                    setUserId(payload.userId);
                    setPlayerName(payload.playerName);
                }
                return { token: savedToken, userId: payload.userId, playerName: payload.playerName };
            }
        }

        // No valid token — create a brand-new session
        const response = await fetch(`${API_URL}/api/session/init`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ playerName: name.trim() }),
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Failed to create session');
        }

        const data = await response.json();
        localStorage.setItem(SESSION_KEY, data.token);
        localStorage.setItem('playerName', data.playerName);
        setToken(data.token);
        setUserId(data.userId);
        setPlayerName(data.playerName);
        return data;
    }, [userId]);

    /**
     * clearSession() — Logs the user out.
     */
    const clearSession = useCallback(() => {
        localStorage.removeItem(SESSION_KEY);
        localStorage.removeItem('playerName');
        setToken(null);
        setUserId(null);
        setPlayerName('');
    }, []);

    return (
        <SessionContext.Provider value={{ userId, playerName, token, isReady, initSession, clearSession }}>
            {children}
        </SessionContext.Provider>
    );
};
