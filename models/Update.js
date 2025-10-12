const mongoose = require('mongoose');

const updateSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Update title is required'],
    trim: true,
    maxlength: [100, 'Title cannot exceed 100 characters']
  },
  description: {
    type: String,
    required: [true, 'Update description is required'],
    trim: true,
    maxlength: [1000, 'Description cannot exceed 1000 characters']
  },
  type: {
    type: String,
    required: true,
    enum: ['feature', 'improvement', 'bugfix', 'announcement', 'security'],
    default: 'feature'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  version: {
    type: String,
    trim: true
  },
  isRead: {
    type: Boolean,
    default: false
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: function() {
      return !this.isGlobal;
    }
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: function() {
      return this.isGlobal;
    }
  },
  isGlobal: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  releaseDate: {
    type: Date,
    default: Date.now
  },
  affectedFeatures: [String],
  breakingChange: {
    type: Boolean,
    default: false
  },
  tags: [String],
  metadata: {
    actionRequired: {
      type: Boolean,
      default: false
    },
    documentationUrl: String,
    migrationGuide: String,
    rollbackInstructions: String
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
updateSchema.index({ userId: 1, isRead: 1 });
updateSchema.index({ userId: 1, createdAt: -1 });
updateSchema.index({ isGlobal: 1, isActive: 1 });
updateSchema.index({ type: 1 });
updateSchema.index({ priority: 1 });
updateSchema.index({ createdBy: 1 });

// Virtual for formatted date
updateSchema.virtual('formattedDate').get(function() {
  return this.createdAt.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
});

// Method to mark as read
updateSchema.methods.markAsRead = function() {
  this.isRead = true;
  return this.save();
};

// Static method to get unread count for user
updateSchema.statics.getUnreadCount = function(userId) {
  return this.countDocuments({ 
    $or: [
      { userId, isRead: false },
      { isGlobal: true, isActive: true, isRead: false }
    ]
  });
};

// Static method to get all updates for user with pagination
updateSchema.statics.getUpdatesForUser = function(userId, page = 1, limit = 10) {
  const skip = (page - 1) * limit;
  return this.find({ 
    $or: [
      { userId },
      { isGlobal: true, isActive: true }
    ]
  })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .select('-__v')
    .populate('createdBy', 'name email');
};

module.exports = mongoose.model('Update', updateSchema);
