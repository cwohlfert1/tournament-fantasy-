const authMiddleware = require('./auth');

function superadminMiddleware(req, res, next) {
  if (req.user?.role !== 'superadmin') {
    return res.status(403).json({ error: 'Superadmin access required' });
  }
  next();
}

// Combines auth + superadmin check into a single middleware array
module.exports = [authMiddleware, superadminMiddleware];
