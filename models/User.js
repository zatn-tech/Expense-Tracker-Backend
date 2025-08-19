// models/User.js (Fixed duplicate index issue)
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const userSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: [true, 'Name is required'],
    trim: true,
    minlength: [2, 'Name must be at least 2 characters'],
    maxlength: [50, 'Name cannot exceed 50 characters']
  },
  email: { 
    type: String, 
    required: [true, 'Email is required'], 
    unique: true,  // ✅ Keep this
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
    // ❌ Remove: index: true (if you had this)
  },
  password: { 
    type: String, 
    required: function() {
      return !this.socialAuth.googleId && !this.socialAuth.facebookId && !this.socialAuth.githubId;
    },
    minlength: [6, 'Password must be at least 6 characters']
  },
  
  // Social Authentication
  socialAuth: {
    googleId: String,
    facebookId: String,
    githubId: String,
    provider: { type: String, enum: ['google', 'facebook', 'github'] }
  },
  
  // Security Features
  emailVerified: { type: Boolean, default: false },
  emailVerificationToken: String,
  emailVerificationExpires: Date,
  
  passwordResetToken: String,
  passwordResetExpires: Date,
  passwordChangedAt: Date,
  
  // Account Security
  loginAttempts: { type: Number, default: 0 },
  lockUntil: Date,
  
  // Two-Factor Authentication
  twoFactorEnabled: { type: Boolean, default: false },
  twoFactorSecret: String,
  backupCodes: [String],
  
  // Profile Information
  phone: String,
  dateOfBirth: Date,
  bio: String,
  profilePicture: String,
  
  // App Preferences
  preferences: {
    currency: { type: String, default: 'INR' },
    theme: { type: String, enum: ['light', 'dark', 'system'], default: 'system' },
    balanceDisplay: {
      method: { 
        type: String, 
        enum: ['net_cash_flow', 'total_accounts', 'main_account', 'liquid_balance', 'investment_balance', 'custom_accounts'], 
        default: 'net_cash_flow' 
      },
      customAccountIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Account' }],
      showBreakdown: { type: Boolean, default: true }
    },
    notifications: {
      email: { type: Boolean, default: true },
      push: { type: Boolean, default: true },
      budgetAlerts: { type: Boolean, default: true },
      goalUpdates: { type: Boolean, default: true },
      lowBalanceAlerts: { type: Boolean, default: true }
    },
    language: { type: String, default: 'en' }
  },
  
  // Security Tracking
  lastLogin: Date,
  lastLoginIP: String,
  loginHistory: [{
    ip: String,
    userAgent: String,
    timestamp: { type: Date, default: Date.now },
    location: String
  }],
  
  // Account Status
  isActive: { type: Boolean, default: true },
  deactivatedAt: Date,
  
  // Setup Status
  isSetupComplete: { type: Boolean, default: false },
  
}, {
  timestamps: true
});

// ✅ INDEXES - Define them ONLY here, not in the field definitions
userSchema.index({ email: 1 }, { unique: true }); // Only define once
userSchema.index({ 'socialAuth.googleId': 1 });
userSchema.index({ 'socialAuth.facebookId': 1 });
userSchema.index({ 'socialAuth.githubId': 1 });
userSchema.index({ emailVerificationToken: 1 });
userSchema.index({ passwordResetToken: 1 });

// Virtual for account lock status
userSchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Pre-save middleware to hash password
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    
    if (!this.isNew) {
      this.passwordChangedAt = Date.now() - 1000;
    }
    
    next();
  } catch (error) {
    next(error);
  }
});

// Method to check password
userSchema.methods.correctPassword = async function(candidatePassword, userPassword) {
  return await bcrypt.compare(candidatePassword, userPassword);
};

// Method to check if password changed after JWT was issued
userSchema.methods.changedPasswordAfter = function(JWTTimestamp) {
  if (this.passwordChangedAt) {
    const changedTimestamp = parseInt(this.passwordChangedAt.getTime() / 1000, 10);
    return JWTTimestamp < changedTimestamp;
  }
  return false;
};

// Method to create password reset token
userSchema.methods.createPasswordResetToken = function() {
  const resetToken = crypto.randomBytes(32).toString('hex');
  
  this.passwordResetToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');
    
  this.passwordResetExpires = Date.now() + 10 * 60 * 1000;
  
  return resetToken;
};

// Method to create email verification token
userSchema.methods.createEmailVerificationToken = function() {
  const verificationToken = crypto.randomBytes(32).toString('hex');
  
  this.emailVerificationToken = crypto
    .createHash('sha256')
    .update(verificationToken)
    .digest('hex');
    
  this.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000;
  
  return verificationToken;
};

// Method to handle failed login attempts
userSchema.methods.incLoginAttempts = function() {
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $unset: { lockUntil: 1 },
      $set: { loginAttempts: 1 }
    });
  }
  
  const updates = { $inc: { loginAttempts: 1 } };
  
  if (this.loginAttempts + 1 >= 5 && !this.isLocked) {
    updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 };
  }
  
  return this.updateOne(updates);
};

// Method to reset login attempts
userSchema.methods.resetLoginAttempts = function() {
  return this.updateOne({
    $unset: { loginAttempts: 1, lockUntil: 1 }
  });
};

module.exports = mongoose.model('User', userSchema);
