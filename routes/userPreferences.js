const express = require('express');
const router = express.Router();
const userPreferencesController = require('../controllers/userPreferences');
const auth = require('../middleware/auth');

// All routes require authentication
router.use(auth);

// GET /api/user/:userId/preferences - Get user preferences
router.get('/', userPreferencesController.getUserPreferences);

// PUT /api/user/:userId/preferences - Update user preferences
router.put('/', userPreferencesController.updateUserPreferences);

// PATCH /api/user/:userId/preferences/:section - Update specific section
router.patch('/:section', userPreferencesController.updateSection);

// POST /api/user/:userId/preferences/reset - Reset to defaults
router.post('/reset', userPreferencesController.resetPreferences);

// GET /api/user/:userId/preferences/export - Export preferences
router.get('/export', userPreferencesController.exportPreferences);

// POST /api/user/:userId/preferences/import - Import preferences
router.post('/import', userPreferencesController.importPreferences);

module.exports = router;
