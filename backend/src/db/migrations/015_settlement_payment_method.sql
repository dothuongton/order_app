-- Add payment_method column to manual_settlement_confirmations and bills
ALTER TABLE manual_settlement_confirmations ADD COLUMN IF NOT EXISTS payment_method VARCHAR(32) DEFAULT 'CASH';
ALTER TABLE bills ADD COLUMN IF NOT EXISTS payment_method VARCHAR(32) DEFAULT 'CASH';
