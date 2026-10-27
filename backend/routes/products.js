const express = require('express');
const pool = require('../config/db');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.product_id, p.store_id, s.store_name, p.product_name,
              p.description, p.image_url, p.price,
              p.is_active, i.quantity_in_stock,
              COALESCE((
                SELECT array_agg(t.tag_name ORDER BY t.tag_name)
                FROM product_tags pt JOIN tags t ON t.tag_id = pt.tag_id
                WHERE pt.product_id = p.product_id
              ), ARRAY[]::varchar[]) AS tags
       FROM products p
       JOIN stores s ON s.store_id = p.store_id AND s.is_active = TRUE
       JOIN inventory i ON i.product_id = p.product_id
       WHERE p.is_removed = FALSE AND p.is_active = TRUE AND i.quantity_in_stock > 0
       ORDER BY p.product_id DESC`
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Product listing failed:', error.message);
    res.status(500).json({ success: false, message: 'Could not load products.' });
  }
});

module.exports = router;
