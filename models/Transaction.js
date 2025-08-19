const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  accountId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Account', 
    required: true 
  },
  amount: { 
    type: Number, 
    required: true,
    min: 0.01
  },
  type: { 
    type: String, 
    enum: ['income', 'expense', 'transfer'], 
    required: true 
  },
  category: { 
    type: String, 
    required: true 
  },
  description: { 
    type: String, 
    default: '' 
  },
  
  // Enhanced Date Fields
  transactionDate: { 
    type: Date, 
    required: true,
    default: Date.now // User can override this
  },
  
  // Additional metadata
  tags: [{ type: String }], // Optional tags like "urgent", "planned", etc.
  
  location: {
    name: String,
    coordinates: {
      latitude: Number,
      longitude: Number
    }
  },
  
  // Payment method
  paymentMethod: {
    type: String,
    enum: ['cash', 'card', 'upi', 'bank_transfer', 'transfer', 'other'],
    default: 'cash'
  },
  
  // Transfer-related fields
  transferId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transfer',
    required: function() { return this.type === 'transfer'; }
  },
  transferType: {
    type: String,
    enum: ['incoming', 'outgoing'],
    required: function() { return this.type === 'transfer'; }
  },
  
  // Recurring transaction info
  isRecurring: { type: Boolean, default: false },
  recurringPattern: {
    frequency: {
      type: String,
      enum: ['daily', 'weekly', 'monthly', 'yearly']
    },
    interval: { type: Number, default: 1 }, // Every X days/weeks/months
    endDate: Date
  },
  
  // Attachments (receipts, etc.)
  attachments: [{
    filename: String,
    url: String,
    uploadDate: { type: Date, default: Date.now }
  }],
  
  // Import tracking
  importId: { type: String }, // To track transactions from the same import batch
  
  // System timestamps (different from transaction date)
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, {
  timestamps: true // This adds createdAt and updatedAt automatically
});

// Indexes for better query performance
transactionSchema.index({ userId: 1, transactionDate: -1 });
transactionSchema.index({ userId: 1, type: 1, transactionDate: -1 });
transactionSchema.index({ userId: 1, category: 1, transactionDate: -1 });
transactionSchema.index({ accountId: 1, transactionDate: -1 });
transactionSchema.index({ userId: 1, accountId: 1 });

// Virtual for formatted date
transactionSchema.virtual('formattedDate').get(function() {
  return this.transactionDate.toLocaleDateString('en-IN');
});

// Pre-save middleware to update the updatedAt field
transactionSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Post-save middleware to update account balance
transactionSchema.post('save', async function(doc) {
  try {
    // Skip balance updates for transfer transactions since they're handled manually
    if (doc.type === 'transfer') {
      return;
    }
    
    const Account = mongoose.model('Account');
    const account = await Account.findById(doc.accountId);
    
    if (account) {
      // Update account balance based on transaction type
      const balanceChange = doc.type === 'income' ? doc.amount : -doc.amount;
      await account.updateBalance(balanceChange);
    }
  } catch (error) {
    console.error('Error updating account balance:', error);
  }
});

// Static method to safely delete a transaction with balance reversion
transactionSchema.statics.safeDelete = async function(transactionId) {
  const transaction = await this.findById(transactionId);
  if (!transaction) {
    throw new Error('Transaction not found');
  }
  
  // Skip balance updates for transfer transactions since they're handled manually
  if (transaction.type !== 'transfer') {
    const Account = mongoose.model('Account');
    const account = await Account.findById(transaction.accountId);
    
    if (account) {
      // Reverse the balance change when transaction is deleted
      const balanceChange = transaction.type === 'income' ? -transaction.amount : transaction.amount;
      await account.updateBalance(balanceChange);
      console.log(`✅ Reverted balance change for deleted transaction: ${balanceChange > 0 ? '+' : ''}₹${balanceChange} (${transaction.type})`);
    }
  }
  
  // Delete the transaction
  return this.findByIdAndDelete(transactionId);
};

// Post-delete middleware to update account balance when transaction is deleted
// Using modern Mongoose 8+ hooks
transactionSchema.post('deleteOne', { document: true, query: false }, async function(doc) {
  try {
    // Skip balance updates for transfer transactions since they're handled manually
    if (doc.type === 'transfer') {
      return;
    }
    
    const Account = mongoose.model('Account');
    const account = await Account.findById(doc.accountId);
    
    if (account) {
      // Reverse the balance change when transaction is deleted
      const balanceChange = doc.type === 'income' ? -doc.amount : doc.amount;
      await account.updateBalance(balanceChange);
      console.log(`✅ Reverted balance change for deleted transaction: ${balanceChange > 0 ? '+' : ''}₹${balanceChange} (${doc.type})`);
    }
  } catch (error) {
    console.error('Error updating account balance after deletion:', error);
  }
});

// Post-deleteMany middleware for bulk deletions
transactionSchema.post('deleteMany', async function(result) {
  try {
    // This hook doesn't have access to individual documents
    // Balance reversion should be handled in the controller for bulk operations
    console.log(`🗑️  Bulk deleted ${result.deletedCount} transactions`);
  } catch (error) {
    console.error('Error in deleteMany hook:', error);
  }
});

module.exports = mongoose.model('Transaction', transactionSchema);
