import http from 'http';
import { app } from './app.js';
import { config } from './config/index.js';
import { initSocketIO } from './realtime/socket.js';
import { ensureSchemaOnBoot } from './db/auto-migrate.js';
import { runDataRetentionCleanup } from './utils/retention.js';

const httpServer = http.createServer(app);

// Initialize Socket.IO
initSocketIO(httpServer, [config.frontendUrl, 'http://localhost:5173', 'http://localhost:3000']);

async function start() {
    await ensureSchemaOnBoot();

    // Run initial data retention cleanup and schedule periodic run every 6 hours
    runDataRetentionCleanup().then(res => {
        console.log(`🧹 Initial data retention cleanup complete:`, res);
    }).catch(() => {});

    const cleanupInterval = setInterval(() => {
        runDataRetentionCleanup().catch(() => {});
    }, 6 * 60 * 60 * 1000);
    cleanupInterval.unref();

    httpServer.listen(config.port, () => {
        console.log(`🚀 QR Order Backend v1.2 running on http://localhost:${config.port}`);
        console.log(`📡 Socket.IO initialized`);
    });
}

start().catch((err) => {
    console.error('Fatal startup error:', err);
    process.exit(1);
});

