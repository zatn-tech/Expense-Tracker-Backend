const mongoose = require('mongoose');

const goalSchema = new mongoose.Schema({
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
  type: {
    type: String,
    enum: ['savings', 'spending_limit', 'debt_payoff', 'income_target'],
    required: true
  },
  targetAmount: {
    type: Number,
    required: true,
    min: 0
  },
  currentAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  startDate: {
    type: Date,
    required: true
  },
  targetDate: {
    type: Date,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isCompleted: {
    type: Boolean,
    default: false
  },
  completedDate: {
    type: Date
  },
  category: {
    type: String,
    required: true
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  color: {
    type: String,
    default: '#3B82F6' // blue
  },
  icon: {
    type: String,
    default: '🎯'
  },
  milestones: [{
    amount: {
      type: Number,
      required: true
    },
    description: {
      type: String,
      required: true
    },
    isCompleted: {
      type: Boolean,
      default: false
    },
    completedDate: {
      type: Date
    }
  }],
  notes: {
    type: String,
    trim: true
  },
  tags: [{
    type: String,
    trim: true
  }]
}, {
  timestamps: true
});

// Index for efficient queries
goalSchema.index({ userId: 1, isActive: 1, type: 1 });
goalSchema.index({ userId: 1, targetDate: 1 });

// Virtual for progress percentage
goalSchema.virtual('progressPercentage').get(function() {
  if (this.targetAmount === 0) return 0;
  return Math.min((this.currentAmount / this.targetAmount) * 100, 100);
});

// Virtual for days remaining
goalSchema.virtual('daysRemaining').get(function() {
  const now = new Date();
  const target = new Date(this.targetDate);
  const diffTime = target - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(diffDays, 0);
});

// Virtual for daily target
goalSchema.virtual('dailyTarget').get(function() {
  const daysRemaining = this.daysRemaining;
  if (daysRemaining <= 0) return 0;
  const remainingAmount = this.targetAmount - this.currentAmount;
  return Math.max(remainingAmount / daysRemaining, 0);
});

// Virtual for status
goalSchema.virtual('status').get(function() {
  if (this.isCompleted) return 'completed';
  if (this.daysRemaining <= 0) return 'overdue';
  if (this.progressPercentage >= 100) return 'achieved';
  if (this.daysRemaining <= 7) return 'urgent';
  if (this.daysRemaining <= 30) return 'upcoming';
  return 'on_track';
});

// Method to update progress
goalSchema.methods.updateProgress = async function(newAmount) {
  const previousAmount = this.currentAmount;
  const previousProgress = this.progressPercentage;
  
  this.currentAmount = Math.max(0, newAmount);
  
  // Check if goal is completed
  if (this.currentAmount >= this.targetAmount && !this.isCompleted) {
    this.isCompleted = true;
    this.completedDate = new Date();
  }
  
  // Update milestones
  this.milestones.forEach(milestone => {
    if (!milestone.isCompleted && this.currentAmount >= milestone.amount) {
      milestone.isCompleted = true;
      milestone.completedDate = new Date();
    }
  });
  
  await this.save();
  
  return this;
};

// Method to add milestone
goalSchema.methods.addMilestone = function(amount, description) {
  this.milestones.push({
    amount,
    description,
    isCompleted: this.currentAmount >= amount,
    completedDate: this.currentAmount >= amount ? new Date() : null
  });
  
  // Sort milestones by amount
  this.milestones.sort((a, b) => a.amount - b.amount);
  
  return this.save();
};

// Method to calculate progress from transactions
goalSchema.methods.calculateProgressFromTransactions = async function() {
  
  const Transaction = require('./Transaction');
  const startDate = new Date(this.startDate);
  const endDate = this.isCompleted ? new Date(this.completedDate) : new Date();
  
  let progress = 0;
  
  // Build base match criteria
  const baseMatch = {
    userId: this.userId,
    transactionDate: { $gte: startDate, $lte: endDate }
  };
  
  // Add category filter if goal has a specific category
  if (this.category) {
    baseMatch.category = this.category;
  } else {
    console.log(`🎯 Goal has no specific category (affects all transactions of relevant type)`);
  }
  
  
  if (this.type === 'savings') {
    // For savings goals, calculate net savings (income - expenses)
    const transactions = await Transaction.find(baseMatch);
    
    const income = transactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);
    
    const expenses = transactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);
    
    // For savings goals, progress is the amount saved (income - expenses)
    // The target amount should be the savings target
    progress = Math.max(income - expenses, 0);
  } else if (this.type === 'spending_limit') {
    // For spending limits, calculate total expenses
    const matchCriteria = {
      ...baseMatch,
      type: 'expense'
    };
    
    
    const expenses = await Transaction.aggregate([
      {
        $match: matchCriteria
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' }
        }
      }
    ]);
    
    progress = expenses.length > 0 ? expenses[0].total : 0;
  } else if (this.type === 'debt_payoff') {
    // For debt payoff, calculate total debt payments
    const matchCriteria = {
      ...baseMatch,
      type: 'expense',
      category: { $regex: /debt|loan|credit/i }
    };
    
    
    const debtPayments = await Transaction.aggregate([
      {
        $match: matchCriteria
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' }
        }
      }
    ]);
    
    progress = debtPayments.length > 0 ? debtPayments[0].total : 0;
  } else if (this.type === 'income_target') {
    // For income targets, calculate total income
    const matchCriteria = {
      ...baseMatch,
      type: 'income'
    };
    
    
    const income = await Transaction.aggregate([
      {
        $match: matchCriteria
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' }
        }
      }
    ]);
    
    progress = income.length > 0 ? income[0].total : 0;
  }
  
  return await this.updateProgress(progress);
};

// Ensure virtual fields are serialized
goalSchema.set('toJSON', { virtuals: true });
goalSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Goal', goalSchema); 