const express = require('express');
const pool = require('../config/db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
const MAX_COVER_IMAGE_BYTES = 10 * 1024 * 1024;
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
    `SELECT store_id, store_name, store_location, description, cover_image_url, is_active
     FROM stores WHERE vendor_id = $1 LIMIT 1`,
    [userId]
  );
  return result.rows[0] || null;
}

function normalizeTags(value) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 10 || value.some((tag) => typeof tag !== 'string')) return null;
  const tags = [...new Map(
    value.map((tag) => tag.trim()).filter(Boolean).map((tag) => [tag.toLowerCase(), tag])
  ).values()];
  if (tags.some((tag) => tag.length > 80)) return null;
  return tags;
}

async function replaceProductTags(client, productId, tags) {
  await client.query('DELETE FROM product_tags WHERE product_id = $1', [productId]);
  for (const tagName of tags) {
    const tag = await client.query(
      `INSERT INTO tags (tag_name) VALUES ($1)
       ON CONFLICT (lower(tag_name)) DO UPDATE SET tag_name = EXCLUDED.tag_name
       RETURNING tag_id`,
      [tagName]
    );
    await client.query(
      'INSERT INTO product_tags (product_id, tag_id) VALUES ($1, $2)',
      [productId, tag.rows[0].tag_id]
    );
  }
}

router.get('/dashboard', async (req, res) => {
  try {
    const store = await getSellerStore(req.user.user_id);
    if (!store) {
      return res.status(404).json({ success: false, message: 'No stall is assigned to this seller account.' });
    }

    const [products, orders, lowStock, categories, metrics, tagCatalog] = await Promise.all([
      pool.query(
        `SELECT p.product_id, p.product_name, p.description, p.image_url, p.category_id,
                c.category_name,
                p.price, p.is_active AS is_available,
                i.quantity_in_stock, i.reorder_level,
                COALESCE((
                  SELECT array_agg(t.tag_name ORDER BY t.tag_name)
                  FROM product_tags pt JOIN tags t ON t.tag_id = pt.tag_id
                  WHERE pt.product_id = p.product_id
                ), ARRAY[]::varchar[]) AS tags
         FROM products p
         JOIN inventory i ON i.product_id = p.product_id
         LEFT JOIN categories c ON c.category_id = p.category_id
         WHERE p.store_id = $1 AND p.is_removed = FALSE
         ORDER BY p.product_id DESC`,
        [store.store_id]
      ),
      pool.query(
        `SELECT o.order_id, o.total_amount, o.order_status, o.created_at,
                pay.payment_method, pay.paid_at,
                u.full_name AS customer_name, u.school_id AS customer_school_id,
                COALESCE(json_agg(json_build_object(
                  'product_id', oi.product_id, 'product_name', oi.product_name,
                  'quantity', oi.quantity, 'unit_price', oi.unit_price
                )) FILTER (WHERE oi.order_item_id IS NOT NULL), '[]'::json) AS items
         FROM orders o
         JOIN users u ON u.user_id = o.customer_id
         LEFT JOIN order_items oi ON oi.order_id = o.order_id
         LEFT JOIN payments pay ON pay.order_id = o.order_id
         WHERE o.store_id = $1
         GROUP BY o.order_id, u.full_name, u.school_id, pay.payment_method, pay.paid_at
         ORDER BY o.created_at DESC`,
        [store.store_id]
      ),
      pool.query(
        `SELECT p.product_id, p.product_name, i.quantity_in_stock, i.reorder_level
         FROM products p JOIN inventory i ON i.product_id = p.product_id
         WHERE p.store_id = $1 AND p.is_removed = FALSE
           AND i.quantity_in_stock <= i.reorder_level
         ORDER BY i.quantity_in_stock ASC`,
        [store.store_id]
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
      pool.query('SELECT * FROM public.stall_operational_metrics WHERE store_id = $1', [store.store_id]),
      pool.query('SELECT tag_id, tag_name FROM public.tags ORDER BY tag_name'),
    ]);
    res.json({ success: true, data: { stall: store, products: products.rows, orders: orders.rows, lowStock: lowStock.rows, categories: categories.rows, metrics: metrics.rows[0], tagCatalog: tagCatalog.rows } });
  } catch (error) {
    console.error('Seller dashboard failed:', error.message);
    res.status(500).json({ success: false, message: 'Could not load the seller dashboard.' });
  }
});

function validCoverImage(value) {
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;

  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) return undefined;

  const image = Buffer.from(match[2], 'base64');
  if (image.length === 0 || image.length > MAX_COVER_IMAGE_BYTES) return undefined;
  const isJpeg = match[1] === 'jpeg' && image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff;
  const isPng = match[1] === 'png' && image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const isWebp = match[1] === 'webp' && image.toString('ascii', 0, 4) === 'RIFF' &&
    image.toString('ascii', 8, 12) === 'WEBP';
  return isJpeg || isPng || isWebp ? value : undefined;
}

