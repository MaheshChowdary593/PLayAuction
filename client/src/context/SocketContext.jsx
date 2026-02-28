import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';

const SocketContext = createContext();

export const useSocket = () => {
    return useContext(SocketContext);
};

export const SocketProvider = ({ children }) => {
    const [socket, setSocket] = useState(null);

    useEffect(() => {
        // Read the token once at startup directly from localStorage.
        // This avoids re-creating the socket every time the token state changes
        // (which caused multiple rapid reconnects during page load).
        const token = localStorage.getItem('ipl_session_token') || null;

        const newSocket = io(import.meta.env.VITE_API_URL || 'http://localhost:5050', {
            auth: { token },
        });

        newSocket.on('connect', () => {
            console.log(`[SOCKET] Connected: ${newSocket.id} (token: ${token ? 'present' : 'none'})`);
        });

        newSocket.on('connect_error', (err) => {
            console.error('[SOCKET] Connection error:', err.message);
        });

        setSocket(newSocket);

        return () => {
            newSocket.close();
        };
    }, []); // Only run once on mount — token is read synchronously from localStorage

    return (
        <SocketContext.Provider value={socket}>
            {children}
        </SocketContext.Provider>
    );
};
