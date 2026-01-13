// socketManager.js - Utility for managing Socket.IO connections

import io from 'socket.io-client';

class SocketManager {
  constructor() {
    this.socket = null;
    this.isConnected = false;
    this.currentTenant = null;
    this.currentBranch = null;
  }

  connect(tenantId, branchId = null) {
    if (this.socket) {
      this.disconnect();
    }

    console.log('Connecting to Socket.IO...', { tenantId, branchId });

    this.socket = io('/', {
      transports: ['polling', 'websocket'],
      upgrade: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
      timeout: 20000
    });

    this.currentTenant = tenantId;
    this.currentBranch = branchId;

    this.socket.on('connect', () => {
      console.log('Socket.IO connected:', this.socket.id);
      this.isConnected = true;
      
      // Join tenant room
      if (tenantId) {
        this.socket.emit('join-tenant', tenantId);
      }
      
      // Join branch room if provided
      if (branchId) {
        this.socket.emit('join-branch', branchId);
      }
    });

    this.socket.on('disconnect', () => {
      console.log('Socket.IO disconnected');
      this.isConnected = false;
    });

    this.socket.on('connect_error', (error) => {
      console.error('Socket.IO connection error:', error);
    });

    return this.socket;
  }

  switchBranch(newBranchId) {
    if (!this.socket || !this.isConnected) {
      console.warn('Socket not connected, cannot switch branch');
      return;
    }

    // Leave current branch room
    if (this.currentBranch) {
      this.socket.emit('leave-branch', this.currentBranch);
    }

    // Join new branch room
    if (newBranchId) {
      this.socket.emit('join-branch', newBranchId);
      this.currentBranch = newBranchId;
    }
  }

  onNotification(callback) {
    if (this.socket) {
      this.socket.on('notification', callback);
    }
  }

  offNotification(callback) {
    if (this.socket) {
      this.socket.off('notification', callback);
    }
  }

  emitPageRefresh() {
    if (this.socket && this.isConnected) {
      this.socket.emit('page-refresh');
    }
  }

  disconnect() {
    if (this.socket) {
      console.log('Disconnecting Socket.IO...');
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
      this.currentTenant = null;
      this.currentBranch = null;
    }
  }

  getConnectionStatus() {
    return {
      isConnected: this.isConnected,
      socketId: this.socket?.id,
      currentTenant: this.currentTenant,
      currentBranch: this.currentBranch
    };
  }
}

// Export singleton instance
export default new SocketManager();