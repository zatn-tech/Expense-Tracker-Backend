const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const validateUserAccess = require('../middleware/validateUserAccess');
const Notification = require('../models/Notification');
const {
  subscribe,
  unsubscribe,
  updatePreferences,
  sendTestNotification,
  getNotificationStatus,
  getVapidPublicKey,
  triggerNotification
} = require('../controllers/notifications');

// Import notification triggers
const {
  triggerRecurringReminder,
  triggerWeeklyReport,
  triggerMonthlyReport,
  triggerGoalUpdate,
  triggerLowBalanceAlert,
  triggerBudgetAlert,
  triggerTestNotification
} = require('../utils/notificationTriggers');

// Get VAPID public key (no auth required)
router.get('/vapid-public-key', getVapidPublicKey);

// All other routes require authentication
router.use(auth);

// Subscribe to push notifications
router.post('/subscribe', subscribe);

// Unsubscribe from push notifications
router.post('/unsubscribe', unsubscribe);

// Update notification preferences
router.put('/preferences', updatePreferences);

// Get notification status
router.get('/status', getNotificationStatus);

// Trigger notification
router.post('/trigger', triggerNotification);



// Get pending notifications for user
router.get('/:userId/pending', auth, validateUserAccess, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Get user's notification preferences
    const userNotification = await Notification.findOne({ userId });
    
    if (!userNotification || !userNotification.isActive) {
      return res.json({ notifications: [] });
    }

    // For now, we'll return a simple structure
    // In a real app, you'd store pending notifications in a separate collection
    res.json({
      notifications: [],
      lastChecked: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching pending notifications:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// Mark notification as read
router.put('/:userId/notifications/:notificationId/read', auth, validateUserAccess, async (req, res) => {
  try {
    const { userId, notificationId } = req.params;
    
    // In a real app, you'd update the notification status
    res.json({ message: 'Notification marked as read' });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

module.exports = router; 