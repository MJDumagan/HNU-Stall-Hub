const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:3000';

app.use(cors({ origin: frontendOrigin, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) req.body = {};
  next();
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/stalls', require('./routes/stalls'));
app.use('/api/customer', require('./routes/customer'));
app.use('/api/vendor', require('./routes/vendor'));
app.use('/api/products', require('./routes/products'));

app.get('/', (req, res) => {
  res.json({
    name: 'HNU StallHub API',
    status: 'running',
    health: '/api/health',
  });
});

app.get('/api/health', async (req, res) => {
  try {
    await require('./config/db').query('SELECT 1');
    res.json({ success: true, status: 'ok', database: 'connected' });
  } catch (error) {
    console.error(`Database health check failed (${error.code || 'unknown error'}): ${error.message}`);
    res.status(503).json({
      success: false,
      status: 'degraded',
      database: 'unavailable',
      message: 'The API is running, but it cannot connect to PostgreSQL. Check DATABASE_URL and the Supabase database credentials.',
    });
  }
});

app.use((err, req, res, next) => {
  console.error('Request failed:', err.message);
  const status = Number.isInteger(err.status) && err.status >= 400 && err.status < 500 ? err.status : 500;
  const message = status === 400 ? 'Request body must contain valid JSON.' :
    status === 413 ? 'Request body is too large.' : 'An unexpected server error occurred.';
  res.status(status).json({ success: false, message });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`API server running at http://localhost:${PORT}`);
  console.log(`Check API and database status at http://localhost:${PORT}/api/health`);
});
