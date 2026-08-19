const redisClient = require('../config/redis');

const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 1;
const LOCKOUT_SECONDS = LOCKOUT_MINUTES * 60;

async function checkRateLimit(req, res, next) {
  const { email } = req.body;
  if (!email) return next();

  try {
    const attempts = await redisClient.get(`rate_limit:${email}`);
    if (attempts && parseInt(attempts, 10) >= MAX_ATTEMPTS) {
      return res.status(429).json({ error: 'Too many failed attempts. Try again in a bit.' });
    }
    next();
  } catch (err) {
    console.error('Rate limit error:', err);
    next(); // Fail open so users can still log in if Redis hiccups
  }
}

async function recordFailedAttempt(email) {
  try {
    const key = `rate_limit:${email}`;
    // Increment the failed attempts counter
    const currentAttempts = await redisClient.incr(key);
    
    // If it is the first failed attempt, set the expiration to the lockout window duration.
    // This ensures the counter resets automatically.
    if (currentAttempts === 1) {
      await redisClient.expire(key, LOCKOUT_SECONDS);
    }
    
    // If we hit the max attempts, explicitly set the TTL to the lockout period
    // so they are locked out for that duration from THIS moment.
    if (currentAttempts >= MAX_ATTEMPTS) {
      await redisClient.expire(key, LOCKOUT_SECONDS);
    }
  } catch (err) {
    console.error('Failed to record attempt:', err);
  }
}

async function resetFailedAttempts(email) {
  try {
    await redisClient.del(`rate_limit:${email}`);
  } catch (err) {
    console.error('Failed to reset attempts:', err);
  }
}

module.exports = {
  checkRateLimit,
  recordFailedAttempt,
  resetFailedAttempts
};
