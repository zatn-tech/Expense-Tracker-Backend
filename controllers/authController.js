// controllers/authController.js
const crypto = require('crypto');
const { promisify } = require('util');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const Email = require('../utils/email');
const { validationResult } = require('express-validator');

const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};



const createSendToken = (user, statusCode, req, res) => {
  const token = signToken(user._id);
  
  const cookieOptions = {
    expires: new Date(
      Date.now() + process.env.JWT_COOKIE_EXPIRES_IN * 24 * 60 * 60 * 1000
    ),
    httpOnly: true,
    secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
    sameSite: 'strict'
  };

  res.cookie('jwt', token, cookieOptions);

  // Remove password from output
  user.password = undefined;
  user.loginAttempts = undefined;
  user.lockUntil = undefined;

  res.status(statusCode).json({
    status: 'success',
    token,
    data: {
      user
    }
  });
};

const signup = catchAsync(async (req, res, next) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new AppError('Invalid input data', 400, errors.array()));
  }

  const { name, email, password, passwordConfirm } = req.body;

  // Check if passwords match
  if (password !== passwordConfirm) {
    return next(new AppError('Passwords do not match', 400));
  }

  // Check if user already exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return next(new AppError('User with this email already exists', 409));
  }

  // Create new user
  const newUser = await User.create({
    name,
    email,
    password,
    isSetupComplete: false
  });

  // Generate email verification token
  const verifyToken = newUser.createEmailVerificationToken();
  await newUser.save({ validateBeforeSave: false });

  // Send verification email
  // In controllers/authController.js, inside the signup catch block:

try {
  const verifyURL = `${req.protocol}://${req.get(
    'host'
  )}/api/auth/verify-email/${verifyToken}`;

  await new Email(newUser, verifyURL).sendWelcome();

  res.status(201).json({
    status: 'success',
    message: 'User registered successfully! Please check your email to verify your account.'
  });
} catch (err) {
  console.error('Email send error:', err);    // ← Add this line
  newUser.emailVerificationToken = undefined;
  newUser.emailVerificationExpires = undefined;
  await newUser.save({ validateBeforeSave: false });

  return next(
    new AppError('There was an error sending the email. Please try again later.', 500)
  );
}

});

const login = catchAsync(async (req, res, next) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new AppError('Invalid input data', 400, errors.array()));
  }

  const { email, password } = req.body;

  // Check if email and password exist
  if (!email || !password) {
    return next(new AppError('Please provide email and password', 400));
  }

  // Check if user exists and password is correct
  const user = await User.findOne({ email }).select('+password +loginAttempts +lockUntil');

  // Check if account is locked
  if (user && user.isLocked) {
    return next(new AppError('Account temporarily locked due to too many failed login attempts. Please try again later.', 423));
  }

  if (!user || !(await user.correctPassword(password, user.password))) {
    if (user) {
      await user.incLoginAttempts();
    }
    return next(new AppError('Invalid credentials', 401));
  }

  // Check if email is verified
  if (!user.emailVerified) {
    return next(new AppError('Please verify your email before logging in', 401));
  }

  // Check if account is active
  if (!user.isActive) {
    return next(new AppError('Your account has been deactivated. Please contact support.', 401));
  }

  // Reset login attempts on successful login
  if (user.loginAttempts > 0) {
    await user.resetLoginAttempts();
  }

  // Update login information
  user.lastLogin = new Date();
  user.lastLoginIP = req.ip || req.connection.remoteAddress;
  
  // Add to login history
  user.loginHistory.push({
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('User-Agent'),
    timestamp: new Date()
  });

  // Keep only last 10 login records
  if (user.loginHistory.length > 10) {
    user.loginHistory = user.loginHistory.slice(-10);
  }

  await user.save({ validateBeforeSave: false });

  // Send token to client
  createSendToken(user, 200, req, res);
});

const logout = (req, res) => {
  res.cookie('jwt', 'loggedout', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true
  });
  res.status(200).json({ status: 'success' });
};

const protect = catchAsync(async (req, res, next) => {
  // 1) Getting token and check if it's there
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies.jwt) {
    token = req.cookies.jwt;
  }

  if (!token) {
    return next(
      new AppError('You are not logged in! Please log in to get access.', 401)
    );
  }

  // 2) Verification token
  const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);

  // 3) Check if user still exists
  const currentUser = await User.findById(decoded.id);
  if (!currentUser) {
    return next(
      new AppError('The user belonging to this token does no longer exist.', 401)
    );
  }

  // 4) Check if user changed password after the token was issued
  if (currentUser.changedPasswordAfter(decoded.iat)) {
    return next(
      new AppError('User recently changed password! Please log in again.', 401)
    );
  }

  // 5) Check if account is active
  if (!currentUser.isActive) {
    return next(new AppError('Your account has been deactivated.', 401));
  }

  // Grant access to protected route
  req.user = currentUser;
  next();
});

