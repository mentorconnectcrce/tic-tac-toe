const GameInfo = ({ status, winner, xIsNext, currentSymbol, availableBlocks, gameMode, isComputerThinking }) => {
  const playerNumber = xIsNext ? '1' : '2'
  const currentPlayer = xIsNext ? 'X' : 'O'
  const isComputerMode = gameMode === 'computer'
  const player2Label = isComputerMode ? 'Computer' : 'Player 2'
  
  return (
    <section className="game-information">
      {!winner && availableBlocks > 0 && (
        <div className="player-turn-indicator">
          <div className="player-badges">
            <div className={`player-badge ${xIsNext ? 'active' : ''}`}>
              <span className="player-symbol">{currentSymbol && xIsNext ? currentSymbol : 'X'}</span>
              <span className="player-label">Player 1</span>
              {xIsNext && !currentSymbol && <span className="action-label">Reveal!</span>}
              {xIsNext && currentSymbol && <span className="action-label">Place it!</span>}
            </div>
            <div className={`player-badge ${!xIsNext ? 'active' : ''}`}>
              <span className="player-symbol">{currentSymbol && !xIsNext ? currentSymbol : 'O'}</span>
              <span className="player-label">{player2Label}</span>
              {!xIsNext && !currentSymbol && !isComputerThinking && <span className="action-label">Reveal!</span>}
              {!xIsNext && currentSymbol && !isComputerThinking && <span className="action-label">Place it!</span>}
              {!xIsNext && isComputerThinking && <span className="action-label">Thinking...</span>}
            </div>
          </div>
        </div>
      )}
      {winner && (
        <div className="winner-announcement">
          <div className="winner-badge">
            <span className="winner-symbol">{status === 'Winner: X' ? 'X' : 'O'}</span>
          </div>
          <h3>{status === 'Winner: X' ? '🎉 Player 1 Wins!' : `🎉 ${player2Label} Wins!`}</h3>
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
