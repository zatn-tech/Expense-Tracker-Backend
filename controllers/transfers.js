const Transfer = require('../models/Transfer');
const Account = require('../models/Account');
const Transaction = require('../models/Transaction');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

// Create a new transfer
exports.createTransfer = catchAsync(async (req, res, next) => {
  const { fromAccountId, toAccountId, amount: rawAmount, description, transferDate, notes } = req.body;
  const userId = req.user._id;
  const amount = parseFloat(rawAmount);

  if (!fromAccountId || !toAccountId || !amount) {
    return next(new AppError('From account, to account, and amount are required', 400));
  }

  if (fromAccountId === toAccountId) {
    return next(new AppError('Cannot transfer to the same account', 400));
  }

  if (amount <= 0 || isNaN(amount)) {
    return next(new AppError('Transfer amount must be a valid number greater than 0', 400));
  }

  // Ensure amount has at most 2 decimal places
  if (amount.toString().includes('.') && amount.toString().split('.')[1].length > 2) {
    return next(new AppError('Transfer amount cannot have more than 2 decimal places', 400));
  }

  // Check for reasonable transfer amount (max 1 billion)
  if (amount > 1000000000) {
    return next(new AppError('Transfer amount cannot exceed 1 billion', 400));
  }

  // Start database session for transaction
  let session;
  try {
    session = await Transfer.startSession();
    session.startTransaction();
    
    console.log('Starting transfer process for user:', userId);
    
    // Step 1: Get accounts and validate
    const fromAccount = await Account.findOne({ _id: fromAccountId, userId, isActive: true }).session(session);
    if (!fromAccount) {
      throw new AppError('Source account not found', 404);
    }

    const toAccount = await Account.findOne({ _id: toAccountId, userId, isActive: true }).session(session);
    if (!toAccount) {
      throw new AppError('Destination account not found', 404);
    }

    console.log('Accounts found:', { fromAccount: fromAccount.name, toAccount: toAccount.name });

    // Check if accounts have same currency
    if (fromAccount.currency !== toAccount.currency) {
      throw new AppError('Cannot transfer between accounts with different currencies', 400);
    }

    // Check sufficient balance
    if (fromAccount.balance < amount) {
      throw new AppError(`Insufficient balance in source account. Available: ${fromAccount.balance}, Required: ${amount}`, 400);
    }

    // Additional validation: ensure balance is a valid number
    if (isNaN(fromAccount.balance) || isNaN(toAccount.balance)) {
      throw new AppError('Invalid account balance detected', 400);
    }

    console.log('Pre-transfer balances:', { 
      fromAccount: { balance: fromAccount.balance, type: typeof fromAccount.balance }, 
      toAccount: { balance: toAccount.balance, type: typeof toAccount.balance },
      amount: { value: amount, type: typeof amount }
    });

    // Step 2: Create transfer record first
    const transfer = new Transfer({
      userId,
      fromAccountId,
      toAccountId,
      amount,
      description: description || 'Transfer between accounts',
      transferDate: transferDate || new Date(),
      notes,
      status: 'completed'
    });

    await transfer.save({ session });
    console.log('Transfer record created:', transfer._id);

    // Step 3: Update source account balance (debit)
    const newFromBalance = Number((fromAccount.balance - amount).toFixed(2));
    console.log('Source account balance calculation:', { 
      oldBalance: fromAccount.balance, 
      amount: amount, 
      newBalance: newFromBalance,
      calculation: `${fromAccount.balance} - ${amount} = ${newFromBalance}`
    });
    await Account.updateOne(
      { _id: fromAccountId },
      { balance: newFromBalance }
    ).session(session);
    console.log('Source account debited:', { oldBalance: fromAccount.balance, newBalance: newFromBalance });

    // Step 4: Update destination account balance (credit)
    const newToBalance = Number((toAccount.balance + amount).toFixed(2));
    console.log('Destination account balance calculation:', { 
      oldBalance: toAccount.balance, 
      amount: amount, 
      newBalance: newToBalance,
      calculation: `${toAccount.balance} + ${amount} = ${newToBalance}`
    });
    await Account.updateOne(
      { _id: toAccountId },
      { balance: newToBalance }
    ).session(session);
    console.log('Destination account credited:', { oldBalance: toAccount.balance, newBalance: newToBalance });

    // Step 5: Create transaction records
    const outgoingTransaction = new Transaction({
      userId,
      accountId: fromAccountId,
      amount,
      type: 'transfer',
      category: 'Transfer',
      description: `Transfer to ${toAccount.name}: ${description || 'Transfer between accounts'}`,
      transactionDate: transferDate || new Date(),
      paymentMethod: 'transfer',
      transferId: transfer._id,
      transferType: 'outgoing'
    });

    const incomingTransaction = new Transaction({
      userId,
      accountId: toAccountId,
      amount,
      type: 'transfer',
      category: 'Transfer',
      description: `Transfer from ${fromAccount.name}: ${description || 'Transfer between accounts'}`,
      transactionDate: transferDate || new Date(),
      paymentMethod: 'transfer',
      transferId: transfer._id,
      transferType: 'incoming'
    });

    await outgoingTransaction.save({ session });
    console.log('Outgoing transaction created:', { 
      id: outgoingTransaction._id, 
      amount: outgoingTransaction.amount, 
      type: outgoingTransaction.type 
    });
    
    await incomingTransaction.save({ session });
    console.log('Incoming transaction created:', { 
      id: incomingTransaction._id, 
      amount: incomingTransaction.amount, 
      type: incomingTransaction.type 
    });
    
    console.log('Transaction records created');

    // Commit the transaction
    await session.commitTransaction();
    console.log('Transfer transaction committed successfully');

    // Step 6: Get final account data for response
    const finalFromAccount = await Account.findById(fromAccountId);
    const finalToAccount = await Account.findById(toAccountId);

    // Populate transfer details for response
    await transfer.populate([
      { path: 'fromAccountId', select: 'name type currency' },
      { path: 'toAccountId', select: 'name type currency' }
    ]);

    console.log('Final balances:', { 
      fromAccount: { 
        id: finalFromAccount._id,
        name: finalFromAccount.name,
        balance: finalFromAccount.balance,
        expectedBalance: newFromBalance
      }, 
      toAccount: { 
        id: finalToAccount._id,
        name: finalToAccount.name,
        balance: finalToAccount.balance,
        expectedBalance: newToBalance
      }
    });

    // Summary log
    console.log('Transfer completed successfully:', {
      transferId: transfer._id,
      userId: userId,
      amount: amount,
      fromAccount: {
        id: fromAccountId,
        name: fromAccount.name,
        balanceChange: -amount,
        oldBalance: fromAccount.balance,
        newBalance: finalFromAccount.balance
      },
      toAccount: {
        id: toAccountId,
        name: toAccount.name,
        balanceChange: amount,
        oldBalance: toAccount.balance,
        newBalance: finalToAccount.balance
      },
      transactionsCreated: 2
    });

    res.status(201).json({
      status: 'success',
      message: 'Transfer completed successfully',
      data: {
        transfer,
        fromAccount: { 
          id: finalFromAccount._id, 
          name: finalFromAccount.name, 
          newBalance: finalFromAccount.balance 
        },
        toAccount: { 
          id: finalToAccount._id, 
          name: finalToAccount.name, 
          newBalance: finalToAccount.balance 
        }
      }
    });

  } catch (error) {
    console.error('Transfer error:', error);
    
    // Rollback transaction if session exists and is in transaction
    if (session && session.inTransaction()) {
      try {
        await session.abortTransaction();
        console.log('Transfer transaction rolled back due to error');
      } catch (abortError) {
        console.error('Error rolling back transaction:', abortError);
      }
    }
    
    throw error;
  } finally {
    // End session if it exists
    if (session) {
      try {
        await session.endSession();
        console.log('Transfer session ended');
      } catch (endError) {
        console.error('Error ending session:', endError);
      }
    }
  }
});

