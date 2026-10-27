const crypto = require('crypto');

const COOKIE_NAME = 'stallhub_session';
const SESSION_SECONDS = 60 * 60 * 24 * 7;

function secret() {
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
    throw new Error('SESSION_SECRET must be configured with at least 32 characters.');
  }
  return process.env.SESSION_SECRET;
}

function encode(value) {
  return Buffer.from(value).toString('base64url');
}

function sign(payload) {
  const body = encode(JSON.stringify(payload));
  const signature = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${signature}`;
}

function verify(token) {
  const [body, signature] = (token || '').split('.');
  if (!body || !signature) return null;
  const expected = crypto.createHmac('sha256', secret()).update(body).digest();
  let actual;
  try {
    actual = Buffer.from(signature, 'base64url');
  } catch {
    return null;
  }
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.sub || !payload.role || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function setSessionCookie(res, user) {
  const token = sign({
    sub: String(user.user_id),
    role: user.role,
    name: user.full_name,
    exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS,
  });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_SECONDS * 1000,
  });
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
}

function authenticate(req, res, next) {
  const cookies = (req.headers.cookie || '').split(';').reduce((result, part) => {
    const separator = part.indexOf('=');
    if (separator > -1) {
      const name = part.slice(0, separator).trim();
      try {
        result[name] = decodeURIComponent(part.slice(separator + 1).trim());
      } catch {
        result[name] = '';
      }
    }
    return result;
  }, {});
  const session = verify(cookies[COOKIE_NAME]);
  if (!session) {
    return res.status(401).json({ success: false, message: 'Please log in to continue.' });
  }
  req.user = {
    user_id: Number(session.sub),
    role: session.role,
    full_name: session.name,
  };
  next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (req.user.role !== role) {
      return res.status(403).json({ success: false, message: `${role} access only.` });
    }
    next();
  };
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function verifyPassword(password, encoded) {
  if (typeof encoded !== 'string') return false;
  const [algorithm, saltHex, hashHex] = encoded.split('$');
  if (algorithm !== 'scrypt' || !saltHex || !hashHex) return false;
  try {
    const expected = Buffer.from(hashHex, 'hex');
    const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

module.exports = {
  authenticate,
  clearSessionCookie,
  hashPassword,
  requireRole,
  setSessionCookie,
  verifyPassword,
};
