import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { 
  PeerConnectionManager, 
  generateRoomCode, 
  isValidRoomCode,
  copyToClipboard
} from '../../utils/onlineRoom';
import './OnlineRoom.css';

const OnlineRoom = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  const [mode, setMode] = useState('select'); // 'select', 'create', 'join'
  const [roomCode, setRoomCode] = useState('');
  const [inputCode, setInputCode] = useState('');
  const [connectionStatus, setConnectionStatus] = useState('idle'); // 'idle', 'waiting', 'connected', 'error'
  const [errorMessage, setErrorMessage] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);
  
  // Use ref to always have latest peer manager reference
  const peerManagerRef = useRef(null);

  // Check if joining via URL parameter
  useEffect(() => {
    const roomParam = searchParams.get('room');
    if (roomParam && isValidRoomCode(roomParam)) {
      setMode('join');
      setInputCode(roomParam.toUpperCase());
    }
  }, [searchParams]);

  // Initialize peer connection manager
  useEffect(() => {
    const manager = new PeerConnectionManager(
      handleIncomingMessage,
      handleConnectionChange,
      handleError
    );
    peerManagerRef.current = manager;
    console.log('✅ Peer manager initialized:', manager);

    // Cleanup on unmount - but don't disconnect if navigating to game
    return () => {
      // Only disconnect if NOT navigating to game
      if (window.twistTacToeNavigatingToGame) {
        console.log('🎮 Navigating to game - keeping peer connection alive');
        delete window.twistTacToeNavigatingToGame;
        return;
      }
      
      // Disconnect if we're still on the room screen and not connected
      if (manager && connectionStatus !== 'connected') {
        console.log('🔌 Cleaning up peer manager (not connected)');
        manager.disconnect();
      }
    };
  // Deliberately run once; handlers are stable enough for this screen
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleIncomingMessage = (data) => {
    console.log('Received message:', data);
    
    if (data.type === 'join') {
      // Guest has joined the room
      setConnectionStatus('connected');
    }
  };

  const handleConnectionChange = (status) => {
    console.log('Connection status:', status);
    
    if (status.status === 'waiting') {
      setConnectionStatus('waiting');
      console.log('✅ Room created, waiting for guest...');
    } else if (status.status === 'connected') {
      setConnectionStatus('connected');
      console.log('✅ Connected! Navigating to game...');
      
      // Navigate to game after short delay
      setTimeout(() => {
        startGame(status.isHost);
      }, 1000);
    } else if (status.status === 'disconnected') {
      // Only show error if we were expecting to be connected
      if (connectionStatus !== 'idle' && connectionStatus !== 'disconnected') {
        setConnectionStatus('error');
        setErrorMessage('Connection lost. Please try again.');
        console.warn('⚠️ Unexpected disconnection');
      }
    }
  };

  const handleError = (error) => {
    console.error('Connection error:', error);
    setConnectionStatus('error');
    setErrorMessage(error);
  };

  const handleCreateRoom = async () => {
    const manager = peerManagerRef.current;
    if (!manager) {
      console.error('❌ No peer manager available');
      return;
    }
    
    setConnectionStatus('waiting');
    setErrorMessage('');
    
    try {
      const code = generateRoomCode();
      console.log('🔄 Creating room with code:', code);
      await manager.createRoom(code);
      setRoomCode(code);
      setMode('create');
    } catch (error) {
      console.error('Failed to create room:', error);
      setConnectionStatus('error');
      setErrorMessage('Failed to create room. Please try again.');
    }
  };

  const handleJoinRoom = async () => {
    const manager = peerManagerRef.current;
    if (!manager || !inputCode) {
      console.error('❌ No peer manager or input code');
      return;
    }
    
    const code = inputCode.toUpperCase().trim();
    
    if (!isValidRoomCode(code)) {
      setErrorMessage('Invalid room code. Must be 5 characters.');
      return;
    }
    
    setConnectionStatus('waiting');
    setErrorMessage('Connecting to room...');
    
    try {
      console.log('🔄 Joining room with code:', code);
      await manager.joinRoom(code);
      setRoomCode(code);
      setErrorMessage(''); // Clear error on success
    } catch (error) {
      console.error('Join room error:', error);
      setConnectionStatus('error');
      
      if (error.message.includes('timeout')) {
        setErrorMessage('Connection timeout. The room may not exist or the host may be offline.');
      } else if (error.message.includes('peer-unavailable')) {
        setErrorMessage('Room not found. Please check the code and make sure the host is online.');
      } else {
        setErrorMessage('Failed to join room. Please check the code and try again.');
      }
    }
  };

  const startGame = (isHost) => {
    // Get peer manager from ref (most reliable)
    const manager = peerManagerRef.current;
    
    console.log('🎮 Starting game...');
    console.log('  - Peer manager from ref:', manager);
    console.log('  - Is connected:', manager?.isConnected());
    
    if (!manager) {
      console.error('❌ No peer manager available!');
      setErrorMessage('Connection lost. Please try again.');
      return;
    }
    
    // Store peer manager in window FIRST (before navigation)
    window.twistTacToePeerManager = manager;
    
    // Mark that we're navigating to game (prevent cleanup)
    window.twistTacToeNavigatingToGame = true;
    
    console.log('✅ Peer manager stored in window.twistTacToePeerManager');
    
    // Navigate to game with mode parameters
    const params = new URLSearchParams();
    params.set('mode', 'online');
    params.set('room', roomCode);
    params.set('host', isHost ? '1' : '0');
    
    navigate(`/play?${params.toString()}`);
  };

  const handleCopyCode = async () => {
    const success = await copyToClipboard(roomCode);
    if (success) {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  };

  const handleBack = () => {
    // Disconnect peer if going back (not navigating to game)
    const manager = peerManagerRef.current;
    if (manager) {
      console.log('⬅️ Going back - disconnecting peer');
      manager.disconnect();
    }
    
    // Navigate back to menu
    navigate('/');
  };

  // Render mode selection
  if (mode === 'select') {
    return (
      <div className="online-room-container">
        <button className="back-button-online" onClick={handleBack}>
          ← Back
        </button>
        
        <div className="online-room-content">
          <h1 className="online-title">Play Online</h1>
          <p className="online-subtitle">Connect with another player anywhere!</p>
          
          <div className="online-buttons">
            <button 
              className="online-option-button create-button"
              onClick={handleCreateRoom}
              disabled={connectionStatus === 'waiting'}
            >
              <div className="button-icon">🎮</div>
              <div className="button-text">
                <h3>Create Room</h3>
                <p>Start a new game and share the code</p>
              </div>
            </button>
            
            <button 
              className="online-option-button join-button"
              onClick={() => setMode('join')}
            >
              <div className="button-icon">🔗</div>
              <div className="button-text">
                <h3>Join Room</h3>
                <p>Enter a room code to join a game</p>
              </div>
            </button>
          </div>
          
          <div className="online-info">
            <p>💡 No registration needed! Just create or join a room.</p>
            <p>🔒 Direct peer-to-peer connection (no data stored)</p>
          </div>
        </div>
      </div>
    );
  }

  // Render create room view
  if (mode === 'create') {
    return (
      <div className="online-room-container">
        <button className="back-button-online" onClick={handleBack}>
          ← Back
        </button>
        
        <div className="online-room-content">
          <h1 className="online-title">Room Created! 🎉</h1>
          <p className="online-subtitle">Share this code with your friend</p>
          
          <div className="room-code-display">
            <label>Room Code:</label>
            <div className="code-value">{roomCode}</div>
          </div>
          
          <button className="share-button" onClick={handleCopyCode}>
            {copySuccess ? '✓ Copied!' : '📋 Copy Code'}
          </button>
          
          {connectionStatus === 'waiting' && (
            <div className="status-container">
              <div className="status-message waiting">
                <div className="spinner"></div>
                <p>Waiting for opponent to join...</p>
                <p className="status-hint">Keep this window open!</p>
              </div>
            </div>
          )}
          
          {connectionStatus === 'error' && (
            <div className="status-container">
              <div className="status-message error">
                <p>❌ {errorMessage}</p>
                <button className="retry-button" onClick={handleCreateRoom}>
                  Try Again
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Render join room view
  if (mode === 'join') {
    return (
      <div className="online-room-container">
        <button className="back-button-online" onClick={handleBack}>
          ← Back
        </button>
        
        <div className="online-room-content">
          <h1 className="online-title">Join Room</h1>
          <p className="online-subtitle">Enter the 5-character room code</p>
          
          <div className="join-form">
            <input
              type="text"
              className="room-code-input"
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value.toUpperCase())}
              placeholder="XXXXX"
              maxLength={5}
              disabled={connectionStatus === 'waiting'}
            />
            <button
              className="join-button-submit"
              onClick={handleJoinRoom}
              disabled={connectionStatus === 'waiting' || inputCode.length !== 5}
            >
              {connectionStatus === 'waiting' ? 'Connecting...' : 'Join Room'}
            </button>
          </div>
          
          {connectionStatus === 'waiting' && (
            <div className="status-container">
              <div className="status-message waiting">
                <div className="spinner"></div>
                <p>Connecting to room...</p>
              </div>
            </div>
          )}
          
          {connectionStatus === 'error' && (
            <div className="status-container">
              <div className="status-message error">
                <p>❌ {errorMessage}</p>
                <button className="retry-button" onClick={() => {
                  setConnectionStatus('idle');
                  setErrorMessage('');
                }}>
                  Try Again
                </button>
                
                <div className="troubleshooting-tips">
                  <h4 className="tips-title">Troubleshooting:</h4>
                  <ul>
                    <li>Check that the room code is correct</li>
                    <li>Make sure the host's window is still open</li>
                    <li>Both devices need internet connection</li>
                  </ul>
                </div>
              </div>
            </div>
          )}
          
          <div className="online-info">
            <p>💡 The host must keep their window open for you to join.</p>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default OnlineRoom;
