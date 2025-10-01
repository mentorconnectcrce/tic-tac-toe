import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Game from './Game.jsx'

const root = ReactDOM.createRoot(document.getElementById('root'))
root.render(<Router basename={process.env.REACT_APP_URI}>
  <Routes>
    <Route path="/tic-tac-toe" element={<Game />} />
  </Routes>
</Router>)
