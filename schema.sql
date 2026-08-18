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
  width_px INT,                         -- native pixel width of the full-res original
  height_px INT,                        -- native pixel height of the full-res original
  sort_order INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gallery_id UUID REFERENCES galleries(id),
  stripe_session_id TEXT UNIQUE,            -- set once checkout session is created; null while cart is being built
  status TEXT NOT NULL DEFAULT 'pending',   -- pending -> paid -> fulfilled
  fulfillment_type TEXT NOT NULL,           -- 'digital', 'print', or 'mixed' (cart contains both)
  product_details JSONB,                    -- { cart: [...] } — full cart contents, one entry per line item
  shipping_address JSONB,                   -- null unless the cart contains at least one print item
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

-- If you already ran this schema before the cart update, run this line to allow orders
-- to be created before a Stripe session exists (needed so carts can be stored up front):
ALTER TABLE orders ALTER COLUMN stripe_session_id DROP NOT NULL;

-- If you already ran this schema before dimension tracking was added, run these two
-- lines to add width/height storage to your existing media table:
ALTER TABLE media ADD COLUMN IF NOT EXISTS width_px INT;
ALTER TABLE media ADD COLUMN IF NOT EXISTS height_px INT;
