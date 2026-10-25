const express = require('express');
const pool = require('../config/db');
const {
  authenticate,
  clearSessionCookie,
  hashPassword,
  setSessionCookie,
  verifyPassword,
} = require('../middleware/auth');

const router = express.Router();
const SCHOOL_ID_PREFIX = {
  customer: '0',
  seller: '2',
};

router.post('/login', async (req, res) => {
  const schoolId = typeof req.body.school_id === 'string' ? req.body.school_id.trim() : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const requestedRole = typeof req.body.role === 'string' ? req.body.role.toLowerCase() : '';

  if (!schoolId || schoolId.length > 100 || !password || password.length > 128 ||
      !['customer', 'seller'].includes(requestedRole)) {
    return res.status(400).json({ success: false, message: 'Enter your account ID, password, and select a role.' });
  }

  if (!new RegExp(`^${SCHOOL_ID_PREFIX[requestedRole]}\\d{7}$`).test(schoolId)) {
    return res.status(400).json({
      success: false,
      message: 'This School ID does not match the selected account type.',
    });
  }

  try {
    const result = await pool.query(
      `SELECT user_id, school_id, full_name, role, password_hash
       FROM users WHERE LOWER(school_id) = LOWER($1) AND is_active = TRUE LIMIT 1`,
      [schoolId]
    );
    const user = result.rows[0];

    if (!user || user.role !== requestedRole || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ success: false, message: 'Invalid credentials for the selected role.' });
    }

    setSessionCookie(res, user);
    res.json({
      success: true,
      data: {
        user: { user_id: user.user_id, school_id: user.school_id, full_name: user.full_name, role: user.role },
        redirect: user.role === 'seller' ? '/seller/dashboard' : '/',
      },
    });
  } catch (error) {
    console.error('Login failed:', error.message);
    res.status(500).json({ success: false, message: 'Unable to sign in right now.' });
  }
});

router.post('/register', async (req, res) => {
  const schoolId = typeof req.body.school_id === 'string' ? req.body.school_id.trim() : '';
  const fullName = typeof req.body.full_name === 'string' ? req.body.full_name.trim() : '';
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const role = typeof req.body.role === 'string' ? req.body.role.toLowerCase() : 'customer';
  const storeName = typeof req.body.store_name === 'string' ? req.body.store_name.trim() : '';
  const storeLocation = typeof req.body.store_location === 'string' ? req.body.store_location.trim() : '';
  const storeDescription =
    typeof req.body.store_description === 'string' ? req.body.store_description.trim() : '';
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const expectedPrefix = SCHOOL_ID_PREFIX[role];
  if (!expectedPrefix || !new RegExp(`^${expectedPrefix}\\d{7}$`).test(schoolId) ||
      !fullName || fullName.length > 160 ||
      !validEmail || email.length > 254 || password.length < 10 || password.length > 128 ||
      (role === 'seller' && (!storeName || storeName.length > 160 || !storeLocation || storeLocation.length > 200)) ||
      storeDescription.length > 1000) {
    return res.status(400).json({
      success: false,
      message: 'Check your School ID, name, email, password, and required account details.',
    });
  }

  const client = await pool.connect();
  let transactionStarted = false;
  try {
    await client.query('BEGIN');
    transactionStarted = true;

    const result = await client.query(
      `INSERT INTO users (school_id, full_name, email, role, password_hash)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING user_id, school_id, full_name, role`,
      [schoolId, fullName, email, role, hashPassword(password)]
    );

    if (role === 'seller') {
      await client.query(
        `INSERT INTO stores (vendor_id, store_name, store_location, description, is_active)
         VALUES ($1, $2, $3, $4, TRUE)`,
        [result.rows[0].user_id, storeName, storeLocation, storeDescription || null]
      );
    }

    await client.query('COMMIT');
    transactionStarted = false;
    setSessionCookie(res, result.rows[0]);
    res.status(201).json({
      success: true,
      data: {
        user: result.rows[0],
        redirect: role === 'seller' ? '/seller/dashboard' : '/',
      },
    });
  } catch (error) {
    if (transactionStarted) {
      await client.query('ROLLBACK');
    }
    if (error.code === '23505') {
      return res.status(409).json({ success: false, message: 'That School ID or email is already registered.' });
    }
    console.error('Account registration failed:', error.message);
    res.status(500).json({ success: false, message: 'Unable to create your account right now.' });
  } finally {
    client.release();
  }
});

router.get('/me', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT user_id, school_id, full_name, role
       FROM users WHERE user_id = $1 AND is_active = TRUE`,
      [req.user.user_id]
    );
    if (!result.rowCount) {
      clearSessionCookie(res);
      return res.status(401).json({ success: false, message: 'This account is no longer active.' });
    }
    res.json({ success: true, data: { user: result.rows[0] } });
  } catch (error) {
    console.error('Session check failed:', error.message);
    res.status(500).json({ success: false, message: 'Unable to verify your session.' });
  }
});

router.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ success: true });
});

module.exports = router;
