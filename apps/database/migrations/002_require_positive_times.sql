BEGIN;

-- Existing zero-time recipes must be corrected explicitly before applying.
-- Constraint validation fails atomically; this migration never rewrites data.
ALTER TABLE recipes
    DROP CONSTRAINT recipes_prep_minutes_check,
    DROP CONSTRAINT recipes_cook_minutes_check,
    ADD CONSTRAINT recipes_prep_minutes_check CHECK (prep_minutes > 0),
    ADD CONSTRAINT recipes_cook_minutes_check CHECK (cook_minutes > 0);

COMMIT;
