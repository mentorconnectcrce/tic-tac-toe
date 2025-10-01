/**
 * Online Room Utilities for TwistTacToe
 * Uses PeerJS for peer-to-peer WebRTC connections (no backend required)
 */

import Peer from 'peerjs';

// Singleton instance to persist across HMR
let globalPeerManager = null;

// Generate a random 5-character alphanumeric room code
export const generateRoomCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed similar looking chars (0, O, I, 1)
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

// Validate room code format
export const isValidRoomCode = (code) => {
  return /^[A-Z0-9]{5}$/i.test(code);
};

/**
 * PeerConnection Manager
 * Handles all WebRTC peer-to-peer connection logic
 */
export class PeerConnectionManager {
  constructor(onMessage, onConnectionChange, onError) {
    // Return existing instance if available (singleton pattern for HMR)
    if (globalPeerManager && globalPeerManager.peer && !globalPeerManager.peer.destroyed) {
      console.log('♻️ Reusing existing peer manager');
      globalPeerManager.onMessage = onMessage;
      globalPeerManager.onConnectionChange = onConnectionChange;
      globalPeerManager.onError = onError;
      return globalPeerManager;
    }

    this.peer = null;
    this.connection = null;
    this.isHost = false;
    this.roomCode = null;
    this.onMessage = onMessage;
    this.onConnectionChange = onConnectionChange;
    this.onError = onError;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 3;
    
    // Store as global singleton
    globalPeerManager = this;
  }

  /**
   * Initialize peer connection as host (room creator)
   */
  async createRoom(roomCode) {
    try {
      this.isHost = true;
      this.roomCode = roomCode;
      
      // Create peer with room code as ID
      // Don't specify host/port/path - let PeerJS use default cloud server
      this.peer = new Peer(roomCode, {
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' },
          ]
        },
        debug: 2 // Set to 2 for better debugging
      });