// Get all transfers for a user
exports.getUserTransfers = catchAsync(async (req, res, next) => {
  const userId = req.user._id;
  const { limit = 50, skip = 0, status, startDate, endDate } = req.query;

  const transfers = await Transfer.getUserTransfers(userId, {
    limit: parseInt(limit),
    skip: parseInt(skip),
    status,
    startDate,
    endDate
  });

  const total = await Transfer.countDocuments({ userId });

  res.json({
    status: 'success',
    data: transfers,
    pagination: {
      total,
      limit: parseInt(limit),
      skip: parseInt(skip),
      hasMore: total > parseInt(skip) + transfers.length
    }
  });
});

// Get a specific transfer
exports.getTransfer = catchAsync(async (req, res, next) => {
  const transfer = await Transfer.findOne({
    _id: req.params.transferId,
    userId: req.user._id
  }).populate([
    { path: 'fromAccountId', select: 'name type currency' },
    { path: 'toAccountId', select: 'name type currency' }
  ]);

  if (!transfer) {
    return next(new AppError('Transfer not found', 404));
  }

  res.json({
    status: 'success',
    data: transfer
  });
});

// Update a transfer
exports.updateTransfer = catchAsync(async (req, res, next) => {
  const { description, notes, transferDate } = req.body;
  const transferId = req.params.transferId;
  const userId = req.user._id;

  // Find transfer
  const transfer = await Transfer.findOne({
    _id: transferId,
    userId,
    status: 'completed'
  });

  if (!transfer) {
    return next(new AppError('Transfer not found or cannot be modified', 404));
  }

  // Start session for transaction
  let session;
  try {
    session = await Transfer.startSession();
    session.startTransaction();

    // Update transfer
    if (description !== undefined) transfer.description = description;
    if (notes !== undefined) transfer.notes = notes;
    if (transferDate !== undefined) transfer.transferDate = new Date(transferDate);

    await transfer.save({ session });

    // Update associated transactions
    const [outgoingTransaction, incomingTransaction] = await Promise.all([
      Transaction.findOne({ transferId, transferType: 'outgoing' }).session(session),
      Transaction.findOne({ transferId, transferType: 'incoming' }).session(session)
    ]);

    if (outgoingTransaction) {
      outgoingTransaction.description = `Transfer to ${transfer.toAccountId.name}: ${transfer.description}`;
      outgoingTransaction.transactionDate = transfer.transferDate;
      await outgoingTransaction.save({ session });
    }

    if (incomingTransaction) {
      incomingTransaction.description = `Transfer from ${transfer.fromAccountId.name}: ${transfer.description}`;
      incomingTransaction.transactionDate = transfer.transferDate;
      await incomingTransaction.save({ session });
    }

    await session.commitTransaction();

    // Populate for response
    await transfer.populate([
      { path: 'fromAccountId', select: 'name type currency' },
      { path: 'toAccountId', select: 'name type currency' }
    ]);

    res.json({
      status: 'success',
      message: 'Transfer updated successfully',
      data: transfer
    });

  } catch (error) {
    if (session && session.inTransaction()) {
      try {
        await session.abortTransaction();
      } catch (abortError) {
        console.error('Error aborting transaction:', abortError);
      }
    }
    throw error;
  } finally {
    if (session) {
      try {
        await session.endSession();
      } catch (endError) {
        console.error('Error ending session:', endError);
      }
    }
  }
});

