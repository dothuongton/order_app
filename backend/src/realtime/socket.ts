import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { verifyStaffToken } from '../utils/staff-token.js';
import { z } from 'zod';
import { config } from '../config/index.js';
import { query } from '../db/pool.js';
import { hashToken } from '../utils/crypto.js';
import { hashDeviceToken } from '../utils/device-cookie.js';
import { isAllowedOrigin } from '../middleware/security.js';

import { deferUntilCommit } from '../utils/transaction-effects.js';

let io: SocketIOServer | null = null;
const staffJoin = z.object({ tenantId: z.string().uuid(), token: z.string().min(1).max(4096) });
const guestJoin = z.object({ sessionId: z.string().uuid(), token: z.string().min(1).max(256) });

export function extractDeviceHashFromSocket(socket: Socket): string | null {
    const rawCookie = socket.handshake.headers?.cookie;
    let token: string | undefined;
    if (rawCookie) {
        const match = rawCookie.match(/(?:__Host-order-device|order_device)=([^;]+)/);
        if (match) token = decodeURIComponent(match[1].trim());
    }
    if (!token && socket.handshake.headers?.['x-device-cookie']) {
        token = socket.handshake.headers['x-device-cookie'] as string;
    }
    if (!token && typeof socket.handshake.auth?.deviceToken === 'string') {
        token = socket.handshake.auth.deviceToken;
    }
    if (token && typeof token === 'string' && token.length >= 32) {
        return hashDeviceToken(token);
    }
    return null;
}

async function canJoinStaff(tenantId: string, token: string) {
    const decoded = await verifyStaffToken(token);
    const result = await query(`SELECT 1 FROM memberships WHERE user_id = $1 AND tenant_id = $2 AND is_active = true`, [decoded.userId, tenantId]);
    return result.rows.length > 0;
}
async function canJoinGuest(sessionId: string, token: string, socket?: Socket) {
    const result = await query(`
        SELECT gs.device_fingerprint, ts.claimed_device_hash
        FROM guest_sessions gs
        JOIN table_sessions ts ON ts.id = gs.session_id
        JOIN tenants t ON t.id = gs.tenant_id
        WHERE gs.session_id = $1 AND gs.token_hash = $2 AND gs.revoked_at IS NULL
          AND gs.expires_at > NOW() AND ts.status = 'OPEN' AND t.status = 'active'
    `, [sessionId, hashToken(token)]);

    if (result.rows.length === 0) return false;

    const row = result.rows[0];

    // In approved_single_device mode: enforce single device claim (G1)
    if (config.orderingMode === 'approved_single_device') {
        if (!row.claimed_device_hash) return false;
        if (row.device_fingerprint && row.device_fingerprint !== row.claimed_device_hash) {
            return false;
        }
        if (socket) {
            const socketDeviceHash = extractDeviceHashFromSocket(socket);
            if (!socketDeviceHash || socketDeviceHash !== row.claimed_device_hash) {
                return false;
            }
        }
    }

    return result.rows.length > 0;
}

