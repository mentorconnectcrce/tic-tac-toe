const GameInfo = ({ 
  status, 
  winner, 
  xIsNext, 
  currentSymbol, 
  availableBlocks, 
  gameMode, 
  isComputerThinking, 
  history, 
  stepNumber,
  isOnlineHost,
  roomCode,
  isWaitingForOpponent,
  opponentConnected,
  hostWins,
  guestWins
}) => {
  const isComputerMode = gameMode === 'computer'
  const isOnlineMode = gameMode === 'online'
  
  // Determine player labels based on mode
  let player1Label = 'Player 1'
  let player2Label = isComputerMode ? 'Computer' : 'Player 2'
  
  if (isOnlineMode) {
    player1Label = isOnlineHost ? 'You' : 'Opponent'
    player2Label = isOnlineHost ? 'Opponent' : 'You'
  }
  
  // Determine who actually won based on the last move
  // In TwistTacToe, the winner is determined by who made the last move (placed the winning symbol)
  // The last move was made by the opposite of xIsNext (since xIsNext toggles after each move)
  const lastMoveByPlayer1 = !xIsNext // If it's now Player 2's turn, Player 1 made the last move
  const winnerLabel = lastMoveByPlayer1 ? player1Label : player2Label
  
  // In online mode, determine if it's my turn
  const isMyTurn = isOnlineMode ? (isOnlineHost ? xIsNext : !xIsNext) : true
  
  return (
    <section className="game-information">
      {isOnlineMode && roomCode && (
        <div className="room-info-banner">
          <span className="room-label">Room Code:</span>
          <span className="room-code-display">{roomCode}</span>
          {!opponentConnected && <span className="disconnected-badge">⚠️ Disconnected</span>}
        </div>
      )}
      
      {isOnlineMode && (hostWins > 0 || guestWins > 0) && (
        <div className="win-counter-banner">
          <div className="win-score">
            <span className="score-label">{isOnlineHost ? 'You' : 'Opponent'}:</span>
            <span className="score-value">{hostWins}</span>
          </div>
          <div className="win-divider">-</div>
          <div className="win-score">
            <span className="score-label">{isOnlineHost ? 'Opponent' : 'You'}:</span>
            <span className="score-value">{guestWins}</span>
          </div>
        </div>
      )}
      
      {!winner && availableBlocks > 0 && (
        <div className="player-turn-indicator">
          <div className="player-badges">
            <div className={`player-badge ${xIsNext ? 'active' : ''}`}>
              <span className="player-symbol">{currentSymbol && xIsNext ? currentSymbol : 'X'}</span>
              <span className="player-label">{player1Label}</span>
              {xIsNext && !currentSymbol && isMyTurn && <span className="action-label">Reveal!</span>}
              {xIsNext && currentSymbol && isMyTurn && <span className="action-label">Place it!</span>}
              {xIsNext && !isMyTurn && <span className="action-label">Waiting...</span>}
            </div>
            <div className={`player-badge ${!xIsNext ? 'active' : ''}`}>
              <span className="player-symbol">{currentSymbol && !xIsNext ? currentSymbol : 'O'}</span>
              <span className="player-label">{player2Label}</span>
              {!xIsNext && !currentSymbol && !isComputerThinking && isMyTurn && <span className="action-label">Reveal!</span>}
              {!xIsNext && currentSymbol && !isComputerThinking && isMyTurn && <span className="action-label">Place it!</span>}
              {!xIsNext && !isMyTurn && <span className="action-label">Waiting...</span>}
              {!xIsNext && isComputerThinking && <span className="action-label">Thinking...</span>}
            </div>
          </div>
        </div>
      )}
      {winner && (
        <div className="winner-announcement">
          <div className="winner-badge">
            <span className="winner-symbol">{winner}</span>
          </div>
          <h3>🎉 {winnerLabel} Wins!</h3>
        </div>
      )}
      {!winner && availableBlocks === 0 && status === 'Draw!' && (
        <div className="draw-announcement">
          <h3>🤝 It's a Draw!</h3>
        </div>
      )}
    </section>
  )
}

export default GameInfo
