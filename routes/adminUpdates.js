const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');
const {
  getAllUpdates,
  createUpdate,
  getUpdate,
  updateUpdate,
  deleteUpdate,
  toggleUpdateStatus,
  getUpdateStats
} = require('../controllers/adminUpdates');

// Apply admin authentication to all routes
router.use(adminAuth);

// Get update statistics
router.get('/stats', getUpdateStats);

// Get all updates with pagination
router.get('/', getAllUpdates);

// Create a new update
router.post('/', createUpdate);

// Get a single update
router.get('/:id', getUpdate);

// Update an existing update
router.put('/:id', updateUpdate);

// Delete an update
router.delete('/:id', deleteUpdate);

// Toggle update active status
router.patch('/:id/toggle', toggleUpdateStatus);

module.exports = router;
