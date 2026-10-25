const express = require('express');
const pool = require('../config/db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, requireRole('seller'));

function optionalText(value, maxLength = 1000) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > maxLength) return undefined;
  return value.trim() || null;
}

function validImageUrl(value) {
  const imageUrl = optionalText(value, 2048);
  if (imageUrl === undefined || imageUrl === null) return imageUrl;
  try {
    const parsed = new URL(imageUrl);
    return ['http:', 'https:'].includes(parsed.protocol) ? imageUrl : undefined;
  } catch {
    return undefined;
  }
}

async function getSellerStore(userId) {
  const result = await pool.query(
    `SELECT store_id, store_name, store_location, description, is_active
     FROM stores WHERE vendor_id = $1 LIMIT 1`,
    [userId]
  );
  return result.rows[0] || null;
}

router.get('/dashboard', async (req, res) => {
  try {
    const store = await getSellerStore(req.user.user_id);
    if (!store) {
      return res.status(404).json({ success: false, message: 'No stall is assigned to this seller account.' });
    }

    const [products, orders, lowStock] = await Promise.all([
      pool.query(
        `SELECT p.product_id, p.product_name, p.description, p.image_url,
                p.price, p.sku, p.is_active AS is_available,
                i.quantity_in_stock, i.reorder_level
         FROM products p
         JOIN inventory i ON i.product_id = p.product_id
         WHERE p.store_id = $1 ORDER BY p.product_id DESC`,
        [store.store_id]
      ),
      pool.query(
        `SELECT o.order_id, o.total_amount, o.order_status, o.created_at,
                u.full_name AS customer_name, u.school_id AS customer_school_id,
                COALESCE(json_agg(json_build_object(
                  'product_id', oi.product_id, 'product_name', oi.product_name,
                  'quantity', oi.quantity, 'unit_price', oi.unit_price
                )) FILTER (WHERE oi.order_item_id IS NOT NULL), '[]'::json) AS items
         FROM orders o
         JOIN users u ON u.user_id = o.customer_id
         LEFT JOIN order_items oi ON oi.order_id = o.order_id
         WHERE o.store_id = $1
         GROUP BY o.order_id, u.full_name, u.school_id
         ORDER BY o.created_at DESC`,
        [store.store_id]
      ),
      pool.query(
        `SELECT p.product_id, p.product_name, i.quantity_in_stock, i.reorder_level
         FROM products p JOIN inventory i ON i.product_id = p.product_id
         WHERE p.store_id = $1 AND i.quantity_in_stock <= i.reorder_level
         ORDER BY i.quantity_in_stock ASC`,
        [store.store_id]
      ),
    ]);
    res.json({ success: true, data: { stall: store, products: products.rows, orders: orders.rows, lowStock: lowStock.rows } });
  } catch (error) {
    console.error('Seller dashboard failed:', error.message);
    res.status(500).json({ success: false, message: 'Could not load the seller dashboard.' });
  }
});

router.post('/products', async (req, res) => {
  const name = typeof req.body.product_name === 'string' ? req.body.product_name.trim() : '';
  const price = Number(req.body.price);
  const stock = Number(req.body.quantity_in_stock ?? 0);
  const reorderLevel = Number(req.body.reorder_level ?? 5);
  const description = optionalText(req.body.description);
  const imageUrl = validImageUrl(req.body.image_url);
  const sku = optionalText(req.body.sku, 100);
  if (!name || name.length > 160 || !Number.isFinite(price) || price < 0 || !Number.isInteger(stock) || stock < 0 ||
      description === undefined || imageUrl === undefined || sku === undefined ||
      !Number.isInteger(reorderLevel) || reorderLevel < 0) {
    return res.status(400).json({ success: false, message: 'Enter a product name, non-negative price, stock, and low-stock threshold.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const store = await getSellerStore(req.user.user_id);
    if (!store) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'No stall is assigned to this seller account.' });
    }
    const result = await client.query(
      `INSERT INTO products (store_id, product_name, description, image_url, price, sku, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE)
       RETURNING product_id, product_name, description, image_url, price, sku, is_active AS is_available`,
      [store.store_id, name, description, imageUrl, price, sku]
    );
    await client.query(
      `INSERT INTO inventory (product_id, quantity_in_stock, reorder_level)
       VALUES ($1, $2, $3)`,
      [result.rows[0].product_id, stock, reorderLevel]
    );
    await client.query('COMMIT');
    res.status(201).json({ success: true, data: { ...result.rows[0], quantity_in_stock: stock, reorder_level: reorderLevel } });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Product creation failed:', error.message);
    res.status(error.code === '23505' ? 409 : 500).json({ success: false, message: error.code === '23505' ? 'That SKU is already in use.' : 'Could not add the product.' });
  } finally {
    client.release();
  }
});

