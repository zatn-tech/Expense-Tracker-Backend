// routes/transactions.js
const express = require('express');
const Transaction = require('../models/Transaction');
const auth = require('../middleware/auth');
const validateUserAccess = require('../middleware/validateUserAccess');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const {
  getDailyTransactions,
  getCategoryExpenses
} = require('../controllers/transactions');
const { updateDependentModels } = require('../utils/modelUpdater');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/')
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname)
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.mimetype === 'application/json') {
      cb(null, true);
    } else {
      cb(new Error('Only CSV and JSON files are allowed'), false);
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// Get transactions for a specific user
router.get('/:userId/transactions', auth, validateUserAccess, async (req, res) => {
  try {
    const { 
      startDate, 
      endDate, 
      category,
      type,
      page = 1,
      limit = 50,
      grouped = false,
      debug = false
    } = req.query;

    let filter = { userId: req.params.userId };
    
    if (startDate || endDate) {
      filter.transactionDate = {};
      if (startDate) filter.transactionDate.$gte = new Date(startDate);
      if (endDate) filter.transactionDate.$lte = new Date(endDate);
    }
    
    if (category) filter.category = category;
    if (type) filter.type = type;

    // Get total count for pagination info
    const totalCount = await Transaction.countDocuments(filter);
    
    // Determine if we should apply pagination
    const shouldPaginate = limit && limit !== '1000' && limit !== 'all';
    
    let query = Transaction.find(filter).sort({ transactionDate: -1, createdAt: -1 });
    
    if (shouldPaginate) {
      query = query.limit(limit * 1).skip((page - 1) * limit);
    }
    
    const transactions = await query;

    // Add debug information if requested
    if (debug === 'true') {
      const totalIncome = transactions
        .filter(t => t.type === 'income')
        .reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);
      
      const totalExpenses = transactions
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);
      
      const balance = totalIncome - totalExpenses;
      
      
      
      return res.json({
        transactions,
        debug: {
          totalIncome,
          totalExpenses,
          balance,
          transactionCount: transactions.length,
          totalInDatabase: totalCount,
          incomeCount: transactions.filter(t => t.type === 'income').length,
          expenseCount: transactions.filter(t => t.type === 'expense').length,
          paginationApplied: shouldPaginate
        }
      });
    }

    if (grouped === 'true') {
      const groupedTransactions = groupTransactions(transactions, 'date');

      return res.json({
        transactions: transactions,
        grouped: groupedTransactions,
        pagination: {
          current: page,
          pages: shouldPaginate ? Math.ceil(totalCount / limit) : 1,
          total: totalCount,
          limit: shouldPaginate ? limit : totalCount
        }
      });
    }

    res.json(transactions);
    
  } catch (err) {
    console.error('Transaction fetch error:', err);
    res.status(400).json({ error: err.message });
  }
});

// Add transaction
router.post('/:userId/transactions', auth, validateUserAccess, async (req, res) => {
  try {
    const { 
      amount, 
      type, 
      category, 
      description, 
      transactionDate,
      paymentMethod,
      tags,
      location,
      isRecurring,
      recurringPattern,
      accountId
    } = req.body;

    // Validate required fields
    if (!amount || !type || !category) {
      return res.status(400).json({ error: 'Amount, type, and category are required' });
    }

    // If no accountId is provided, get the user's default account
    let finalAccountId = accountId;
    if (!finalAccountId) {
      const Account = require('../models/Account');
      const defaultAccount = await Account.getDefaultAccount(req.params.userId);
      if (!defaultAccount) {
        return res.status(400).json({ error: 'No default account found. Please create an account first.' });
      }
      finalAccountId = defaultAccount._id;
    }

    // Validate account belongs to user
    const Account = require('../models/Account');
    const account = await Account.findOne({
      _id: finalAccountId,
      userId: req.params.userId,
      isActive: true
    });

    if (!account) {
      return res.status(400).json({ error: 'Invalid account or account not found' });
    }

    const transaction = new Transaction({
      userId: req.params.userId,
      accountId: finalAccountId,
      amount,
      type,
      category,
      description,
      transactionDate: transactionDate || new Date(),
      paymentMethod: paymentMethod || 'cash',
      tags: tags || [],
      location: location || {},
      isRecurring: isRecurring || false,
      recurringPattern: isRecurring ? recurringPattern : {}
    });

    await transaction.save();

    // Populate account information
    await transaction.populate('accountId', 'name type balance');

    res.status(201).json({
      status: 'success',
      data: transaction
    });
    
  } catch (err) {
    console.error('Transaction creation error:', err);
    res.status(400).json({ error: err.message });
  }
});

