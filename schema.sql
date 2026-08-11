-- Run this once against your Vercel Postgres database
-- (Vercel dashboard -> Storage -> your Postgres DB -> Query tab -> paste and run)

CREATE TABLE IF NOT EXISTS galleries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,          -- random private link token, e.g. "8f3a1c9e"
  client_name TEXT NOT NULL,
  client_business TEXT,
  client_email TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ              -- optional: link expiry
);

CREATE TABLE IF NOT EXISTS media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gallery_id UUID REFERENCES galleries(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'photo',   -- 'photo' or 'video'
  blob_url TEXT NOT NULL,               -- full-res original (image or video file)
  thumb_url TEXT NOT NULL,              -- preview image (photo thumb, or video poster frame)
  filename TEXT NOT NULL,
  file_size_bytes BIGINT,
  sort_order INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gallery_id UUID REFERENCES galleries(id),
  stripe_session_id TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',   -- pending -> paid -> fulfilled
  fulfillment_type TEXT NOT NULL,           -- 'digital' or 'print'
  product_details JSONB,                    -- selected photos, print size/qty, etc.
  shipping_address JSONB,                   -- null for digital orders
  amount_total INT,                         -- in cents
  customer_email TEXT,
  stripe_invoice_id TEXT,                   -- auto-generated Stripe invoice, from invoice_creation
  invoice_url TEXT,                         -- hosted Stripe invoice/receipt page
  created_at TIMESTAMPTZ DEFAULT now(),
  fulfilled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_media_gallery ON media(gallery_id);
CREATE INDEX IF NOT EXISTS idx_orders_gallery ON orders(gallery_id);

-- If you already ran this schema before Tax/Invoicing was added, run these two lines
-- to add the new columns to your existing orders table (safe to run even if already present):
ALTER TABLE orders ADD COLUMN IF NOT EXISTS stripe_invoice_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice_url TEXT;
