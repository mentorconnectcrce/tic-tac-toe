import React from 'react'
import calculateWinner from './helpers/calculateWinner'
import Board from './components/board/Board'
import GameInfo from './components/game-info/GameInfo'
import { triggerWinnerCelebration } from './utils/confetti'
import { useLocation } from 'react-router-dom'

// Wrapper to use hooks with class component
import { useNavigate } from 'react-router-dom'

const withRouter = (Component) => {
  return (props) => {
    const location = useLocation()
    const navigate = useNavigate()
    return <Component {...props} location={location} navigate={navigate} />
  }
}

class Game extends React.Component {
  constructor(props) {
    super(props)
    
    // Detect game mode from URL params
    const searchParams = new URLSearchParams(props.location?.search)
    const gameMode = searchParams.get('mode') || 'friend' // 'friend' or 'computer'
    
    // Generate 10 blocks with more strategic distribution (5 X and 5 O shuffled)
    const generateBalancedBlocks = () => {
      const blocks = ['X', 'X', 'X', 'X', 'X', 'O', 'O', 'O', 'O', 'O']
      // Enhanced Fisher-Yates shuffle with multiple passes for better randomness
      // Seed randomness with timestamp to ensure different patterns each game
      const seed = Date.now() * Math.random()
      
      // Perform multiple shuffle passes for truly random distribution
      const shufflePasses = 3 + Math.floor(Math.random() * 3) // 3-5 passes
      
      for (let pass = 0; pass < shufflePasses; pass++) {
        for (let i = blocks.length - 1; i > 0; i--) {
          // Use multiple random sources for better entropy
          const randomFactor = Math.sin(seed + i + pass) * 10000
          const j = Math.floor((Math.random() + Math.abs(randomFactor % 1)) / 2 * (i + 1))
          ;[blocks[i], blocks[j]] = [blocks[j], blocks[i]]
        }
      }
      return blocks
    }
    const blocks = generateBalancedBlocks()
    
    this.state = {
      history: [
        {
          squares: Array(9).fill(null),
        },
      ],
      stepNumber: 0,
      xIsNext: true,
      blocks: blocks, // All 10 blocks
      revealedIndices: [], // Track which indices have been revealed
      fromFront: true, // Alternates: true = reveal from front, false = reveal from back
      currentSymbol: null, // The symbol revealed for current turn
      frontIndex: 0, // Next index to reveal from front
      backIndex: 9, // Next index to reveal from back
      showRules: !localStorage.getItem('rulesShown'), // Show rules on first visit
      gameMode: gameMode, // 'friend' or 'computer'
      isComputerThinking: false, // For computer mode
    }
  }

  componentDidMount() {
    // Mark that rules have been shown
    if (this.state.showRules) {
      localStorage.setItem('rulesShown', 'true')
    }
  }

  toggleRules = () => {
    this.setState({ showRules: !this.state.showRules })
  }

  handleClick(i) {
    const history = this.state.history.slice(0, this.state.stepNumber + 1)
    const current = history[history.length - 1]
    const squares = current.squares.slice()
    
    if (calculateWinner(squares) || squares[i]) {
      return
    }
    
    // Check if a symbol has been revealed for this turn
    if (this.state.currentSymbol === null) {
      // Player needs to reveal a block first
      return
    }
    
    // Place the revealed symbol
    squares[i] = this.state.currentSymbol
    
    // Check if this move wins the game
    const winner = calculateWinner(squares)
    
    this.setState({
      history: history.concat([
        {
          squares: squares,
        },
      ]),
      stepNumber: history.length,
      xIsNext: !this.state.xIsNext,
      fromFront: !this.state.fromFront, // Alternate for next turn
      currentSymbol: null, // Reset for next turn
    })
    
    // Trigger confetti celebration if there's a winner
    if (winner) {
      setTimeout(() => {
        triggerWinnerCelebration()
      }, 100)
    } else if (this.state.gameMode === 'computer' && this.state.xIsNext) {
      // After player (X/Player 1) places symbol, trigger computer move
      // xIsNext will be false after setState, so we check before the toggle
      setTimeout(() => this.computerRevealAndMove(), 800)
    }
  }
  
  // Computer AI logic
  computerRevealAndMove() {
    if (this.state.isComputerThinking) return
    
    const { frontIndex, backIndex, fromFront, blocks } = this.state
    
    // Check if there are blocks left
    if (frontIndex > backIndex) return
    
    this.setState({ isComputerThinking: true })
    
    // Computer reveals from back (Player 2 position)
    setTimeout(() => {
      this.handleBlockReveal(false)
      
      // After revealing, computer places the symbol
      setTimeout(() => {
        this.computerPlaceSymbol()
      }, 600)
    }, 400)
  }
  
