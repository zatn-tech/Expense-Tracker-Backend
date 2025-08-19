const EmailConnection = require('../models/EmailConnection');
const EmailTransaction = require('../models/EmailTransaction');
const EmailScanner = require('../utils/emailScanner');
const EmailTransactionDetector = require('../utils/emailTransactionDetector');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

class EmailConnectionController {
  constructor() {
    this.scanner = new EmailScanner();
    this.detector = new EmailTransactionDetector();
  }

  /**
   * Get all email connections for a user
   */
  getUserConnections = catchAsync(async (req, res) => {
    const connections = await EmailConnection.getUserConnections(req.params.userId);
    
    res.json({
      status: 'success',
      data: connections
    });
  });

  /**
   * Get a specific email connection
   */
  getConnection = catchAsync(async (req, res) => {
    const connection = await EmailConnection.findOne({
      _id: req.params.connectionId,
      userId: req.params.userId,
      isActive: true
    });

    if (!connection) {
      throw new AppError('Email connection not found', 404);
    }

    res.json({
      status: 'success',
      data: connection
    });
  });

  /**
   * Create a new email connection
   */
  createConnection = catchAsync(async (req, res) => {
    const {
      provider,
      email,
      oauth2,
      imap,
      syncSettings
    } = req.body;

    // Validate required fields
    if (!provider || !email) {
      throw new AppError('Provider and email are required', 400);
    }

    // Check if connection already exists for this user and email
    const existingConnection = await EmailConnection.findOne({
      userId: req.params.userId,
      email: email.toLowerCase(),
      isActive: true
    });

    if (existingConnection) {
      throw new AppError('Email connection already exists for this email', 400);
    }

    // Validate provider-specific requirements
    if (provider === 'gmail') {
      if (!oauth2 || !oauth2.accessToken) {
        throw new AppError(
          'OAuth2 credentials required for Gmail. Please complete the Google OAuth2 authorization flow to get an access token. ' +
          'For IMAP-based email scanning, please use the Custom provider option.',
          400
        );
      }
    }

    if (provider === 'custom') {
      if (!imap || !imap.host || !imap.username || !imap.password) {
        throw new AppError(
          'IMAP credentials required for custom provider. Please provide host, username, and password.',
          400
        );
      }
    }

    // Create connection
    const connection = new EmailConnection({
      userId: req.params.userId,
      provider,
      email: email.toLowerCase(),
      oauth2,
      imap,
      syncSettings: {
        enabled: syncSettings?.enabled ?? true,
        frequency: syncSettings?.frequency ?? 'daily',
        scanDays: syncSettings?.scanDays ?? 7,
        autoCreateTransactions: syncSettings?.autoCreateTransactions ?? false,
        categories: syncSettings?.categories ?? [],
        minAmount: syncSettings?.minAmount ?? 0,
        maxAmount: syncSettings?.maxAmount ?? 1000000
      }
    });

    await connection.save();

    res.status(201).json({
      status: 'success',
      data: connection
    });
  });

  /**
   * Update an email connection
   */
  updateConnection = catchAsync(async (req, res) => {
    const connection = await EmailConnection.findOne({
      _id: req.params.connectionId,
      userId: req.params.userId,
      isActive: true
    });

    if (!connection) {
      throw new AppError('Email connection not found', 404);
    }

    const {
      email,
      provider,
      oauth2,
      imap,
      syncSettings,
      isActive
    } = req.body;

    // Update fields
    if (email !== undefined) connection.email = email.toLowerCase();
    if (provider !== undefined) connection.provider = provider;
    if (oauth2 !== undefined) connection.oauth2 = oauth2;
    if (imap !== undefined) connection.imap = imap;
    if (syncSettings !== undefined) {
      connection.syncSettings = { ...connection.syncSettings, ...syncSettings };
    }
    if (isActive !== undefined) connection.isActive = isActive;

    await connection.save();

    res.json({
      status: 'success',
      data: connection
    });
  });

  /**
   * Delete an email connection
   */
  deleteConnection = catchAsync(async (req, res) => {
    const connection = await EmailConnection.findOne({
      _id: req.params.connectionId,
      userId: req.params.userId,
      isActive: true
    });

    if (!connection) {
      throw new AppError('Email connection not found', 404);
    }

    // Soft delete
    connection.isActive = false;
    await connection.save();

    res.json({
      status: 'success',
      message: 'Email connection deleted successfully'
    });
  });

