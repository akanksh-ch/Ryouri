\set ON_ERROR_STOP on
BEGIN;

-- Explicit, optional correction for known sample IDs only. No other fields or
-- maintainer recipe IDs are changed. Safe to rerun; presentation is frontend-owned.
WITH labels AS (
    SELECT id, cuisine AS previous, lower(btrim(cuisine)) AS normalized
    FROM recipes WHERE id IN (
        'sample-tomato-rice', 'sample-fattoush', 'sample-quick-tofu',
        'sample-sesame-rice-a', 'sample-sesame-rice-b',
        'sample-arabic-bread', 'sample-stuffed-flatbread'
    )
)
UPDATE recipes AS recipe SET cuisine = labels.normalized
FROM labels
WHERE recipe.id = labels.id AND recipe.cuisine IS DISTINCT FROM labels.normalized
RETURNING recipe.id, labels.previous AS previous_cuisine, recipe.cuisine;

COMMIT;
