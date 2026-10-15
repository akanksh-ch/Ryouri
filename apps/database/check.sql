\set ON_ERROR_STOP on
BEGIN;

-- Everything rolls back, including the valid fixture. A collision fails safely.
INSERT INTO recipes (
    id, title, cuisine, prep_minutes, cook_minutes, servings, ingredients, steps
) VALUES (
    'database-constraint-check', 'Constraint check', 'Test', 1, 1, 1,
    '[{"items":["first","second"]},{"heading":"Dough","items":["third"]}]',
    ARRAY['First step', 'Second step']
);

DO $$
DECLARE
    change text;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM recipes
        WHERE id = 'database-constraint-check'
          AND description IS NULL AND image_path IS NULL
          AND ingredients -> 0 -> 'items' ->> 1 = 'second'
          AND ingredients -> 1 ->> 'heading' = 'Dough'
          AND steps[2] = 'Second step'
    ) THEN
        RAISE EXCEPTION 'Ordered content or nullable fields did not round-trip';
    END IF;

    BEGIN
        INSERT INTO recipes SELECT * FROM recipes WHERE id = 'database-constraint-check';
        RAISE EXCEPTION 'Duplicate identity accepted';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;

    FOREACH change IN ARRAY ARRAY[
        'prep_minutes = -1',
        'prep_minutes = 0',
        'cook_minutes = -1',
        'cook_minutes = 0',
        'servings = 0',
        'servings = -1',
        'ingredients = ''[]''::jsonb',
        'ingredients = ''{}''::jsonb',
        'ingredients = ''null''::jsonb',
        'ingredients = ''"scalar"''::jsonb',
        'steps = ARRAY[]::text[]',
        'id = NULL',
        'title = NULL',
        'cuisine = NULL',
        'prep_minutes = NULL',
        'cook_minutes = NULL',
        'servings = NULL',
        'ingredients = NULL',
        'steps = NULL'
    ] LOOP
        BEGIN
            EXECUTE 'UPDATE recipes SET ' || change ||
                ' WHERE id = ''database-constraint-check''';
            RAISE EXCEPTION 'Invalid value accepted: %', change;
        EXCEPTION WHEN check_violation OR not_null_violation THEN NULL;
        END;
    END LOOP;
END;
$$;

ROLLBACK;
\echo 'Database constraints and ordered content checks passed (fixture rolled back).'