router.patch('/products/:productId', async (req, res) => {
  const name = typeof req.body.product_name === 'string' ? req.body.product_name.trim() : '';
  const price = Number(req.body.price);
  const description = optionalText(req.body.description);
  const imageUrl = validImageUrl(req.body.image_url);
  const sku = optionalText(req.body.sku, 100);
  if (!name || name.length > 160 || !Number.isFinite(price) || price < 0 ||
      description === undefined || imageUrl === undefined || sku === undefined) {
    return res.status(400).json({ success: false, message: 'Enter a product name and a valid non-negative price.' });
  }
  try {
    const store = await getSellerStore(req.user.user_id);
    if (!store) return res.status(404).json({ success: false, message: 'Stall not found.' });
    const result = await pool.query(
      `UPDATE products SET product_name = $1, description = $2, image_url = $3, price = $4, sku = $5
       WHERE product_id = $6 AND store_id = $7
       RETURNING product_id, product_name, description, image_url, price, sku, is_active AS is_available`,
      [name, description, imageUrl, price, sku, req.params.productId, store.store_id]
    );
    if (!result.rowCount) return res.status(404).json({ success: false, message: 'Product not found in your stall.' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Product update failed:', error.message);
    res.status(error.code === '23505' ? 409 : 500).json({ success: false, message: error.code === '23505' ? 'That SKU is already in use.' : 'Could not update the product.' });
  }
});

router.delete('/products/:productId', async (req, res) => {
  try {
    const store = await getSellerStore(req.user.user_id);
    if (!store) return res.status(404).json({ success: false, message: 'Stall not found.' });
    const result = await pool.query(
      `UPDATE products SET is_active = FALSE
       WHERE product_id = $1 AND store_id = $2
       RETURNING product_id`,
      [req.params.productId, store.store_id]
    );
    if (!result.rowCount) return res.status(404).json({ success: false, message: 'Product not found in your stall.' });
    res.json({ success: true });
  } catch (error) {
    console.error('Product removal failed:', error.message);
    res.status(500).json({ success: false, message: 'Could not remove the product.' });
  }
});

router.patch('/products/:productId/availability', async (req, res) => {
  if (typeof req.body.is_available !== 'boolean') {
    return res.status(400).json({ success: false, message: 'is_available must be true or false.' });
  }
  try {
    const store = await getSellerStore(req.user.user_id);
    if (!store) return res.status(404).json({ success: false, message: 'Stall not found.' });
    const result = await pool.query(
      `UPDATE products SET is_active = $1
       WHERE product_id = $2 AND store_id = $3
       RETURNING product_id, product_name, is_active AS is_available`,
      [req.body.is_available, req.params.productId, store.store_id]
    );
    if (!result.rowCount) return res.status(404).json({ success: false, message: 'Product not found in your stall.' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Product availability update failed:', error.message);
    res.status(500).json({ success: false, message: 'Could not update product availability.' });
  }
});

router.patch('/products/:productId/stock', async (req, res) => {
  const quantity = Number(req.body.quantity_in_stock);
  const threshold = Number(req.body.reorder_level);
  if (!Number.isInteger(quantity) || quantity < 0 || !Number.isInteger(threshold) || threshold < 0) {
    return res.status(400).json({ success: false, message: 'Stock and low-stock threshold must be non-negative whole numbers.' });
  }
  try {
    const store = await getSellerStore(req.user.user_id);
    if (!store) return res.status(404).json({ success: false, message: 'Stall not found.' });
    const result = await pool.query(
      `UPDATE inventory i SET quantity_in_stock = $1, reorder_level = $2, updated_at = NOW()
       FROM products p
       WHERE i.product_id = p.product_id AND p.product_id = $3 AND p.store_id = $4
       RETURNING i.product_id, i.quantity_in_stock, i.reorder_level`,
      [quantity, threshold, req.params.productId, store.store_id]
    );
    if (!result.rowCount) return res.status(404).json({ success: false, message: 'Product not found in your stall.' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Inventory update failed:', error.message);
    res.status(500).json({ success: false, message: 'Could not update product inventory.' });
  }
});

router.patch('/orders/:orderId/status', async (req, res) => {
  const allowedTransitions = {
    Pending: ['Confirmed'],
    Confirmed: ['Preparing'],
    Preparing: ['Ready for Pickup'],
    'Ready for Pickup': ['Completed'],
    Completed: [],
  };
  const nextStatus = req.body.order_status;
  if (typeof nextStatus !== 'string' || !Object.hasOwn(allowedTransitions, nextStatus)) {
    return res.status(400).json({ success: false, message: 'Choose a valid order status.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const store = await getSellerStore(req.user.user_id);
    if (!store) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Stall not found.' });
    }
    const order = await client.query(
      `SELECT order_id, order_status FROM orders
       WHERE order_id = $1 AND store_id = $2 FOR UPDATE`,
      [req.params.orderId, store.store_id]
    );
    if (!order.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Order not found in your stall.' });
    }
    const current = order.rows[0].order_status;
    if (!allowedTransitions[current]?.includes(nextStatus)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: `Cannot change order status from ${current} to ${nextStatus}.` });
    }
    const updated = await client.query(
      `UPDATE orders SET order_status = $1 WHERE order_id = $2 AND store_id = $3
       RETURNING order_id, order_status`,
      [nextStatus, req.params.orderId, store.store_id]
    );
    await client.query('COMMIT');
    res.json({ success: true, data: updated.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Order status update failed:', error.message);
    res.status(500).json({ success: false, message: 'Could not update order status.' });
  } finally {
    client.release();
  }
});

module.exports = router;
