import dotenv from 'dotenv';
dotenv.config();

export const config = {
    port: parseInt(process.env.PORT || '4000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    databaseUrl: process.env.DATABASE_URL || 'postgres://admin:@localhost:5432/qr_order_db',
    jwtSecret: process.env.JWT_SECRET || 'super-secret-jwt-key-for-qr-order-v12',
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
    guestCookieSecret: process.env.GUEST_COOKIE_SECRET || 'super-secret-guest-cookie-token'
};
