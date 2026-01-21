import http from 'http';
import app from './app';
import websocketService from './services/websocket.service';
import dotenv from 'dotenv';

dotenv.config();

const PORT = Number(process.env.PORT || 4000);

// Create HTTP server for Express + WebSocket
const server = http.createServer(app);

// Initialize WebSocket
websocketService.initialize(server);

server.listen(PORT, '0.0.0.0', () => {
  // eslint-disable-next-line no-console
  console.log(`✅ Server running on http://localhost:${PORT}`);
  // eslint-disable-next-line no-console
  console.log(`📡 WebSocket ready at ws://localhost:${PORT}`);
});

server.on('error', (err: any) => {
  // eslint-disable-next-line no-console
  console.error('Server error:', err);
});

process.on('unhandledRejection', (reason: any) => {
  // eslint-disable-next-line no-console
  console.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error: any) => {
  // eslint-disable-next-line no-console
  console.error('Uncaught Exception:', error);
  process.exit(1);
});
