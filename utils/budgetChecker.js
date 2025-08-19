const Budget = require('../models/Budget');
const Transaction = require('../models/Transaction');
const { sendNotificationToUser } = require('../controllers/notifications');

// Calculate spending for a specific budget
const calculateBudgetSpending = async (userId, budget) => {
  const startDate = budget.startDate;
  const endDate = budget.endDate;
  
  let query = {
    userId,
    type: 'expense',
    transactionDate: {
      $gte: startDate,
      $lte: endDate
    }
  };

  // If it's a category budget, filter by category
  if (budget.type === 'category' && budget.category) {
    query.category = budget.category;
  }

  const transactions = await Transaction.find(query);
  return transactions.reduce((total, transaction) => total + transaction.amount, 0);
};

// Check if a transaction exceeds any budgets
const checkBudgetAlerts = async (userId, transaction, isDeletion = false) => {
  try {
    // Only check for expense transactions
    if (transaction.type !== 'expense') {
      return [];
    }

    // Get all active budgets for the user
    const budgets = await Budget.find({
      userId,
      isActive: true
    });

    const alerts = [];

    for (const budget of budgets) {
      // Calculate current spending for this budget
      const spending = await calculateBudgetSpending(userId, budget);
      const usagePercentage = budget.amount > 0 ? ((spending / budget.amount) * 100) : 0;

      // Check if budget is exceeded or threshold is reached
      if (spending > budget.amount || usagePercentage >= budget.alertThreshold) {
        const excessAmount = spending > budget.amount ? (spending - budget.amount) : 0;
        
        alerts.push({
          budgetId: budget._id,
          budgetName: budget.name,
          budgetType: budget.type,
          category: budget.category,
          budgetAmount: budget.amount,
          spentAmount: spending,
          usagePercentage,
          isExceeded: spending > budget.amount,
          excessAmount,
          alertType: spending > budget.amount ? 'exceeded' : 'threshold'
        });
      }
    }

    // Send notifications for each alert
    for (const alert of alerts) {
      const title = alert.isExceeded ? 'Budget Exceeded!' : 'Budget Alert';
      const body = alert.isExceeded 
        ? `You've exceeded your ${alert.budgetName} budget by ₹${alert.excessAmount.toFixed(2)}`
        : `Your ${alert.budgetName} budget is ${alert.usagePercentage.toFixed(1)}% used`;

      await sendNotificationToUser(userId, {
        type: 'budgetAlerts',
        title,
        body,
        data: {
          url: '/budgets',
          budgetId: alert.budgetId,
          alertType: alert.alertType
        }
      });
    }

    return alerts;
  } catch (error) {
    console.error('Error checking budget alerts:', error);
    return [];
  }
};

module.exports = {
  calculateBudgetSpending,
  checkBudgetAlerts
}; 