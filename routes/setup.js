const express = require('express');
const router = express.Router();
const setupController = require('../controllers/setup');
const auth = require('../middleware/auth');

// All setup routes require authentication
router.use(auth);

// Check setup status
router.get('/status', setupController.checkSetupStatus);

// Complete a setup step
router.post('/complete-step', setupController.completeSetupStep);

// Mark setup as complete (manual override)
router.post('/mark-complete', setupController.markSetupComplete);

module.exports = router; 