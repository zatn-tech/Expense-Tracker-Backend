const mongoose = require('mongoose');

const accountSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: [true, 'Account name is required'],
    trim: true,
    minlength: [2, 'Account name must be at least 2 characters'],
    maxlength: [50, 'Account name cannot exceed 50 characters']
  },
  type: { 
    type: String, 
    enum: ['checking', 'savings', 'credit', 'investment', 'cash', 'other'],
    default: 'other'
  },
  balance: { 
    type: Number, 
    required: [true, 'Account balance is required'],
    default: 0,
    min: [0, 'Account balance cannot be negative']
  },
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: [true, 'User ID is required'] 
  },
  isDefault: { 
    type: Boolean, 
    default: false 
  },
  isActive: { 
    type: Boolean, 
    default: true 
  },
  description: { 
    type: String, 
    trim: true,
    maxlength: [200, 'Description cannot exceed 200 characters']
  },
  currency: { 
    type: String, 
    default: 'INR' 
  },
  lastReconciled: { 
    type: Date 
  },
  notes: { 
    type: String, 
    trim: true,
    maxlength: [500, 'Notes cannot exceed 500 characters']
  }
}, {
  timestamps: true
});

// Indexes for better query performance
accountSchema.index({ userId: 1, isActive: 1 });
accountSchema.index({ userId: 1, isDefault: 1 });
accountSchema.index({ userId: 1, type: 1 });

// Virtual for formatted balance
accountSchema.virtual('formattedBalance').get(function() {
  return this.balance.toLocaleString('en-IN', { 
    style: 'currency', 
    currency: this.currency 
  });
});

// Ensure only one default account per user
accountSchema.pre('save', async function(next) {
  if (this.isDefault) {
    // Remove default flag from other accounts of the same user
    await this.constructor.updateMany(
      { userId: this.userId, _id: { $ne: this._id } },
      { isDefault: false }
    );
  }
  next();
});

// Instance method to update balance
accountSchema.methods.updateBalance = function(amount) {
  this.balance += amount;
  return this.save();
};

// Static method to get user's default account
accountSchema.statics.getDefaultAccount = function(userId) {
  return this.findOne({ userId, isDefault: true, isActive: true });
};

// Static method to get all active accounts for a user
accountSchema.statics.getUserAccounts = function(userId) {
  return this.find({ userId, isActive: true }).sort({ isDefault: -1, name: 1 });
};

module.exports = mongoose.model('Account', accountSchema); 