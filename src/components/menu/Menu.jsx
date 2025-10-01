import React from 'react'
import { useNavigate } from 'react-router-dom'
import './Menu.css'

const Menu = () => {
  const navigate = useNavigate()

  const handlePlayWithFriend = () => {
    navigate('/twisttactoe?mode=friend')
  }

  const handlePlayWithComputer = () => {
    navigate('/twisttactoe?mode=computer')
  }

  return (
    <div className="menu-container">
      <div className="menu-content">
        <h1 className="menu-title">TwistTacToe</h1>
        <p className="menu-subtitle">Choose Your Game Mode</p>
        
        <div className="menu-buttons">
          <button className="menu-button friend-button" onClick={handlePlayWithFriend}>
            <div className="button-icon">👥</div>
            <div className="button-text">
              <h3>Play with Friend</h3>
              <p>Two players on same device</p>
            </div>
          </button>
          
          <button className="menu-button computer-button" onClick={handlePlayWithComputer}>
            <div className="button-icon">🤖</div>
            <div className="button-text">
              <h3>Play with Computer</h3>
              <p>Challenge the AI opponent</p>
            </div>
          </button>
        </div>

        <div className="menu-footer">
          <p className="menu-hint">🎲 Hidden blocks with random X's and O's!</p>
        </div>
      </div>
    </div>
  )
}

export default Menu
