-- Add slug column to tenants
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS slug VARCHAR(255) UNIQUE;

-- Generate slugs for existing tenants based on name
UPDATE tenants SET slug = LOWER(REPLACE(name, ' ', '-')) WHERE slug IS NULL;
