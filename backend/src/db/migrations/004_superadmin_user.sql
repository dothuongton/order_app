-- Migration 004: Ensure Super Admin user exists for Multi-Tenant CMS portal
-- Password is 'admin123' hashed with bcrypt (cost factor 10)
INSERT INTO users (id, email, password_hash, full_name, phone, is_platform_admin)
VALUES (
    '99999999-9999-9999-9999-999999999999',
    'superadmin@qrorder.vn',
    '$2a$10$cweMWdM3s.7gdRP1Mi5ulexKStDHK0qpYvk7mVeVKtHZaf1vU3Hva',
    'Hệ Thống Super Admin',
    '0999999999',
    true
)
ON CONFLICT (email) DO UPDATE SET
    is_platform_admin = true,
    password_hash = EXCLUDED.password_hash,
    full_name = 'Hệ Thống Super Admin';