router.patch('/cover', async (req, res) => {
  const coverImage = validCoverImage(req.body.cover_image);
  if (coverImage === undefined) {
    return res.status(400).json({
      success: false,
      message: 'Choose a valid JPEG, PNG, or WebP image no larger than 10 MB.',
    });
  }

  try {
    const store = await getSellerStore(req.user.user_id);
    if (!store) return res.status(404).json({ success: false, message: 'Stall not found.' });
    const result = await pool.query(
      `UPDATE stores SET cover_image_url = $1 WHERE store_id = $2
       RETURNING cover_image_url`,
      [coverImage, store.store_id]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Stall cover update failed:', error.message);
    res.status(500).json({ success: false, message: 'Could not update the stall cover photo.' });
  }
});

router.post('/products', async (req, res) => {
  const name = typeof req.body.product_name === 'string' ? req.body.product_name.trim() : '';
  const price = Number(req.body.price);
  const categoryId = Number(req.body.category_id);
  const stock = Number(req.body.quantity_in_stock ?? 0);
  const reorderLevel = Number(req.body.reorder_level ?? 5);
  const description = optionalText(req.body.description);
  const imageUrl = validImageUrl(req.body.image_url);
  const tags = normalizeTags(req.body.tags === undefined ? [] : req.body.tags);
  if (!name || name.length > 160 || !Number.isFinite(price) || price < 0 ||
      !Number.isInteger(categoryId) || categoryId < 1 || !Number.isInteger(stock) || stock < 0 ||
      description === undefined || imageUrl === undefined ||
      !Number.isInteger(reorderLevel) || reorderLevel < 0 || tags === null) {
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
    const category = await client.query('SELECT category_id FROM categories WHERE category_id = $1', [categoryId]);
    if (!category.rowCount) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Choose a valid product category.' });
    }
    const result = await client.query(
      `INSERT INTO products (store_id, category_id, product_name, description, image_url, price, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE)
       RETURNING product_id, product_name, category_id, description, image_url, price, is_active AS is_available`,
      [store.store_id, categoryId, name, description, imageUrl, price]
    );
    await client.query(
      `INSERT INTO inventory (product_id, quantity_in_stock, reorder_level)
       VALUES ($1, $2, $3)`,
      [result.rows[0].product_id, stock, reorderLevel]
    );
    await replaceProductTags(client, result.rows[0].product_id, tags);
    await client.query('COMMIT');
    res.status(201).json({ success: true, data: { ...result.rows[0], quantity_in_stock: stock, reorder_level: reorderLevel } });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Product creation failed:', error.message);
    res.status(500).json({ success: false, message: 'Could not add the product.' });
  } finally {
    client.release();
  }
});

