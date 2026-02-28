import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { SocketProvider } from "./context/SocketContext";
import Lobby from "./pages/Lobby";
import AuctionPodium from "./pages/AuctionPodium";
import SquadSelection from "./pages/SquadSelection";
import ResultsReveal from "./pages/ResultsReveal";
import PublicRooms from "./pages/PublicRooms";

function App() {
  return (
    <SocketProvider>
      <Router>
        <div className="min-h-screen bg-darkBg text-white w-full overflow-hidden font-sans">
          <Routes>
            <Route path="/" element={<Lobby />} />
            <Route path="/public-rooms" element={<PublicRooms />} />
            <Route path="/auction/:roomCode" element={<AuctionPodium />} />
            <Route path="/selection/:roomCode" element={<SquadSelection />} />
            <Route path="/results/:roomCode" element={<ResultsReveal />} />
          </Routes>
        </div>
      </Router>
    </SocketProvider>
  );
}

export default App;
