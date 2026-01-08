import React from 'react'
import calculateWinner from './helpers/calculateWinner'
import Board from './components/board/Board'
import GameInfo from './components/game-info/GameInfo'
import { triggerWinnerCelebration } from './utils/confetti'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'

// Wrapper to use hooks with class component
const withRouter = (Component) => {
  return (props) => {
    const location = useLocation()
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    return <Component {...props} location={location} navigate={navigate} searchParams={searchParams} />
  }
}

class Game extends React.Component {
  constructor(props) {
    super(props)
    
    // Detect game mode from URL params
    const searchParams = new URLSearchParams(props.location?.search)
    const gameMode = searchParams.get('mode') || 'friend' // 'friend', 'computer', or 'online'
    const isHost = searchParams.get('host') === '1'
    const roomCode = searchParams.get('room') || null
    
    // Initialize blocks for arrangement phase
    // First block of each side is set by system (blocks[0] and blocks[5])
    // Player 1 arranges blocks[6-9] (enemy's blocks 1-4)
    // Player 2 arranges blocks[1-4] (enemy's blocks 1-4)
    const initializeBlocksForArrangement = () => {
      // System sets first block for each player - they must be different
      const player1FirstBlock = Math.random() < 0.5 ? 'X' : 'O'
      const player2FirstBlock = player1FirstBlock === 'X' ? 'O' : 'X'
      
      // Initialize all blocks - first block of each side is set, rest are null (to be arranged)
      const blocks = [
        player1FirstBlock, // index 0 - Player 1's first block (system set)
        null, null, null, null, // indices 1-4 - Player 1's blocks (arranged by Player 2)
        player2FirstBlock, // index 5 - Player 2's first block (system set)
        null, null, null, null  // indices 6-9 - Player 2's blocks (arranged by Player 1)
      ]
      
      return blocks
    }
    
    const blocks = initializeBlocksForArrangement()
    
    // Generate pool of symbols for arrangement (4 of each per player to arrange)
    const generateArrangementPool = () => {
      return {
        player1Pool: ['X', 'X', 'O', 'O'], // Player 1 will use these to arrange Player 2's blocks (indices 6-9)
        player2Pool: ['X', 'X', 'O', 'O']  // Player 2 will use these to arrange Player 1's blocks (indices 1-4)
      }
    }
    
    const { player1Pool, player2Pool } = generateArrangementPool()
    
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
      gameMode: gameMode, // 'friend', 'computer', or 'online'
      isComputerThinking: false, // For computer mode
      isOnlineHost: isHost, // Whether this player is the host (Player 1) in online mode
      roomCode: roomCode, // Room code for online mode
      peerManager: null, // PeerJS connection manager
      isWaitingForOpponent: false, // Waiting for opponent's move in online mode
      opponentConnected: true, // Whether opponent is connected
      hostWins: 0, // Track host wins in this room session
      guestWins: 0, // Track guest wins in this room session
      // Block arrangement phase state
      gamePhase: 'arrangement', // 'arrangement' or 'playing'
      arrangementTurn: 1, // 1 = Player 1's turn to arrange, 2 = Player 2's turn
      player1Pool: player1Pool, // Symbols Player 1 can place for Player 2
      player2Pool: player2Pool, // Symbols Player 2 can place for Player 1
      selectedSymbol: null, // Currently selected symbol to place
      // Alternating first player - track who starts first in each game
      player1StartsFirst: true, // Alternates each game
      gamesPlayed: 0, // Track number of games to alternate starting player
    }
  }

  componentDidMount() {
    // Mark that rules have been shown
    if (this.state.showRules) {
      localStorage.setItem('rulesShown', 'true')
    }

    // Setup online multiplayer if in online mode
    if (this.state.gameMode === 'online') {
      // Minimal delay to ensure peer manager is available
      setTimeout(() => {
        this.setupOnlineMultiplayer()
      }, 50)
    }
  }

  componentWillUnmount() {
    // Don't cleanup peer connection when component unmounts
    // Let user explicitly disconnect or close browser
    // This prevents disconnection when navigating between game pages
    console.log('🎮 Game component unmounting - keeping peer connection alive')
    
    // Only log, don't disconnect
    if (this.state.peerManager) {
      console.log('✅ Peer manager still active:', this.state.peerManager.isConnected())
    }
  }

  setupOnlineMultiplayer() {
    // Get peer manager from window (set by OnlineRoom component)
    const peerManager = window.twistTacToePeerManager
    
    if (!peerManager) {
      console.error('❌ No peer manager found in window!')
      console.log('🔍 Available window properties:', Object.keys(window).filter(k => k.includes('twist')))
      return
    }
    
    console.log('✅ Peer manager found:', peerManager)
    console.log('✅ Is connected:', peerManager.isConnected())

    // Update peer manager's message handler to handle game messages
    peerManager.onMessage = (data) => this.handleOnlineMessage(data)
    peerManager.onConnectionChange = (status) => this.handleOnlineConnectionChange(status)

    this.setState({ peerManager })

    // If we're the guest, request initial game state from host
    if (!this.state.isOnlineHost) {
      // Send immediately if connected, otherwise will retry on connection
      if (peerManager.isConnected()) {
        peerManager.send({ type: 'request_state' })
      } else {
        // Request state once connection opens
        const originalOnConnectionChange = peerManager.onConnectionChange
        peerManager.onConnectionChange = (status) => {
          originalOnConnectionChange(status)
          if (status.status === 'connected' && !this.state.isOnlineHost) {
            peerManager.send({ type: 'request_state' })
          }
        }
      }
    }
  }

  handleOnlineMessage(data) {
    console.log('Game received message:', data)

    switch (data.type) {
      case 'request_state':
        // Host sends current game state to guest
        if (this.state.isOnlineHost) {
          this.sendGameState()
        }
        break

      case 'game_state':
        // Guest receives initial game state from host
        if (!this.state.isOnlineHost) {
          this.setState({
            blocks: data.blocks,
            history: data.history,
            stepNumber: data.stepNumber,
            xIsNext: data.xIsNext,
            revealedIndices: data.revealedIndices,
            fromFront: data.fromFront,
            currentSymbol: data.currentSymbol,
            frontIndex: data.frontIndex,
            backIndex: data.backIndex,
            hostWins: data.hostWins || 0,
            guestWins: data.guestWins || 0,
            gamePhase: data.gamePhase || 'arrangement',
            arrangementTurn: data.arrangementTurn || 1,
            player1Pool: data.player1Pool || ['X', 'X', 'O', 'O'],
            player2Pool: data.player2Pool || ['X', 'X', 'O', 'O'],
          })
        }
        break

      case 'block_reveal':
        // Opponent revealed a block
        this.setState({
          currentSymbol: data.symbol,
          frontIndex: data.frontIndex,
          backIndex: data.backIndex,
          revealedIndices: data.revealedIndices,
        })
        break

      case 'square_click':
        // Opponent placed a symbol
        this.applyOpponentMove(data.squareIndex)
        break

      case 'block_arrangement':
        // Opponent arranged blocks
        this.setState({
          blocks: data.blocks,
          player1Pool: data.player1Pool,
          player2Pool: data.player2Pool,
          arrangementTurn: data.arrangementTurn,
          gamePhase: data.gamePhase,
          selectedSymbol: null,
        })
        break

      case 'game_restart':
        // Opponent restarted the game - apply immediately
        const newP1StartsFirst = data.player1StartsFirst !== undefined ? data.player1StartsFirst : !this.state.player1StartsFirst
        this.setState({
          history: [{ squares: Array(9).fill(null) }],
          stepNumber: 0,
          xIsNext: newP1StartsFirst,
          blocks: data.blocks,
          revealedIndices: [],
          fromFront: newP1StartsFirst,
          currentSymbol: null,
          frontIndex: 0,
          backIndex: 9,
          isWaitingForOpponent: false,
          gamePhase: 'arrangement',
          arrangementTurn: 1,
          player1Pool: ['X', 'X', 'O', 'O'],
          player2Pool: ['X', 'X', 'O', 'O'],
          selectedSymbol: null,
          player1StartsFirst: newP1StartsFirst,
          gamesPlayed: data.gamesPlayed || this.state.gamesPlayed + 1,
        })
        break

      case 'win_count':
        // Sync win counts from opponent
        this.setState({
          hostWins: data.hostWins,
          guestWins: data.guestWins,
        })
        break

      default:
        console.log('Unknown message type:', data.type)
    }
  }

  handleOnlineConnectionChange(status) {
    console.log('Online connection status:', status)
    
    if (status.status === 'disconnected') {
      this.setState({ 
        opponentConnected: false,
        isWaitingForOpponent: false 
      })
    } else if (status.status === 'connected') {
      this.setState({ opponentConnected: true })
    }
  }

  sendGameState() {
    if (!this.state.peerManager) return

    this.state.peerManager.send({
      type: 'game_state',
      blocks: this.state.blocks,
      history: this.state.history,
      stepNumber: this.state.stepNumber,
      xIsNext: this.state.xIsNext,
      revealedIndices: this.state.revealedIndices,
      fromFront: this.state.fromFront,
      currentSymbol: this.state.currentSymbol,
      frontIndex: this.state.frontIndex,
      backIndex: this.state.backIndex,
      hostWins: this.state.hostWins,
      guestWins: this.state.guestWins,
      gamePhase: this.state.gamePhase,
      arrangementTurn: this.state.arrangementTurn,
      player1Pool: this.state.player1Pool,
      player2Pool: this.state.player2Pool,
    })
  }

  applyOpponentMove(squareIndex) {
    // Apply the opponent's move to our game state
    const history = this.state.history.slice(0, this.state.stepNumber + 1)
    const current = history[history.length - 1]
    const squares = current.squares.slice()
    
    squares[squareIndex] = this.state.currentSymbol
    
    const winner = calculateWinner(squares)
    
    this.setState({
      history: history.concat([{ squares: squares }]),
      stepNumber: history.length,
      xIsNext: !this.state.xIsNext,
      fromFront: !this.state.fromFront,
      currentSymbol: null,
      isWaitingForOpponent: false,
    })

    if (winner) {
      setTimeout(() => {
        triggerWinnerCelebration()
      }, 100)
    }
  }

  resetGameFromOnline(newBlocks) {
    this.setState({
      history: [{ squares: Array(9).fill(null) }],
      stepNumber: 0,
      xIsNext: true,
      blocks: newBlocks,
      revealedIndices: [],
      fromFront: true,
      currentSymbol: null,
      frontIndex: 0,
      backIndex: 9,
      isWaitingForOpponent: false,
    })
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

    // In online mode, check if it's this player's turn
    if (this.state.gameMode === 'online') {
      const isMyTurn = this.state.isOnlineHost ? this.state.xIsNext : !this.state.xIsNext
      if (!isMyTurn || this.state.isWaitingForOpponent) {
        return // Not this player's turn
      }
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
      isWaitingForOpponent: this.state.gameMode === 'online', // Wait for opponent in online mode
    })

    // Send move to opponent in online mode
    if (this.state.gameMode === 'online' && this.state.peerManager) {
      this.state.peerManager.send({
        type: 'square_click',
        squareIndex: i,
      })
    }
    
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
    
    const { frontIndex, backIndex } = this.state
    
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

    // In online mode, check if it's this player's turn
    if (this.state.gameMode === 'online') {
      const isMyTurn = this.state.isOnlineHost ? this.state.xIsNext : !this.state.xIsNext
      if (!isMyTurn || this.state.isWaitingForOpponent) {
        return // Not this player's turn
      }
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

    // Send block reveal to opponent in online mode
    if (this.state.gameMode === 'online' && this.state.peerManager) {
      this.state.peerManager.send({
        type: 'block_reveal',
        symbol: blocks[blockIndex],
        frontIndex: newFrontIndex,
        backIndex: newBackIndex,
        revealedIndices: newRevealedIndices,
      })
    }
  }

  // Block arrangement phase methods
  selectSymbolFromPool = (symbol, poolIndex) => {
    const { arrangementTurn, player1Pool, player2Pool, gameMode, isOnlineHost } = this.state
    
    // In online mode, check if it's this player's turn to arrange
    if (gameMode === 'online') {
      const isMyArrangementTurn = (isOnlineHost && arrangementTurn === 1) || (!isOnlineHost && arrangementTurn === 2)
      if (!isMyArrangementTurn) return
    }
    
    const pool = arrangementTurn === 1 ? player1Pool : player2Pool
    if (pool[poolIndex] === null) return // Already used
    
    this.setState({ selectedSymbol: { symbol, poolIndex } })
  }

  placeBlockInArrangement = (blockIndex) => {
    const { arrangementTurn, blocks, player1Pool, player2Pool, selectedSymbol, gameMode, isOnlineHost } = this.state
    
    if (!selectedSymbol) return
    
    // In online mode, check if it's this player's turn to arrange
    if (gameMode === 'online') {
      const isMyArrangementTurn = (isOnlineHost && arrangementTurn === 1) || (!isOnlineHost && arrangementTurn === 2)
      if (!isMyArrangementTurn) return
    }
    
    // Validate which blocks each player can place on
    // Player 1 (arrangementTurn === 1) arranges blocks 6-9 (Player 2's blocks)
    // Player 2 (arrangementTurn === 2) arranges blocks 1-4 (Player 1's blocks)
    const validIndices = arrangementTurn === 1 ? [6, 7, 8, 9] : [1, 2, 3, 4]
    
    if (!validIndices.includes(blockIndex)) return
    if (blocks[blockIndex] !== null) return // Already placed
    
    const newBlocks = [...blocks]
    newBlocks[blockIndex] = selectedSymbol.symbol
    
    // Remove from pool
    const newPool = arrangementTurn === 1 ? [...player1Pool] : [...player2Pool]
    newPool[selectedSymbol.poolIndex] = null
    
    // Check if arrangement is complete
    const remainingInPool = newPool.filter(s => s !== null).length
    
    let newArrangementTurn = arrangementTurn
    let newGamePhase = 'arrangement'
    
    if (remainingInPool === 0) {
      // Current player finished arranging
      if (arrangementTurn === 1) {
        newArrangementTurn = 2
      } else {
        // Both players done - start the game
        newGamePhase = 'playing'
      }
    }
    
    const newState = {
      blocks: newBlocks,
      selectedSymbol: null,
      gamePhase: newGamePhase,
      arrangementTurn: newArrangementTurn,
    }
    
    if (arrangementTurn === 1) {
      newState.player1Pool = newPool
    } else {
      newState.player2Pool = newPool
    }
    
    this.setState(newState)
    
    // Send arrangement to opponent in online mode
    if (gameMode === 'online' && this.state.peerManager) {
      this.state.peerManager.send({
        type: 'block_arrangement',
        blocks: newBlocks,
        player1Pool: arrangementTurn === 1 ? newPool : player1Pool,
        player2Pool: arrangementTurn === 2 ? newPool : player2Pool,
        arrangementTurn: newArrangementTurn,
        gamePhase: newGamePhase,
      })
    }
  }

  // Computer arranges blocks for Player 1
  computerArrangeBlocks = () => {
    if (this.state.gameMode !== 'computer' || this.state.arrangementTurn !== 2) return
    
    this.setState({ isComputerThinking: true })
    
    // Computer arranges blocks 1-4 for Player 1 in random order
    const pool = [...this.state.player2Pool]
    const newBlocks = [...this.state.blocks]
    const indices = [1, 2, 3, 4]
    
    // Shuffle pool for random arrangement
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[pool[i], pool[j]] = [pool[j], pool[i]]
    }
    
    // Place symbols
    for (let i = 0; i < 4; i++) {
      newBlocks[indices[i]] = pool[i]
    }
    
    setTimeout(() => {
      this.setState({
        blocks: newBlocks,
        player2Pool: [null, null, null, null],
        gamePhase: 'playing',
        arrangementTurn: 2,
        isComputerThinking: false,
      })
    }, 1000)
  }

  jumpTo(step) {
    console.log(step)
    // Reset the game completely
    if (step === 0) {
      // Check if previous game had a winner and increment win count
      const history = this.state.history
      const current = history[this.state.stepNumber]
      const winner = calculateWinner(current.squares)
      
      let newHostWins = this.state.hostWins
      let newGuestWins = this.state.guestWins
      
      if (winner && this.state.gameMode === 'online') {
        // Determine who won: if xIsNext is false, Player 1 (host) made the last winning move
        const hostWon = !this.state.xIsNext
        if (hostWon) {
          newHostWins++
        } else {
          newGuestWins++
        }
      }
      
      // Alternate who starts first each game
      const newGamesPlayed = this.state.gamesPlayed + 1
      const newPlayer1StartsFirst = !this.state.player1StartsFirst
      
      // Initialize blocks for arrangement phase
      const initializeBlocksForArrangement = () => {
        const player1FirstBlock = Math.random() < 0.5 ? 'X' : 'O'
        const player2FirstBlock = player1FirstBlock === 'X' ? 'O' : 'X'
        
        return [
          player1FirstBlock,
          null, null, null, null,
          player2FirstBlock,
          null, null, null, null
        ]
      }
      
      const blocks = initializeBlocksForArrangement()
      
      this.setState({
        history: [
          {
            squares: Array(9).fill(null),
          },
        ],
        stepNumber: 0,
        xIsNext: newPlayer1StartsFirst, // Alternate who starts first
        blocks: blocks,
        revealedIndices: [],
        fromFront: newPlayer1StartsFirst, // If Player 1 starts, reveal from front first
        currentSymbol: null,
        frontIndex: 0,
        backIndex: 9,
        isComputerThinking: false,
        isWaitingForOpponent: false,
        hostWins: newHostWins,
        guestWins: newGuestWins,
        // Reset arrangement phase
        gamePhase: 'arrangement',
        arrangementTurn: 1,
        player1Pool: ['X', 'X', 'O', 'O'],
        player2Pool: ['X', 'X', 'O', 'O'],
        selectedSymbol: null,
        // Track alternating start
        player1StartsFirst: newPlayer1StartsFirst,
        gamesPlayed: newGamesPlayed,
      })

      // Send restart message in online mode (only host can restart)
      if (this.state.gameMode === 'online' && this.state.peerManager && this.state.isOnlineHost) {
        this.state.peerManager.send({
          type: 'game_restart',
          blocks: blocks,
          player1StartsFirst: newPlayer1StartsFirst,
          gamesPlayed: newGamesPlayed,
        })
        // Also send updated win counts
        this.state.peerManager.send({
          type: 'win_count',
          hostWins: newHostWins,
          guestWins: newGuestWins,
        })
      }
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
    const { gamePhase, arrangementTurn, player1Pool, player2Pool, selectedSymbol, gameMode, isOnlineHost } = this.state
    
    // Trigger computer arrangement when it's computer's turn
    if (gameMode === 'computer' && gamePhase === 'arrangement' && arrangementTurn === 2 && !this.state.isComputerThinking) {
      setTimeout(() => this.computerArrangeBlocks(), 500)
    }
    
    let status
    // Check for draw: board is full with no winner, or no more blocks and no winner
    const boardIsFull = current.squares.filter(s => s === null).length === 0
    const noBlocksLeft = availableBlocks <= 0
    const isDraw = !winner && (boardIsFull || noBlocksLeft)
    
    if (gamePhase === 'arrangement') {
      if (gameMode === 'online') {
        const isMyArrangementTurn = (isOnlineHost && arrangementTurn === 1) || (!isOnlineHost && arrangementTurn === 2)
        status = isMyArrangementTurn 
          ? `Your turn to arrange opponent's blocks!` 
          : `Waiting for opponent to arrange...`
      } else if (gameMode === 'computer') {
        status = arrangementTurn === 1 
          ? `Player 1: Arrange Computer's blocks!` 
          : `Computer is arranging...`
      } else {
        status = `Player ${arrangementTurn}: Arrange opponent's blocks!`
      }
    } else if (winner) {
      status = 'Winner: ' + winner
    } else if (isDraw) {
      status = 'Draw!'
    } else if (this.state.gameMode === 'online') {
      const isMyTurn = this.state.isOnlineHost ? this.state.xIsNext : !this.state.xIsNext
      if (!this.state.opponentConnected) {
        status = '⚠️ Opponent disconnected'
      } else if (this.state.isWaitingForOpponent) {
        status = 'Waiting for opponent...'
      } else if (isMyTurn) {
        status = 'Your turn!'
      } else {
        status = "Opponent's turn..."
      }
    } else {
      status = 'Next player: ' + (this.state.xIsNext ? 'Player 1' : 'Player 2')
    }
    
    // Build back URL
    const buildBackUrl = () => {
      return '/'
    }

    // Get current player's pool and target blocks for arrangement
    const currentPool = arrangementTurn === 1 ? player1Pool : player2Pool
    const isMyArrangementTurn = gameMode === 'online' 
      ? ((isOnlineHost && arrangementTurn === 1) || (!isOnlineHost && arrangementTurn === 2))
      : true
    
    return (
      <React.Fragment>
        <div className="navbar">
          <button className="back-button" onClick={() => this.props.navigate(buildBackUrl()) } aria-label="Back to menu">←</button>
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
                  <span className="rule-number">0</span>
                  <div>
                    <h3>Arrange Enemy's Blocks</h3>
                    <p>Before the game starts, arrange your opponent's hidden blocks!</p>
                    <p className="sub-rule">• System sets the first block for each player</p>
                    <p className="sub-rule">• Player 1 arranges blocks for Player 2</p>
                    <p className="sub-rule">• Player 2 arranges blocks for Player 1</p>
                  </div>
                </div>
                <div className="rule-item">
                  <span className="rule-number">1</span>
                  <div>
                    <h3>Hidden Symbols</h3>
                    <p>10 hidden blocks contain 5 X's and 5 O's arranged by players</p>
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
          {/* Arrangement Phase */}
          {gamePhase === 'arrangement' && (
            <div className="arrangement-phase">
              <div className="arrangement-header">
                <h2>🎯 Set Up {arrangementTurn === 1 ? "Player 2's" : "Player 1's"} Blocks</h2>
                {gameMode === 'friend' && (
                  <p className="pass-device-hint">
                    ⚠️ {arrangementTurn === 1 ? "Player 2" : "Player 1"}, look away!
                  </p>
                )}
                {gameMode === 'online' && !isMyArrangementTurn && (
                  <p className="waiting-hint">⏳ Waiting for opponent...</p>
                )}
                {gameMode === 'computer' && arrangementTurn === 2 && (
                  <p className="waiting-hint">🤖 Computer is arranging...</p>
                )}
              </div>
              
              {/* Symbol Pool - Draggable */}
              {isMyArrangementTurn && !this.state.isComputerThinking && (
                <div className="symbol-pool">
                  <div className="pool-symbols">
                    {currentPool.map((symbol, idx) => (
                      symbol !== null && (
                        <div 
                          key={idx}
                          className={`pool-symbol ${selectedSymbol?.poolIndex === idx ? 'selected' : ''}`}
                          draggable="true"
                          onDragStart={(e) => {
                            e.dataTransfer.setData('symbol', symbol)
                            e.dataTransfer.setData('poolIndex', idx.toString())
                            this.selectSymbolFromPool(symbol, idx)
                          }}
                          onClick={() => this.selectSymbolFromPool(symbol, idx)}
                        >
                          {symbol}
                        </div>
                      )
                    ))}
                  </div>
                </div>
              )}
              
              {/* Arrangement Blocks Display - Show only the opponent's blocks */}
              <div className="arrangement-blocks-display">
                {/* Player 1 arranges Player 2's blocks (indices 5-9) */}
                {arrangementTurn === 1 && (
                  <div className="arrangement-side single-row">
                    <div className="arrangement-blocks">
                      {[5, 6, 7, 8, 9].map((idx) => {
                        const block = this.state.blocks[idx]
                        const isSystemSet = idx === 5
                        const isTargetable = !isSystemSet && block === null && isMyArrangementTurn && selectedSymbol
                        const shouldShowSymbol = block !== null && !isSystemSet
                        
                        return (
                          <div 
                            key={idx}
                            className={`arrangement-block ${block !== null && !isSystemSet ? 'filled' : 'empty'} ${isSystemSet ? 'system-set' : ''} ${isTargetable ? 'targetable' : ''}`}
                            onClick={() => isTargetable && this.placeBlockInArrangement(idx)}
                            onDragOver={(e) => isTargetable && e.preventDefault()}
                            onDrop={(e) => {
                              e.preventDefault()
                              if (isTargetable) {
                                this.placeBlockInArrangement(idx)
                              }
                            }}
                          >
                            {isSystemSet ? '🔒' : (shouldShowSymbol ? block : '')}
                          </div>
                        )
                      })}
                    </div>
                    <p className="reveal-direction">← Player 2 reveals from here</p>
                  </div>
                )}
                
                {/* Player 2 arranges Player 1's blocks (indices 0-4) */}
                {arrangementTurn === 2 && (
                  <div className="arrangement-side single-row">
                    <div className="arrangement-blocks">
                      {[0, 1, 2, 3, 4].map((idx) => {
                        const block = this.state.blocks[idx]
                        const isSystemSet = idx === 0
                        const isTargetable = !isSystemSet && block === null && isMyArrangementTurn && selectedSymbol
                        const shouldShowSymbol = block !== null && !isSystemSet
                        
                        return (
                          <div 
                            key={idx}
                            className={`arrangement-block ${block !== null && !isSystemSet ? 'filled' : 'empty'} ${isSystemSet ? 'system-set' : ''} ${isTargetable ? 'targetable' : ''}`}
                            onClick={() => isTargetable && this.placeBlockInArrangement(idx)}
                            onDragOver={(e) => isTargetable && e.preventDefault()}
                            onDrop={(e) => {
                              e.preventDefault()
                              if (isTargetable) {
                                this.placeBlockInArrangement(idx)
                              }
                            }}
                          >
                            {isSystemSet ? '🔒' : (shouldShowSymbol ? block : '')}
                          </div>
                        )
                      })}
                    </div>
                    <p className="reveal-direction">Player 1 reveals from here →</p>
                  </div>
                )}
              </div>
            </div>
          )}
          
          {/* Playing Phase */}
          {gamePhase === 'playing' && (
            <>
              <section className="game">
                <GameInfo
                  status={status}
                  winner={winner}
                  xIsNext={this.state.xIsNext}
                  currentSymbol={currentSymbol}
                  availableBlocks={availableBlocks}
                  gameMode={this.state.gameMode}
                  isComputerThinking={this.state.isComputerThinking}
                  history={history}
                  stepNumber={this.state.stepNumber}
                  isOnlineHost={this.state.isOnlineHost}
                  roomCode={this.state.roomCode}
                  isWaitingForOpponent={this.state.isWaitingForOpponent}
                  opponentConnected={this.state.opponentConnected}
                  hostWins={this.state.hostWins}
                  guestWins={this.state.guestWins}
                />
                <Board
                  squares={current.squares}
                  onClick={(i) => this.handleClick(i)}
                  jumpTo={(i) => this.jumpTo(i)}
                  gameOver={winner || isDraw}
                />
              </section>
              <div className="blocks-container">
                <h4>Hidden Blocks: {availableBlocks} remaining</h4>
                {/* Instruction text always present to reserve layout space; visibility toggled via CSS */}
                <p className={`instruction-text ${(!currentSymbol && !winner && availableBlocks > 0 && !this.state.isComputerThinking && !this.state.isWaitingForOpponent) ? 'visible' : 'hidden'}`}>
                  {this.state.gameMode === 'computer' && !this.state.xIsNext ?
                    'Computer is thinking...' :
                    this.state.gameMode === 'online' && !this.state.opponentConnected ?
                      'Waiting for opponent to reconnect...' :
                      this.state.gameMode === 'online' && this.state.isWaitingForOpponent ?
                        "Waiting for opponent's move..." :
                        this.state.gameMode === 'online' && ((this.state.isOnlineHost && !this.state.xIsNext) || (!this.state.isOnlineHost && this.state.xIsNext)) ?
                          "Opponent is thinking..." :
                          this.state.fromFront ?
                            'Click on the FIRST hidden block to reveal it!' :
                            'Click on the LAST hidden block to reveal it!'}
                </p>
                <div className="blocks-deque">
                  {this.state.blocks.map((block, index) => {
                    const isRevealed = this.state.revealedIndices.includes(index)
                    
                    // Determine if this block is clickable
                    let isClickable = false
                    if (!isRevealed && !currentSymbol && !winner && !this.state.isComputerThinking) {
                      if (this.state.gameMode === 'online') {
                        const isMyTurn = this.state.isOnlineHost ? this.state.xIsNext : !this.state.xIsNext
                        isClickable = isMyTurn && !this.state.isWaitingForOpponent && this.state.opponentConnected &&
                          ((this.state.fromFront && index === this.state.frontIndex) ||
                           (!this.state.fromFront && index === this.state.backIndex))
                      } else {
                        isClickable = ((this.state.fromFront && index === this.state.frontIndex) ||
                                       (!this.state.fromFront && index === this.state.backIndex))
                      }
                    }
                    
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
            </>
          )}
        </div>
      </React.Fragment>
    )
  }
}

export default withRouter(Game)
