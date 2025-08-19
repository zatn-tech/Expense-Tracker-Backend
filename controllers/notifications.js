const webpush = require('web-push');
const Notification = require('../models/Notification');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

// Configure VAPID keys from environment variables (optional for browser notifications)
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

// Only configure webpush if VAPID keys are available
if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(
    'mailto:your-email@example.com', // Replace with your email
    vapidPublicKey,
    vapidPrivateKey
  );
} else {
  console.log('ℹ️  VAPID keys not found - using browser notifications only');
}

// Subscribe to push notifications
exports.subscribe = catchAsync(async (req, res) => {
  const { subscription } = req.body;
  const userId = req.user.id;

  if (!subscription) {
    throw new AppError('Subscription data is required', 400);
  }

  // Check if user already has a subscription
  let userNotification = await Notification.findOne({ userId });

  if (userNotification) {
    // Update existing subscription
    userNotification.subscription = subscription;
    userNotification.isActive = true;
    await userNotification.save();
  } else {
    // Create new subscription
    userNotification = await Notification.create({
      userId,
      subscription,
      preferences: {
        budgetAlerts: true,
        recurringReminders: true,
        weeklyReports: true,
        monthlyReports: true,
        goalUpdates: true,
        lowBalanceAlerts: true
      }
    });
  }

  res.status(200).json({
    status: 'success',
    message: 'Successfully subscribed to push notifications',
    data: {
      publicKey: vapidPublicKey
    }
  });
});

// Unsubscribe from push notifications
exports.unsubscribe = catchAsync(async (req, res) => {
  const userId = req.user.id;

  const userNotification = await Notification.findOne({ userId });
  
  if (userNotification) {
    userNotification.isActive = false;
    await userNotification.save();
  }

  res.status(200).json({
    status: 'success',
    message: 'Successfully unsubscribed from push notifications'
  });
});

// Update notification preferences
exports.updatePreferences = catchAsync(async (req, res) => {
  const userId = req.user.id;
  const { preferences } = req.body;

  let userNotification = await Notification.findOne({ userId });

  // If no notification subscription exists, create one with default preferences
  if (!userNotification) {
    userNotification = await Notification.create({
      userId,
      subscription: {
        endpoint: 'placeholder',
        keys: {
          p256dh: 'placeholder',
          auth: 'placeholder'
        }
      },
      preferences: {
        budgetAlerts: true,
        recurringReminders: true,
        weeklyReports: true,
        monthlyReports: true,
        goalUpdates: true,
        lowBalanceAlerts: true
      },
      isActive: false // Will be activated when user subscribes
    });
  }

  userNotification.preferences = {
    ...userNotification.preferences,
    ...preferences
  };

  await userNotification.save();

  res.status(200).json({
    status: 'success',
    message: 'Notification preferences updated successfully',
    data: {
      preferences: userNotification.preferences
    }
  });
});



// Send notification to specific user
exports.sendNotificationToUser = async (userId, notificationData) => {
  const userNotification = await Notification.findOne({ 
    userId, 
    isActive: true 
  });

  if (!userNotification) {
    return false;
  }

  // Check if user has enabled this type of notification
  const notificationType = notificationData.type;
  if (userNotification.preferences[notificationType] === false) {
    return false;
  }
  
  userNotification.lastNotificationSent = new Date();
  await userNotification.save();
  
  return true;
};

// Send notification to multiple users
exports.sendNotificationToUsers = async (userIds, notificationData) => {
  const results = [];
  
  for (const userId of userIds) {
    const success = await exports.sendNotificationToUser(userId, notificationData);
    results.push({ userId, success });
  }
  
  return results;
};

// Get notification status for user
exports.getNotificationStatus = catchAsync(async (req, res) => {
  const userId = req.user.id;

  const userNotification = await Notification.findOne({ userId });

  res.status(200).json({
    status: 'success',
    data: {
      isSubscribed: !!userNotification?.isActive,
      preferences: userNotification?.preferences || {},
      lastNotificationSent: userNotification?.lastNotificationSent
    }
  });
});

// Get VAPID public key
exports.getVapidPublicKey = catchAsync(async (req, res) => {
  res.status(200).json({
    status: 'success',
    data: {
      publicKey: vapidPublicKey
    }
  });
});

// Trigger notification for specific user
exports.triggerNotification = catchAsync(async (req, res) => {
  const { userId, type, title, body, data } = req.body;

  if (!userId || !type || !title || !body) {
    throw new AppError('Missing required fields', 400);
  }

  const notificationData = {
    type,
    title,
    body,
    icon: data?.icon || '/favicon.ico',
    badge: data?.badge || '/favicon.ico',
    tag: data?.tag || 'expense-tracker-notification',
    data: data || {},
    actions: data?.actions || []
  };

  const success = await exports.sendNotificationToUser(userId, notificationData);

  if (success) {
    res.status(200).json({
      status: 'success',
      message: 'Notification sent successfully'
    });
  } else {
    res.status(404).json({
      status: 'error',
      message: 'User not subscribed to notifications or notification type disabled'
    });
  }
}); 