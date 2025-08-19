// middleware/validateUserAccess.js
const AppError = require('../utils/appError');

const validateUserAccess = (req, res, next) => {
  // Check if the user is trying to access their own data
  const requestedUserId = req.params.userId;
  const currentUserId = req.user.id || req.user._id;

  // Convert both to strings for comparison
  const requestedUserIdStr = String(requestedUserId);
  const currentUserIdStr = String(currentUserId);

  if (requestedUserIdStr !== currentUserIdStr) {
    return next(new AppError('You can only access your own data', 403));
  }

  next();
};

module.exports = validateUserAccess;
