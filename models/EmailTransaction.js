const mongoose = require('mongoose');

const emailTransactionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  emailConnectionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'EmailConnection',
    required: true
  },
  
  // Email details
  emailId: {
    type: String,
    required: true
  },
  
  emailSubject: String,
  emailFrom: String,
  emailDate: Date,
  
  // Detected transaction details
  detectedAmount: {
    type: Number,
    required: true
  },
  
  detectedType: {
    type: String,
    enum: ['income', 'expense', 'transfer'],
    required: true
  },
  
  detectedCategory: String,
  detectedDescription: String,
  detectedDate: Date,
  
  // Confidence scores (0-100)
  confidence: {
    amount: { type: Number, min: 0, max: 100, default: 0 },
    category: { type: Number, min: 0, max: 100, default: 0 },
    description: { type: Number, min: 0, max: 100, default: 0 },
    overall: { type: Number, min: 0, max: 100, default: 0 }
  },
  
  // Raw email content for debugging
  rawContent: String,
  
  // Parsing metadata
  parsingData: {
    amountPatterns: [String], // Regex patterns that matched
    categoryKeywords: [String], // Keywords that suggested category
    datePatterns: [String], // Date patterns found
    merchantNames: [String], // Potential merchant names
    transactionTypes: [String] // Transaction type indicators
  },
  
  // User actions
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'modified', 'auto_created'],
    default: 'pending'
  },
  
  userNotes: String,
  
  // If user modified the transaction
  modifiedData: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  
  // If transaction was created
  createdTransactionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transaction'
  },
  
  // Processing flags
  isProcessed: { type: Boolean, default: false },
  processedAt: Date,
  
  // System fields
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

// Indexes
emailTransactionSchema.index({ userId: 1, status: 1 });
emailTransactionSchema.index({ userId: 1, emailConnectionId: 1 });
// Remove unique constraint on emailId - multiple transactions can come from same email
emailTransactionSchema.index({ emailId: 1 });
// Add composite unique constraint to prevent exact duplicates
emailTransactionSchema.index({ 
  userId: 1, 
  emailId: 1, 
  detectedAmount: 1, 
  detectedDate: 1, 
  detectedType: 1 
}, { unique: true });
emailTransactionSchema.index({ createdAt: -1 });

// Static methods
emailTransactionSchema.statics.getPendingTransactions = function(userId) {
  return this.find({ userId, status: 'pending' }).sort({ createdAt: -1 });
};

emailTransactionSchema.statics.getProcessedTransactions = function(userId, limit = 50) {
  return this.find({ userId, isProcessed: true })
    .sort({ processedAt: -1 })
    .limit(limit);
};

emailTransactionSchema.statics.getByEmailId = function(emailId) {
  return this.findOne({ emailId });
};

// Check if transaction already exists (for duplicate prevention)
emailTransactionSchema.statics.checkForDuplicate = async function(userId, emailId, amount, date, type) {
  // Check for exact duplicates using composite unique constraint
  const existingTransaction = await this.findOne({ 
    userId,
    emailId,
    detectedAmount: amount,
    detectedDate: {
      $gte: new Date(date.getFullYear(), date.getMonth(), date.getDate()),
      $lt: new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)
    },
    detectedType: type
  });
  
  return existingTransaction;
};

// Check if email has been processed before (for tracking purposes)
emailTransactionSchema.statics.getEmailTransactions = function(userId, emailId) {
  return this.find({ userId, emailId }).sort({ createdAt: -1 });
};

// Instance methods
emailTransactionSchema.methods.approve = function(accountId) {
  this.status = 'approved';
  this.isProcessed = true;
  this.processedAt = new Date();
  
  // Use markModified to tell Mongoose this field has changed
  this.markModified('modifiedData');
  
  // Set the accountId in modifiedData
  if (!this.modifiedData) {
    this.modifiedData = {};
  }
  this.modifiedData.accountId = accountId;
  
  return this.save();
};

emailTransactionSchema.methods.reject = function() {
  this.status = 'rejected';
  this.isProcessed = true;
  this.processedAt = new Date();
  return this.save();
};

emailTransactionSchema.methods.modify = function(modifiedData) {
  this.status = 'modified';
  this.isProcessed = true;
  this.processedAt = new Date();
  
  // Use markModified to tell Mongoose this field has changed
  this.markModified('modifiedData');
  
  // Ensure modifiedData exists and merge with new data
  if (!this.modifiedData) {
    this.modifiedData = {};
  }
  
  this.modifiedData = { ...this.modifiedData, ...modifiedData };
  
  return this.save();
};

emailTransactionSchema.methods.autoCreate = function(transactionId) {
  this.status = 'auto_created';
  this.createdTransactionId = transactionId;
  this.isProcessed = true;
  this.processedAt = new Date();
  return this.save();
};

// Pre-save middleware to ensure modifiedData exists
emailTransactionSchema.pre('save', function(next) {
  // Ensure modifiedData exists
  if (!this.modifiedData) {
    this.modifiedData = {};
  }
  
  // Update the updatedAt field
  this.updatedAt = new Date();
  next();
});

// Calculate overall confidence score
emailTransactionSchema.methods.calculateOverallConfidence = function() {
  const weights = { amount: 0.4, category: 0.3, description: 0.3 };
  this.confidence.overall = Math.round(
    (this.confidence.amount * weights.amount) +
    (this.confidence.category * weights.category) +
    (this.confidence.description * weights.description)
  );
  return this.confidence.overall;
};

module.exports = mongoose.model('EmailTransaction', emailTransactionSchema); 