// Import transactions from CSV
router.post('/:userId/transactions/import/csv', auth, validateUserAccess, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const results = [];
    const errors = [];
    let processedCount = 0;

    fs.createReadStream(req.file.path)
      .pipe(csv())
      .on('data', (data) => {
        try {
          // Map CSV columns to transaction fields
          const transactionData = {
            amount: parseFloat(data.amount || data.Amount || data.AMOUNT || 0),
            type: (data.type || data.Type || data.TYPE || 'expense').toLowerCase(),
            category: data.category || data.Category || data.CATEGORY || 'Other',
            description: data.description || data.Description || data.DESCRIPTION || '',
            transactionDate: data.transactionDate || data.date || data.Date || data.DATE || new Date(),
            paymentMethod: data.paymentMethod || data.payment_method || data.PaymentMethod || 'cash',
            tags: data.tags ? data.tags.split(',').map(tag => tag.trim()) : [],
            userId: req.params.userId
          };

          // Validate required fields
          if (!transactionData.amount || transactionData.amount <= 0) {
            errors.push({ row: processedCount + 1, error: 'Invalid amount' });
            return;
          }

          if (!['income', 'expense'].includes(transactionData.type)) {
            errors.push({ row: processedCount + 1, error: 'Invalid type (must be income or expense)' });
            return;
          }

          results.push(transactionData);
        } catch (error) {
          errors.push({ row: processedCount + 1, error: error.message });
        }
        processedCount++;
      })
      .on('end', async () => {
        try {
          // Clean up uploaded file
          fs.unlinkSync(req.file.path);

          if (results.length === 0) {
            return res.status(400).json({ 
              error: 'No valid transactions found in file',
              errors 
            });
          }

          // Generate import ID for this batch
          const importId = `import_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          
          // Add importId to all transactions
          results.forEach(transaction => {
            transaction.importId = importId;
          });
          
          // Insert transactions in batches
          const batchSize = 100;
          const insertedTransactions = [];
          
          for (let i = 0; i < results.length; i += batchSize) {
            const batch = results.slice(i, i + batchSize);
            const transactions = await Transaction.insertMany(batch);
            insertedTransactions.push(...transactions);
          }

          // Check for budget alerts after importing transactions
          let budgetAlerts = [];
          try {
            for (const transaction of insertedTransactions) {
              if (transaction.type === 'expense') {
                const alerts = await checkBudgetAlerts(req.params.userId, transaction);
                budgetAlerts.push(...alerts);
              }
            }
          } catch (alertError) {
            console.error('Error checking budget alerts during import:', alertError);
            // Don't fail the import if budget alerts fail
          }

          // Update goals after importing transactions
          let goalUpdates = [];
          try {
            const Goal = require('../models/Goal');
            const userGoals = await Goal.find({ 
              userId: req.params.userId, 
              isActive: true,
              isCompleted: false 
            });
            
            for (const goal of userGoals) {
              try {
                const previousProgress = goal.progressPercentage;
                await goal.calculateProgressFromTransactions();
                const newProgress = goal.progressPercentage;
                
                goalUpdates.push({
                  goalId: goal._id,
                  goalName: goal.name,
                  progress: Math.round(goal.progressPercentage),
                  isCompleted: goal.isCompleted
                });
                
                // Trigger goal notification if progress changed or goal was completed
                if (Math.abs(newProgress - previousProgress) > 0 || goal.isCompleted) {
                  try {
                    const { triggerGoalUpdate } = require('../utils/notificationTriggers');
                    
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
                    
                    const goalData = {
                      _id: goal._id,
                      name: goal.name,
                      progress: Math.round(newProgress),
                      message: message,
                      type: goal.type,
                      targetAmount: goal.targetAmount,
                      currentAmount: goal.currentAmount
                    };
                    
                    await triggerGoalUpdate(req.params.userId, goalData);
                  } catch (notificationError) {
                    console.error('Error triggering goal notification during import:', notificationError);
                  }
                }
              } catch (goalError) {
                console.error('Error updating goal during import:', goal._id, goalError);
                // Don't fail the import if goal updates fail
              }
            }
          } catch (goalError) {
            console.error('Error updating goals during import:', goalError);
            // Don't fail the import if goal updates fail
          }

          res.json({
            message: `Successfully imported ${insertedTransactions.length} transactions`,
            imported: insertedTransactions.length,
            importId: importId,
            errors: errors.length > 0 ? errors : undefined,
            totalProcessed: processedCount,
            budgetAlerts: allModelUpdates.budgetAlerts.map(alert => ({
              title: alert.isExceeded ? 'Budget Exceeded!' : 'Budget Alert',
              message: alert.isExceeded 
                ? `You've exceeded your ${alert.budgetName} budget by ₹${alert.excessAmount.toFixed(2)}`
                : `Your ${alert.budgetName} budget is ${alert.usagePercentage.toFixed(1)}% used`,
              type: alert.isExceeded ? 'error' : 'warning',
              budgetId: alert.budgetId,
              alertType: alert.alertType
            })),
            goalUpdates: allModelUpdates.goalUpdates,
            goalNotifications: allModelUpdates.goalNotifications
          });
        } catch (error) {
          // Clean up uploaded file on error
          if (fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
          }
          res.status(500).json({ error: error.message });
        }
      })
      .on('error', (error) => {
        // Clean up uploaded file on error
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ error: error.message });
      });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Import transactions from JSON
