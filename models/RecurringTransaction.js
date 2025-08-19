const mongoose = require('mongoose');

const recurringTransactionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  type: {
    type: String,
    enum: ['income', 'expense'],
    required: true
  },
  category: {
    type: String,
    required: true
  },
  paymentMethod: {
    type: String,
    default: 'cash'
  },
  frequency: {
    type: String,
    enum: ['daily', 'weekly', 'monthly', 'yearly', 'custom'],
    required: true
  },
  interval: {
    type: Number,
    default: 1,
    min: 1
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date
  },
  nextDueDate: {
    type: Date,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastProcessed: {
    type: Date
  },
  totalOccurrences: {
    type: Number,
    default: 0
  },
  maxOccurrences: {
    type: Number
  },
  tags: [{
    type: String,
    trim: true
  }],
  notes: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// Index for efficient queries
recurringTransactionSchema.index({ userId: 1, isActive: 1, nextDueDate: 1 });

// Method to calculate next due date
recurringTransactionSchema.methods.calculateNextDueDate = function() {
  const now = new Date();
  let nextDate = new Date(this.nextDueDate || this.startDate);
  
  while (nextDate <= now) {
    switch (this.frequency) {
      case 'daily':
        nextDate.setDate(nextDate.getDate() + this.interval);
        break;
      case 'weekly':
        nextDate.setDate(nextDate.getDate() + (7 * this.interval));
        break;
      case 'monthly':
        nextDate.setMonth(nextDate.getMonth() + this.interval);
        break;
      case 'yearly':
        nextDate.setFullYear(nextDate.getFullYear() + this.interval);
        break;
      default:
        return nextDate;
    }
  }
  
  return nextDate;
};

// Method to check if recurring transaction should be processed
recurringTransactionSchema.methods.shouldProcess = function() {
  if (!this.isActive) return false;
  
  const now = new Date();
  const nextDue = new Date(this.nextDueDate);
  
  // Check if it's due today or overdue
  const isDue = nextDue <= now;
  
  // Check if we have an end date and if we've passed it
  if (this.endDate && now > this.endDate) return false;
  
  // Check if we've reached max occurrences
  if (this.maxOccurrences && this.totalOccurrences >= this.maxOccurrences) return false;
  
  return isDue;
};

// Method to process the recurring transaction
recurringTransactionSchema.methods.process = function() {
  if (!this.shouldProcess()) return null;
  
  const transactionData = {
    userId: this.userId,
    amount: this.amount,
    type: this.type,
    category: this.category,
    description: this.description,
    paymentMethod: this.paymentMethod,
    transactionDate: new Date(),
    tags: this.tags,
    notes: this.notes,
    isRecurring: true,
    recurringTransactionId: this._id
  };
  
  // Update the recurring transaction
  this.lastProcessed = new Date();
  this.totalOccurrences += 1;
  this.nextDueDate = this.calculateNextDueDate();
  
  return transactionData;
};

module.exports = mongoose.model('RecurringTransaction', recurringTransactionSchema); 