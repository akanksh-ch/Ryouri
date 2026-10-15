\set ON_ERROR_STOP on
BEGIN;

-- OPTIONAL local examples: run explicitly, never from migrations/initialization.
-- Whitespace/case variants exercise read-side cuisine normalization; normal
-- YAML imports trim cuisine labels. Existing IDs are never changed.
INSERT INTO recipes (
    id, title, description, cuisine, prep_minutes, cook_minutes, servings,
    ingredients, steps, image_path
) VALUES
(
    'sample-tomato-rice', 'Tomato Rice', 'A simple Indian one-pot meal.',
    'Indian', 10, 20, 2,
    '[{"items":["1 cup rice","2 chopped tomatoes","2 cups water","Salt to taste"]}]',
    ARRAY['Rinse the rice.', 'Simmer rice, tomatoes, water and salt until tender.', 'Rest, then serve.'], NULL
),
(
    'sample-fattoush', 'Fattoush', 'A crisp salad with toasted pita.',
    'Arabic', 10, 0, 4,
    '[{"items":["1 cucumber, chopped","2 tomatoes, chopped","1 toasted pita","Lemon juice and olive oil"]}]',
    ARRAY['Chop the vegetables.', 'Toss with lemon juice and olive oil.', 'Add the toasted pita just before serving.'], NULL
),
(
    'sample-quick-tofu', 'Quick Tofu', NULL,
    'Japanese', 0, 5, 1,
    '[{"items":["200 g ready-cubed tofu","1 tbsp soy sauce"]}]',
    ARRAY['Warm the tofu in a pan.', 'Add soy sauce and heat through.'], NULL
),
(
    'sample-sesame-rice-a', 'Sesame Rice', NULL,
    ' japanese ', 5, 10, 2,
    '[{"items":["1 cup quick-cooking rice","1 tbsp sesame seeds","Water as directed on rice packet"]}]',
    ARRAY['Cook the rice in water.', 'Fold in the sesame seeds.'], NULL
),
(
    'sample-sesame-rice-b', 'Sesame Rice', 'A second recipe with an identical title and cooking time.',
    'JAPANESE', 8, 10, 3,
    '[{"heading":"Rice","items":["1 cup quick-cooking rice","Water as directed on rice packet"]},{"items":["2 tbsp toasted sesame seeds"]}]',
    ARRAY['Cook the rice.', 'Sprinkle with toasted sesame seeds.'], NULL
),
(
    'sample-arabic-bread', 'Arabic Bread', NULL,
    ' Arabic ', 15, 10, 6,
    '[{"items":["2 cups flour","Water as needed","A pinch of salt"]}]',
    ARRAY['Mix flour, water and salt into dough.', 'Divide and roll into flat rounds.', 'Cook each round in a hot skillet.'], NULL
),
(
    'sample-stuffed-flatbread', 'Stuffed Flatbread', 'Named groups with an unheaded group retained between them.',
    ' indian ', 25, 30, 4,
    '[{"heading":"Dough","items":["2 cups flour","Water as needed"]},{"items":["Oil for the pan"]},{"heading":"Stuffing","items":["2 cooked potatoes, mashed","Salt and cumin to taste"]}]',
    ARRAY['Mix the flour and water into dough.', 'Season the mashed potatoes.', 'Fill dough portions with stuffing and roll gently.', 'Cook in a lightly oiled pan until golden.'], NULL
)
ON CONFLICT (id) DO NOTHING;

COMMIT;
