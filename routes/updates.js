const express = require('express');
const router = express.Router();
const updatesController = require('../controllers/updates');
const auth = require('../middleware/auth');

// All routes require authentication
router.use(auth);

// GET /api/user/:userId/updates - Get all updates for user with pagination
router.get('/', updatesController.getUpdates);

// GET /api/user/:userId/updates/unread-count - Get unread count
router.get('/unread-count', updatesController.getUnreadCount);

// GET /api/user/:userId/updates/stats - Get update statistics
router.get('/stats', updatesController.getUpdateStats);

// PATCH /api/user/:userId/updates/:updateId/read - Mark single update as read
router.patch('/:updateId/read', updatesController.markAsRead);

// PATCH /api/user/:userId/updates/mark-all-read - Mark all updates as read
router.patch('/mark-all-read', updatesController.markAllAsRead);

// POST /api/user/:userId/updates - Create new update (for testing)
router.post('/', updatesController.createUpdate);

module.exports = router;
