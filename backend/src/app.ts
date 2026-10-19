import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config/index.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { guestRouter } from './modules/guest/guest.routes.js';
import { staffRouter } from './modules/staff/staff.routes.js';
import { reportsRouter } from './modules/reports/reports.routes.js';
import { pushRouter } from './modules/push/push.routes.js';
import { adminRouter } from './modules/admin/admin.routes.js';
import { cmsRouter } from './modules/cms/cms.routes.js';
import { query } from './db/pool.js';

export const app = express();

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests from frontend URL, localhost, mobile browsers
        callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-tenant-id', 'x-guest-token', 'x-idempotency-key']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser(config.guestCookieSecret));

// Health check
app.get('/health', (req: Request, res: Response) => {
    return res.json({ status: 'ok', time: new Date().toISOString() });
});

// Public image serving endpoint (with immutable caching for max performance)
app.get('/api/v1/public/images/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const result = await query(`SELECT mime_type, data_base64 FROM uploaded_images WHERE id = $1`, [id]);
        if (result.rows.length === 0) {
            return res.status(404).send('Image not found');
        }
        const { mime_type, data_base64 } = result.rows[0];
        const base64Data = data_base64.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        res.setHeader('Content-Type', mime_type || 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        return res.end(buffer);
    } catch (err: any) {
        return res.status(500).send('Error loading image');
    }
});

// Disable caching for all API endpoints to guarantee instant realtime sync on mobile
app.use('/api', (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
});

// Mount Routes
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/admin', adminRouter);
app.use('/api/v1/cms', cmsRouter);
app.use('/api/v1', guestRouter);
app.use('/api/v1/staff', staffRouter);
app.use('/api/v1/staff/reports', reportsRouter);
app.use('/api/v1/staff/push', pushRouter);

// Serve frontend static files if public folder exists (Production / Fly.io)
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = process.env.PUBLIC_DIR || path.resolve(__dirname, '../public');

if (fs.existsSync(publicDir)) {
    app.use(express.static(publicDir));
    app.get('*', (req: Request, res: Response, next: NextFunction) => {
        if (req.path.startsWith('/api') || req.path.startsWith('/health') || req.path.startsWith('/socket.io')) {
            return next();
        }
        res.sendFile(path.join(publicDir, 'index.html'));
    });
}

// 404 handler for API routes
app.use((req: Request, res: Response) => {
    res.status(404).json({
        error: 'ROUTE_NOT_FOUND',
        message: `Endpoint ${req.method} ${req.path} không tồn tại`
    });
});

// Central error handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    console.error('Unhandled Server Error:', err);
    res.status(err.status || 500).json({
        error: err.code || 'INTERNAL_SERVER_ERROR',
        message: err.message || 'Đã có lỗi xảy ra trên máy chủ'
    });
});
