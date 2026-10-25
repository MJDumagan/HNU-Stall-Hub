const { Pool } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required. Configure your Supabase or Neon PostgreSQL connection string.');
}

let databaseUrl;
try {
  databaseUrl = new URL(connectionString);
} catch {
  throw new Error('DATABASE_URL must be a valid PostgreSQL connection URI.');
}

if (
  !['postgres:', 'postgresql:'].includes(databaseUrl.protocol) ||
  !databaseUrl.hostname ||
  !databaseUrl.username ||
  !databaseUrl.password ||
  /your-|placeholder|example/i.test(databaseUrl.hostname)
) {
  throw new Error('DATABASE_URL must contain the real Supabase PostgreSQL host, username, and password.');
}

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  throw new Error('SESSION_SECRET must be configured with at least 32 characters.');
}

const pool = new Pool({
  connectionString,
  ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false },
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Unexpected database error:', err.message);
});

module.exports = pool;
