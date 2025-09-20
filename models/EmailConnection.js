const mongoose = require('mongoose');
const crypto = require('crypto');

const emailConnectionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Email provider details
  provider: {
    type: String,
    enum: ['gmail', 'outlook', 'yahoo', 'icloud', 'custom'],
    required: true
  },
  
  // Email address
  email: {
    type: String,
    required: true,
    lowercase: true
  },
  
  // OAuth2 credentials (for Gmail, Outlook)
  oauth2: {
    accessToken: String,
    refreshToken: String,
    expiresAt: Date,
    scope: String
  },
  
  // IMAP/SMTP credentials (for custom providers)
  imap: {
    host: String,
    port: Number,
    secure: Boolean,
    username: String,
    password: String
  },
  
  // Connection status
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Last sync information
  lastSync: Date,
  lastSyncStatus: {
    type: String,
    enum: ['success', 'failed', 'partial'],
    default: 'success'
  },
  
  // Sync settings
  syncSettings: {
    enabled: { type: Boolean, default: true },
    frequency: { type: String, enum: ['hourly', 'daily', 'weekly'], default: 'daily' },
    scanDays: { type: Number, default: 7 }, // How many days back to scan
    maxEmailsPerScan: { type: Number, default: 50 }, // Max emails to scan per session
    autoCreateTransactions: { type: Boolean, default: false }, // Auto-create or suggest
    categories: [String], // Preferred categories for auto-categorization
    minAmount: { type: Number, default: 0 }, // Minimum amount to consider
    maxAmount: { type: Number, default: 1000000 }, // Maximum amount to consider
    scanKeywords: {
      success: { type: [String], default: ['successful', 'completed', 'confirmed', 'approved', 'success', 'successfully'] },
      failure: { type: [String], default: ['failed', 'declined', 'rejected', 'unsuccessful', 'error', 'cancelled', 'cancelled'] },
      pending: { type: [String], default: ['pending', 'processing', 'in progress', 'awaiting', 'pending approval'] }
    }
  },
  
  // Error tracking
  lastError: {
    message: String,
    timestamp: Date,
    retryCount: { type: Number, default: 0 }
  },
  
  // Security
  encryptionKey: String, // For encrypting sensitive data
  
  // System fields
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

// Indexes
emailConnectionSchema.index({ userId: 1, email: 1 });
emailConnectionSchema.index({ userId: 1, isActive: 1 });

// Encryption key (in production, this should be stored securely)
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'your-secret-encryption-key-32-chars-long!!';

// Encrypt sensitive data before saving
emailConnectionSchema.pre('save', function(next) {
  // Ensure IMAP settings have proper defaults
  if (this.provider === 'custom' && this.imap) {
    if (this.imap.secure === undefined) {
      this.imap.secure = true; // Default to secure for most email providers
    }
    if (!this.imap.port) {
      this.imap.port = this.imap.secure ? 993 : 143;
    }
  }
  
  // Encrypt sensitive data
  if (this.isModified('oauth2.refreshToken') || this.isModified('imap.password')) {
    if (this.oauth2.refreshToken) {
      this.oauth2.refreshToken = this.encrypt(this.oauth2.refreshToken);
    }
    if (this.imap.password) {
      this.imap.password = this.encrypt(this.imap.password);
    }
  }
  next();
});

// Instance methods for encryption/decryption
emailConnectionSchema.methods.encrypt = function(text) {
  if (!text) return text;
  const iv = crypto.randomBytes(16);
  // Use createCipheriv with proper key derivation
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
};

emailConnectionSchema.methods.decrypt = function(encryptedText) {
  if (!encryptedText) return encryptedText;
  
  // Check if this is a legacy SHA-256 hash (64 characters, hex only)
  if (encryptedText.length === 64 && /^[a-f0-9]+$/i.test(encryptedText)) {
    console.log('⚠️  Legacy SHA-256 hash detected. Password cannot be recovered.');
    throw new Error('Legacy SHA-256 hash detected. Password cannot be recovered. Please recreate the connection with the correct password.');
  }
  
  try {
    const textParts = encryptedText.split(':');
    const iv = Buffer.from(textParts.shift(), 'hex');
    const encrypted = textParts.join(':');
    // Use createDecipheriv with proper key derivation
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt password. Please check your connection settings.');
  }
};

// Static methods
emailConnectionSchema.statics.getUserConnections = function(userId) {
  return this.find({ userId, isActive: true });
};

emailConnectionSchema.statics.getActiveConnections = function() {
  return this.find({ isActive: true, 'syncSettings.enabled': true });
};

// Instance methods
emailConnectionSchema.methods.updateLastSync = function(status = 'success') {
  this.lastSync = new Date();
  this.lastSyncStatus = status;
  return this.save();
};

emailConnectionSchema.methods.recordError = function(errorMessage) {
  this.lastError = {
    message: errorMessage,
    timestamp: new Date(),
    retryCount: this.lastError ? this.lastError.retryCount + 1 : 1
  };
  return this.save();
};

module.exports = mongoose.model('EmailConnection', emailConnectionSchema); 