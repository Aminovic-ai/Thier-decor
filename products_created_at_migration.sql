-- Thier Décor: ajoute la date de création utilisée par la section « Produits récents ».
-- À exécuter dans Supabase SQL Editor après une sauvegarde.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS "createdAt" timestamptz;

-- Renseigne les anciennes lignes sans date. Pour les identifiants numériques en millisecondes,
-- on récupère la date si elle est plausible ; sinon on utilise la date de migration.
UPDATE public.products
SET "createdAt" = CASE
  WHEN id::text ~ '^[0-9]{13}$'
       AND to_timestamp((id::text)::double precision / 1000.0) < now() + interval '1 day'
       AND to_timestamp((id::text)::double precision / 1000.0) > timestamp '2000-01-01'
    THEN to_timestamp((id::text)::double precision / 1000.0)
  ELSE now()
END
WHERE "createdAt" IS NULL;

ALTER TABLE public.products
  ALTER COLUMN "createdAt" SET DEFAULT now();
