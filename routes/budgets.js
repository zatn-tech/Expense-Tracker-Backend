const express = require('express');
const router = express.Router();
const Budget = require('../models/Budget');
const Transaction = require('../models/Transaction');
const  auth = require('../middleware/auth');
const validateUserAccess = require('../middleware/validateUserAccess')

// Get all budgets for a user
router.get('/:userId/budgets', auth, validateUserAccess, async (req, res) => {
  try {
    const { userId } = req.params;
    const { type, isActive } = req.query;

    let query = { userId };
    
    if (type) {
      query.type = type;
    }
    
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    const budgets = await Budget.find(query).sort({ createdAt: -1 });
    
    // Calculate current spending for each budget
    const budgetsWithSpending = await Promise.all(
      budgets.map(async (budget) => {
        const budgetObj = budget.toObject();
        
        // Calculate spending for the budget period
        const spending = await calculateBudgetSpending(userId, budget);
        budgetObj.currentSpending = spending;
        budgetObj.remainingAmount = budget.amount - spending;
        budgetObj.usagePercentage = budget.amount > 0 ? ((spending / budget.amount) * 100) : 0;
        budgetObj.isExceeded = spending > budget.amount;
        budgetObj.shouldAlert = budgetObj.usagePercentage >= budget.alertThreshold;
        
        return budgetObj;
      })
    );

    res.json(budgetsWithSpending);
  } catch (error) {
    console.error('Error fetching budgets:', error);
    res.status(500).json({ error: 'Failed to fetch budgets' });
  }
});

// Create a new budget
router.post('/:userId/budgets', auth, validateUserAccess, async (req, res) => {
  try {
    const { userId } = req.params;
    const {
      name,
      type,
      amount,
      category,
      startDate,
      endDate,
      description,
      alertThreshold,
      rollover
    } = req.body;

    // Validate required fields
    if (!name || !type || !amount || !startDate || !endDate) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate category budget
    if (type === 'category' && !category) {
      return res.status(400).json({ error: 'Category is required for category budgets' });
    }

    // Check for overlapping budgets of the same type
    const existingBudget = await Budget.findOne({
      userId,
      type,
      category: type === 'category' ? category : { $exists: false },
      isActive: true,
      $or: [
        {
          startDate: { $lte: new Date(endDate) },
          endDate: { $gte: new Date(startDate) }
        }
      ]
    });

    if (existingBudget) {
      return res.status(400).json({ error: 'Budget already exists for this period and type' });
    }

    const budget = new Budget({
      userId,
      name,
      type,
      amount,
      category: type === 'category' ? category : undefined,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      description,
      alertThreshold: alertThreshold || 80,
      rollover: rollover || false
    });

    await budget.save();
    res.status(201).json(budget);
  } catch (error) {
    console.error('Error creating budget:', error);
    res.status(500).json({ error: 'Failed to create budget' });
  }
});

// Update a budget
router.put('/:userId/budgets/:budgetId', auth, validateUserAccess, async (req, res) => {
  try {
    const { userId, budgetId } = req.params;
    const updateData = req.body;

    const budget = await Budget.findOne({ _id: budgetId, userId });
    
    if (!budget) {
      return res.status(404).json({ error: 'Budget not found' });
    }

    // Check for overlapping budgets if dates are being updated
    if (updateData.startDate || updateData.endDate) {
      const startDate = updateData.startDate ? new Date(updateData.startDate) : budget.startDate;
      const endDate = updateData.endDate ? new Date(updateData.endDate) : budget.endDate;

      const existingBudget = await Budget.findOne({
        userId,
        type: budget.type,
        category: budget.category,
        isActive: true,
        _id: { $ne: budgetId },
        $or: [
          {
            startDate: { $lte: endDate },
            endDate: { $gte: startDate }
          }
        ]
      });

      if (existingBudget) {
        return res.status(400).json({ error: 'Budget already exists for this period and type' });
      }
    }

    Object.assign(budget, updateData);
    await budget.save();

    res.json(budget);
  } catch (error) {
    console.error('Error updating budget:', error);
    res.status(500).json({ error: 'Failed to update budget' });
  }
});

// Delete a budget
router.delete('/:userId/budgets/:budgetId', auth, validateUserAccess, async (req, res) => {
  try {
    const { userId, budgetId } = req.params;
    
    const budget = await Budget.findOneAndDelete({ _id: budgetId, userId });
    
    if (!budget) {
      return res.status(404).json({ error: 'Budget not found' });
    }

    res.json({ message: 'Budget deleted successfully' });
  } catch (error) {
    console.error('Error deleting budget:', error);
    res.status(500).json({ error: 'Failed to delete budget' });
  }
});