router.post('/:userId/transactions/import/json', auth, validateUserAccess, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileContent = fs.readFileSync(req.file.path, 'utf8');
    let jsonData;

    try {
      jsonData = JSON.parse(fileContent);
    } catch (parseError) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Invalid JSON format' });
    }

    // Handle both array of transactions and object with transactions property
    let transactions = Array.isArray(jsonData) ? jsonData : jsonData.transactions || [];

    if (!Array.isArray(transactions)) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'No transactions array found in JSON' });
    }

    const results = [];
    const errors = [];

    for (let i = 0; i < transactions.length; i++) {
      try {
        const transaction = transactions[i];
        
        const transactionData = {
          amount: parseFloat(transaction.amount || 0),
          type: (transaction.type || 'expense').toLowerCase(),
          category: transaction.category || 'Other',
          description: transaction.description || '',
          transactionDate: transaction.transactionDate || transaction.date || new Date(),
          paymentMethod: transaction.paymentMethod || transaction.payment_method || 'cash',
          tags: transaction.tags || [],
          userId: req.params.userId
        };

        // Validate required fields
        if (!transactionData.amount || transactionData.amount <= 0) {
          errors.push({ row: i + 1, error: 'Invalid amount' });
          continue;
        }

        if (!['income', 'expense'].includes(transactionData.type)) {
          errors.push({ row: i + 1, error: 'Invalid type (must be income or expense)' });
          continue;
        }

        results.push(transactionData);
      } catch (error) {
        errors.push({ row: i + 1, error: error.message });
      }
    }

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    if (results.length === 0) {
      return res.status(400).json({ 
        error: 'No valid transactions found in file',
        errors 
      });
    }

    // Generate import ID for this batch
    const importId = `import_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Add importId to all transactions
    results.forEach(transaction => {
      transaction.importId = importId;
    });
    
    // Insert transactions in batches
    const batchSize = 100;
    const insertedTransactions = [];
    
    for (let i = 0; i < results.length; i += batchSize) {
      const batch = results.slice(i, i + batchSize);
      const transactions = await Transaction.insertMany(batch);
      insertedTransactions.push(...transactions);
    }

    // Check for budget alerts after importing transactions
    let budgetAlerts = [];
    try {
      for (const transaction of insertedTransactions) {
        if (transaction.type === 'expense') {
          const alerts = await checkBudgetAlerts(req.params.userId, transaction);
          budgetAlerts.push(...alerts);
        }
      }
    } catch (alertError) {
      console.error('Error checking budget alerts during import:', alertError);
      // Don't fail the import if budget alerts fail
    }

    // Update goals after importing transactions
    let goalUpdates = [];
    try {
      const Goal = require('../models/Goal');
      const userGoals = await Goal.find({ 
        userId: req.params.userId, 
        isActive: true,
        isCompleted: false 
      });
      
      for (const goal of userGoals) {
        try {
          const previousProgress = goal.progressPercentage;
          await goal.calculateProgressFromTransactions();
          const newProgress = goal.progressPercentage;
          
          goalUpdates.push({
            goalId: goal._id,
            goalName: goal.name,
            progress: Math.round(goal.progressPercentage),
            isCompleted: goal.isCompleted
          });
          
          // Trigger goal notification if progress changed or goal was completed
          if (Math.abs(newProgress - previousProgress) > 0 || goal.isCompleted) {
            try {
              const { triggerGoalUpdate } = require('../utils/notificationTriggers');
              
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
              
              const goalData = {
                _id: goal._id,
                name: goal.name,
                progress: Math.round(newProgress),
                message: message,
                type: goal.type,
                targetAmount: goal.targetAmount,
                currentAmount: goal.currentAmount
              };
              
              await triggerGoalUpdate(req.params.userId, goalData);
            } catch (notificationError) {
              console.error('Error triggering goal notification during import:', notificationError);
            }
          }
        } catch (goalError) {
          console.error('Error updating goal during import:', goal._id, goalError);
          // Don't fail the import if goal updates fail
        }
      }
    } catch (goalError) {
      console.error('Error updating goals during import:', goalError);
      // Don't fail the import if goal updates fail
    }

    res.json({
      message: `Successfully imported ${insertedTransactions.length} transactions`,
      imported: insertedTransactions.length,
      importId: importId,
      errors: errors.length > 0 ? errors : undefined,
      totalProcessed: transactions.length,
      budgetAlerts: budgetAlerts.map(alert => ({
        title: alert.isExceeded ? 'Budget Exceeded!' : 'Budget Alert',
        message: alert.isExceeded 
          ? `You've exceeded your ${alert.budgetName} budget by ₹${alert.excessAmount.toFixed(2)}`
          : `Your ${alert.budgetName} budget is ${alert.usagePercentage.toFixed(1)}% used`,
        type: alert.isExceeded ? 'error' : 'warning',
        budgetId: alert.budgetId,
        alertType: alert.alertType
      })),
      goalUpdates: goalUpdates
    });

  } catch (error) {
    // Clean up uploaded file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: error.message });
  }
});

