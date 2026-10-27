const express = require('express');
const pool = require('../config/db');
const { authenticate, requireRole } = require('../middleware/auth');
const { isRiceAddonEligible, riceAddonLabel, riceAddonPrice } = require('../lib/rice-addons');

const router = express.Router();
router.use(authenticate, requireRole('customer'));

router.get('/orders', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT o.order_id, o.store_id, s.store_name, o.total_amount,
              o.order_status, o.created_at,
              pay.payment_method, pay.amount_paid, pay.paid_at,
              COALESCE(json_agg(json_build_object(
                'product_id', oi.product_id, 'product_name', oi.product_name,
                'quantity', oi.quantity, 'unit_price', oi.unit_price
              )) FILTER (WHERE oi.order_item_id IS NOT NULL), '[]'::json) AS items
       FROM orders o
       JOIN stores s ON s.store_id = o.store_id
       LEFT JOIN order_items oi ON oi.order_id = o.order_id
       LEFT JOIN payments pay ON pay.order_id = o.order_id
       WHERE o.customer_id = $1
       GROUP BY o.order_id, s.store_name, pay.payment_method, pay.amount_paid, pay.paid_at
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
  const riceAddons = new Map();
  for (const item of items) {
    const productId = Number(item.product_id);
    const quantity = Number(item.quantity);
    const riceAddon = item.rice_addon === undefined ? 'none' : item.rice_addon;
    if (!Number.isInteger(productId) || productId < 1 || !Number.isInteger(quantity) || quantity < 1 ||
        !['none', 'half', 'full'].includes(riceAddon)) {
      return res.status(400).json({ success: false, message: 'Each order item needs a valid product and quantity.' });
    }
    const productKey = String(productId);
    if (riceAddons.has(productKey) && riceAddons.get(productKey) !== riceAddon) {
      return res.status(400).json({ success: false, message: 'Choose one rice option for each menu item.' });
    }
    quantities.set(productKey, (quantities.get(productKey) || 0) + quantity);
    riceAddons.set(productKey, riceAddon);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      "SELECT set_config('app.customer_id', $1, TRUE)",
      [String(req.user.user_id)]
    );
    const productIds = [...quantities.keys()].sort((a, b) => a - b);
    const productsResult = await client.query(
      `SELECT p.product_id, p.store_id, p.product_name, p.price, p.is_active,
              c.category_name,
              i.quantity_in_stock
       FROM products p
       LEFT JOIN categories c ON c.category_id = p.category_id
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
    if (products.some((product) => !product.is_active ||
        Number(product.quantity_in_stock) < quantities.get(String(product.product_id)))) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: 'Stock changed; update your cart and try again.' });
    }
    if (products.some((product) => riceAddons.get(String(product.product_id)) !== 'none' &&
        !isRiceAddonEligible(product.product_name, product.category_name))) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Rice add-ons are only available with viand items.' });
    }
    if (new Set(products.map((product) => product.store_id)).size !== 1) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Please place a separate order for each stall.' });
    }

    const checkout = await client.query(
      `CALL public.place_order($1, $2, $3, $4, $5, NULL)`,
      [
        req.user.user_id,
        products.map((product) => product.product_id),
        products.map((product) => quantities.get(String(product.product_id))),
        products.map((product) => riceAddonPrice(riceAddons.get(String(product.product_id)))),
        products.map((product) => riceAddonLabel(riceAddons.get(String(product.product_id)))),
      ]
    );
    const orderId = checkout.rows[0].p_order_id;
    const orderResult = await client.query(
      `SELECT order_id, store_id, total_amount, order_status, created_at
       FROM orders WHERE order_id = $1`,
      [orderId]
    );
    const order = orderResult.rows[0];

    await client.query('COMMIT');
    res.status(201).json({ success: true, data: { ...order, items: products.map((product) => ({
      product_id: product.product_id,
      product_name: riceAddonLabel(riceAddons.get(String(product.product_id)))
        ? `${product.product_name} (${riceAddonLabel(riceAddons.get(String(product.product_id)))})`
        : product.product_name,
      quantity: quantities.get(String(product.product_id)),
      unit_price: Number(product.price) + riceAddonPrice(riceAddons.get(String(product.product_id))),
    })) } });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === 'P0001') {
      return res.status(409).json({ success: false, message: error.message });
    }
    console.error('Order creation failed:', error.message);
    res.status(500).json({ success: false, message: 'Could not place your order.' });
  } finally {
    client.release();
  }
});

module.exports = router;