// Get budget alerts
router.get('/:userId/budgets/alerts', auth, validateUserAccess, async (req, res) => {
  try {
    const { userId } = req.params;

    const budgets = await Budget.find({
      userId,
      isActive: true
    });

    const alerts = [];

    for (const budget of budgets) {
      const spending = await calculateBudgetSpending(userId, budget);
      const usagePercentage = budget.amount > 0 ? ((spending / budget.amount) * 100) : 0;

      if (usagePercentage >= budget.alertThreshold || spending > budget.amount) {
        alerts.push({
          budgetId: budget._id,
          budgetName: budget.name,
          budgetType: budget.type,
          category: budget.category,
          budgetAmount: budget.amount,
          spentAmount: spending,
          usagePercentage,
          isExceeded: spending > budget.amount,
          alertType: spending > budget.amount ? 'exceeded' : 'threshold',
          message: spending > budget.amount 
            ? `${budget.name} budget has been exceeded by ₹${(spending - budget.amount).toFixed(2)}`
            : `${budget.name} budget is ${usagePercentage.toFixed(1)}% used (${budget.alertThreshold}% threshold)`
        });
      }
    }

    res.json(alerts);
  } catch (error) {
    console.error('Error fetching budget alerts:', error);
    res.status(500).json({ error: 'Failed to fetch budget alerts' });
  }
});

// Get budget statistics
router.get('/:userId/budgets/stats/overview', auth, validateUserAccess, async (req, res) => {
  try {
    const { userId } = req.params;
    const { period = 'current' } = req.query;

    let startDate, endDate;
    const now = new Date();

    switch (period) {
      case 'current':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
      case 'previous':
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), 0);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        endDate = new Date(now.getFullYear(), 11, 31);
        break;
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    }

    // Get active budgets for the period
    const budgets = await Budget.find({
      userId,
      isActive: true,
      startDate: { $lte: endDate },
      endDate: { $gte: startDate }
    });

    // Calculate spending for each budget
    const budgetStats = await Promise.all(
      budgets.map(async (budget) => {
        const spending = await calculateBudgetSpending(userId, budget, startDate, endDate);
        return {
          id: budget._id,
          name: budget.name,
          type: budget.type,
          category: budget.category,
          budgetAmount: budget.amount,
          spentAmount: spending,
          remainingAmount: budget.amount - spending,
          usagePercentage: budget.amount > 0 ? ((spending / budget.amount) * 100) : 0,
          isExceeded: spending > budget.amount,
          shouldAlert: (spending / budget.amount * 100) >= budget.alertThreshold
        };
      })
    );

    // Calculate overall statistics
    const totalBudget = budgets.reduce((sum, budget) => sum + budget.amount, 0);
    const totalSpent = budgetStats.reduce((sum, stat) => sum + stat.spentAmount, 0);
    const totalRemaining = totalBudget - totalSpent;
    const overallUsagePercentage = totalBudget > 0 ? ((totalSpent / totalBudget) * 100) : 0;

    const stats = {
      period,
      startDate,
      endDate,
      totalBudgets: budgets.length,
      totalBudgetAmount: totalBudget,
      totalSpentAmount: totalSpent,
      totalRemainingAmount: totalRemaining,
      overallUsagePercentage,
      budgets: budgetStats,
      alerts: budgetStats.filter(stat => stat.shouldAlert || stat.isExceeded)
    };

    res.json(stats);
  } catch (error) {
    console.error('Error fetching budget stats:', error);
    res.status(500).json({ error: 'Failed to fetch budget statistics' });
  }
});

// Helper function to calculate budget spending
async function calculateBudgetSpending(userId, budget, customStartDate = null, customEndDate = null) {
  const startDate = customStartDate || budget.startDate;
  const endDate = customEndDate || budget.endDate;

  let query = {
    userId,
    type: 'expense',
    transactionDate: {
      $gte: startDate,
      $lte: endDate
    }
  };

  // Add category filter for category budgets
  if (budget.type === 'category' && budget.category) {
    query.category = budget.category;
  }

  const transactions = await Transaction.find(query);
  
  return transactions.reduce((sum, transaction) => {
    return sum + parseFloat(transaction.amount || 0);
  }, 0);
}

// Get a specific budget
router.get('/:userId/budgets/:budgetId', auth, validateUserAccess, async (req, res) => {
  try {
    const { userId, budgetId } = req.params;
    
    const budget = await Budget.findOne({ _id: budgetId, userId });
    
    if (!budget) {
      return res.status(404).json({ error: 'Budget not found' });
    }

    const budgetObj = budget.toObject();
    const spending = await calculateBudgetSpending(userId, budget);
    
    budgetObj.currentSpending = spending;
    budgetObj.remainingAmount = budget.amount - spending;
    budgetObj.usagePercentage = budget.amount > 0 ? ((spending / budget.amount) * 100) : 0;
    budgetObj.isExceeded = spending > budget.amount;
    budgetObj.shouldAlert = budgetObj.usagePercentage >= budget.alertThreshold;

    res.json(budgetObj);
  } catch (error) {
    console.error('Error fetching budget:', error);
    res.status(500).json({ error: 'Failed to fetch budget' });
  }
});

module.exports = router; 