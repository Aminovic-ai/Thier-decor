-- Thier Décor: additive preparation for Cloudflare R2 product images.
-- This migration does not modify or delete the existing products.images values.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS image_urls jsonb;

COMMENT ON COLUMN public.products.image_urls IS
  'Ordered public Cloudflare R2 image URLs. NULL means the product has not yet been migrated; an empty array means it intentionally has no images.';
