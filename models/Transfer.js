const mongoose = require('mongoose');

const transferSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  fromAccountId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Account',
    required: true
  },
  toAccountId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Account',
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0.01
  },
  description: {
    type: String,
    default: ''
  },
  transferDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  notes: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'cancelled', 'failed'],
    default: 'pending'
  },
  // Metadata for tracking
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

// Indexes for better query performance
transferSchema.index({ userId: 1, transferDate: -1 });
transferSchema.index({ userId: 1, status: 1 });
transferSchema.index({ fromAccountId: 1, transferDate: -1 });
transferSchema.index({ toAccountId: 1, transferDate: -1 });

// Virtual for formatted date
transferSchema.virtual('formattedDate').get(function() {
  return this.transferDate.toLocaleDateString('en-IN');
});

// Pre-save middleware to update the updatedAt field
transferSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Static method to get user transfers
transferSchema.statics.getUserTransfers = async function(userId, options = {}) {
  const { limit = 50, skip = 0, status, startDate, endDate } = options;
  
  let query = { userId };
  
  if (status) query.status = status;
  if (startDate || endDate) {
    query.transferDate = {};
    if (startDate) query.transferDate.$gte = new Date(startDate);
    if (endDate) query.transferDate.$lte = new Date(endDate);
  }
  
  return await this.find(query)
    .populate('fromAccountId', 'name type currency')
    .populate('toAccountId', 'name type currency')
    .sort({ transferDate: -1 })
    .skip(skip)
    .limit(limit);
};

// Static method to get transfer statistics
transferSchema.statics.getTransferStats = async function(userId, period = 'month') {
  const now = new Date();
  let startDate;
  
  switch (period) {
    case 'week':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case 'month':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case 'year':
      startDate = new Date(now.getFullYear(), 0, 1);
      break;
    default:
      startDate = new Date(0);
  }
  
  const transfers = await this.find({
    userId,
    transferDate: { $gte: startDate },
    status: 'completed'
  });
  
  const totalAmount = transfers.reduce((sum, transfer) => sum + transfer.amount, 0);
  const totalTransfers = transfers.length;
  
  return {
    totalAmount,
    totalTransfers,
    averageAmount: totalTransfers > 0 ? totalAmount / totalTransfers : 0
  };
};

module.exports = mongoose.model('Transfer', transferSchema); 