  /**
   * Test email connection
   */
  testConnection = catchAsync(async (req, res) => {
    const connection = await EmailConnection.findOne({
      _id: req.params.connectionId,
      userId: req.params.userId,
      isActive: true
    });

    if (!connection) {
      throw new AppError('Email connection not found', 404);
    }

    const result = await this.scanner.testConnection(connection);

    res.json({
      status: 'success',
      data: result
    });
  });

  /**
   * Scan emails for transactions
   */
  scanEmails = catchAsync(async (req, res) => {
    const connection = await EmailConnection.findOne({
      _id: req.params.connectionId,
      userId: req.params.userId,
      isActive: true
    });

    if (!connection) {
      throw new AppError('Email connection not found', 404);
    }

    if (!connection.syncSettings.enabled) {
      throw new AppError('Email scanning is disabled for this connection', 400);
    }

    // Start scanning in background
    const scanResult = await this.scanner.scanEmails(connection);

    res.json({
      status: 'success',
      data: scanResult
    });
  });

  /**
   * Get detected email transactions
   */
  getEmailTransactions = catchAsync(async (req, res) => {
    const { status, limit = 50, page = 1 } = req.query;
    
    let query = { userId: req.params.userId };
    if (status) {
      query.status = status;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const transactions = await EmailTransaction.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('emailConnectionId', 'provider email');

    const total = await EmailTransaction.countDocuments(query);

    res.json({
      status: 'success',
      data: {
        transactions,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  });

  /**
   * Get a specific email transaction
   */
  getEmailTransaction = catchAsync(async (req, res) => {
    const transaction = await EmailTransaction.findOne({
      _id: req.params.transactionId,
      userId: req.params.userId
    }).populate('emailConnectionId', 'provider email');

    if (!transaction) {
      throw new AppError('Email transaction not found', 404);
    }

    res.json({
      status: 'success',
      data: transaction
    });
  });

  /**
   * Approve an email transaction
   */
  approveTransaction = catchAsync(async (req, res) => {
    const { accountId } = req.body;

    if (!accountId) {
      throw new AppError('Account ID is required', 400);
    }

    // Validate accountId format
    if (!accountId.match(/^[0-9a-fA-F]{24}$/)) {
      throw new AppError('Invalid account ID format. Must be a valid MongoDB ObjectId', 400);
    }

    // Validate that the account exists and belongs to the user
    const Account = require('../models/Account');
    const account = await Account.findOne({
      _id: accountId,
      userId: req.params.userId,
      isActive: true
    });

    if (!account) {
      throw new AppError('Account not found or does not belong to user', 400);
    }

    const emailTransaction = await EmailTransaction.findOne({
      _id: req.params.transactionId,
      userId: req.params.userId,
      status: 'pending'
    });

    if (!emailTransaction) {
      throw new AppError('Email transaction not found or already processed', 404);
    }

    try {
      // Create actual transaction
      const transaction = await this.detector.createTransactionFromEmail(emailTransaction, accountId);
      
      // Mark email transaction as approved
      await emailTransaction.approve(accountId);

      res.json({
        status: 'success',
        data: {
          emailTransaction,
          createdTransaction: transaction
        }
      });
    } catch (error) {
      console.error('Error approving email transaction:', error);
      
      // Provide more specific error messages
      if (error.message.includes('Valid accountId is required')) {
        throw new AppError('Invalid account ID provided', 400);
      } else if (error.message.includes('Invalid accountId format')) {
        throw new AppError('Account ID format is invalid', 400);
      } else if (error.name === 'ValidationError') {
        throw new AppError(`Transaction validation failed: ${error.message}`, 400);
      } else {
        throw new AppError(`Failed to create transaction: ${error.message}`, 500);
      }
    }
  });

  /**
   * Reject an email transaction
   */
  rejectTransaction = catchAsync(async (req, res) => {
    const emailTransaction = await EmailTransaction.findOne({
      _id: req.params.transactionId,
      userId: req.params.userId,
      status: 'pending'
    });

    if (!emailTransaction) {
      throw new AppError('Email transaction not found or already processed', 404);
    }

    await emailTransaction.reject();

    res.json({
      status: 'success',
      data: emailTransaction
    });
  });

  /**
   * Modify an email transaction
   */
  modifyTransaction = catchAsync(async (req, res) => {
    const {
      amount,
      type,
      category,
      description,
      date,
      accountId
    } = req.body;

    const emailTransaction = await EmailTransaction.findOne({
      _id: req.params.transactionId,
      userId: req.params.userId,
      status: 'pending'
    });

    if (!emailTransaction) {
      throw new AppError('Email transaction not found or already processed', 404);
    }

    const modifiedData = {};
    if (amount !== undefined) modifiedData.amount = amount;
    if (type !== undefined) modifiedData.type = type;
    if (category !== undefined) modifiedData.category = category;
    if (description !== undefined) modifiedData.description = description;
    if (date !== undefined) modifiedData.date = new Date(date);
    if (accountId !== undefined) {
      // Validate accountId format
      if (!accountId.match(/^[0-9a-fA-F]{24}$/)) {
        throw new AppError('Invalid account ID format. Must be a valid MongoDB ObjectId', 400);
      }
      
      // Validate that the account exists and belongs to the user
      const Account = require('../models/Account');
      const account = await Account.findOne({
        _id: accountId,
        userId: req.params.userId,
        isActive: true
      });

      if (!account) {
        throw new AppError('Account not found or does not belong to user', 400);
      }
      
      modifiedData.accountId = accountId;
    }

    await emailTransaction.modify(modifiedData);

    // If accountId is provided, create the transaction
    let createdTransaction = null;
    if (accountId) {
      try {
        createdTransaction = await this.detector.createTransactionFromEmail(emailTransaction, accountId);
        await emailTransaction.autoCreate(createdTransaction._id);
      } catch (error) {
        console.error('Error creating transaction from modified email transaction:', error);
        throw new AppError(`Failed to create transaction: ${error.message}`, 500);
      }
    }

    res.json({
      status: 'success',
      data: {
        emailTransaction,
        createdTransaction
      }
    });
  });

  /**
   * Process all pending transactions
   */
  processPendingTransactions = catchAsync(async (req, res) => {
    const { accountId } = req.body;

    if (!accountId) {
      throw new AppError('Account ID is required', 400);
    }

    // Validate accountId format
    if (!accountId.match(/^[0-9a-fA-F]{24}$/)) {
      throw new AppError('Invalid account ID format. Must be a valid MongoDB ObjectId', 400);
    }

    // Validate that the account exists and belongs to the user
    const Account = require('../models/Account');
    const account = await Account.findOne({
      _id: accountId,
      userId: req.params.userId,
      isActive: true
    });

    if (!account) {
      throw new AppError('Account not found or does not belong to user', 400);
    }

    try {
      const result = await this.detector.processPendingTransactions(req.params.userId, accountId);

      res.json({
        status: 'success',
        data: result
      });
    } catch (error) {
      console.error('Error processing pending transactions:', error);
      throw new AppError(`Failed to process pending transactions: ${error.message}`, 500);
    }
  });

  /**
   * Get email scanning statistics
   */
  getScanningStats = catchAsync(async (req, res) => {
    const userId = req.params.userId;

    const stats = await EmailTransaction.aggregate([
      { $match: { userId: require('mongoose').Types.ObjectId(userId) } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$detectedAmount' }
        }
      }
    ]);

    const totalConnections = await EmailConnection.countDocuments({
      userId,
      isActive: true
    });

    const activeConnections = await EmailConnection.countDocuments({
      userId,
      isActive: true,
      'syncSettings.enabled': true
    });

    res.json({
      status: 'success',
      data: {
        connections: {
          total: totalConnections,
          active: activeConnections
        },
        transactions: stats,
        summary: {
          totalDetected: stats.reduce((sum, stat) => sum + stat.count, 0),
          totalAmount: stats.reduce((sum, stat) => sum + stat.totalAmount, 0)
        }
      }
    });
  });

  /**
   * Refresh OAuth2 tokens
   */
  refreshTokens = catchAsync(async (req, res) => {
    const connection = await EmailConnection.findOne({
      _id: req.params.connectionId,
      userId: req.params.userId,
      isActive: true
    });

    if (!connection) {
      throw new AppError('Email connection not found', 404);
    }

    const result = await this.scanner.refreshTokens(connection);

    res.json({
      status: 'success',
      data: result
    });
  });
}

module.exports = new EmailConnectionController(); 