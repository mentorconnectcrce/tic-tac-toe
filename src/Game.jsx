import React from 'react'
import calculateWinner from './helpers/calculateWinner'
import Board from './components/board/Board'
import GameInfo from './components/game-info/GameInfo'

class Game extends React.Component {
  constructor(props) {
    super(props)
    this.state = {
      history: [
        {
          squares: Array(9).fill(null),
        },
      ],
      stepNumber: 0,
      xIsNext: true,
    }
  }

  handleClick(i) {
    const history = this.state.history.slice(0, this.state.stepNumber + 1)
    const current = history[history.length - 1]
    const squares = current.squares.slice()
    if (calculateWinner(squares) || squares[i]) {
      return
    }
    squares[i] = this.state.xIsNext ? 'X' : 'O'
    this.setState({
      history: history.concat([
        {
          squares: squares,
        },
      ]),
      stepNumber: history.length,
      xIsNext: !this.state.xIsNext,
    })
  }

  jumpTo(step) {
    console.log(step)
    this.setState({
      stepNumber: step,
      xIsNext: step % 2 === 0,
    })
  }

  render() {
    const history = this.state.history
    const current = history[this.state.stepNumber]
    const winner = calculateWinner(current.squares)
    let status
    if (winner) {
      status = 'Winner: ' + winner
    } else {
      status = 'Next player: ' + (this.state.xIsNext ? 'X' : 'O')
    }
    return (
      <React.Fragment>
        <div className="navbar">
          <h1>Tic Tac Toe</h1>
        </div>
        <div className="game-container">
          <section className="game">
            <GameInfo
              status={status}
              winner={winner}
              xIsNext={this.state.xIsNext}
            />
            <Board
              squares={current.squares}
              onClick={(i) => this.handleClick(i)}
              jumpTo={(i) => this.jumpTo(i)}
            />
          </section>
        </div>
      </React.Fragment>
    )
  }
}

export default Game
