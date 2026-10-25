const express = require('express');
const pool = require('../config/db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, requireRole('customer'));

router.get('/orders', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT o.order_id, o.store_id, s.store_name, o.total_amount,
              o.order_status, o.created_at,
              COALESCE(json_agg(json_build_object(
                'product_id', oi.product_id, 'product_name', oi.product_name,
                'quantity', oi.quantity, 'unit_price', oi.unit_price
              )) FILTER (WHERE oi.order_item_id IS NOT NULL), '[]'::json) AS items
       FROM orders o
       JOIN stores s ON s.store_id = o.store_id
       LEFT JOIN order_items oi ON oi.order_id = o.order_id
       WHERE o.customer_id = $1
       GROUP BY o.order_id, s.store_name
       ORDER BY o.created_at DESC`,
      [req.user.user_id]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Customer order history failed:', error.message);
    res.status(500).json({ success: false, message: 'Could not load your orders.' });
  }
});

router.post('/orders', async (req, res) => {
  const items = req.body.items;
  if (!Array.isArray(items) || items.length < 1 || items.length > 50) {
    return res.status(400).json({ success: false, message: 'Add at least one item to your order.' });
  }
  const quantities = new Map();
  for (const item of items) {
    const productId = Number(item.product_id);
    const quantity = Number(item.quantity);
    if (!Number.isInteger(productId) || productId < 1 || !Number.isInteger(quantity) || quantity < 1) {
      return res.status(400).json({ success: false, message: 'Each order item needs a valid product and quantity.' });
    }
    quantities.set(productId, (quantities.get(productId) || 0) + quantity);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const productIds = [...quantities.keys()].sort((a, b) => a - b);
    const productsResult = await client.query(
      `SELECT p.product_id, p.store_id, p.product_name, p.price, p.is_active,
              i.quantity_in_stock
       FROM products p
       JOIN inventory i ON i.product_id = p.product_id
       WHERE p.product_id = ANY($1::bigint[])
       ORDER BY p.product_id
       FOR UPDATE OF p, i`,
      [productIds]
    );

    if (productsResult.rowCount !== productIds.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'One or more products are no longer available.' });
    }

    const products = productsResult.rows;
    if (products.some((product) => !product.is_active || Number(product.quantity_in_stock) < quantities.get(product.product_id))) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: 'Stock changed; update your cart and try again.' });
    }
    if (new Set(products.map((product) => product.store_id)).size !== 1) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Please place a separate order for each stall.' });
    }

    const total = products.reduce(
      (sum, product) => sum + Number(product.price) * quantities.get(product.product_id),
      0
    );
    const orderResult = await client.query(
      `INSERT INTO orders (customer_id, store_id, total_amount, order_status)
       VALUES ($1, $2, $3, 'Pending') RETURNING order_id, store_id, total_amount, order_status, created_at`,
      [req.user.user_id, products[0].store_id, total]
    );
    const order = orderResult.rows[0];

    for (const product of products) {
      const quantity = quantities.get(product.product_id);
      await client.query(
        `INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price)
         VALUES ($1, $2, $3, $4, $5)`,
        [order.order_id, product.product_id, product.product_name, quantity, product.price]
      );
      await client.query(
        `UPDATE inventory
         SET quantity_in_stock = quantity_in_stock - $1, updated_at = NOW()
         WHERE product_id = $2`,
        [quantity, product.product_id]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ success: true, data: { ...order, items: products.map((product) => ({
      product_id: product.product_id,
      product_name: product.product_name,
      quantity: quantities.get(product.product_id),
      unit_price: product.price,
    })) } });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Order creation failed:', error.message);
    res.status(500).json({ success: false, message: 'Could not place your order.' });
  } finally {
    client.release();
  }
});

module.exports = router;
