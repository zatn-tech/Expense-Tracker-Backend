const express = require('express');
const router = express.Router();
const RecurringTransaction = require('../models/RecurringTransaction');
const Transaction = require('../models/Transaction');
const auth = require('../middleware/auth');
const validateUserAccess = require('../middleware/validateUserAccess');

// Get all recurring transactions for a user
router.get('/:userId/recurring-transactions', auth, validateUserAccess, async (req, res) => {
  try {
    const { userId } = req.params;
    const { status, type, category } = req.query;
    
    let query = { userId };
    
    // Filter by status
    if (status === 'active') {
      query.isActive = true;
    } else if (status === 'inactive') {
      query.isActive = false;
    }
    
    // Filter by type
    if (type) {
      query.type = type;
    }
    
    // Filter by category
    if (category) {
      query.category = category;
    }
    
    const recurringTransactions = await RecurringTransaction.find(query)
      .sort({ nextDueDate: 1, createdAt: -1 });
    
    res.json(recurringTransactions);
  } catch (error) {
    console.error('Error fetching recurring transactions:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get a specific recurring transaction
router.get('/:userId/recurring-transactions/:id', auth, validateUserAccess, async (req, res) => {
  try {
    const { id } = req.params;
    
    const recurringTransaction = await RecurringTransaction.findById(id);
    
    if (!recurringTransaction) {
      return res.status(404).json({ message: 'Recurring transaction not found' });
    }
    
    res.json(recurringTransaction);
  } catch (error) {
    console.error('Error fetching recurring transaction:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create a new recurring transaction
router.post('/:userId/recurring-transactions', auth, validateUserAccess, async (req, res) => {
  try {
    const { userId } = req.params;
    const {
      title,
      description,
      amount,
      type,
      category,
      paymentMethod,
      frequency,
      interval,
      startDate,
      endDate,
      maxOccurrences,
      tags,
      notes
    } = req.body;
    
    // Validate required fields
    if (!title || !amount || !type || !category || !frequency || !startDate) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    
    // Calculate next due date
    const start = new Date(startDate);
    let nextDueDate = new Date(start);
    
    // Set initial next due date based on frequency
    switch (frequency) {
      case 'daily':
        nextDueDate.setDate(nextDueDate.getDate() + (interval || 1));
        break;
      case 'weekly':
        nextDueDate.setDate(nextDueDate.getDate() + (7 * (interval || 1)));
        break;
      case 'monthly':
        nextDueDate.setMonth(nextDueDate.getMonth() + (interval || 1));
        break;
      case 'yearly':
        nextDueDate.setFullYear(nextDueDate.getFullYear() + (interval || 1));
        break;
      default:
        return res.status(400).json({ message: 'Invalid frequency' });
    }
    
    const recurringTransaction = new RecurringTransaction({
      userId,
      title,
      description,
      amount,
      type,
      category,
      paymentMethod: paymentMethod || 'cash',
      frequency,
      interval: interval || 1,
      startDate: start,
      endDate: endDate ? new Date(endDate) : null,
      nextDueDate,
      maxOccurrences,
      tags: tags || [],
      notes
    });
    
    await recurringTransaction.save();
    
    res.status(201).json(recurringTransaction);
  } catch (error) {
    console.error('Error creating recurring transaction:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update a recurring transaction
router.put('/:userId/recurring-transactions/:id', auth, validateUserAccess, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    // Remove fields that shouldn't be updated directly
    delete updateData.userId;
    delete updateData.lastProcessed;
    delete updateData.totalOccurrences;
    
    // If frequency, interval, or start date changed, recalculate next due date
    if (updateData.frequency || updateData.interval || updateData.startDate) {
      const current = await RecurringTransaction.findById(id);
      if (!current) {
        return res.status(404).json({ message: 'Recurring transaction not found' });
      }
      
      const start = new Date(updateData.startDate || current.startDate);
      const frequency = updateData.frequency || current.frequency;
      const interval = updateData.interval || current.interval;
      
      let nextDueDate = new Date(start);
      
      switch (frequency) {
        case 'daily':
          nextDueDate.setDate(nextDueDate.getDate() + interval);
          break;
        case 'weekly':
          nextDueDate.setDate(nextDueDate.getDate() + (7 * interval));
          break;
        case 'monthly':
          nextDueDate.setMonth(nextDueDate.getMonth() + interval);
          break;
        case 'yearly':
          nextDueDate.setFullYear(nextDueDate.getFullYear() + interval);
          break;
      }
      
      updateData.nextDueDate = nextDueDate;
    }
    
    const recurringTransaction = await RecurringTransaction.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );
    
    if (!recurringTransaction) {
      return res.status(404).json({ message: 'Recurring transaction not found' });
    }
    
    res.json(recurringTransaction);
  } catch (error) {
    console.error('Error updating recurring transaction:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete a recurring transaction
router.delete('/:userId/recurring-transactions/:id', auth, validateUserAccess, async (req, res) => {
  try {
    const { id } = req.params;
    
    const recurringTransaction = await RecurringTransaction.findByIdAndDelete(id);
    
    if (!recurringTransaction) {
      return res.status(404).json({ message: 'Recurring transaction not found' });
    }
    
    res.json({ message: 'Recurring transaction deleted successfully' });
  } catch (error) {
    console.error('Error deleting recurring transaction:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Toggle active status of a recurring transaction
router.patch('/:userId/recurring-transactions/:id/toggle', auth, validateUserAccess, async (req, res) => {
  try {
    const { id } = req.params;
    
    const recurringTransaction = await RecurringTransaction.findById(id);
    
    if (!recurringTransaction) {
      return res.status(404).json({ message: 'Recurring transaction not found' });
    }
    
    recurringTransaction.isActive = !recurringTransaction.isActive;
    await recurringTransaction.save();
    
    res.json(recurringTransaction);
  } catch (error) {
    console.error('Error toggling recurring transaction:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Process recurring transactions (create actual transactions)
router.post('/:userId/recurring-transactions/process', auth, validateUserAccess, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Find all active recurring transactions that should be processed
    const recurringTransactions = await RecurringTransaction.find({
      userId,
      isActive: true
    });
    
    const processedTransactions = [];
    const errors = [];
    
    for (const recurring of recurringTransactions) {
      if (recurring.shouldProcess()) {
        try {
          const transactionData = recurring.process();
          
          if (transactionData) {
            // Create the actual transaction
            const transaction = new Transaction(transactionData);
            await transaction.save();
            
            // Update the recurring transaction
            await recurring.save();
            
            processedTransactions.push({
              recurringId: recurring._id,
              transactionId: transaction._id,
              title: recurring.title,
              amount: recurring.amount,
              type: recurring.type
            });
          }
        } catch (error) {
          errors.push({
            recurringId: recurring._id,
            title: recurring.title,
            error: error.message
          });
        }
      }
    }
    
    res.json({
      processed: processedTransactions,
      errors,
      summary: {
        total: recurringTransactions.length,
        processed: processedTransactions.length,
        errors: errors.length
      }
    });
  } catch (error) {
    console.error('Error processing recurring transactions:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get recurring transaction statistics
router.get('/:userId/recurring-transactions/stats/overview', auth, validateUserAccess, async (req, res) => {
  try {
    const { userId } = req.params;
    
    const stats = await RecurringTransaction.aggregate([
      { $match: { userId: require('mongoose').Types.ObjectId(userId) } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          active: {
            $sum: { $cond: ['$isActive', 1, 0] }
          },
          inactive: {
            $sum: { $cond: ['$isActive', 0, 1] }
          },
          totalAmount: { $sum: '$amount' },
          income: {
            $sum: { $cond: [{ $eq: ['$type', 'income'] }, '$amount', 0] }
          },
          expense: {
            $sum: { $cond: [{ $eq: ['$type', 'expense'] }, '$amount', 0] }
          },
          totalOccurrences: { $sum: '$totalOccurrences' }
        }
      }
    ]);
    
    const frequencyStats = await RecurringTransaction.aggregate([
      { $match: { userId: require('mongoose').Types.ObjectId(userId) } },
      {
        $group: {
          _id: '$frequency',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' }
        }
      }
    ]);
    
    const result = {
      overview: stats[0] || {
        total: 0,
        active: 0,
        inactive: 0,
        totalAmount: 0,
        income: 0,
        expense: 0,
        totalOccurrences: 0
      },
      byFrequency: frequencyStats
    };
    
    res.json(result);
  } catch (error) {
    console.error('Error fetching recurring transaction stats:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router; 