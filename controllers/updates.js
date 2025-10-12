const Update = require('../models/Update');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

// Get all updates for a user with pagination
exports.getUpdates = catchAsync(async (req, res, next) => {
  // For now, let's use the authenticated user's ID directly
  // This ensures we get the user's own updates regardless of URL parameter issues
  const userId = req.user._id;
  
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const type = req.query.type;
  const priority = req.query.priority;

  // Build filter object - include both user-specific and global admin updates
  const filter = { 
    $or: [
      { userId },
      { isGlobal: true, isActive: true }
    ]
  };
  if (type) filter.$and = [{ $or: [{ userId }, { isGlobal: true, isActive: true }] }, { type }];
  if (priority) filter.$and = [{ $or: [{ userId }, { isGlobal: true, isActive: true }] }, { priority }];

  const updates = await Update.find(filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .select('-__v')
    .populate('createdBy', 'name email');

  const total = await Update.countDocuments(filter);
  const unreadCount = await Update.getUnreadCount(userId);

  res.status(200).json({
    status: 'success',
    data: {
      updates,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      },
      unreadCount
    }
  });
});

// Get unread count for a user
exports.getUnreadCount = catchAsync(async (req, res, next) => {
  // Use the authenticated user's ID directly
  const userId = req.user._id;
  const unreadCount = await Update.getUnreadCount(userId);

  res.status(200).json({
    status: 'success',
    data: {
      unreadCount
    }
  });
});

// Mark a single update as read
exports.markAsRead = catchAsync(async (req, res, next) => {
  const { updateId } = req.params;
  // Use the authenticated user's ID directly
  const userId = req.user._id;

  // First, try to find a user-specific update
  let update = await Update.findOne({ _id: updateId, userId });
  
  if (!update) {
    // If not found, check if it's a global admin update
    const globalUpdate = await Update.findOne({ _id: updateId, isGlobal: true, isActive: true });
    if (!globalUpdate) {
      return next(new AppError('Update not found', 404));
    }
    
    // Create a user-specific read record for the global update
    update = await Update.create({
      title: globalUpdate.title,
      description: globalUpdate.description,
      type: globalUpdate.type,
      priority: globalUpdate.priority,
      version: globalUpdate.version,
      releaseDate: globalUpdate.releaseDate,
      affectedFeatures: globalUpdate.affectedFeatures,
      breakingChange: globalUpdate.breakingChange,
      tags: globalUpdate.tags,
      userId: userId,
      isRead: true,
      isGlobal: false,
      isActive: true,
      createdBy: globalUpdate.createdBy
    });
  } else {
    // Mark existing user update as read
    await update.markAsRead();
  }
  
  // Get updated unread count
  const unreadCount = await Update.getUnreadCount(userId);

  res.status(200).json({
    status: 'success',
    data: {
      update,
      unreadCount
    }
  });
});

// Mark all updates as read for a user
exports.markAllAsRead = catchAsync(async (req, res, next) => {
  // Use the authenticated user's ID directly
  const userId = req.user._id;

  // Mark user-specific updates as read
  await Update.updateMany(
    { userId, isRead: false },
    { isRead: true }
  );

  // Get all unread global updates and create read records for them
  const globalUpdates = await Update.find({ 
    isGlobal: true, 
    isActive: true,
    _id: { $nin: await Update.distinct('_id', { userId, isGlobal: false }) }
  });

  for (const globalUpdate of globalUpdates) {
    // Check if user already has this update as read
    const existingUserUpdate = await Update.findOne({ 
      userId, 
      title: globalUpdate.title,
      createdBy: globalUpdate.createdBy,
      createdAt: { $gte: globalUpdate.createdAt }
    });

    if (!existingUserUpdate) {
      // Create a read record for this global update
      await Update.create({
        title: globalUpdate.title,
        description: globalUpdate.description,
        type: globalUpdate.type,
        priority: globalUpdate.priority,
        version: globalUpdate.version,
        releaseDate: globalUpdate.releaseDate,
        affectedFeatures: globalUpdate.affectedFeatures,
        breakingChange: globalUpdate.breakingChange,
        tags: globalUpdate.tags,
        userId: userId,
        isRead: true,
        isGlobal: false,
        isActive: true,
        createdBy: globalUpdate.createdBy
      });
    }
  }

  res.status(200).json({
    status: 'success',
    message: 'All updates marked as read'
  });
});

// Get update statistics for a user
exports.getUpdateStats = catchAsync(async (req, res, next) => {
  // Use the authenticated user's ID directly
  const userId = req.user._id;

  const stats = await Update.aggregate([
    { 
      $match: { 
        $or: [
          { userId },
          { isGlobal: true, isActive: true }
        ]
      } 
    },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        unread: {
          $sum: {
            $cond: [{ $eq: ['$isRead', false] }, 1, 0]
          }
        },
        byType: {
          $push: {
            type: '$type',
            isRead: '$isRead'
          }
        },
        byPriority: {
          $push: {
            priority: '$priority',
            isRead: '$isRead'
          }
        }
      }
    }
  ]);

  // Process the results
  const result = stats[0] || { total: 0, unread: 0, byType: [], byPriority: [] };
  
  // Group by type
  const typeStats = {};
  result.byType.forEach(item => {
    if (!typeStats[item.type]) {
      typeStats[item.type] = { total: 0, unread: 0 };
    }
    typeStats[item.type].total++;
    if (!item.isRead) typeStats[item.type].unread++;
  });

  // Group by priority
  const priorityStats = {};
  result.byPriority.forEach(item => {
    if (!priorityStats[item.priority]) {
      priorityStats[item.priority] = { total: 0, unread: 0 };
    }
    priorityStats[item.priority].total++;
    if (!item.isRead) priorityStats[item.priority].unread++;
  });

  res.status(200).json({
    status: 'success',
    data: {
      total: result.total,
      unread: result.unread,
      byType: typeStats,
      byPriority: priorityStats
    }
  });
});

// Create a new update (admin only - for testing purposes)
exports.createUpdate = catchAsync(async (req, res, next) => {
  // Use the authenticated user's ID directly
  const userId = req.user._id;
  
  const update = await Update.create({
    ...req.body,
    userId
  });

  res.status(201).json({
    status: 'success',
    data: {
      update
    }
  });
});