router.patch('/products/:productId', async (req, res) => {
  const name = typeof req.body.product_name === 'string' ? req.body.product_name.trim() : '';
  const price = Number(req.body.price);
  const categoryId = Number(req.body.category_id);
  const description = optionalText(req.body.description);
  const imageUrl = validImageUrl(req.body.image_url);
  const tags = normalizeTags(req.body.tags);
  if (!name || name.length > 160 || !Number.isFinite(price) || price < 0 ||
      !Number.isInteger(categoryId) || categoryId < 1 ||
      description === undefined || imageUrl === undefined || tags === null) {
    return res.status(400).json({ success: false, message: 'Enter a product name and a valid non-negative price.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const store = await getSellerStore(req.user.user_id);
    if (!store) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Stall not found.' });
    }
    const category = await client.query('SELECT category_id FROM categories WHERE category_id = $1', [categoryId]);
    if (!category.rowCount) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Choose a valid product category.' });
    }
    const result = await client.query(
      `UPDATE products SET category_id = $1, product_name = $2, description = $3, image_url = $4, price = $5
       WHERE product_id = $6 AND store_id = $7 AND is_removed = FALSE
       RETURNING product_id, product_name, category_id, description, image_url, price, is_active AS is_available`,
      [categoryId, name, description, imageUrl, price, req.params.productId, store.store_id]
    );
    if (!result.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Product not found in your stall.' });
    }
    if (tags !== undefined) await replaceProductTags(client, result.rows[0].product_id, tags);
    await client.query('COMMIT');
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Product update failed:', error.message);
    res.status(500).json({ success: false, message: 'Could not update the product.' });
  } finally {
    client.release();
  }
});

router.delete('/products/:productId', async (req, res) => {
  try {
    const store = await getSellerStore(req.user.user_id);
    if (!store) return res.status(404).json({ success: false, message: 'Stall not found.' });
    const result = await pool.query(
      `UPDATE products SET is_active = FALSE, is_removed = TRUE
       WHERE product_id = $1 AND store_id = $2 AND is_removed = FALSE
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
       WHERE product_id = $2 AND store_id = $3 AND is_removed = FALSE
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
      `UPDATE inventory i SET quantity_in_stock = $1, reorder_level = $2
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

router.post('/orders/:orderId/payment', async (req, res) => {
  const paymentMethod = req.body.payment_method;
  const paymentMethods = ['Cash', 'Debit_Card', 'Credit_Card', 'GCash', 'PayMaya'];
  if (!paymentMethods.includes(paymentMethod)) {
    return res.status(400).json({ success: false, message: 'Choose the payment method received at the stall.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const store = await getSellerStore(req.user.user_id);
    if (!store) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Stall not found.' });
    }

    const orderResult = await client.query(
      `SELECT order_id, total_amount, order_status FROM orders
       WHERE order_id = $1 AND store_id = $2 FOR UPDATE`,
      [req.params.orderId, store.store_id]
    );
    if (!orderResult.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Order not found in your stall.' });
    }

    const order = orderResult.rows[0];
    if (!['Ready for Pickup', 'Completed'].includes(order.order_status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Only ready or previously completed orders can have a payment recorded.' });
    }

    const payment = await client.query(
      `INSERT INTO payments (order_id, payment_method, amount_paid)
       VALUES ($1, $2, $3)
       RETURNING payment_id, order_id, payment_method, amount_paid, paid_at`,
      [order.order_id, paymentMethod, order.total_amount]
    );
    if (order.order_status === 'Ready for Pickup') {
      await client.query(
        `UPDATE orders SET order_status = 'Completed' WHERE order_id = $1`,
        [order.order_id]
      );
    }
    await client.query('COMMIT');
    res.json({ success: true, data: { ...payment.rows[0], order_status: order.order_status === 'Ready for Pickup' ? 'Completed' : order.order_status } });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') {
      return res.status(409).json({ success: false, message: 'Payment has already been recorded for this order.' });
    }
    console.error('Order payment recording failed:', error.message);
    res.status(500).json({ success: false, message: 'Could not record the order payment.' });
  } finally {
    client.release();
  }
});

router.patch('/orders/:orderId/status', async (req, res) => {
  const allowedTransitions = {
    Pending: ['Confirmed'],
    Preparing: ['Ready for Pickup'],
    'Ready for Pickup': [],
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
