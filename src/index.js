import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Game from './Game.jsx'
import Menu from './components/menu/Menu.jsx'

const root = ReactDOM.createRoot(document.getElementById('root'))
root.render(
  <Router basename={process.env.REACT_APP_URI}>
    <Routes>
      {/* Root shows the menu */}
      <Route path="/" element={<Menu />} />
      {/* Game route with mode parameter */}
      <Route path="/twisttactoe" element={<Game />} />
      {/* Legacy route redirect to menu */}
      <Route path="/tic-tac-toe" element={<Navigate to="/" replace />} />
      {/* Catch-all: redirect unknown routes to menu */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </Router>
)
