-- Migration 013: Update tenant slug from pho-co to ola-ngon-ngot
UPDATE tenants 
SET slug = 'ola-ngon-ngot',
    name = CASE 
      WHEN name LIKE '%Phố Cổ%' THEN 'Quán Trà Sữa & Ăn Vặt Ola (Đà Lạt Phố)'
      ELSE name 
    END,
    updated_at = NOW()
WHERE id = '11111111-1111-1111-1111-111111111111' OR slug = 'pho-co';
