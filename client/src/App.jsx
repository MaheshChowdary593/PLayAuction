import React from "react";
import { BrowserRouter as Router, Routes, Route, useLocation } from "react-router-dom";
import { SessionProvider } from "./context/SessionContext";
import { SocketProvider } from "./context/SocketContext";
import Lobby from "./pages/Lobby";
import AuctionPodium from "./pages/AuctionPodium";
import SquadSelection from "./pages/SquadSelection";
import ResultsReveal from "./pages/ResultsReveal";
import PublicRooms from "./pages/PublicRooms";

// Renders the stadium video only on lobby routes
function StadiumBackground() {
  const location = useLocation();
  const videoRef = React.useRef(null);
  const isLobby = location.pathname === "/" || location.pathname.startsWith("/join/");

  React.useEffect(() => {
    if (isLobby) {
      const handleFirstInteraction = () => {
        if (videoRef.current) {
          videoRef.current.muted = false;
          videoRef.current.play().catch(e => console.log("Audio play blocked:", e));
        }
        window.removeEventListener("click", handleFirstInteraction);
        window.removeEventListener("keydown", handleFirstInteraction);
      };

      window.addEventListener("click", handleFirstInteraction);
      window.addEventListener("keydown", handleFirstInteraction);

      return () => {
        window.removeEventListener("click", handleFirstInteraction);
        window.removeEventListener("keydown", handleFirstInteraction);
      };
    }
  }, [isLobby]);

  if (!isLobby) return null;
  return (
    <video
      ref={videoRef}
      autoPlay
      loop
      muted // Autoplay MUST be muted to start playing automatically in modern browsers
      playsInline
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        objectFit: "cover",
        opacity: 0.6,
        zIndex: -1,
        pointerEvents: "none",
      }}
    >
      <source src="/Stadium-bg.mp4" type="video/mp4" />
    </video>
  );
}

function App() {
  return (
    <SessionProvider>
      <SocketProvider>
        <Router>
          <StadiumBackground />
          <div className="min-h-screen text-white w-full overflow-hidden font-sans">
            <Routes>
              <Route path="/" element={<Lobby />} />
              <Route path="/join/:roomCode" element={<Lobby />} />
              <Route path="/public-rooms" element={<PublicRooms />} />
              <Route path="/auction/:roomCode" element={<AuctionPodium />} />
              <Route path="/selection/:roomCode" element={<SquadSelection />} />
              <Route path="/results/:roomCode" element={<ResultsReveal />} />
            </Routes>
          </div>
        </Router>
      </SocketProvider>
    </SessionProvider>
  );
}

export default App;