  computerPlaceSymbol() {
    const history = this.state.history.slice(0, this.state.stepNumber + 1)
    const current = history[history.length - 1]
    const squares = current.squares.slice()
    
    if (!this.state.currentSymbol) {
      this.setState({ isComputerThinking: false })
      return
    }
    
    // Find best move using minimax-like strategy
    const bestMove = this.findBestMove(squares)
    
    if (bestMove !== -1) {
      this.handleClick(bestMove)
    }
    
    // Reset computer thinking state
    this.setState({ isComputerThinking: false })
  }
  
  findBestMove(squares) {
    // Strategy: Try to win, block player from winning, or pick random
    const availableMoves = squares.map((sq, idx) => sq === null ? idx : null).filter(idx => idx !== null)
    
    if (availableMoves.length === 0) return -1
    
    const symbol = this.state.currentSymbol
    const opponentSymbol = symbol === 'X' ? 'O' : 'X'
    
    // 1. Check if computer can win
    for (let move of availableMoves) {
      const testSquares = [...squares]
      testSquares[move] = symbol
      if (calculateWinner(testSquares) === symbol) {
        return move
      }
    }
    
    // 2. Block player from winning
    for (let move of availableMoves) {
      const testSquares = [...squares]
      testSquares[move] = opponentSymbol
      if (calculateWinner(testSquares) === opponentSymbol) {
        return move
      }
    }
    
    // 3. Take center if available
    if (squares[4] === null) {
      return 4
    }
    
    // 4. Take corners
    const corners = [0, 2, 6, 8].filter(idx => squares[idx] === null)
    if (corners.length > 0) {
      return corners[Math.floor(Math.random() * corners.length)]
    }
    
    // 5. Take any available move
    return availableMoves[Math.floor(Math.random() * availableMoves.length)]
  }
  
  handleBlockReveal(isFromFront) {
    // Only allow reveal if no symbol is currently revealed
    if (this.state.currentSymbol !== null) {
      return
    }
    
    const { frontIndex, backIndex, fromFront, blocks, revealedIndices } = this.state
    
    // Check if there are blocks left
    if (frontIndex > backIndex) {
      return
    }
    
    // Check if player is clicking the correct side
    if (isFromFront !== fromFront) {
      // Wrong side, show error or just return
      return
    }
    
    // Reveal the block
    let blockIndex = isFromFront ? frontIndex : backIndex
    let newFrontIndex = isFromFront ? frontIndex + 1 : frontIndex
    let newBackIndex = isFromFront ? backIndex : backIndex - 1
    let newRevealedIndices = [...revealedIndices, blockIndex]
    
    this.setState({
      currentSymbol: blocks[blockIndex],
      frontIndex: newFrontIndex,
      backIndex: newBackIndex,
      revealedIndices: newRevealedIndices,
    })
  }

  jumpTo(step) {
    console.log(step)
    // Reset the game completely
    if (step === 0) {
      const generateBalancedBlocks = () => {
        const blocks = ['X', 'X', 'X', 'X', 'X', 'O', 'O', 'O', 'O', 'O']
        // Enhanced Fisher-Yates shuffle with multiple passes for better randomness
        const seed = Date.now() * Math.random()
        const shufflePasses = 3 + Math.floor(Math.random() * 3)
        
        for (let pass = 0; pass < shufflePasses; pass++) {
          for (let i = blocks.length - 1; i > 0; i--) {
            const randomFactor = Math.sin(seed + i + pass) * 10000
            const j = Math.floor((Math.random() + Math.abs(randomFactor % 1)) / 2 * (i + 1))
            ;[blocks[i], blocks[j]] = [blocks[j], blocks[i]]
          }
        }
        return blocks
      }
      const blocks = generateBalancedBlocks()
      this.setState({
        history: [
          {
            squares: Array(9).fill(null),
          },
        ],
        stepNumber: 0,
        xIsNext: true,
        blocks: blocks,
        revealedIndices: [],
        fromFront: true,
        currentSymbol: null,
        frontIndex: 0,
        backIndex: 9,
        isComputerThinking: false,
      })
    } else {
      this.setState({
        stepNumber: step,
        xIsNext: step % 2 === 0,
      })
    }
  }

