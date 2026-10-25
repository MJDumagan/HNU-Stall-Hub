const express = require('express');
const pool = require('../config/db');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.store_id, s.store_name, s.store_location, s.description,
              COUNT(p.product_id) FILTER (WHERE i.quantity_in_stock > 0)::int AS available_products
       FROM stores s
       LEFT JOIN products p ON p.store_id = s.store_id AND p.is_active = TRUE
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
    const result = await pool.query(
      `SELECT s.store_id, s.store_name, s.store_location, s.description,
              p.product_id, p.product_name, p.description AS product_description,
              p.image_url, p.price, p.sku,
              i.quantity_in_stock
       FROM stores s
       LEFT JOIN products p ON p.store_id = s.store_id
         AND p.is_active = TRUE
         AND EXISTS (
           SELECT 1 FROM inventory available
           WHERE available.product_id = p.product_id AND available.quantity_in_stock > 0
         )
       LEFT JOIN inventory i ON i.product_id = p.product_id
       WHERE s.store_id = $1 AND s.is_active = TRUE
       ORDER BY p.product_name`,
      [req.params.stallId]
    );
    if (!result.rowCount) {
      return res.status(404).json({ success: false, message: 'Stall not found.' });
    }
    const { store_id, store_name, store_location, description } = result.rows[0];
    res.json({
      success: true,
      data: {
        stall: { store_id, store_name, store_location, description },
        products: result.rows.filter((row) => row.product_id !== null),
      },
    });
  } catch (error) {
    console.error('Stall menu failed:', error.message);
    res.status(500).json({ success: false, message: 'Could not load this stall menu.' });
  }
});

module.exports = router;
