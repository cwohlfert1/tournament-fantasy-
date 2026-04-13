const jwt = require('jsonwebtoken');
const db = require('../db/index');

async function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Always pull fresh role from DB so superadmin grant takes effect without re-login
    const row = await db.get('SELECT role FROM users WHERE id = ?', decoded.id);
    if (row?.role === 'banned') {
      return res.status(403).json({ error: 'Account suspended' });
    }
    req.user = { id: decoded.id, email: decoded.email, username: decoded.username, role: row?.role || 'user' };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = authMiddleware;
