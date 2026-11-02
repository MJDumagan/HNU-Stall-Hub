const express = require('express');
const pool = require('../config/db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, requireRole('admin'));

router.get('/dashboard', async (req, res) => {
  try {
    const [summary, stalls, recentOrders, recentInventoryChanges] = await Promise.all([
      pool.query(`
        SELECT
          (SELECT COUNT(*)::integer FROM stores) AS total_stalls,
          (SELECT COUNT(*)::integer FROM stores WHERE is_active = TRUE) AS active_stalls,
          (SELECT COUNT(*)::integer FROM users WHERE role = 'seller' AND is_active = TRUE) AS active_sellers,
          (SELECT COUNT(*)::integer FROM users WHERE role = 'customer' AND is_active = TRUE) AS active_customers,
          (SELECT COUNT(*)::integer FROM orders
           WHERE order_status::text NOT IN ('Completed', 'Cancelled')) AS open_orders
      `),
      pool.query(`
        SELECT s.store_id, s.store_name, s.store_location, s.is_active,
               u.full_name AS seller_name,
               COUNT(o.order_id)::integer AS order_count,
               COUNT(o.order_id) FILTER (
                 WHERE o.order_status::text NOT IN ('Completed', 'Cancelled')
               )::integer AS open_order_count
        FROM stores s
        LEFT JOIN users u ON u.user_id = s.vendor_id
        LEFT JOIN orders o ON o.store_id = s.store_id
        GROUP BY s.store_id, u.full_name
        ORDER BY s.is_active DESC, s.store_name
      `),
      pool.query(`
        SELECT o.order_id, o.total_amount, o.order_status, o.created_at,
               s.store_name, u.full_name AS customer_name
        FROM orders o
        JOIN stores s ON s.store_id = o.store_id
        JOIN users u ON u.user_id = o.customer_id
        ORDER BY o.created_at DESC, o.order_id DESC
        LIMIT 10
      `),
      pool.query(`
        SELECT log.log_id, log.quantity_changed, log.action_reason, log.logged_at,
               product.product_name, store.store_name
        FROM inventory_logs log
        JOIN inventory item ON item.inventory_id = log.inventory_id
        JOIN products product ON product.product_id = item.product_id
        JOIN stores store ON store.store_id = product.store_id
        ORDER BY log.logged_at DESC, log.log_id DESC
        LIMIT 10
      `),
    ]);

    res.json({
      success: true,
      data: {
        summary: summary.rows[0],
        stalls: stalls.rows,
        recentOrders: recentOrders.rows,
        recentInventoryChanges: recentInventoryChanges.rows,
      },
    });
  } catch (error) {
    console.error('Administrator dashboard failed:', error.message);
    res.status(500).json({ success: false, message: 'Could not load the administrator dashboard.' });
  }
});

router.delete('/stalls/:storeId', async (req, res) => {
  const storeId = Number(req.params.storeId);
  if (!Number.isSafeInteger(storeId) || storeId < 1) {
    return res.status(400).json({ success: false, message: 'Invalid stall ID.' });
  }

  const client = await pool.connect();
  let transactionStarted = false;
  try {
    await client.query('BEGIN');
    transactionStarted = true;

    const stall = await client.query(
      'SELECT store_id, store_name, is_active FROM stores WHERE store_id = $1 FOR UPDATE',
      [storeId]
    );
    if (!stall.rowCount) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(404).json({ success: false, message: 'Stall not found.' });
    }

    await client.query('UPDATE stores SET is_active = FALSE WHERE store_id = $1', [storeId]);
    await client.query('UPDATE products SET is_active = FALSE WHERE store_id = $1', [storeId]);
    await client.query('COMMIT');
    transactionStarted = false;

    res.json({
      success: true,
      message: 'Stall removed from the customer menu. Order history has been preserved.',
      data: { store_id: storeId, is_active: false },
    });
  } catch (error) {
    if (transactionStarted) await client.query('ROLLBACK');
    console.error('Stall removal failed:', error.message);
    res.status(500).json({ success: false, message: 'Could not remove this stall.' });
  } finally {
    client.release();
  }
});

module.exports = router;
