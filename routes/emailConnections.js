const express = require('express');
const emailConnectionController = require('../controllers/emailConnections');
const auth = require('../middleware/auth');
const validateUserAccess = require('../middleware/validateUserAccess');

const router = express.Router();

// Apply auth middleware to all routes
router.use(auth);

// Email Connection Management
router.get('/:userId/email-connections', validateUserAccess, emailConnectionController.getUserConnections);
router.post('/:userId/email-connections', validateUserAccess, emailConnectionController.createConnection);
router.get('/:userId/email-connections/:connectionId', validateUserAccess, emailConnectionController.getConnection);
router.put('/:userId/email-connections/:connectionId', validateUserAccess, emailConnectionController.updateConnection);
router.delete('/:userId/email-connections/:connectionId', validateUserAccess, emailConnectionController.deleteConnection);

// Email Connection Operations
router.post('/:userId/email-connections/:connectionId/test', validateUserAccess, emailConnectionController.testConnection);
router.post('/:userId/email-connections/:connectionId/scan', validateUserAccess, emailConnectionController.scanEmails);
router.post('/:userId/email-connections/:connectionId/refresh-tokens', validateUserAccess, emailConnectionController.refreshTokens);

// Email Transaction Management
router.get('/:userId/email-transactions', validateUserAccess, emailConnectionController.getEmailTransactions);
// Specific action routes must come before the general :transactionId route
router.post('/:userId/email-transactions/:transactionId/approve', validateUserAccess, emailConnectionController.approveTransaction);
router.post('/:userId/email-transactions/:transactionId/reject', validateUserAccess, emailConnectionController.rejectTransaction);
router.put('/:userId/email-transactions/:transactionId/modify', validateUserAccess, emailConnectionController.modifyTransaction);
router.get('/:userId/email-transactions/:transactionId', validateUserAccess, emailConnectionController.getEmailTransaction);

// Debug: Log all registered routes
console.log('📋 Email Connection Routes Registered:');
console.log('  GET    /:userId/email-transactions');
console.log('  POST   /:userId/email-transactions/:transactionId/approve');
console.log('  POST   /:userId/email-transactions/:transactionId/reject');
console.log('  PUT    /:userId/email-transactions/:transactionId/modify');
console.log('  GET    /:userId/email-transactions/:transactionId');

// Batch Operations
router.post('/:userId/email-transactions/process-pending', validateUserAccess, emailConnectionController.processPendingTransactions);

// Statistics
router.get('/:userId/email-scanning/stats', validateUserAccess, emailConnectionController.getScanningStats);

module.exports = router; 