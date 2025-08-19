const mongoose = require('mongoose');

const budgetSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    enum: ['monthly', 'yearly', 'category', 'custom'],
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  category: {
    type: String,
    required: function() {
      return this.type === 'category';
    }
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  description: {
    type: String,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  alertThreshold: {
    type: Number,
    min: 0,
    max: 100,
    default: 80 // Alert when 80% of budget is used
  },
  rollover: {
    type: Boolean,
    default: false // Whether unused budget rolls over to next period
  },
  rolloverAmount: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for efficient queries
budgetSchema.index({ userId: 1, type: 1, isActive: 1 });
budgetSchema.index({ userId: 1, category: 1, isActive: 1 });
budgetSchema.index({ userId: 1, startDate: 1, endDate: 1 });

// Virtual for calculating remaining budget
budgetSchema.virtual('remainingAmount').get(function() {
  return this.amount - this.rolloverAmount;
});

// Virtual for calculating usage percentage
budgetSchema.virtual('usagePercentage').get(function() {
  return this.amount > 0 ? ((this.rolloverAmount / this.amount) * 100) : 0;
});

// Method to check if budget is exceeded
budgetSchema.methods.isExceeded = function() {
  return this.rolloverAmount > this.amount;
};

// Method to check if alert should be triggered
budgetSchema.methods.shouldAlert = function() {
  return this.usagePercentage >= this.alertThreshold;
};

// Pre-save middleware to update updatedAt
budgetSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Budget', budgetSchema); 