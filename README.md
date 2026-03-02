# 🏏 PLayAuction - Premium Cricket Auction Management Platform

[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-7-646CFF?style=for-the-badge&logo=vite)](https://vitejs.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?style=for-the-badge&logo=node.js)](https://nodejs.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-7+-47A248?style=for-the-badge&logo=mongodb)](https://www.mongodb.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4-38B2AC?style=for-the-badge&logo=tailwind-css)](https://tailwindcss.com/)
[![Socket.IO](https://img.shields.io/badge/Socket.io-4.8-black?style=for-the-badge&logo=socket.io)](https://socket.io/)

**PLayAuction** is a state-of-the-art, real-time cricket player auction application designed for a premium, high-stakes experience. Featuring a stunning gold-themed aesthetic and an Indian cricket stadium-inspired UI, it brings the intensity and glamour of professional player auctions to your screen.

---

## ✨ Core Features

### 🏆 Premium Auction Podium
- **Real-Time Bidding**: Powered by Socket.IO for instantaneous bid updates across all clients.
- **Dynamic Player Stats**: Detailed player cards showcasing photos, skills, and historical performance.
- **Interactive Gavel**: Visual feedback with "Gavel Slam" animations and confetti celebrations for successful acquisitions.

### 🧠 AI-Powered Insights
- **Smart Ratings**: Integration with **Google Gemini AI** to provide dynamic player ratings and performance predictions based on historical data.

### 📋 Player Pool Management
- **Categorized Pools**: Manage players across different tiers (Marquee, Batsmen, Bowlers, All-rounders).
- **Sold/Unsold History**: Track every transaction and re-auction unsold players.

### 💬 Social & Interaction
- **Live Chat**: Integrated chat room for real-time discussion and strategic banter.
- **User Presence**: Real-time lobby reflecting active participants.

### 📱 Premium Design System
- **Responsive Layout**: Optimized for both desktop and mobile experiences.
- **Micro-animations**: Powered by Framer Motion for smooth transitions and interactive feedback.
- **Gold-Glassmorphism UI**: High-end aesthetic using modern CSS techniques.

---

## 🛠️ Tech Stack

### Frontend
- **Framework**: React 19 (Vite)
- **Styling**: Tailwind CSS
- **Animations**: Framer Motion, Canvas-Confetti
- **Icons**: Lucide React, React Icons
- **Real-time**: Socket.IO Client

### Backend
- **Server**: Node.js, Express
- **Database**: MongoDB (via Mongoose)
- **Real-time**: Socket.IO Server
- **AI Integration**: Google Generative AI (Gemini SDK)

---

## 📂 Project Structure

```text
PLayAuction/
├── client/           # React Frontend (Vite)
│   ├── src/          # Components, Pages, Assets
│   └── public/       # Static files
├── server/           # Node.js Backend (Express)
│   ├── models/       # Mongoose Schemas (Player, Team, etc.)
│   ├── routes/       # API endpoints
│   ├── services/     # Business logic & AI Integration
│   └── socket/       # Socket.IO handlers
```

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v20 or higher)
- [MongoDB](https://www.mongodb.com/) (Local or Atlas)
- [Google Gemini API Key](https://aistudio.google.com/app/apikey)

### Installation

1. **Clone the Repository**
   ```bash
   git clone https://github.com/MaheshChowdary593/PLayAuction.git
   cd PLayAuction
   ```

2. **Backend Setup**
   ```bash
   cd server
   npm install
   ```
   Create a `.env` file in the `server` directory:
   ```env
   PORT=5050
   MONGO_URI=your_mongodb_connection_string
   GEMINI_API_KEY=your_gemini_api_key
   ```
   *Optional:* Seed the database:
   ```bash
   node seed/playerSeed.js
   ```
   Run the server:
   ```bash
   npm run dev
   ```

3. **Frontend Setup**
   ```bash
   cd ../client
   npm install
   ```
   Create a `.env` file in the `client` directory:
   ```env
   VITE_API_URL=http://localhost:5050
   ```
   Run the client:
   ```bash
   npm run dev
   ```

---

## 🎨 Visual Identity

| Theme | Colors | Typography |
| :--- | :--- | :--- |
| **Premium Gold** | #FFD700, #B8860B, #1A1A1A | **Inter** & **Outfit** (Elegant & Bold) |

The UI leverages a dark-mode-first approach with gold accents to mimic the luxury of a premium sports league (like the IPL).

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

Distributed under the ISC License. See `LICENSE` for more information.

---

Built with ❤️ for Cricket Fans 🏏
