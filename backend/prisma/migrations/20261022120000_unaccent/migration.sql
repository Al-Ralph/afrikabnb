-- Recherche insensible aux accents ("Lome" trouve "Lomé") : fonction unaccent() de PostgreSQL.
-- Disponible sur Supabase et dans l'image postgres officielle (module contrib).
CREATE EXTENSION IF NOT EXISTS unaccent;
