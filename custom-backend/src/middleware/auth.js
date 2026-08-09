const db = require('../config/db');

async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const result = await db.query(
      'SELECT user_id, expires_at FROM sessions WHERE token = $1',
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const session = result.rows[0];
    if (new Date() > new Date(session.expires_at)) {
      // Session expired, remove it
      await db.query('DELETE FROM sessions WHERE token = $1', [token]);
      return res.status(401).json({ error: 'Not authenticated' });
    }

    req.userId = session.user_id;
    req.token = token;
    next();
  } catch (err) {
    console.error('Auth error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = authenticate;