const forgotPassword = catchAsync(async (req, res, next) => {
  // 1) Get user based on POSTed email
  const user = await User.findOne({ email: req.body.email });
  if (!user) {
    return next(new AppError('There is no user with that email address.', 404));
  }

  // 2) Generate the random reset token
  const resetToken = user.createPasswordResetToken();
  await user.save({ validateBeforeSave: false });

  // 3) Send it to user's email
  try {
    const resetURL = `${req.protocol}://${req.get(
      'host'
    )}/reset-password/${resetToken}`;

    await new Email(user, resetURL).sendPasswordReset();

    res.status(200).json({
      status: 'success',
      message: 'Password reset link sent to email!'
    });
  } catch (err) {
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save({ validateBeforeSave: false });

    return next(
      new AppError('There was an error sending the email. Try again later.', 500)
    );
  }
});

const resetPassword = catchAsync(async (req, res, next) => {
  // 1) Get user based on the token
  const hashedToken = crypto
    .createHash('sha256')
    .update(req.params.token)
    .digest('hex');

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() }
  });

  // 2) If token has not expired, and there is user, set the new password
  if (!user) {
    return next(new AppError('Token is invalid or has expired', 400));
  }

  const { password, passwordConfirm } = req.body;

  if (password !== passwordConfirm) {
    return next(new AppError('Passwords do not match', 400));
  }

  user.password = password;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save();

  // 3) Update changedPasswordAt property for the user (done in pre-save middleware)

  // 4) Log the user in, send JWT
  createSendToken(user, 200, req, res);
});

const updatePassword = catchAsync(async (req, res, next) => {
  // 1) Get user from collection
  const user = await User.findById(req.user.id).select('+password');

  // 2) Check if POSTed password is correct
  if (!(await user.correctPassword(req.body.passwordCurrent, user.password))) {
    return next(new AppError('Your current password is incorrect.', 401));
  }

  // 3) Check if new passwords match
  if (req.body.password !== req.body.passwordConfirm) {
    return next(new AppError('New passwords do not match', 400));
  }

  // 4) If so, update password
  user.password = req.body.password;
  await user.save();

  // 5) Log user in, send JWT
  createSendToken(user, 200, req, res);
});

const verifyEmail = catchAsync(async (req, res, next) => {
  // 1) Get user based on the token
  const hashedToken = crypto
    .createHash('sha256')
    .update(req.params.token)
    .digest('hex');

  const user = await User.findOne({
    emailVerificationToken: hashedToken,
    emailVerificationExpires: { $gt: Date.now() }
  });

  // 2) If token has not expired, and there is user, verify email
  if (!user) {
    return next(new AppError('Token is invalid or has expired', 400));
  }

  user.emailVerified = true;
  user.emailVerificationToken = undefined;
  user.emailVerificationExpires = undefined;
  await user.save({ validateBeforeSave: false });

  res.status(200).json({
    status: 'success',
    message: 'Email verified successfully! You can now log in.'
  });
});

const resendVerificationEmail = catchAsync(async (req, res, next) => {
  const user = await User.findOne({ email: req.body.email });
  
  if (!user) {
    return next(new AppError('No user found with that email address.', 404));
  }

  if (user.emailVerified) {
    return next(new AppError('Email is already verified.', 400));
  }

  // Generate new verification token
  const verifyToken = user.createEmailVerificationToken();
  await user.save({ validateBeforeSave: false });

  // Send verification email
  try {
    const verifyURL = `${req.protocol}://${req.get(
      'host'
    )}/api/auth/verify-email/${verifyToken}`;

    await new Email(user, verifyURL).sendEmailVerification();

    res.status(200).json({
      status: 'success',
      message: 'Verification email sent!'
    });
  } catch (err) {
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save({ validateBeforeSave: false });

    return next(
      new AppError('There was an error sending the email. Try again later.', 500)
    );
  }
});

module.exports = {
  signup,
  login,
  logout,
  protect,
  forgotPassword,
  resetPassword,
  updatePassword,
  verifyEmail,
  resendVerificationEmail
};
