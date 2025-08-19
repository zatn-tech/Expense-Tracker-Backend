const { sendNotificationToUser } = require('../controllers/notifications');

// Helper function to check if user has notification enabled for specific type
const checkNotificationPreference = async (userId, notificationType) => {
  try {
    const Notification = require('../models/Notification');
    const userNotification = await Notification.findOne({ 
      userId, 
      isActive: true 
    });

    if (!userNotification) {
      console.log(`No active notification subscription found for user ${userId}`);
      return false;
    }

    return userNotification.preferences[notificationType] !== false;
  } catch (error) {
    console.error('Error checking notification preference:', error);
    return false;
  }
};

// Recurring Transaction Reminders
exports.triggerRecurringReminder = async (userId, recurringTransaction) => {
  console.log('🔄 Triggering recurring reminder for user:', userId);
  
  const isEnabled = await checkNotificationPreference(userId, 'recurringReminders');
  if (!isEnabled) {
    console.log('❌ Recurring reminders disabled for user:', userId);
    return false;
  }

  const notificationData = {
    type: 'recurringReminders',
    title: 'Recurring Transaction Due',
    body: `Your recurring ${recurringTransaction.type} of ₹${recurringTransaction.amount} for ${recurringTransaction.category} is due soon.`,
    data: {
      url: '/recurring-transactions',
      type: 'recurring-reminder',
      transactionId: recurringTransaction._id,
      category: recurringTransaction.category,
      amount: recurringTransaction.amount
    }
  };

  return await sendNotificationToUser(userId, notificationData);
};

// Weekly Report Notifications
exports.triggerWeeklyReport = async (userId, reportData) => {
  console.log('📊 Triggering weekly report for user:', userId);
  
  const isEnabled = await checkNotificationPreference(userId, 'weeklyReports');
  if (!isEnabled) {
    console.log('❌ Weekly reports disabled for user:', userId);
    return false;
  }

  const notificationData = {
    type: 'weeklyReports',
    title: 'Weekly Financial Report',
    body: `Your weekly spending: ₹${reportData.totalSpent}. Income: ₹${reportData.totalIncome}. Net: ₹${reportData.netAmount}.`,
    data: {
      url: '/reports',
      type: 'weekly-report',
      reportId: reportData.reportId,
      totalSpent: reportData.totalSpent,
      totalIncome: reportData.totalIncome,
      netAmount: reportData.netAmount
    }
  };

  return await sendNotificationToUser(userId, notificationData);
};

// Monthly Report Notifications
exports.triggerMonthlyReport = async (userId, reportData) => {
  console.log('📈 Triggering monthly report for user:', userId);
  
  const isEnabled = await checkNotificationPreference(userId, 'monthlyReports');
  if (!isEnabled) {
    console.log('❌ Monthly reports disabled for user:', userId);
    return false;
  }

  const notificationData = {
    type: 'monthlyReports',
    title: 'Monthly Financial Report',
    body: `Your monthly summary: Spent ₹${reportData.totalSpent}, Earned ₹${reportData.totalIncome}, Saved ₹${reportData.savings}.`,
    data: {
      url: '/reports',
      type: 'monthly-report',
      reportId: reportData.reportId,
      totalSpent: reportData.totalSpent,
      totalIncome: reportData.totalIncome,
      savings: reportData.savings
    }
  };

  return await sendNotificationToUser(userId, notificationData);
};

// Goal Update Notifications
exports.triggerGoalUpdate = async (userId, goalData) => {
  console.log('🎯 Triggering goal update for user:', userId);
  
  const isEnabled = await checkNotificationPreference(userId, 'goalUpdates');
  if (!isEnabled) {
    console.log('❌ Goal updates disabled for user:', userId);
    return false;
  }

  const notificationData = {
    type: 'goalUpdates',
    title: 'Goal Progress Update',
    body: `Your ${goalData.name} goal: ${goalData.progress}% complete. ${goalData.message}`,
    data: {
      url: '/goals',
      type: 'goal-update',
      goalId: goalData._id,
      goalName: goalData.name,
      progress: goalData.progress,
      message: goalData.message
    }
  };

  return await sendNotificationToUser(userId, notificationData);
};

// Low Balance Alert Notifications
exports.triggerLowBalanceAlert = async (userId, balanceData) => {
  console.log('💰 Triggering low balance alert for user:', userId);
  
  const isEnabled = await checkNotificationPreference(userId, 'lowBalanceAlerts');
  if (!isEnabled) {
    console.log('❌ Low balance alerts disabled for user:', userId);
    return false;
  }

  const notificationData = {
    type: 'lowBalanceAlerts',
    title: 'Low Balance Alert',
    body: `Your current balance is ₹${balanceData.currentBalance}. Consider adding funds soon.`,
    data: {
      url: '/dashboard',
      type: 'low-balance-alert',
      balance: balanceData.currentBalance,
      threshold: balanceData.threshold || 1000
    }
  };

  return await sendNotificationToUser(userId, notificationData);
};

// Budget Alert Notifications (already implemented, but adding here for completeness)
exports.triggerBudgetAlert = async (userId, budgetData) => {
  console.log('🧪 Triggering budget alert for user:', userId);
  
  const isEnabled = await checkNotificationPreference(userId, 'budgetAlerts');
  if (!isEnabled) {
    console.log('❌ Budget alerts disabled for user:', userId);
    return false;
  }

  const notificationData = {
    type: 'budgetAlerts',
    title: budgetData.isExceeded ? 'Budget Exceeded!' : 'Budget Alert',
    body: budgetData.isExceeded 
      ? `You've exceeded your ${budgetData.budgetName} budget by ₹${budgetData.excessAmount.toFixed(2)}`
      : `Your ${budgetData.budgetName} budget is ${budgetData.usagePercentage.toFixed(1)}% used`,
    data: {
      url: '/budgets',
      type: 'budget-alert',
      budgetId: budgetData.budgetId,
      alertType: budgetData.alertType,
      isExceeded: budgetData.isExceeded
    }
  };

  return await sendNotificationToUser(userId, notificationData);
};

// Test notification for any type
exports.triggerTestNotification = async (userId, testType = 'test') => {
  console.log('🧪 Triggering test notification for user:', userId);
  
  const notificationData = {
    type: 'test',
    title: 'Test Notification',
    body: `This is a test ${testType} notification from Expense Tracker.`,
    data: {
      url: '/dashboard',
      type: 'test',
      testType: testType
    }
  };

  return await sendNotificationToUser(userId, notificationData);
}; 