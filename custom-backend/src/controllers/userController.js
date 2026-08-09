const db = require('../config/db');

async function getMe(req, res) {
  try {
    const result = await db.query(`
      SELECT u.id, u.email, p.full_name, p.display_name, p.bio, p.role, p.created_at
      FROM users u
      LEFT JOIN profiles p ON u.id = p.user_id
      WHERE u.id = $1
    `, [req.userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    res.status(200).json({
      id: user.id,
      email: user.email,
      profile: {
        fullName: user.full_name,
        displayName: user.display_name,
        bio: user.bio,
        role: user.role,
        createdAt: user.created_at
      }
    });
  } catch (err) {
    console.error('Get user error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { getMe };
