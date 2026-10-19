import http from 'http';
import { app } from './app.js';
import { config } from './config/index.js';
import { initSocketIO } from './realtime/socket.js';
import { ensureSchemaOnBoot } from './db/auto-migrate.js';

const httpServer = http.createServer(app);

// Initialize Socket.IO
initSocketIO(httpServer, [config.frontendUrl, 'http://localhost:5173', 'http://localhost:3000']);

async function start() {
    await ensureSchemaOnBoot();
    httpServer.listen(config.port, () => {
        console.log(`🚀 QR Order Backend v1.2 running on http://localhost:${config.port}`);
        console.log(`📡 Socket.IO initialized`);
    });
}

start().catch((err) => {
    console.error('Fatal startup error:', err);
    process.exit(1);
});

