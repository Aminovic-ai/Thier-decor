-- Thier Décor Store: database migration for Packs and product promotions
-- Run this once in Supabase Dashboard > SQL Editor > New query.
-- Existing products and orders are not deleted or rewritten.
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS "isPack" boolean NOT NULL DEFAULT false;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS "packItems" jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS "promoPrice" numeric(12,2);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS "promoStart" date;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS "promoEnd" date;

-- Verify new columns after running:
-- select column_name, data_type from information_schema.columns
-- where table_schema='public' and table_name='products'
-- and column_name in ('isPack','packItems','promoPrice','promoStart','promoEnd');
