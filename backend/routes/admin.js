const express = require('express');
const pool = require('../config/db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, requireRole('admin'));

router.get('/dashboard', async (req, res) => {
  try {
    const [summary, stalls] = await Promise.all([
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
    ]);

    res.json({
      success: true,
      data: { summary: summary.rows[0], stalls: stalls.rows },
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
