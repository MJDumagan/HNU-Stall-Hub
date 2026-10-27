const express = require('express');
const pool = require('../config/db');
const { isRiceAddonEligible } = require('../lib/rice-addons');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.store_id, s.store_name, s.store_location, s.description, s.cover_image_url,
              COUNT(p.product_id) FILTER (WHERE i.quantity_in_stock > 0)::int AS available_products
       FROM stores s
       LEFT JOIN products p ON p.store_id = s.store_id
         AND p.is_active = TRUE AND p.is_removed = FALSE
       LEFT JOIN inventory i ON i.product_id = p.product_id
       WHERE s.is_active = TRUE
       GROUP BY s.store_id
       ORDER BY s.store_name`
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Stall directory failed:', error.message);
    res.status(500).json({ success: false, message: 'Could not load cafeteria stalls.' });
  }
});

router.get('/:stallId/products', async (req, res) => {
  try {
    const [result, categoriesResult] = await Promise.all([
      pool.query(
      `SELECT s.store_id, s.store_name, s.store_location, s.description, s.cover_image_url,
              p.product_id, p.product_name, p.description AS product_description,
              p.image_url, p.price, p.category_id, c.category_name,
              i.quantity_in_stock,
              COALESCE((
                SELECT array_agg(t.tag_name ORDER BY t.tag_name)
                FROM product_tags pt JOIN tags t ON t.tag_id = pt.tag_id
                WHERE pt.product_id = p.product_id
              ), ARRAY[]::varchar[]) AS tags
       FROM stores s
       LEFT JOIN products p ON p.store_id = s.store_id
         AND p.is_active = TRUE
         AND p.is_removed = FALSE
         AND EXISTS (
           SELECT 1 FROM inventory available
           WHERE available.product_id = p.product_id AND available.quantity_in_stock > 0
         )
       LEFT JOIN inventory i ON i.product_id = p.product_id
       LEFT JOIN categories c ON c.category_id = p.category_id
       WHERE s.store_id = $1 AND s.is_active = TRUE
       ORDER BY p.product_name`,
      [req.params.stallId]
      ),
      pool.query(
        `SELECT category_id, category_name
         FROM categories
         ORDER BY CASE LOWER(BTRIM(category_name))
           WHEN 'meals' THEN 1
           WHEN 'drinks' THEN 2
           WHEN 'snacks' THEN 3
           ELSE 4
         END, category_name`
      ),
    ]);
    if (!result.rowCount) {
      return res.status(404).json({ success: false, message: 'Stall not found.' });
    }
    const { store_id, store_name, store_location, description, cover_image_url } = result.rows[0];
    res.json({
      success: true,
      data: {
        stall: { store_id, store_name, store_location, description, cover_image_url },
        categories: categoriesResult.rows,
        products: result.rows
          .filter((row) => row.product_id !== null)
          .map((product) => ({
            ...product,
            rice_addon_eligible: isRiceAddonEligible(product.product_name, product.category_name),
          })),
      },
    });
  } catch (error) {
    console.error('Stall menu failed:', error.message);
    res.status(500).json({ success: false, message: 'Could not load this stall menu.' });
  }
});

module.exports = router;
