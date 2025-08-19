const Goal = require('../models/Goal');
const Budget = require('../models/Budget');
const { checkBudgetAlerts } = require('./budgetChecker');
const { triggerGoalUpdate } = require('./notificationTriggers');

/**
 * Updates all dependent models when a transaction is added, updated, or deleted
 * @param {string} userId - The user ID
 * @param {Object} transaction - The transaction object (null for deletion)
 * @param {string} operation - 'add', 'update', or 'delete'
 * @param {Object} oldTransaction - The old transaction data (for updates/deletions)
 * @returns {Object} - Results of all updates
 */
const updateDependentModels = async (userId, transaction, operation, oldTransaction = null) => {
  const results = {
    budgetAlerts: [],
    goalUpdates: [],
    goalNotifications: []
  };

  try {
    // Update budgets
    if (operation === 'add' || operation === 'update') {
      const budgetAlerts = await checkBudgetAlerts(userId, transaction);
      results.budgetAlerts = budgetAlerts;
    } else if (operation === 'delete' && oldTransaction) {
      // For deletion, we need to recalculate budgets without this transaction
      const budgetAlerts = await checkBudgetAlerts(userId, oldTransaction, true); // true = deletion mode
      results.budgetAlerts = budgetAlerts;
    }

    // Update goals
    const userGoals = await Goal.find({ 
      userId: userId, 
      isActive: true,
      isCompleted: false 
    });
    
    console.log(`🎯 Found ${userGoals.length} active goals for user ${userId}`);
    
    for (const goal of userGoals) {
      try {
        // Check if this transaction affects this goal
        let shouldUpdate = false;
        
        console.log(`🔍 Checking if transaction affects goal: ${goal.title} (${goal.type})`);
        
        if (operation === 'add' || operation === 'update') {
          if (goal.category && goal.category === transaction.category) {
            // Goal has specific category and transaction matches
            shouldUpdate = true;
            console.log(`✅ Goal has specific category and transaction matches: ${transaction.category}`);
          } else if (!goal.category) {
            // Goal has no specific category, check by type
            if (goal.type === 'savings') {
              // Savings goals are affected by all transactions
              shouldUpdate = true;
              console.log(`✅ Savings goal affected by all transactions`);
            } else if (goal.type === 'spending_limit' && transaction.type === 'expense') {
              // Spending limit goals are affected by expenses
              shouldUpdate = true;
              console.log(`✅ Spending limit goal affected by expense transaction`);
            } else if (goal.type === 'debt_payoff' && transaction.type === 'expense' && 
                      /debt|loan|credit/i.test(transaction.category)) {
              // Debt payoff goals are affected by debt-related expenses
              shouldUpdate = true;
              console.log(`✅ Debt payoff goal affected by debt-related expense: ${transaction.category}`);
            } else if (goal.type === 'income_target' && transaction.type === 'income') {
              // Income target goals are affected by income
              shouldUpdate = true;
              console.log(`✅ Income target goal affected by income transaction`);
            }
          }
        } else if (operation === 'delete' && oldTransaction) {
          // For deletion, check if the deleted transaction affected this goal
          if (goal.category && goal.category === oldTransaction.category) {
            shouldUpdate = true;
            console.log(`✅ Goal has specific category and deleted transaction matches: ${oldTransaction.category}`);
          } else if (!goal.category) {
            if (goal.type === 'savings') {
              shouldUpdate = true;
              console.log(`✅ Savings goal affected by deleted transaction`);
            } else if (goal.type === 'spending_limit' && oldTransaction.type === 'expense') {
              shouldUpdate = true;
              console.log(`✅ Spending limit goal affected by deleted expense transaction`);
            } else if (goal.type === 'debt_payoff' && oldTransaction.type === 'expense' && 
                      /debt|loan|credit/i.test(oldTransaction.category)) {
              shouldUpdate = true;
              console.log(`✅ Debt payoff goal affected by deleted debt-related expense: ${oldTransaction.category}`);
            } else if (goal.type === 'income_target' && oldTransaction.type === 'income') {
              shouldUpdate = true;
              console.log(`✅ Income target goal affected by deleted income transaction`);
            }
          }
        }
        
        if (shouldUpdate) {
          console.log(`🎯 Updating goal: ${goal.title} (${goal.type})`);
          const previousProgress = goal.progressPercentage;
          await goal.calculateProgressFromTransactions();
          const newProgress = goal.progressPercentage;
          
          console.log(`📊 Goal progress: ${previousProgress}% -> ${newProgress}%`);
          
          // Add goal update
          results.goalUpdates.push({
            goalId: goal._id,
            goalName: goal.title,
            progress: Math.round(goal.progressPercentage),
            isCompleted: goal.isCompleted
          });
          
          // Add notification for frontend display if progress changed
          if (Math.abs(newProgress - previousProgress) > 0 || goal.isCompleted) {
            console.log(`🔔 Goal progress changed, generating notification`);
            let message = '';
            if (goal.isCompleted) {
              message = 'Congratulations! You have achieved your goal!';
            } else if (newProgress >= 100) {
              message = 'Goal achieved! You can mark it as completed.';
            } else if (newProgress >= 75) {
              message = 'Great progress! You\'re almost there!';
            } else if (newProgress >= 50) {
              message = 'Halfway there! Keep going!';
            } else if (newProgress >= 25) {
              message = 'Good progress! You\'re making steady progress.';
            } else {
              message = 'Keep up the good work!';
            }
            
            const notificationData = {
              title: 'Goal Progress Update',
              message: `Your ${goal.title} goal: ${Math.round(newProgress)}% complete. ${message}`,
              type: goal.isCompleted ? 'success' : 'info',
              goalId: goal._id,
              goalName: goal.title,
              progress: Math.round(newProgress)
            };
            
            console.log(`📝 Adding goal notification:`, notificationData);
            results.goalNotifications.push(notificationData);
            
            // Trigger backend notification system
            try {
              const goalData = {
                _id: goal._id,
                name: goal.title,
                progress: Math.round(newProgress),
                message: message,
                type: goal.type,
                targetAmount: goal.targetAmount,
                currentAmount: goal.currentAmount
              };
              
              console.log(`🔔 Triggering backend goal notification for:`, goalData);
              await triggerGoalUpdate(userId, goalData);
              console.log(`✅ Backend goal notification triggered successfully`);
            } catch (notificationError) {
              console.error('❌ Error triggering goal notification:', notificationError);
              // Don't fail the transaction operation if notification fails
            }
          } else {
            console.log(`📊 No progress change for goal: ${goal.title}`);
          }
        } else {
          console.log(`📋 Goal ${goal.title} not affected by this transaction`);
        }
      } catch (goalError) {
        console.error('Error updating goal:', goal._id, goalError);
        // Don't fail the transaction operation if goal updates fail
      }
    }
  } catch (error) {
    console.error('Error updating dependent models:', error);
    // Don't fail the transaction operation if model updates fail
  }

  return results;
};

module.exports = { updateDependentModels }; 