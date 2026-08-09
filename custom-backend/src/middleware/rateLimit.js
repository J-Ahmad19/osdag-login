const db = require('../config/db');

const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 1;

async function checkRateLimit(req, res, next) {
  const { email } = req.body;
  if (!email) return next();

  try {
    const result = await db.query('SELECT attempt_count, locked_until FROM login_attempts WHERE email = $1', [email]);
    if (result.rows.length > 0) {
      const record = result.rows[0];
      if (record.locked_until && new Date() < new Date(record.locked_until)) {
        return res.status(429).json({ error: 'Too many failed attempts. Try again in a bit.' });
      }
    }
    next();
  } catch (err) {
    console.error('Rate limit error:', err);
    next();
  }
}

async function recordFailedAttempt(email) {
  try {
    const result = await db.query('SELECT attempt_count FROM login_attempts WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      await db.query('INSERT INTO login_attempts (email, attempt_count) VALUES ($1, 1)', [email]);
    } else {
      let count = result.rows[0].attempt_count + 1;
      if (count >= MAX_ATTEMPTS) {
        const lockoutTime = new Date();
        lockoutTime.setMinutes(lockoutTime.getMinutes() + LOCKOUT_MINUTES);
        await db.query('UPDATE login_attempts SET attempt_count = 0, locked_until = $1 WHERE email = $2', [lockoutTime, email]);
      } else {
        await db.query('UPDATE login_attempts SET attempt_count = $1 WHERE email = $2', [count, email]);
      }
    }
  } catch (err) {
    console.error('Failed to record attempt:', err);
  }
}

async function resetFailedAttempts(email) {
  try {
    await db.query('DELETE FROM login_attempts WHERE email = $1', [email]);
  } catch (err) {
    console.error('Failed to reset attempts:', err);
  }
}

module.exports = {
  checkRateLimit,
  recordFailedAttempt,
  resetFailedAttempts
};
