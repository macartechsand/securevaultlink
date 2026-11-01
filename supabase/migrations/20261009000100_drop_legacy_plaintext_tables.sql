-- DESTRUCTIVE (approved by the project owner; the legacy tables only held prototype/test data).
-- Removes the old plaintext prototype tables. Apply only on the project where you confirmed
-- there is no data worth keeping. Not reversible.
drop table if exists public.vault_items cascade;
drop table if exists public.secure_links cascade;
