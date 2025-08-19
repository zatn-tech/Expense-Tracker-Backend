// Update routes/reports.js - Fix date filtering to use transactionDate
const express = require('express');
const router = express.Router();
const archiver = require('archiver');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const auth = require('../middleware/auth');
const validateUserAccess = require('../middleware/validateUserAccess');

// Get financial summary for a user - FIXED to use transactionDate
router.get('/:userId/summary', auth, validateUserAccess, async (req, res) => {
  try {
    const { startDate, endDate, period = 'month' } = req.query;
    
    // Build date filter using transactionDate
    let dateFilter = { userId: req.params.userId };
    if (startDate && endDate) {
      dateFilter.transactionDate = {  // Changed from createdAt to transactionDate
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    } else {
      // Default to current month based on transaction dates
      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      dateFilter.transactionDate = { $gte: firstDay, $lte: lastDay };  // Changed from createdAt
    }

    const transactions = await Transaction.find(dateFilter).sort({ transactionDate: -1 });  // Changed sort
    
    // Calculate totals
    const income = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const expenses = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    const balance = income - expenses;

    // Category breakdown
    const categoryBreakdown = {};
    transactions.forEach(t => {
      if (!categoryBreakdown[t.category]) {
        categoryBreakdown[t.category] = { income: 0, expense: 0, total: 0 };
      }
      categoryBreakdown[t.category][t.type] += t.amount;
      categoryBreakdown[t.category].total += t.type === 'income' ? t.amount : -t.amount;
    });

    // Monthly trends (last 6 months) - FIXED to use transactionDate
    const monthlyTrends = [];
    for (let i = 5; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
      const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59);
      
      const monthTransactions = await Transaction.find({
        userId: req.params.userId,
        transactionDate: { $gte: monthStart, $lte: monthEnd }  // Changed from createdAt
      });
      
      const monthIncome = monthTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
      const monthExpenses = monthTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
      
      monthlyTrends.push({
        month: date.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }),
        income: monthIncome,
        expenses: monthExpenses,
        balance: monthIncome - monthExpenses
      });
    }

    res.json({
      summary: {
        totalIncome: income,
        totalExpenses: expenses,
        balance: balance,
        transactionCount: transactions.length,
        averageTransaction: transactions.length > 0 ? (income + expenses) / transactions.length : 0
      },
      categoryBreakdown,
      monthlyTrends,
      transactions: transactions.slice(0, 10), // Recent 10 transactions
      period: {
        startDate: dateFilter.transactionDate?.$gte || new Date(),
        endDate: dateFilter.transactionDate?.$lte || new Date()
      }
    });
  } catch (err) {
    console.error('Reports summary error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Export to PDF - FIXED to use transactionDate
router.get('/:userId/export/pdf', auth, validateUserAccess, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const user = await User.findById(req.params.userId);
    
    // Get transactions using transactionDate
    let dateFilter = { userId: req.params.userId };
    if (startDate && endDate) {
      dateFilter.transactionDate = {  // Changed from createdAt
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const transactions = await Transaction.find(dateFilter).sort({ transactionDate: -1 });  // Changed sort
    const income = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const expenses = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);

    // Create PDF (same code but with corrected transaction dates)
    const PDFDocument = require('pdfkit');
    const fs = require('fs');
    const path = require('path');
    
    const doc = new PDFDocument({ margin: 50 });
    const filename = `expense-report-${user.email}-${Date.now()}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    doc.pipe(res);

    // Header
    doc.fontSize(24).text('Expense Report', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Generated for: ${user.name} (${user.email})`);
    doc.text(`Report Date: ${new Date().toLocaleDateString('en-IN')}`);
    doc.text(`Period: ${startDate || 'All time'} to ${endDate || 'Present'}`);
    doc.moveDown();

    // Summary
    doc.fontSize(16).text('Summary', { underline: true });
    doc.fontSize(12);
    doc.text(`Total Income: ₹${income.toLocaleString('en-IN')}`);
    doc.text(`Total Expenses: ₹${expenses.toLocaleString('en-IN')}`);
    doc.text(`Net Balance: ₹${(income - expenses).toLocaleString('en-IN')}`);
    doc.text(`Total Transactions: ${transactions.length}`);
    doc.moveDown();

    // Transactions
    doc.fontSize(16).text('Transaction Details', { underline: true });
    doc.fontSize(10);
    
    let yPosition = doc.y;
    transactions.forEach((txn, index) => {
      if (yPosition > 700) {
        doc.addPage();
        yPosition = 50;
      }
      
      doc.text(`${index + 1}. ${txn.category} - ${txn.type.toUpperCase()}`, 50, yPosition);
      doc.text(`₹${txn.amount.toLocaleString('en-IN')}`, 300, yPosition);
      // Use transactionDate for display
      doc.text(new Date(txn.transactionDate || txn.createdAt).toLocaleDateString('en-IN'), 400, yPosition);
      doc.text(txn.description || '-', 480, yPosition);
      yPosition += 20;
    });

    doc.end();

  } catch (err) {
    console.error('PDF export error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Export to Excel - FIXED to use transactionDate
router.get('/:userId/export/excel', auth, validateUserAccess, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const user = await User.findById(req.params.userId);
    
    // Get transactions using transactionDate
    let dateFilter = { userId: req.params.userId };
    if (startDate && endDate) {
      dateFilter.transactionDate = {  // Changed from createdAt
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const transactions = await Transaction.find(dateFilter).sort({ transactionDate: -1 });

    // Create Excel workbook
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Transactions');

    // Headers
    worksheet.columns = [
      { header: 'Transaction Date', key: 'transactionDate', width: 15 },  // Changed header
      { header: 'Category', key: 'category', width: 20 },
      { header: 'Type', key: 'type', width: 10 },
      { header: 'Amount (₹)', key: 'amount', width: 15 },
      { header: 'Payment Method', key: 'paymentMethod', width: 15 },
      { header: 'Description', key: 'description', width: 30 }
    ];

    // Add data using transactionDate
    transactions.forEach(txn => {
      worksheet.addRow({
        transactionDate: new Date(txn.transactionDate || txn.createdAt).toLocaleDateString('en-IN'),
        category: txn.category,
        type: txn.type.toUpperCase(),
        amount: txn.amount,
        paymentMethod: txn.paymentMethod || 'cash',
        description: txn.description || '-'
      });
    });

    // Summary sheet
    const summarySheet = workbook.addWorksheet('Summary');
    const income = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const expenses = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);

    summarySheet.addRow(['Report Summary']);
    summarySheet.addRow(['Generated for:', user.name]);
    summarySheet.addRow(['Email:', user.email]);
    summarySheet.addRow(['Report Date:', new Date().toLocaleDateString('en-IN')]);
    summarySheet.addRow([]);
    summarySheet.addRow(['Total Income:', income]);
    summarySheet.addRow(['Total Expenses:', expenses]);
    summarySheet.addRow(['Net Balance:', income - expenses]);
    summarySheet.addRow(['Total Transactions:', transactions.length]);

    const filename = `expense-report-${user.email}-${Date.now()}.xlsx`;
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error('Excel export error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Export transactions CSV - FIXED to use transactionDate
router.get('/:userId/export/transactions-csv', auth, validateUserAccess, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const user = await User.findById(req.params.userId);
    
    // Build date filter using transactionDate
    let dateFilter = { userId: req.params.userId };
    if (startDate && endDate) {
      dateFilter.transactionDate = {  // Changed from createdAt
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const transactions = await Transaction.find(dateFilter).sort({ transactionDate: -1 });

    // Generate CSV with transactionDate
    let csvContent = 'Transaction Date,Time,Category,Type,Amount (₹),Payment Method,Description,Transaction ID\n';
    
    transactions.forEach(txn => {
      const date = new Date(txn.transactionDate || txn.createdAt);  // Use transactionDate
      csvContent += `"${date.toLocaleDateString('en-IN')}","${date.toLocaleTimeString('en-IN')}","${txn.category}","${txn.type.toUpperCase()}","${txn.amount}","${txn.paymentMethod || 'cash'}","${(txn.description || '').replace(/"/g, '""')}","${txn._id}"\n`;
    });

    const filename = `transactions-${user.email}-${Date.now()}.csv`;
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    res.send(csvContent);

  } catch (err) {
    console.error('CSV export error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Export all user data - FIXED to use transactionDate
router.get('/:userId/export/all-data', auth, validateUserAccess, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select('-password');
    const transactions = await Transaction.find({ userId: req.params.userId }).sort({ transactionDate: -1 });

    // Prepare data structure
    const exportData = {
      profile: {
        name: user.name,
        email: user.email,
        phone: user.phone || '',
        bio: user.bio || '',
        dateOfBirth: user.dateOfBirth,
        profilePicture: user.profilePicture || '',
        preferences: user.preferences || {},
        createdAt: user.createdAt,
        lastLogin: user.lastLogin,
        isActive: user.isActive
      },
      transactions: transactions.map(txn => ({
        id: txn._id,
        amount: txn.amount,
        type: txn.type,
        category: txn.category,
        description: txn.description || '',
        transactionDate: txn.transactionDate,  // Include actual transaction date
        paymentMethod: txn.paymentMethod || 'cash',
        createdAt: txn.createdAt,  // Keep upload date too
        updatedAt: txn.updatedAt
      })),
      statistics: {
        totalTransactions: transactions.length,
        totalIncome: transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0),
        totalExpenses: transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0),
        accountAge: Math.floor((new Date() - new Date(user.createdAt)) / (1000 * 60 * 60 * 24)),
        categoriesUsed: [...new Set(transactions.map(t => t.category))],
        exportDate: new Date().toISOString(),
        exportReason: 'User data export request'
      }
    };

    const filename = `user-data-export-${user.email}-${Date.now()}.json`;
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    res.json(exportData);

  } catch (err) {
    console.error('Data export error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Export data as ZIP archive with multiple formats
router.get('/:userId/export/archive', auth, validateUserAccess, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select('-password');
    const transactions = await Transaction.find({ userId: req.params.userId }).sort({ createdAt: -1 });

    // Create archive
    const archive = archiver('zip', { zlib: { level: 9 } });
    const filename = `complete-data-export-${user.email}-${Date.now()}.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    archive.pipe(res);

    // 1. Profile data as JSON
    const profileData = {
      name: user.name,
      email: user.email,
      phone: user.phone || '',
      bio: user.bio || '',
      dateOfBirth: user.dateOfBirth,
      preferences: user.preferences || {},
      createdAt: user.createdAt,
      lastLogin: user.lastLogin
    };
    archive.append(JSON.stringify(profileData, null, 2), { name: 'profile.json' });

    // 2. Transactions as CSV
    let csvContent = 'Date,Category,Type,Amount,Description\n';
    transactions.forEach(txn => {
      csvContent += `"${new Date(txn.createdAt).toLocaleDateString('en-IN')}","${txn.category}","${txn.type}","${txn.amount}","${(txn.description || '').replace(/"/g, '""')}"\n`;
    });
    archive.append(csvContent, { name: 'transactions.csv' });

    // 3. Summary report as text
    const income = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const expenses = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    
    const summaryText = `
EXPENSE TRACKER - DATA EXPORT SUMMARY
=====================================

Account Information:
- Name: ${user.name}
- Email: ${user.email}
- Account Created: ${new Date(user.createdAt).toLocaleDateString('en-IN')}
- Last Login: ${user.lastLogin ? new Date(user.lastLogin).toLocaleDateString('en-IN') : 'Never'}

Financial Summary:
- Total Income: ₹${income.toLocaleString('en-IN')}
- Total Expenses: ₹${expenses.toLocaleString('en-IN')}
- Net Balance: ₹${(income - expenses).toLocaleString('en-IN')}
- Total Transactions: ${transactions.length}

Categories Used:
${[...new Set(transactions.map(t => t.category))].map(cat => `- ${cat}`).join('\n')}

Export Details:
- Export Date: ${new Date().toLocaleDateString('en-IN')}
- Export Time: ${new Date().toLocaleTimeString('en-IN')}
- Data Format: Complete archive with JSON, CSV, and TXT files
- Privacy: This export contains all your personal data stored in our system

Note: This export is generated for data portability and backup purposes.
Keep this file secure as it contains sensitive financial information.
    `;
    archive.append(summaryText, { name: 'README.txt' });

    // 4. Transactions as JSON (detailed)
    const transactionsData = {
      metadata: {
        totalCount: transactions.length,
        exportDate: new Date().toISOString(),
        dateRange: {
          earliest: transactions.length > 0 ? transactions[transactions.length - 1].createdAt : null,
          latest: transactions.length > 0 ? transactions[0].createdAt : null
        }
      },
      transactions: transactions
    };
    archive.append(JSON.stringify(transactionsData, null, 2), { name: 'transactions-detailed.json' });

    // Finalize archive
    archive.finalize();

  } catch (err) {
    console.error('Archive export error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Export transactions only as CSV
router.get('/:userId/export/transactions-csv', auth, validateUserAccess, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const user = await User.findById(req.params.userId);
    
    // Build date filter
    let dateFilter = { userId: req.params.userId };
    if (startDate && endDate) {
      dateFilter.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const transactions = await Transaction.find(dateFilter).sort({ createdAt: -1 });

    // Generate CSV
    let csvContent = 'Date,Time,Category,Type,Amount (₹),Description,Transaction ID\n';
    
    transactions.forEach(txn => {
      const date = new Date(txn.createdAt);
      csvContent += `"${date.toLocaleDateString('en-IN')}","${date.toLocaleTimeString('en-IN')}","${txn.category}","${txn.type.toUpperCase()}","${txn.amount}","${(txn.description || '').replace(/"/g, '""')}","${txn._id}"\n`;
    });

    const filename = `transactions-${user.email}-${Date.now()}.csv`;
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    res.send(csvContent);

  } catch (err) {
    console.error('CSV export error:', err);
    res.status(500).json({ error: err.message });
  }
});


module.exports = router;
