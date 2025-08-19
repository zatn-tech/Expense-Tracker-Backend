const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  subscription: {
    endpoint: {
      type: String,
      required: true
    },
    keys: {
      p256dh: {
        type: String,
        required: true
      },
      auth: {
        type: String,
        required: true
      }
    }
  },
  preferences: {
    budgetAlerts: {
      type: Boolean,
      default: true
    },
    recurringReminders: {
      type: Boolean,
      default: true
    },
    weeklyReports: {
      type: Boolean,
      default: true
    },
    monthlyReports: {
      type: Boolean,
      default: true
    },
    goalUpdates: {
      type: Boolean,
      default: true
    },
    lowBalanceAlerts: {
      type: Boolean,
      default: true
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastNotificationSent: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Index for efficient queries
notificationSchema.index({ userId: 1 });
notificationSchema.index({ isActive: 1 });

module.exports = mongoose.model('Notification', notificationSchema); 