import http from 'http';
import { app } from './app.js';
import { config } from './config/index.js';
import { initSocketIO } from './realtime/socket.js';

const httpServer = http.createServer(app);

// Initialize Socket.IO
initSocketIO(httpServer, [config.frontendUrl, 'http://localhost:5173', 'http://localhost:3000']);

httpServer.listen(config.port, () => {
    console.log(`🚀 QR Order Backend v1.2 running on http://localhost:${config.port}`);
    console.log(`📡 Socket.IO initialized`);
});