  render() {
    const history = this.state.history
    const current = history[this.state.stepNumber]
    const winner = calculateWinner(current.squares)
    const currentSymbol = this.state.currentSymbol
    const availableBlocks = (this.state.backIndex - this.state.frontIndex) + 1
    
    let status
    if (winner) {
      status = 'Winner: ' + winner
    } else if (availableBlocks <= 0 || (availableBlocks === 0 && current.squares.filter(s => s === null).length === 0)) {
      status = 'Draw!'
    } else {
      status = 'Next player: ' + (this.state.xIsNext ? 'Player 1' : 'Player 2')
    }
    
    return (
      <React.Fragment>
        <div className="navbar">
          <button className="back-button" onClick={() => this.props.navigate('/') } aria-label="Back to menu">←</button>
          <h1>TwistTacToe</h1>
          <button className="info-button" onClick={this.toggleRules} title="Game Rules" aria-label="Open game rules">
            <span className="info-icon">i</span>
          </button>
        </div>
        
        {this.state.showRules && (
          <div className="rules-overlay" onClick={this.toggleRules}>
            <div className="rules-modal" onClick={(e) => e.stopPropagation()}>
              <button className="close-button" onClick={this.toggleRules}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
              <h2>🎮 How to Play</h2>
              <div className="rules-content">
                <div className="rule-item">
                  <span className="rule-number">1</span>
                  <div>
                    <h3>Hidden Symbols</h3>
                    <p>10 hidden blocks contain 5 X's and 5 O's shuffled randomly</p>
                  </div>
                </div>
                <div className="rule-item">
                  <span className="rule-number">2</span>
                  <div>
                    <h3>Reveal Your Symbol</h3>
                    <p>Click the glowing block to reveal your symbol for this turn</p>
                    <p className="sub-rule">• Player 1 reveals from FIRST block</p>
                    <p className="sub-rule">• Player 2 reveals from LAST block</p>
                    <p className="sub-rule">• Alternate between front and back</p>
                  </div>
                </div>
                <div className="rule-item">
                  <span className="rule-number">3</span>
                  <div>
                    <h3>Place on Board</h3>
                    <p>After revealing, place that symbol on the TwistTacToe board</p>
                  </div>
                </div>
                <div className="rule-item">
                  <span className="rule-number">4</span>
                  <div>
                    <h3>Win or Draw</h3>
                    <p>Get 3 in a row (horizontal, vertical, or diagonal) to win!</p>
                    <p className="sub-rule">⚠️ You might place X or O regardless of being Player 1 or 2</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        <div className="game-container">
          <section className="game">
            <GameInfo
              status={status}
              winner={winner}
              xIsNext={this.state.xIsNext}
              currentSymbol={currentSymbol}
              availableBlocks={availableBlocks}
              gameMode={this.state.gameMode}
              isComputerThinking={this.state.isComputerThinking}
            />
            <Board
              squares={current.squares}
              onClick={(i) => this.handleClick(i)}
              jumpTo={(i) => this.jumpTo(i)}
            />
          </section>
          <div className="blocks-container">
            <h4>Hidden Blocks: {availableBlocks} remaining</h4>
            {/* Instruction text always present to reserve layout space; visibility toggled via CSS */}
            <p className={`instruction-text ${(!currentSymbol && !winner && availableBlocks > 0 && !this.state.isComputerThinking) ? 'visible' : 'hidden'}`}>
              {this.state.gameMode === 'computer' && !this.state.xIsNext ?
                'Computer is thinking...' :
                this.state.fromFront ?
                  'Click on the FIRST hidden block to reveal it!' :
                  'Click on the LAST hidden block to reveal it!'}
            </p>
            <div className="blocks-deque">
              {this.state.blocks.map((block, index) => {
                const isRevealed = this.state.revealedIndices.includes(index)
                const isClickable = !isRevealed && !currentSymbol && !winner && !this.state.isComputerThinking &&
                  ((this.state.fromFront && index === this.state.frontIndex) ||
                   (!this.state.fromFront && index === this.state.backIndex))
                
                return (
                  <div 
                    key={index} 
                    className={`block ${isRevealed ? 'revealed' : 'hidden'} ${isClickable ? 'clickable' : ''}`}
                    onClick={() => {
                      if (isClickable) {
                        this.handleBlockReveal(index === this.state.frontIndex)
                      }
                    }}
                  >
                    {isRevealed ? block : '?'}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </React.Fragment>
    )
  }
}

export default withRouter(Game)