// Revert a transfer (reverse the transfer)
exports.deleteTransfer = catchAsync(async (req, res, next) => {
  const transferId = req.params.transferId;
  const userId = req.user._id;

  console.log('Starting transfer revert process:', { transferId, userId });

  // Find transfer
  const transfer = await Transfer.findOne({
    _id: transferId,
    userId,
    status: 'completed'
  });

  if (!transfer) {
    return next(new AppError('Transfer not found or cannot be reverted', 404));
  }

  console.log('Found transfer for reversal:', {
    transferId: transfer._id,
    amount: transfer.amount,
    fromAccount: transfer.fromAccountId,
    toAccount: transfer.toAccountId
  });

  // Instead of using transactions, use a simpler approach with proper error handling
  try {

    // Get accounts
    console.log('Fetching accounts for transfer reversal:', {
      fromAccountId: transfer.fromAccountId,
      toAccountId: transfer.toAccountId
    });
    
    const [fromAccount, toAccount] = await Promise.all([
      Account.findById(transfer.fromAccountId),
      Account.findById(transfer.toAccountId)
    ]);

    if (!fromAccount || !toAccount) {
      throw new AppError('Associated accounts not found', 404);
    }

    console.log('Found accounts for reversal:', {
      fromAccount: { id: fromAccount._id, name: fromAccount.name, balance: fromAccount.balance },
      toAccount: { id: toAccount._id, name: toAccount.name, balance: toAccount.balance }
    });

    // Check if accounts have sufficient balance for reversal
    console.log('Checking balance for reversal:', {
      toAccountBalance: toAccount.balance,
      transferAmount: transfer.amount,
      hasSufficientBalance: toAccount.balance >= transfer.amount
    });
    
    if (toAccount.balance < transfer.amount) {
      throw new AppError(`Cannot reverse transfer: insufficient balance in destination account. Available: ${toAccount.balance}, Required: ${transfer.amount}`, 400);
    }

    // Additional validation: ensure balance is a valid number
    if (isNaN(fromAccount.balance) || isNaN(toAccount.balance)) {
      throw new AppError('Invalid account balance detected during reversal', 400);
    }

    // Reverse account balances
    console.log('Reversing transfer balances:', {
      transferAmount: transfer.amount,
      fromAccountOldBalance: fromAccount.balance,
      toAccountOldBalance: toAccount.balance
    });
    
    // Ensure balances are numbers and add/subtract the transfer amount
    const fromAccountNewBalance = Number((fromAccount.balance + transfer.amount).toFixed(2));
    const toAccountNewBalance = Number((toAccount.balance - transfer.amount).toFixed(2));
    
    console.log('Reversed balances:', {
      fromAccountNewBalance,
      toAccountNewBalance,
      calculation: `From: ${fromAccount.balance} + ${transfer.amount} = ${fromAccountNewBalance}, To: ${toAccount.balance} - ${transfer.amount} = ${toAccountNewBalance}`
    });

    // Update account balances
    const [fromAccountUpdate, toAccountUpdate] = await Promise.all([
      Account.updateOne(
        { _id: fromAccount._id },
        { balance: fromAccountNewBalance }
      ),
      Account.updateOne(
        { _id: toAccount._id },
        { balance: toAccountNewBalance }
      )
    ]);

    console.log('Account balance updates:', {
      fromAccount: fromAccountUpdate,
      toAccount: toAccountUpdate
    });

    // Delete associated transactions
    console.log('Deleting associated transactions for transfer:', transferId);
    
    // Delete associated transactions
    const deletedTransactions = await Transaction.deleteMany({ transferId });
    console.log('Deleted associated transactions:', { 
      transferId: transfer._id, 
      deletedCount: deletedTransactions.deletedCount 
    });

    // Update transfer status
    console.log('Updating transfer status to cancelled:', transferId);
    
    const transferUpdateResult = await Transfer.updateOne(
      { _id: transferId },
      { status: 'cancelled' }
    );
    
    console.log('Transfer status update result:', transferUpdateResult);
    
    // Update local transfer object for response
    transfer.status = 'cancelled';

    console.log('Transfer reversal completed successfully');
    


    const responseData = {
      transfer,
      fromAccount: { id: fromAccount._id, name: fromAccount.name, newBalance: fromAccountNewBalance },
      toAccount: { id: toAccount._id, name: toAccount.name, newBalance: toAccountNewBalance }
    };

    console.log('Sending success response:', responseData);

    res.json({
      status: 'success',
      message: 'Transfer reverted successfully',
      data: responseData
    });

  } catch (error) {
    console.error('Error during transfer reversal:', error);
    
    // Send error response
    return res.status(500).json({
      status: 'error',
      message: 'Failed to revert transfer',
      error: error.message
    });
  }
});

