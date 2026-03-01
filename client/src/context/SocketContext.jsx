import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

const SocketContext = createContext();

export const useSocket = () => {
    return useContext(SocketContext);
};

export const SocketProvider = ({ children }) => {
    const [socket, setSocket] = useState(null);

    const connect = useCallback((token) => {
        // Use relative URL for Vite proxy support; VITE_API_URL takes priority in production
        const url = import.meta.env.VITE_API_URL || '/';
        const newSocket = io(url, {
            path: '/socket.io',
            auth: { token },
            reconnection: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 2000,
        });

        newSocket.on('connect', () => {
            console.log(`[SOCKET] Connected: ${newSocket.id} (token: ${token ? 'present' : 'none'})`);
        });

        newSocket.on('connect_error', (err) => {
            console.error('[SOCKET] Connection error:', err.message);
        });

        setSocket(newSocket);
        return newSocket;
    }, []);

    useEffect(() => {
        // Initial connection with whatever is in localStorage
        const token = localStorage.getItem('ipl_session_token') || null;
        const s = connect(token);

        return () => {
            s.close();
        };
    }, [connect]);

    /**
     * reconnectWithToken — forced reconnect with a new identity/token.
     * Returns a Promise that resolves with the freshly-connected socket.
     * Always await this before emitting events to avoid the race condition
     * where you emit on the old socket before the new one has connected.
     */
    const reconnectWithToken = useCallback((newToken) => {
        return new Promise((resolve) => {
            setSocket(prev => {
                if (prev) prev.close();
                const newSocket = connect(newToken);
                // Resolve immediately if already connected, otherwise wait
                if (newSocket.connected) {
                    resolve(newSocket);
                } else {
                    newSocket.once('connect', () => resolve(newSocket));
                }
                return newSocket;
            });
        });
    }, [connect]);

    return (
        <SocketContext.Provider value={{ socket, reconnectWithToken }}>
            {children}
        </SocketContext.Provider>
    );
};