export function initSocketIO(httpServer: HTTPServer, _allowedOrigins?: string[]): SocketIOServer {
    io = new SocketIOServer(httpServer, {
        cors: { origin: (origin, cb) => cb(null, isAllowedOrigin(origin)), credentials: true, methods: ['GET', 'POST'] },
        allowRequest: (req, cb) => cb(null, isAllowedOrigin(req.headers.origin)),
        maxHttpBufferSize: 8192,
        transports: ['websocket', 'polling'], pingTimeout: 20000, pingInterval: 25000
    });
    io.on('connection', (socket: Socket) => {
        let attempts = 0;
        const window = setInterval(() => { attempts = 0; }, 60000);
        socket.on('disconnect', () => clearInterval(window));
        socket.on('join_staff_room', async (input: unknown, ack?: (result: any) => void) => {
            const parsed = staffJoin.safeParse(input);
            try {
                if (++attempts > 30 || !parsed.success || !await canJoinStaff(parsed.data.tenantId, parsed.data.token)) throw new Error('denied');
                for (const room of socket.rooms) if (room.startsWith('tenant:')) socket.leave(room);
                socket.data.staff = parsed.data;
                await socket.join(`tenant:${parsed.data.tenantId}:staff`);
                if (typeof ack === 'function') ack({ ok: true });
            } catch {
                if (typeof ack === 'function') ack({ ok: false, error: 'FORBIDDEN' });
            }
        });
        socket.on('join_session_room', async (input: unknown, ack?: (result: any) => void) => {
            const parsed = guestJoin.safeParse(input);
            try {
                if (++attempts > 30 || !parsed.success || !await canJoinGuest(parsed.data.sessionId, parsed.data.token, socket)) throw new Error('denied');
                for (const room of socket.rooms) if (room.startsWith('session:')) socket.leave(room);
                socket.data.guest = parsed.data;
                await socket.join(`session:${parsed.data.sessionId}:guest`);
                if (typeof ack === 'function') ack({ ok: true });
            } catch {
                if (typeof ack === 'function') ack({ ok: false, error: 'FORBIDDEN' });
            }
        });
        socket.on('leave_staff_room', () => {
            for (const room of socket.rooms) if (room.startsWith('tenant:')) socket.leave(room);
            delete socket.data.staff;
        });
        socket.on('leave_session_room', () => {
            for (const room of socket.rooms) if (room.startsWith('session:')) socket.leave(room);
            delete socket.data.guest;
        });
        socket.on('join_table_room', async (input: unknown, ack?: (result: any) => void) => {
            try {
                const parsed = z.object({ tableId: z.string().uuid() }).safeParse(input);
                if (!parsed.success) throw new Error('invalid_table_id');
                await socket.join(`table:${parsed.data.tableId}:public`);
                if (typeof ack === 'function') ack({ ok: true });
            } catch {
                if (typeof ack === 'function') ack({ ok: false, error: 'BAD_REQUEST' });
            }
        });
        socket.on('leave_table_room', async (input: unknown) => {
            try {
                const parsed = z.object({ tableId: z.string().uuid() }).safeParse(input);
                if (parsed.success) {
                    await socket.leave(`table:${parsed.data.tableId}:public`);
                }
            } catch {
                // ignore
            }
        });
    });
    return io;
}

export function getIO(): SocketIOServer | null {
    return io;
}

export function broadcastToTable(tableId: string, event: string, payload: any) {
    if (deferUntilCommit(() => broadcastToTable(tableId, event, payload))) return;
    if (!io) return;
    io.in(`table:${tableId}:public`).emit(event, { ...payload, emittedAt: new Date().toISOString() });
}

// Re-check authorization for every delivery so revocations and expiry take effect.
export function broadcastToStaff(tenantId: string, event: string, payload: any) {
    if (deferUntilCommit(() => broadcastToStaff(tenantId, event, payload))) return;
    deliver(`tenant:${tenantId}:staff`, event, payload, async socket => {
        const auth = socket.data.staff;
        return auth?.tenantId === tenantId && await canJoinStaff(tenantId, auth.token);
    }).catch(() => {});
}

export function broadcastToSession(sessionId: string, event: string, payload: any) {
    if (deferUntilCommit(() => broadcastToSession(sessionId, event, payload))) return;
    deliver(`session:${sessionId}:guest`, event, payload, async socket => {
        const auth = socket.data.guest;
        return auth?.sessionId === sessionId && (event === 'session.closed' || await canJoinGuest(sessionId, auth.token, socket));
    }).catch(() => {});
}

async function deliver(room: string, event: string, payload: any, authorized: (socket: any) => Promise<boolean>) {
    if (!io) return;
    const sockets = await io.in(room).fetchSockets();
    await Promise.all(sockets.map(async socket => {
        try {
            if (await authorized(socket)) socket.emit(event, { ...payload, emittedAt: new Date().toISOString() });
            else socket.leave(room);
        } catch { socket.leave(room); }
        if (event === 'session.closed') socket.leave(room);
    }));
}