// Get transfer statistics
exports.getTransferStats = catchAsync(async (req, res, next) => {
  const userId = req.user._id;
  const { period = 'month' } = req.query;

  const stats = await Transfer.getTransferStats(userId, period);

  res.json({
    status: 'success',
    data: stats
  });
});

// Validate transfer (check if possible without executing)
exports.validateTransfer = catchAsync(async (req, res, next) => {
  const { fromAccountId, toAccountId, amount: rawAmount } = req.body;
  const userId = req.user._id;
  const amount = parseFloat(rawAmount);

  if (!fromAccountId || !toAccountId || !amount) {
    return next(new AppError('From account, to account, and amount are required', 400));
  }

  if (fromAccountId === toAccountId) {
    return next(new AppError('Cannot transfer to the same account', 400));
  }

  if (amount <= 0 || isNaN(amount)) {
    return next(new AppError('Transfer amount must be a valid number greater than 0', 400));
  }

  // Ensure amount has at most 2 decimal places
  if (amount.toString().includes('.') && amount.toString().split('.')[1].length > 2) {
    return next(new AppError('Transfer amount cannot have more than 2 decimal places', 400));
  }

  // Check accounts
  const [fromAccount, toAccount] = await Promise.all([
    Account.findOne({ _id: fromAccountId, userId, isActive: true }),
    Account.findOne({ _id: toAccountId, userId, isActive: true })
  ]);

  if (!fromAccount || !toAccount) {
    return next(new AppError('One or both accounts not found', 404));
  }

  console.log('Transfer validation:', {
    fromAccount: { id: fromAccount._id, name: fromAccount.name, balance: fromAccount.balance, currency: fromAccount.currency },
    toAccount: { id: toAccount._id, name: toAccount.name, balance: toAccount.balance, currency: toAccount.currency },
    amount: { value: amount, type: typeof amount }
  });

  if (fromAccount.currency !== toAccount.currency) {
    return next(new AppError('Cannot transfer between accounts with different currencies', 400));
  }

  if (fromAccount.balance < amount) {
    return next(new AppError(`Insufficient balance in source account. Available: ${fromAccount.balance}, Required: ${amount}`, 400));
  }

  // Additional validation: ensure balance is a valid number
  if (isNaN(fromAccount.balance) || isNaN(toAccount.balance)) {
    return next(new AppError('Invalid account balance detected', 400));
  }

  console.log('Transfer validation successful');
  res.json({
    status: 'success',
    message: 'Transfer is valid',
    data: {
      fromAccount: { id: fromAccount._id, name: fromAccount.name, currentBalance: fromAccount.balance },
      toAccount: { id: toAccount._id, name: toAccount.name, currentBalance: toAccount.balance },
      amount,
      currency: fromAccount.currency
    }
  });
}); 