\set ON_ERROR_STOP on
-- Read-only check. Conflicting existing sample IDs may make assertions fail;
-- do not overwrite or delete existing recipes to make the check pass.
DO $$
DECLARE
    ordered_ids text[];
    cuisines text[];
BEGIN
    SELECT array_agg(id ORDER BY cook_minutes, title COLLATE "C", id COLLATE "C")
    INTO ordered_ids FROM recipes WHERE id IN (
        'sample-fattoush', 'sample-quick-tofu', 'sample-arabic-bread',
        'sample-sesame-rice-a', 'sample-sesame-rice-b',
        'sample-tomato-rice', 'sample-stuffed-flatbread'
    );
    IF ordered_ids IS DISTINCT FROM ARRAY[
        'sample-fattoush', 'sample-quick-tofu', 'sample-arabic-bread',
        'sample-sesame-rice-a', 'sample-sesame-rice-b',
        'sample-tomato-rice', 'sample-stuffed-flatbread'
    ] THEN
        RAISE EXCEPTION 'Sample count or ascending time/title/ID order differs: %', ordered_ids;
    END IF;

    SELECT array_agg(id ORDER BY cook_minutes DESC, title COLLATE "C", id COLLATE "C")
    INTO ordered_ids FROM recipes WHERE id = ANY(ordered_ids);
    IF ordered_ids IS DISTINCT FROM ARRAY[
        'sample-stuffed-flatbread', 'sample-tomato-rice', 'sample-arabic-bread',
        'sample-sesame-rice-a', 'sample-sesame-rice-b',
        'sample-quick-tofu', 'sample-fattoush'
    ] THEN
        RAISE EXCEPTION 'Descending sample time/title/ID order differs: %', ordered_ids;
    END IF;

    SELECT array_agg(cuisine ORDER BY cuisine) INTO cuisines FROM (
        SELECT DISTINCT cuisine FROM recipes WHERE id = ANY(ordered_ids)
    ) AS stored;
    IF cuisines IS DISTINCT FROM ARRAY['arabic', 'indian', 'japanese'] THEN
        RAISE EXCEPTION 'Stored sample cuisines must be trimmed lowercase: %', cuisines;
    END IF;

    -- Isolated adversarial labels: no visible recipes are inserted or modified.
    SELECT array_agg(cuisine ORDER BY cuisine) INTO cuisines FROM (
        SELECT DISTINCT lower(btrim(label)) AS cuisine
        FROM (VALUES ('Japanese'), ('JAPANESE'), (' japanese ')) AS cases(label)
    ) AS normalized;
    IF cuisines IS DISTINCT FROM ARRAY['japanese'] THEN
        RAISE EXCEPTION 'Case/whitespace deduplication failed: %', cuisines;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM recipes WHERE id = 'sample-fattoush'
        AND prep_minutes > 0 AND cook_minutes = 0 AND image_path IS NULL)
    OR NOT EXISTS (SELECT 1 FROM recipes WHERE id = 'sample-quick-tofu'
        AND prep_minutes = 0 AND cook_minutes = 5 AND description IS NULL)
    OR NOT EXISTS (SELECT 1 FROM recipes WHERE id = 'sample-stuffed-flatbread'
        AND cook_minutes = 30 AND servings = 4
        AND ingredients -> 0 ->> 'heading' = 'Dough'
        AND NOT (ingredients -> 1 ? 'heading')
        AND ingredients -> 2 ->> 'heading' = 'Stuffing'
        AND ingredients -> 2 -> 'items' ->> 0 = '2 cooked potatoes, mashed'
        AND steps[1] = 'Mix the flour and water into dough.') THEN
        RAISE EXCEPTION 'Sample field, timing, or ordered-group checks failed';
    END IF;
END;
$$;
\echo 'Persisted sample read checks passed.'
