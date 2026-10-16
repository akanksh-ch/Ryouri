BEGIN;

ALTER TABLE recipes
    DROP CONSTRAINT recipes_prep_minutes_check,
    DROP CONSTRAINT recipes_cook_minutes_check,
    ADD CONSTRAINT recipes_prep_minutes_check CHECK (prep_minutes >= 0),
    ADD CONSTRAINT recipes_cook_minutes_check CHECK (cook_minutes >= 0),
    -- Either time may be zero (e.g. salad: prep > 0, cook = 0), but not both.
    -- Use OR, not addition, to avoid signed integer overflow.
    ADD CONSTRAINT recipes_nonzero_time_check CHECK (prep_minutes > 0 OR cook_minutes > 0);

COMMIT;