// Delete transaction
router.delete('/:userId/transactions/:transactionId', auth, validateUserAccess, async (req, res) => {
  try {
    const transaction = await Transaction.findOne({
      _id: req.params.transactionId,
      userId: req.params.userId
    });
    
    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    
    // Update dependent models before deleting the transaction
    const modelUpdates = await updateDependentModels(req.params.userId, null, 'delete', transaction);
    
    // Delete the transaction using safeDelete method (handles balance reversion)
    await Transaction.safeDelete(req.params.transactionId);
    
    res.json({ 
      message: 'Transaction deleted successfully',
      budgetAlerts: modelUpdates.budgetAlerts.map(alert => ({
        title: alert.isExceeded ? 'Budget Exceeded!' : 'Budget Alert',
        message: alert.isExceeded 
          ? `You've exceeded your ${alert.budgetName} budget by ₹${alert.excessAmount.toFixed(2)}`
          : `Your ${alert.budgetName} budget is ${alert.usagePercentage.toFixed(1)}% used`,
        type: alert.isExceeded ? 'error' : 'warning',
        budgetId: alert.budgetId,
        alertType: alert.alertType
      })),
      goalUpdates: modelUpdates.goalUpdates,
      goalNotifications: modelUpdates.goalNotifications
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

function groupTransactions(transactions, groupBy) {
  const grouped = {};
  
  transactions.forEach(txn => {
    let key;
    const date = new Date(txn.transactionDate);
    
    switch (groupBy) {
      case 'date':
        key = date.toDateString();
        break;
      case 'week':
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        key = `Week of ${weekStart.toDateString()}`;
        break;
      case 'month':
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        break;
      default:
        key = date.toDateString();
    }
    
    if (!grouped[key]) {
      grouped[key] = {
        date: key,
        transactions: [],
        totalIncome: 0,
        totalExpense: 0,
        count: 0
      };
    }
    
    grouped[key].transactions.push(txn);
    grouped[key].count++;
    
    if (txn.type === 'income') {
      grouped[key].totalIncome += txn.amount;
    } else {
      grouped[key].totalExpense += txn.amount;
    }
  });
  
  return grouped;
}

// routes/transactions.js
router.get('/:userId/transactions/daily', auth, validateUserAccess, async (req, res, next) => {
  try {
    
    const { userId } = req.params;
    const data = await getDailyTransactions(userId);
    
    res.json({ success: true, data });
  } catch (err) {
    if (err.message === 'Invalid userId') {
      return res.status(400).json({ success: false, error: 'Malformed userId parameter' });
    }
    next(err);
  }
});

// routes/transactions.js
router.get('/:userId/transactions/category-expenses/:period', auth, validateUserAccess, async (req, res, next) => {
  try {
    
    const period = req.params.period || 'all'; // 'month', 'year', 'all'
    const data = await getCategoryExpenses(req.params.userId, period);
    
    res.json({ success: true, data });
  } catch (err) {
    console.error('❌ Category expenses error:', err);
    next(err);
  }
});

// Download template files
router.get('/:userId/transactions/template/:format', auth, validateUserAccess, async (req, res) => {
  try {
    const { format } = req.params;
    let filePath, contentType, filename;
    
    switch (format) {
      case 'csv':
        filePath = 'templates/sample-transactions.csv';
        contentType = 'text/csv';
        filename = 'sample-transactions.csv';
        break;
      case 'json':
        filePath = 'templates/sample-transactions.json';
        contentType = 'application/json';
        filename = 'sample-transactions.json';
        break;
      default:
        return res.status(400).json({ error: 'Invalid format. Use csv or json.' });
    }
    
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (err) {
    res.status(500).json({ error: 'Failed to download template' });
  }
});

// Delete imported transactions by date range
router.delete('/:userId/transactions/import/batch', auth, validateUserAccess, async (req, res) => {
  try {
    const { startDate, endDate, importId } = req.body;
    
    let filter = { userId: req.params.userId };
    
    if (startDate && endDate) {
      filter.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    
    if (importId) {
      filter.importId = importId;
    }
    
    // Get transactions before deleting them for model updates
    const transactionsToDelete = await Transaction.find(filter);
    
    // Update dependent models for each transaction being deleted
    let allModelUpdates = {
      budgetAlerts: [],
      goalUpdates: [],
      goalNotifications: []
    };
    
    // Delete each transaction individually using safeDelete (handles balance reversion)
    let deletedCount = 0;
    for (const transaction of transactionsToDelete) {
      const modelUpdates = await updateDependentModels(req.params.userId, null, 'delete', transaction);
      
      // Merge updates (avoid duplicates)
      allModelUpdates.budgetAlerts.push(...modelUpdates.budgetAlerts);
      allModelUpdates.goalUpdates.push(...modelUpdates.goalUpdates);
      allModelUpdates.goalNotifications.push(...modelUpdates.goalNotifications);
      
      // Delete the transaction using safeDelete method
      await Transaction.safeDelete(transaction._id);
      deletedCount++;
    }
    
    // Remove duplicates from goal updates and notifications
    const uniqueGoalUpdates = allModelUpdates.goalUpdates.filter((update, index, self) => 
      index === self.findIndex(u => u.goalId.toString() === update.goalId.toString())
    );
    
    const uniqueGoalNotifications = allModelUpdates.goalNotifications.filter((notification, index, self) => 
      index === self.findIndex(n => n.goalId.toString() === notification.goalId.toString())
    );
    
    res.json({
      message: `Successfully deleted ${deletedCount} transactions`,
      deletedCount: deletedCount,
      budgetAlerts: allModelUpdates.budgetAlerts.map(alert => ({
        title: alert.isExceeded ? 'Budget Exceeded!' : 'Budget Alert',
        message: alert.isExceeded 
          ? `You've exceeded your ${alert.budgetName} budget by ₹${alert.excessAmount.toFixed(2)}`
          : `Your ${alert.budgetName} budget is ${alert.usagePercentage.toFixed(1)}% used`,
        type: alert.isExceeded ? 'error' : 'warning',
        budgetId: alert.budgetId,
        alertType: alert.alertType
      })),
      goalUpdates: uniqueGoalUpdates,
      goalNotifications: uniqueGoalNotifications
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get preview of transactions from file (without saving)
router.post('/:userId/transactions/import/preview', auth, validateUserAccess, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileType = req.body.fileType || 'csv';
    const results = [];
    const errors = [];
    let processedCount = 0;

    if (fileType === 'csv') {
      fs.createReadStream(req.file.path)
        .pipe(csv())
        .on('data', (data) => {
          try {
            const transactionData = {
              amount: parseFloat(data.amount || data.Amount || data.AMOUNT || 0),
              type: (data.type || data.Type || data.TYPE || 'expense').toLowerCase(),
              category: data.category || data.Category || data.CATEGORY || 'Other',
              description: data.description || data.Description || data.DESCRIPTION || '',
              transactionDate: data.transactionDate || data.date || data.Date || data.DATE || new Date(),
              paymentMethod: data.paymentMethod || data.payment_method || data.PaymentMethod || 'cash',
              tags: data.tags ? data.tags.split(',').map(tag => tag.trim()) : []
            };

            if (!transactionData.amount || transactionData.amount <= 0) {
              errors.push({ row: processedCount + 1, error: 'Invalid amount' });
              return;
            }

            if (!['income', 'expense'].includes(transactionData.type)) {
              errors.push({ row: processedCount + 1, error: 'Invalid type (must be income or expense)' });
              return;
            }

            results.push(transactionData);
          } catch (error) {
            errors.push({ row: processedCount + 1, error: error.message });
          }
          processedCount++;
        })
        .on('end', () => {
          // Clean up uploaded file
          fs.unlinkSync(req.file.path);
          
          res.json({
            preview: results.slice(0, 10), // Show first 10 transactions
            totalCount: results.length,
            validCount: results.length,
            errorCount: errors.length,
            errors: errors.slice(0, 10), // Show first 10 errors
            summary: {
              income: results.filter(t => t.type === 'income').length,
              expense: results.filter(t => t.type === 'expense').length,
              totalAmount: results.reduce((sum, t) => sum + t.amount, 0),
              incomeAmount: results.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0),
              expenseAmount: results.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0)
            }
          });
        })
        .on('error', (error) => {
          if (fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
          }
          res.status(500).json({ error: error.message });
        });
    } else if (fileType === 'json') {
      const fileContent = fs.readFileSync(req.file.path, 'utf8');
      let jsonData;

      try {
        jsonData = JSON.parse(fileContent);
      } catch (parseError) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: 'Invalid JSON format' });
      }

      let transactions = Array.isArray(jsonData) ? jsonData : jsonData.transactions || [];

      if (!Array.isArray(transactions)) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: 'No transactions array found in JSON' });
      }

      for (let i = 0; i < transactions.length; i++) {
        try {
          const transaction = transactions[i];
          
          const transactionData = {
            amount: parseFloat(transaction.amount || 0),
            type: (transaction.type || 'expense').toLowerCase(),
            category: transaction.category || 'Other',
            description: transaction.description || '',
            transactionDate: transaction.transactionDate || transaction.date || new Date(),
            paymentMethod: transaction.paymentMethod || transaction.payment_method || 'cash',
            tags: transaction.tags || []
          };

          if (!transactionData.amount || transactionData.amount <= 0) {
            errors.push({ row: i + 1, error: 'Invalid amount' });
            continue;
          }

          if (!['income', 'expense'].includes(transactionData.type)) {
            errors.push({ row: i + 1, error: 'Invalid type (must be income or expense)' });
            continue;
          }

          results.push(transactionData);
        } catch (error) {
          errors.push({ row: i + 1, error: error.message });
        }
      }

      // Clean up uploaded file
      fs.unlinkSync(req.file.path);

      res.json({
        preview: results.slice(0, 10), // Show first 10 transactions
        totalCount: transactions.length,
        validCount: results.length,
        errorCount: errors.length,
        errors: errors.slice(0, 10), // Show first 10 errors
        summary: {
          income: results.filter(t => t.type === 'income').length,
          expense: results.filter(t => t.type === 'expense').length,
          totalAmount: results.reduce((sum, t) => sum + t.amount, 0),
          incomeAmount: results.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0),
          expenseAmount: results.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0)
        }
      });
    } else {
      fs.unlinkSync(req.file.path);
      res.status(400).json({ error: 'Invalid file type' });
    }
  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: error.message });
  }
});