      return new Promise((resolve, reject) => {
        let timeoutId;
        
        this.peer.on('open', (id) => {
          console.log('✅ Peer created with ID:', id);
          clearTimeout(timeoutId);
          this.saveRoomToCache(roomCode, true);
          this.onConnectionChange({ status: 'waiting', isHost: true, roomCode });
          resolve(roomCode);
        });

        this.peer.on('connection', (conn) => {
          console.log('✅ Incoming connection from:', conn.peer);
          this.connection = conn;
          this.setupConnectionHandlers();
        });

        this.peer.on('error', (err) => {
          console.error('❌ Peer error:', err);
          clearTimeout(timeoutId);
          this.onError(this.formatError(err));
          reject(err);
        });

        this.peer.on('disconnected', () => {
          console.warn('⚠️ Peer disconnected from signaling server');
          // Only try to reconnect if we haven't manually disconnected
          if (this.peer && !this.peer.destroyed) {
            console.log('🔄 Attempting to reconnect to signaling server...');
            setTimeout(() => {
              if (this.peer && !this.peer.destroyed) {
                this.peer.reconnect();
              }
            }, 1000);
          }
        });

        // Timeout after 15 seconds
        timeoutId = setTimeout(() => {
          if (!this.peer || !this.peer.id) {
            const error = new Error('Connection timeout. Please try again.');
            console.error('❌ Timeout:', error);
            reject(error);
          }
        }, 15000);
      });
    } catch (error) {
      console.error('❌ Error creating room:', error);
      this.onError('Failed to create room. Please try again.');
      throw error;
    }
  }

  /**
   * Join an existing room as guest
   */
  async joinRoom(roomCode) {
    try {
      this.isHost = false;
      this.roomCode = roomCode;
      
      // Create peer with random ID for guest
      const guestId = `guest-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      console.log('🔄 Creating guest peer with ID:', guestId);
      console.log('🔄 Attempting to join room:', roomCode);
      
      // Don't specify host/port/path - let PeerJS use default cloud server
      this.peer = new Peer(guestId, {
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' },
          ]
        },
        debug: 2
      });

      return new Promise((resolve, reject) => {
        let timeoutId;
        let connectionTimeoutId;
        
        this.peer.on('open', (id) => {
          console.log('✅ Guest peer created with ID:', id);
          console.log('🔄 Connecting to host:', roomCode);
          
          // Connect to host
          this.connection = this.peer.connect(roomCode, {
            reliable: true,
            serialization: 'json',
            metadata: { type: 'guest' }
          });

          this.connection.on('open', () => {
            console.log('✅ Connected to host successfully!');
            clearTimeout(timeoutId);
            clearTimeout(connectionTimeoutId);
            this.setupConnectionHandlers();
            this.saveRoomToCache(roomCode, false);
            this.onConnectionChange({ status: 'connected', isHost: false, roomCode });
            
            // Send join message to host
            this.send({ type: 'join', timestamp: Date.now() });
            resolve(roomCode);
          });

          this.connection.on('error', (err) => {
            console.error('❌ Connection error:', err);
            clearTimeout(timeoutId);
            clearTimeout(connectionTimeoutId);
            this.onError(this.formatError(err));
            reject(err);
          });

          this.connection.on('close', () => {
            console.warn('⚠️ Connection closed');
          });

          // Connection-specific timeout after 15 seconds
          connectionTimeoutId = setTimeout(() => {
            if (!this.connection || !this.connection.open) {
              const error = new Error('Connection timeout. Room may not exist or host is offline.');
              console.error('❌ Connection timeout:', error);
              this.onError('Could not connect to room. Please check the code and try again.');
              reject(error);
            }
          }, 15000);
        });

        this.peer.on('error', (err) => {
          console.error('❌ Peer error:', err);
          clearTimeout(timeoutId);
          clearTimeout(connectionTimeoutId);
          this.onError(this.formatError(err));
          reject(err);
        });

        this.peer.on('disconnected', () => {
          console.warn('⚠️ Peer disconnected from signaling server');
          // Only try to reconnect if we haven't manually disconnected
          if (this.peer && !this.peer.destroyed) {
            console.log('🔄 Attempting to reconnect to signaling server...');
            setTimeout(() => {
              if (this.peer && !this.peer.destroyed) {
                this.peer.reconnect();
              }
            }, 1000);
          }
        });

        // Peer creation timeout after 15 seconds
        timeoutId = setTimeout(() => {
          if (!this.peer || !this.peer.id) {
            const error = new Error('Failed to connect to signaling server. Please try again.');
            console.error('❌ Peer timeout:', error);
            reject(error);
          }
        }, 15000);
      });
    } catch (error) {
      console.error('❌ Error joining room:', error);
      this.onError('Failed to join room. Please check the code and try again.');
      throw error;
    }
  }

  /**
   * Setup connection event handlers
   */
  setupConnectionHandlers() {
    if (!this.connection) return;

    this.connection.on('data', (data) => {
      console.log('Received data:', data);
      this.onMessage(data);
    });

    this.connection.on('close', () => {
      console.log('Connection closed');
      this.onConnectionChange({ status: 'disconnected' });
      this.attemptReconnect();
    });

    this.connection.on('error', (err) => {
      console.error('Connection error:', err);
      this.onError(this.formatError(err));
    });

    // Mark connection as established
    if (!this.isHost) {
      this.onConnectionChange({ status: 'connected', isHost: false, roomCode: this.roomCode });
    } else {
      this.onConnectionChange({ status: 'connected', isHost: true, roomCode: this.roomCode });
    }
  }

  /**
   * Attempt to reconnect after connection loss
   */
  attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.onError('Connection lost. Please create a new room.');
      return;
    }

    this.reconnectAttempts++;
    this.onConnectionChange({ status: 'reconnecting', attempt: this.reconnectAttempts });

    setTimeout(() => {
      if (!this.isHost && this.roomCode) {
        console.log(`Reconnection attempt ${this.reconnectAttempts}...`);
        this.joinRoom(this.roomCode).catch(() => {
          // Reconnection failed, will try again or give up
        });
      }
    }, 2000 * this.reconnectAttempts); // Exponential backoff
  }

  /**
   * Send data to connected peer
   */
  send(data) {
    if (this.connection && this.connection.open) {
      try {
        this.connection.send(data);
        console.log('Sent data:', data);
        return true;
      } catch (error) {
        console.error('Error sending data:', error);
        this.onError('Failed to send data. Connection may be unstable.');
        return false;
      }
    } else {
      console.warn('Cannot send: connection not open');
      this.onError('Not connected. Please check your connection.');
      return false;
    }
  }

  /**
   * Close connection and cleanup
   */
  disconnect() {
    console.log('🔌 Disconnecting peer connection...');
    this.reconnectAttempts = this.maxReconnectAttempts; // Prevent auto-reconnect
    
    if (this.connection) {
      try {
        this.connection.close();
      } catch (err) {
        console.warn('Error closing connection:', err);
      }
      this.connection = null;
    }
    
    if (this.peer && !this.peer.destroyed) {
      try {
        this.peer.destroy();
      } catch (err) {
        console.warn('Error destroying peer:', err);
      }
      this.peer = null;
    }
    
    this.clearRoomCache();
    this.onConnectionChange({ status: 'disconnected' });
  }

  /**
   * Check if connected
   */
  isConnected() {
    return this.connection && this.connection.open;
  }

  /**
   * Format error messages for user display
   */
  formatError(error) {
    if (typeof error === 'string') return error;
    
    const errorMessages = {
      'peer-unavailable': 'Room not found. Please check the room code.',
      'network': 'Network error. Please check your internet connection.',
      'disconnected': 'Connection lost. Attempting to reconnect...',
      'browser-incompatible': 'Your browser doesn\'t support WebRTC.',
      'ssl-unavailable': 'Secure connection required. Please use HTTPS.',
      'server-error': 'Connection server error. Please try again later.',
    };

    return errorMessages[error.type] || 'Connection error. Please try again.';
  }

  /**
   * Save room info to localStorage for quick rejoin
   */
  saveRoomToCache(roomCode, isHost) {
    const roomData = {
      code: roomCode,
      isHost,
      timestamp: Date.now()
    };
    localStorage.setItem('twisttactoe_last_room', JSON.stringify(roomData));
  }

  /**
   * Get last room from cache
   */
  static getLastRoom() {
    const data = localStorage.getItem('twisttactoe_last_room');
    if (!data) return null;

    try {
      const roomData = JSON.parse(data);
      // Only return if less than 30 minutes old
      if (Date.now() - roomData.timestamp < 30 * 60 * 1000) {
        return roomData;
      }
    } catch (e) {
      console.error('Error parsing cached room:', e);
    }
    return null;
  }

  /**
   * Clear room cache
   */
  clearRoomCache() {
    localStorage.removeItem('twisttactoe_last_room');
  }
}

/**
 * Copy text to clipboard with fallback
 */
export const copyToClipboard = async (text) => {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    } else {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        document.body.removeChild(textArea);
        return true;
      } catch (err) {
        document.body.removeChild(textArea);
        return false;
      }
    }
  } catch (err) {
    console.error('Failed to copy:', err);
    return false;
  }
};

/**
 * Generate shareable link for room
 */
export const generateShareableLink = (roomCode) => {
  const baseUrl = window.location.origin;
  const path = window.location.pathname.replace(/\/+$/, ''); // Remove trailing slashes
  return `${baseUrl}${path}/twisttactoe/join?room=${roomCode}`;
};
