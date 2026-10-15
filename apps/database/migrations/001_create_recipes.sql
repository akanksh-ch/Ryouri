BEGIN;

CREATE TABLE recipes (
    id text PRIMARY KEY,
    title text NOT NULL,
    description text,
    cuisine text NOT NULL,
    prep_minutes integer NOT NULL CHECK (prep_minutes >= 0),
    cook_minutes integer NOT NULL CHECK (cook_minutes >= 0),
    servings integer NOT NULL CHECK (servings > 0),
    ingredients jsonb NOT NULL CHECK (
        CASE WHEN jsonb_typeof(ingredients) = 'array'
            THEN jsonb_array_length(ingredients) > 0
            ELSE false
        END
    ),
    steps text[] NOT NULL CHECK (cardinality(steps) > 0),
    image_path text
);

COMMIT;
