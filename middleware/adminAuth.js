const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware to protect admin routes
const adminAuth = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        status: 'fail',
        message: 'Access denied. No token provided.'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user from database
    const user = await User.findById(decoded.id).select('-password');
    
    if (!user) {
      return res.status(401).json({
        status: 'fail',
        message: 'Token is not valid. User not found.'
      });
    }

    // Check if user is admin
    if (!user.isAdmin && !['admin', 'superadmin'].includes(user.role)) {
      return res.status(403).json({
        status: 'fail',
        message: 'Access denied. Admin privileges required.'
      });
    }

    // Add user to request object
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        status: 'fail',
        message: 'Invalid token.'
      });
    } else if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        status: 'fail',
        message: 'Token expired.'
      });
    }
    
    console.error('Admin auth error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error during authentication.'
    });
  }
};

module.exports = adminAuth;
