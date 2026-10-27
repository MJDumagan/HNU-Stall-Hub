BEGIN;

INSERT INTO categories (category_name)
SELECT requested.category_name
FROM (VALUES ('Meals'), ('Drinks'), ('Snacks')) AS requested(category_name)
WHERE NOT EXISTS (
  SELECT 1
  FROM categories existing
  WHERE LOWER(BTRIM(existing.category_name)) = LOWER(requested.category_name)
);

WITH canonical_categories AS (
  SELECT LOWER(BTRIM(category_name)) AS normalized_name, MIN(category_id) AS category_id
  FROM categories
  WHERE LOWER(BTRIM(category_name)) IN ('meals', 'drinks', 'snacks')
  GROUP BY LOWER(BTRIM(category_name))
)
UPDATE products AS product
SET category_id = canonical.category_id
FROM categories AS duplicate
JOIN canonical_categories AS canonical
  ON LOWER(BTRIM(duplicate.category_name)) = canonical.normalized_name
WHERE product.category_id = duplicate.category_id
  AND duplicate.category_id <> canonical.category_id;

WITH meals AS (
  SELECT MIN(category_id) AS category_id
  FROM categories
  WHERE LOWER(BTRIM(category_name)) = 'meals'
)
UPDATE products AS product
SET category_id = meals.category_id
FROM categories AS old_category
CROSS JOIN meals
WHERE product.category_id = old_category.category_id
  AND LOWER(BTRIM(old_category.category_name)) IN ('soup', 'pasta');

DELETE FROM categories AS category
WHERE LOWER(BTRIM(category.category_name)) IN ('soup', 'pasta')
   OR (
     LOWER(BTRIM(category.category_name)) IN ('meals', 'drinks', 'snacks')
     AND category.category_id <> (
       SELECT MIN(canonical.category_id)
       FROM categories AS canonical
       WHERE LOWER(BTRIM(canonical.category_name)) =
             LOWER(BTRIM(category.category_name))
     )
   );

COMMIT;
