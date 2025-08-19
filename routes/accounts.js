const express = require('express');
const Account = require('../models/Account');
const Transaction = require('../models/Transaction');
const auth = require('../middleware/auth');
const validateUserAccess = require('../middleware/validateUserAccess');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

const router = express.Router();

// Get all accounts for a user
router.get('/:userId/accounts', auth, validateUserAccess, catchAsync(async (req, res) => {
  const accounts = await Account.getUserAccounts(req.params.userId);
  
  res.json({
    status: 'success',
    data: accounts
  });
}));

// Get a specific account
router.get('/:userId/accounts/:accountId', auth, validateUserAccess, catchAsync(async (req, res) => {
  const account = await Account.findOne({
    _id: req.params.accountId,
    userId: req.params.userId,
    isActive: true
  });

  if (!account) {
    throw new AppError('Account not found', 404);
  }

  res.json({
    status: 'success',
    data: account
  });
}));

// Create a new account
router.post('/:userId/accounts', auth, validateUserAccess, catchAsync(async (req, res) => {
  const { name, type, balance, description, currency, notes } = req.body;

  // Validate required fields
  if (!name) {
    throw new AppError('Account name is required', 400);
  }

  // Check if this is the first account (make it default)
  const existingAccounts = await Account.countDocuments({ userId: req.params.userId });
  const isDefault = existingAccounts === 0;

  const account = new Account({
    name,
    type: type || 'other',
    balance: balance || 0,
    userId: req.params.userId,
    isDefault,
    isActive: true,
    description,
    currency: currency || 'INR',
    notes
  });

  await account.save();

  res.status(201).json({
    status: 'success',
    data: account
  });
}));

// Update an account
router.put('/:userId/accounts/:accountId', auth, validateUserAccess, catchAsync(async (req, res) => {
  const { name, type, balance, description, currency, notes, isDefault } = req.body;

  const account = await Account.findOne({
    _id: req.params.accountId,
    userId: req.params.userId,
    isActive: true
  });

  if (!account) {
    throw new AppError('Account not found', 404);
  }

  // Update fields
  if (name !== undefined) account.name = name;
  if (type !== undefined) account.type = type;
  if (balance !== undefined) account.balance = balance;
  if (description !== undefined) account.description = description;
  if (currency !== undefined) account.currency = currency;
  if (notes !== undefined) account.notes = notes;
  if (isDefault !== undefined) account.isDefault = isDefault;

  await account.save();

  res.json({
    status: 'success',
    data: account
  });
}));

// Delete an account (soft delete)
router.delete('/:userId/accounts/:accountId', auth, validateUserAccess, catchAsync(async (req, res) => {
  const account = await Account.findOne({
    _id: req.params.accountId,
    userId: req.params.userId,
    isActive: true
  });

  if (!account) {
    throw new AppError('Account not found', 404);
  }

  // Check if this is the default account
  if (account.isDefault) {
    throw new AppError('Cannot delete the default account', 400);
  }

  // Check if account has transactions
  const transactionCount = await Transaction.countDocuments({ accountId: req.params.accountId });
  if (transactionCount > 0) {
    throw new AppError(`Cannot delete account with ${transactionCount} transactions. Please reassign or delete transactions first.`, 400);
  }

  // Soft delete
  account.isActive = false;
  await account.save();

  res.json({
    status: 'success',
    message: 'Account deleted successfully'
  });
}));

// Set account as default
router.patch('/:userId/accounts/:accountId/default', auth, validateUserAccess, catchAsync(async (req, res) => {
  const account = await Account.findOne({
    _id: req.params.accountId,
    userId: req.params.userId,
    isActive: true
  });

  if (!account) {
    throw new AppError('Account not found', 404);
  }

  account.isDefault = true;
  await account.save();

  res.json({
    status: 'success',
    data: account
  });
}));

// Get account balance history
router.get('/:userId/accounts/:accountId/balance-history', auth, validateUserAccess, catchAsync(async (req, res) => {
  const { startDate, endDate, limit = 30 } = req.query;

  let dateFilter = {};
  if (startDate || endDate) {
    dateFilter.transactionDate = {};
    if (startDate) dateFilter.transactionDate.$gte = new Date(startDate);
    if (endDate) dateFilter.transactionDate.$lte = new Date(endDate);
  }

  const transactions = await Transaction.find({
    accountId: req.params.accountId,
    userId: req.params.userId,
    ...dateFilter
  })
  .sort({ transactionDate: -1 })
  .limit(parseInt(limit))
  .select('amount type transactionDate');

  // Calculate running balance
  let runningBalance = 0;
  const balanceHistory = transactions.reverse().map(transaction => {
    if (transaction.type === 'income') {
      runningBalance += transaction.amount;
    } else {
      runningBalance -= transaction.amount;
    }
    return {
      date: transaction.transactionDate,
      balance: runningBalance,
      transaction: {
        amount: transaction.amount,
        type: transaction.type
      }
    };
  });

  res.json({
    status: 'success',
    data: balanceHistory
  });
}));

// Reconcile account balance
router.post('/:userId/accounts/:accountId/reconcile', auth, validateUserAccess, catchAsync(async (req, res) => {
  const { actualBalance, notes } = req.body;

  if (typeof actualBalance !== 'number') {
    throw new AppError('Actual balance is required and must be a number', 400);
  }

  const account = await Account.findOne({
    _id: req.params.accountId,
    userId: req.params.userId,
    isActive: true
  });

  if (!account) {
    throw new AppError('Account not found', 404);
  }

  // Calculate difference
  const difference = actualBalance - account.balance;
  
  // Update account
  account.balance = actualBalance;
  account.lastReconciled = new Date();
  if (notes) account.notes = notes;

  await account.save();

  res.json({
    status: 'success',
    data: {
      account,
      reconciliation: {
        previousBalance: account.balance - difference,
        newBalance: actualBalance,
        difference,
        date: account.lastReconciled
      }
    }
  });
}));

module.exports = router; 