-- supabase/migrations/0003_m8_batch_index.sql
ALTER TABLE action_previews
  ADD COLUMN batch_index integer NOT NULL DEFAULT 0;
