import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';

let io: SocketIOServer | null = null;

export function initSocketIO(httpServer: HTTPServer, allowedOrigins?: string[]): SocketIOServer {
    io = new SocketIOServer(httpServer, {
        cors: {
            origin: true,
            credentials: true,
            methods: ['GET', 'POST']
        },
        transports: ['websocket', 'polling'],
        pingTimeout: 20000,
        pingInterval: 25000
    });

    io.on('connection', (socket: Socket) => {
        // Staff join room: tenant:{tenantId}:staff
        socket.on('join_staff_room', (tenantId: string) => {
            if (tenantId) {
                const room = `tenant:${tenantId}:staff`;
                socket.join(room);
            }
        });

        // Guest join room: session:{sessionId}:guest
        socket.on('join_session_room', (sessionId: string) => {
            if (sessionId) {
                const room = `session:${sessionId}:guest`;
                socket.join(room);
            }
        });

        socket.on('disconnect', () => {
            // Socket disconnected
        });
    });

    return io;
}

export function getIO(): SocketIOServer | null {
    return io;
}

export function broadcastToStaff(tenantId: string, event: string, payload: any) {
    if (io) {
        io.to(`tenant:${tenantId}:staff`).emit(event, {
            ...payload,
            emittedAt: new Date().toISOString()
        });
    }
}

export function broadcastToSession(sessionId: string, event: string, payload: any) {
    if (io) {
        io.to(`session:${sessionId}:guest`).emit(event, {
            ...payload,
            emittedAt: new Date().toISOString()
        });
    }
}
