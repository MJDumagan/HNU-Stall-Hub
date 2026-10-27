const pool = require('../config/db');

const benchmarks = [
  {
    name: 'customer-order-history',
    sql: `SELECT order_id, store_id, total_amount, order_status, created_at
          FROM public.orders
          WHERE customer_id = (
            SELECT user_id FROM public.users
            WHERE role = 'customer' ORDER BY user_id LIMIT 1
          )
          ORDER BY created_at DESC
          LIMIT 50`,
  },
  {
    name: 'stall-recent-orders',
    sql: `SELECT order_id, customer_id, total_amount, order_status, created_at
          FROM public.orders
          WHERE store_id = (
            SELECT store_id FROM public.stores ORDER BY store_id LIMIT 1
          )
          ORDER BY created_at DESC
          LIMIT 50`,
  },
  {
    name: 'order-item-details',
    sql: `SELECT order_item_id, product_id, product_name, quantity, unit_price, total_price
          FROM public.order_items
          WHERE order_id = (
            SELECT order_id FROM public.orders ORDER BY created_at DESC LIMIT 1
          )`,
  },
];

async function main() {
  const metadata = await pool.query(
    `SELECT current_database() AS database_name,
            current_user AS database_role,
            version() AS postgres_version,
            NOW() AS measured_at`
  );
  console.log(JSON.stringify({ metadata: metadata.rows[0] }, null, 2));

  for (const benchmark of benchmarks) {
    const result = await pool.query(
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${benchmark.sql}`
    );
    console.log(JSON.stringify({
      benchmark: benchmark.name,
      plan: result.rows[0]['QUERY PLAN'][0],
    }, null, 2));
  }
}

main()
  .catch((error) => {
    console.error(`Database benchmark failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
