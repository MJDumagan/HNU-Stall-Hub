const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// 1. READ ALL: Fetch all active products
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products WHERE is_active = true ORDER BY product_id DESC');
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. CREATE NEW: Safely add a product via Prepared Statements
router.post('/add', async (req, res) => {
  const { product_name, price, sku } = req.body;
  try {
    const queryText = `
      INSERT INTO products (store_id, category_id, product_name, price, sku) 
      VALUES (1, 1, $1, $2, $3) 
      RETURNING *
    `;
    const result = await pool.query(queryText, [product_name, parseFloat(price), sku]);
    res.status(201).json({ success: true, message: "Row saved into cloud database repository.", data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. TRANSACTION CHECKOUT: Execute Database Stored Procedure
router.post('/checkout', async (req, res) => {
  const { customer_id, store_id, product_id, quantity, unit_price, payment_method, payment_ref } = req.body;
  try {
    await pool.query(
      'CALL checkout_marketplace_basket(\$1, \$2, \$3, \$4, \$5, \$6, \$7)',
      [parseInt(customer_id), parseInt(store_id), parseInt(product_id), parseInt(quantity), parseFloat(unit_price), payment_method, payment_ref]
    );
    res.status(201).json({ success: true, message: "Order processed and logs generated via Stored Procedure!" });
  } catch (err) {
    if (err.message.includes('quantity_in_stock')) {
      return res.status(400).json({ success: false, error: "Rejected: Stock floor constraint breach." });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
