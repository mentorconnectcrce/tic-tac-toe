import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Game from './Game';
import Menu from './components/menu/Menu';
import OnlineRoom from './components/online-room/OnlineRoom';
import './TwistTacToeScoped.css';
import './index.css';

/**
 * TwistTacToe Wrapper Component
 * 
 * Routes:
 * - / - Game menu (choose vs friend, vs computer, or online)
 * - /play?mode=friend - Play with a friend on same device
 * - /play?mode=computer - Play against computer
 * - /play?mode=online - Play online multiplayer
 * - /online - Create or join online room
 * - /join?room=CODE - Direct join with room code
 */
const TwistTacToeWrapper = () => {
  return (
    <div className="twisttactoe-game-wrapper">
      <main>
        <Routes>
          <Route path="/" element={<Menu />} />
          <Route path="/play" element={<Game />} />
          <Route path="/online" element={<OnlineRoom />} />
          <Route path="/join" element={<OnlineRoom />} />
          {/* Redirect unknown routes to menu */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
};

export default TwistTacToeWrapper;