// Get transaction statistics for a specific user (all transactions, no pagination)
router.get('/:userId/transactions/stats', auth, validateUserAccess, async (req, res) => {
  try {
    const { startDate, endDate, category, type } = req.query;
    const userId = req.params.userId;

    let filter = { userId };
    
    if (startDate || endDate) {
      filter.transactionDate = {};
      if (startDate) filter.transactionDate.$gte = new Date(startDate);
      if (endDate) filter.transactionDate.$lte = new Date(endDate);
    }
    
    if (category) filter.category = category;
    if (type) filter.type = type;

    // Get user preferences for balance calculation
    const User = require('../models/User');
    const user = await User.findById(userId).select('preferences.balanceDisplay');
    const balanceMethod = user?.preferences?.balanceDisplay?.method || 'net_cash_flow';
    const customAccountIds = user?.preferences?.balanceDisplay?.customAccountIds || [];
    const showBreakdown = user?.preferences?.balanceDisplay?.showBreakdown !== false;

    // Get all transactions for stats calculation (no pagination)
    const allTransactions = await Transaction.find(filter)
      .sort({ transactionDate: -1, createdAt: -1 });

    // Calculate comprehensive stats
    const totalIncome = allTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);
    
    const totalExpenses = allTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);
    
    const netCashFlow = totalIncome - totalExpenses;

    // Get account balances for different calculation methods
    const Account = require('../models/Account');
    const allAccounts = await Account.find({ userId, isActive: true });
    
    let balance = 0;
    let balanceBreakdown = {};
    let balanceMethodLabel = '';

    switch (balanceMethod) {
      case 'net_cash_flow':
        balance = netCashFlow;
        balanceMethodLabel = 'Net Cash Flow';
        balanceBreakdown = {
          income: totalIncome,
          expenses: totalExpenses,
          netFlow: netCashFlow
        };
        break;

      case 'total_accounts':
        balance = allAccounts.reduce((sum, acc) => sum + (acc.balance || 0), 0);
        balanceMethodLabel = 'Total Account Balance';
        balanceBreakdown = {
          totalBalance: balance,
          accountCount: allAccounts.length,
          accounts: allAccounts.map(acc => ({
            id: acc._id,
            name: acc.name,
            balance: acc.balance,
            type: acc.type
          }))
        };
        break;

      case 'main_account':
        const mainAccount = allAccounts.find(acc => acc.isDefault) || allAccounts[0];
        balance = mainAccount ? mainAccount.balance : 0;
        balanceMethodLabel = 'Main Account Balance';
        balanceBreakdown = {
          accountName: mainAccount?.name || 'No Account',
          balance: balance,
          accountType: mainAccount?.type || 'N/A'
        };
        break;

      case 'liquid_balance':
        const liquidAccounts = allAccounts.filter(acc => 
          ['checking', 'savings', 'current'].includes(acc.type?.toLowerCase())
        );
        balance = liquidAccounts.reduce((sum, acc) => sum + (acc.balance || 0), 0);
        balanceMethodLabel = 'Liquid Balance';
        balanceBreakdown = {
          totalBalance: balance,
          accountCount: liquidAccounts.length,
          accounts: liquidAccounts.map(acc => ({
            id: acc._id,
            name: acc.name,
            balance: acc.balance,
            type: acc.type
          }))
        };
        break;

      case 'investment_balance':
        const investmentAccounts = allAccounts.filter(acc => 
          ['investment', 'stocks', 'mutual_funds', 'bonds'].includes(acc.type?.toLowerCase())
        );
        balance = investmentAccounts.reduce((sum, acc) => sum + (acc.balance || 0), 0);
        balanceMethodLabel = 'Investment Balance';
        balanceBreakdown = {
          totalBalance: balance,
          accountCount: investmentAccounts.length,
          accounts: investmentAccounts.map(acc => ({
            id: acc._id,
            name: acc.name,
            balance: acc.balance,
            type: acc.type
          }))
        };
        break;

      case 'custom_accounts':
        const customAccounts = allAccounts.filter(acc => 
          customAccountIds.includes(acc._id.toString())
        );
        balance = customAccounts.reduce((sum, acc) => sum + (acc.balance || 0), 0);
        balanceMethodLabel = 'Custom Accounts Balance';
        balanceBreakdown = {
          totalBalance: balance,
          accountCount: customAccounts.length,
          accounts: customAccounts.map(acc => ({
            id: acc._id,
            name: acc.name,
            balance: acc.balance,
            type: acc.type
          }))
        };
        break;

      default:
        balance = netCashFlow;
        balanceMethodLabel = 'Net Cash Flow';
        balanceBreakdown = {
          income: totalIncome,
          expenses: totalExpenses,
          netFlow: netCashFlow
        };
    }

    // Category breakdown
    const categoryStats = {};
    allTransactions.forEach(t => {
      if (!categoryStats[t.category]) {
        categoryStats[t.category] = { income: 0, expense: 0, count: 0 };
      }
      if (t.type === 'income') {
        categoryStats[t.category].income += parseFloat(t.amount) || 0;
      } else {
        categoryStats[t.category].expense += parseFloat(t.amount) || 0;
      }
      categoryStats[t.category].count += 1;
    });

    res.json({
      status: 'success',
      data: {
        totalTransactions: allTransactions.length,
        totalIncome: Math.round(totalIncome * 100) / 100,
        totalExpenses: Math.round(totalExpenses * 100) / 100,
        balance: Math.round(balance * 100) / 100,
        balanceMethod: balanceMethod,
        balanceMethodLabel: balanceMethodLabel,
        balanceBreakdown: showBreakdown ? balanceBreakdown : undefined,
        incomeCount: allTransactions.filter(t => t.type === 'income').length,
        expenseCount: allTransactions.filter(t => t.type === 'expense').length,
        categoryStats,
        transactions: allTransactions.slice(0, 100) // Return first 100 for display
      }
    });
    
  } catch (err) {
    console.error('Transaction stats error:', err);
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
