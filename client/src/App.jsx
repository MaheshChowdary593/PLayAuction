import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { SocketProvider } from './context/SocketContext';
import Lobby from './pages/Lobby';
import AuctionPodium from './pages/AuctionPodium';
import ResultsReveal from './pages/ResultsReveal';

function App() {
  return (
    <SocketProvider>
      <Router>
        <div className="min-h-screen bg-darkBg text-white w-full overflow-hidden font-sans">
          <Routes>
            <Route path="/" element={<Lobby />} />
            <Route path="/auction/:roomCode" element={<AuctionPodium />} />
            <Route path="/results/:roomCode" element={<ResultsReveal />} />
          </Routes>
        </div>
      </Router>
    </SocketProvider>
  );
}

export default App;
