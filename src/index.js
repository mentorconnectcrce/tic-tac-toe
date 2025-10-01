import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Game from './Game.jsx'

const root = ReactDOM.createRoot(document.getElementById('root'))
root.render(
  <Router basename={process.env.REACT_APP_URI}>
    <Routes>
      {/* Root shows the game */}
      <Route path="/" element={<Game />} />
      {/* New primary route */}
      <Route path="/twisttactoe" element={<Game />} />
      {/* Legacy route redirect */}
      <Route path="/tic-tac-toe" element={<Navigate to="/twisttactoe" replace />} />
      {/* Catch-all: redirect unknown routes to the game */}
      <Route path="*" element={<Navigate to="/twisttactoe" replace />} />
    </Routes>
  </Router>
)
