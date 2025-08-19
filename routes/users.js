// routes/users.js
const express = require('express');
const authController = require('../controllers/authController');
const validateUserAccess = require('../middleware/validateUserAccess');

const router = express.Router();

// All routes are protected
router.use(authController.protect);

// User routes - Make sure :userId is properly named
router.get('/:userId', validateUserAccess, (req, res) => {
  res.status(200).json({
    status: 'success',
    data: {
      user: req.user
    }
  });
});

router.patch('/:userId', validateUserAccess, async (req, res, next) => {
  try {
    const { password, passwordConfirm, ...updateData } = req.body;
    
    const User = require('../models/User');
    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      updateData,
      {
        new: true,
        runValidators: true
      }
    );

    res.status(200).json({
      status: 'success',
      data: {
        user: updatedUser
      }
    });
  } catch (err) {
    next(err);
  }
});

// Update balance display preferences
router.patch('/:userId/balance-preferences', validateUserAccess, async (req, res) => {
  try {
    const { method, customAccountIds, showBreakdown } = req.body;
    
    // Validate method
    const validMethods = ['net_cash_flow', 'total_accounts', 'main_account', 'liquid_balance', 'investment_balance', 'custom_accounts'];
    if (method && !validMethods.includes(method)) {
      return res.status(400).json({ error: 'Invalid balance method' });
    }

    // Validate custom account IDs if method is custom_accounts
    if (method === 'custom_accounts' && customAccountIds) {
      const Account = require('../models/Account');
      const validAccounts = await Account.find({ 
        _id: { $in: customAccountIds }, 
        userId: req.params.userId 
      });
      
      if (validAccounts.length !== customAccountIds.length) {
        return res.status(400).json({ error: 'Some account IDs are invalid' });
      }
    }

    const updateData = {};
    if (method !== undefined) updateData['preferences.balanceDisplay.method'] = method;
    if (customAccountIds !== undefined) updateData['preferences.balanceDisplay.customAccountIds'] = customAccountIds;
    if (showBreakdown !== undefined) updateData['preferences.balanceDisplay.showBreakdown'] = showBreakdown;

    const User = require('../models/User');
    const user = await User.findByIdAndUpdate(
      req.params.userId,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select('-password');

    res.json({
      status: 'success',
      message: 'Balance preferences updated successfully',
      data: user.preferences.balanceDisplay
    });
  } catch (error) {
    console.error('Error updating balance preferences:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete user account and all associated data
router.delete('/:userId', validateUserAccess, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Import all models
    const User = require('../models/User');
    const Account = require('../models/Account');
    const Transaction = require('../models/Transaction');
    const Budget = require('../models/Budget');
    const Goal = require('../models/Goal');
    const Category = require('../models/Category');
    const RecurringTransaction = require('../models/RecurringTransaction');
    const Transfer = require('../models/Transfer');
    const EmailConnection = require('../models/EmailConnection');
    const EmailTransaction = require('../models/EmailTransaction');
    const Notification = require('../models/Notification');
    
    console.log(`Starting account deletion for user: ${userId}`);
    
    // Delete all user data in proper order (to handle foreign key constraints)
    await Promise.all([
      EmailTransaction.deleteMany({ userId }),
      EmailConnection.deleteMany({ userId }),
      Transfer.deleteMany({ userId }),
      Transaction.deleteMany({ userId }),
      RecurringTransaction.deleteMany({ userId }),
      Budget.deleteMany({ userId }),
      Goal.deleteMany({ userId }),
      Category.deleteMany({ userId }),
      Account.deleteMany({ userId }),
      Notification.deleteMany({ userId })
    ]);
    
    // Finally delete the user
    await User.findByIdAndDelete(userId);
    
    console.log(`Account deletion completed for user: ${userId}`);
    
    res.status(200).json({
      status: 'success',
      message: 'Account and all associated data have been permanently deleted'
    });
  } catch (error) {
    console.error('Error deleting user account:', error);
    res.status(500).json({ 
      status: 'error',
      message: 'Failed to delete account. Please try again.' 
    });
  }
});

module.exports = router;
