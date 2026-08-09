const bcrypt = require('bcrypt');
const crypto = require('crypto');
const db = require('../config/db');
const { recordFailedAttempt, resetFailedAttempts } = require('../middleware/rateLimit');

const SESSION_EXPIRY_HOURS = 24;

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

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + SESSION_EXPIRY_HOURS);

    await db.query(
      'INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)',
      [token, user.id, expiresAt]
    );

    res.status(200).json({ token, user: { id: user.id, email: user.email } });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function logout(req, res) {
  const token = req.token;
  try {
    await db.query('DELETE FROM sessions WHERE token = $1', [token]);
    res.status(200).json({ message: 'Logged out' });
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { register, login, logout };
