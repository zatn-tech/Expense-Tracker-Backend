const express = require('express');
const {
  createTransfer,
  getUserTransfers,
  getTransfer,
  updateTransfer,
  deleteTransfer,
  getTransferStats,
  validateTransfer
} = require('../controllers/transfers');
const auth = require('../middleware/auth');

const router = express.Router();

// Apply auth middleware to all routes
router.use(auth);

// Create a new transfer
router.post('/', createTransfer);

// Get all transfers for the authenticated user
router.get('/', getUserTransfers);

// Get transfer statistics
router.get('/stats', getTransferStats);

// Validate a transfer (check if possible)
router.post('/validate', validateTransfer);

// Get a specific transfer
router.get('/:transferId', getTransfer);

// Update a transfer
router.put('/:transferId', updateTransfer);

// Delete/reverse a transfer
router.delete('/:transferId', deleteTransfer);

module.exports = router; 