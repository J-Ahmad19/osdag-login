const jwt = require('jsonwebtoken');
const redisClient = require('../config/redis');

async function authenticate(req, res, next) {
  let token = req.cookies.accessToken;

  // Fallback to Authorization header for backward compatibility / testing
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }
  }

  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    // 1. Verify JWT signature and expiration statelessly
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // 2. Check if the token was explicitly revoked (blacklisted during logout)
    const isBlacklisted = await redisClient.get(`bl:${token}`);
    if (isBlacklisted) {
      return res.status(401).json({ error: 'Token has been revoked' });
    }

    req.userId = payload.userId;
    req.token = token;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Not authenticated' });
  }
}

module.exports = authenticate;
