const bcrypt = require('bcrypt');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const redisClient = require('../config/redis');
const { recordFailedAttempt, resetFailedAttempts } = require('../middleware/rateLimit');

const ACCESS_TOKEN_EXPIRY = '15m';
const ACCESS_TOKEN_EXPIRY_SECONDS = 15 * 60;
const REFRESH_TOKEN_EXPIRY_SECONDS = 7 * 24 * 60 * 60; // 7 days

async function register(req, res) {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  try {
    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'An account with that email already exists' });
    }

    const id = 'usr_' + crypto.randomBytes(4).toString('hex');
    const passwordHash = await bcrypt.hash(password, 10);

    await db.query('BEGIN');
    await db.query(
      'INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)',
      [id, email, passwordHash]
    );
    await db.query(
      'INSERT INTO profiles (user_id, full_name, display_name, bio) VALUES ($1, $2, $3, $4)',
      [id, '', email.split('@')[0], '']
    );
    await db.query('COMMIT');

    res.status(201).json({ id, email });
  } catch (err) {
    await db.query('ROLLBACK');
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function login(req, res) {
  const { email, password } = req.body;
  const GENERIC_ERROR = { error: 'Invalid email or password' };

  try {
    const result = await db.query('SELECT id, email, password_hash FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      await recordFailedAttempt(email);
      return res.status(401).json(GENERIC_ERROR);
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      await recordFailedAttempt(email);
      return res.status(401).json(GENERIC_ERROR);
    }

    await resetFailedAttempts(email);

    // Generate Access Token (JWT)
    const accessToken = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET,
      { expiresIn: ACCESS_TOKEN_EXPIRY }
    );

    // Generate Refresh Token (Opaque)
    const refreshToken = crypto.randomBytes(40).toString('hex');

    // Store Refresh Token in Redis
    await redisClient.setEx(`refresh:${refreshToken}`, REFRESH_TOKEN_EXPIRY_SECONDS, user.id);

    // Set HttpOnly Cookies
    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: ACCESS_TOKEN_EXPIRY_SECONDS * 1000
    });
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: REFRESH_TOKEN_EXPIRY_SECONDS * 1000
    });

    res.status(200).json({ 
      message: 'Logged in successfully',
      user: { id: user.id, email: user.email } 
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function refresh(req, res) {
  const refreshToken = req.cookies.refreshToken;
  
  if (!refreshToken) {
    return res.status(401).json({ error: 'Refresh token is required' });
  }

  try {
    const userId = await redisClient.get(`refresh:${refreshToken}`);
    if (!userId) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    // Issue a new Access Token
    const accessToken = jwt.sign(
      { userId },
      process.env.JWT_SECRET,
      { expiresIn: ACCESS_TOKEN_EXPIRY }
    );

    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: ACCESS_TOKEN_EXPIRY_SECONDS * 1000
    });

    res.status(200).json({ message: 'Token refreshed successfully' });
  } catch (err) {
    console.error('Refresh error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function logout(req, res) {
  const accessToken = req.token; // Extracted by auth middleware
  const refreshToken = req.cookies.refreshToken;

  try {
    // 1. Blacklist the short-lived access token in Redis to enforce strict server-side logout
    if (accessToken) {
      await redisClient.setEx(`bl:${accessToken}`, ACCESS_TOKEN_EXPIRY_SECONDS, 'revoked');
    }

    // 2. Delete the refresh token from Redis
    if (refreshToken) {
      await redisClient.del(`refresh:${refreshToken}`);
    }

    // 3. Clear cookies
    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');

    res.status(200).json({ message: 'Logged out successfully' });
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { register, login, refresh, logout };
