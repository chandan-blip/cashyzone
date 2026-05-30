'use strict';

const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
const EXPIRES_IN = '7d';

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name, is_admin: !!user.is_admin },
    SECRET,
    { expiresIn: EXPIRES_IN }
  );
}

// Rejects the request if there is no valid token.
function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired session' });
  }
}

// Rejects the request unless the user is an admin.
function adminRequired(req, res, next) {
  authRequired(req, res, () => {
    if (!req.user.is_admin) return res.status(403).json({ error: 'Admin access required' });
    next();
  });
}

// Attaches req.user if a valid token is present, but never blocks the request.
function optionalAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) {
    try {
      req.user = jwt.verify(token, SECRET);
    } catch {
      /* ignore invalid token for optional routes */
    }
  }
  next();
}

module.exports = { signToken, authRequired, adminRequired, optionalAuth, SECRET };
