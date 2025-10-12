const Update = require('../models/Update');
const User = require('../models/User');

// Get all updates with admin details
const getAllUpdates = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Get updates with pagination
    const updates = await Update.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('createdBy', 'name email');

    const total = await Update.countDocuments();

    res.status(200).json({
      status: 'success',
      data: {
        updates,
        pagination: {
          page,
          pages: Math.ceil(total / limit),
          limit,
          total
        }
      }
    });
  } catch (error) {
    console.error('Get all updates error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch updates'
    });
  }
};

// Create a new update
const createUpdate = async (req, res) => {
  try {
    const {
      title,
      description,
      type,
      priority,
      version,
      releaseDate,
      affectedFeatures,
      breakingChange,
      tags
    } = req.body;

    // Validate required fields
    if (!title || !description || !type || !priority) {
      return res.status(400).json({
        status: 'fail',
        message: 'Title, description, type, and priority are required'
      });
    }

    // Create the update
    const update = new Update({
      title,
      description,
      type,
      priority,
      version,
      releaseDate: releaseDate ? new Date(releaseDate) : new Date(),
      affectedFeatures: affectedFeatures || [],
      breakingChange: breakingChange || false,
      tags: tags || [],
      createdBy: req.user._id,
      isGlobal: true // Admin updates are global
    });

    await update.save();

    // Populate the createdBy field
    await update.populate('createdBy', 'name email');

    res.status(201).json({
      status: 'success',
      message: 'Update created successfully',
      data: {
        update
      }
    });
  } catch (error) {
    console.error('Create update error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to create update'
    });
  }
};

// Get a single update
const getUpdate = async (req, res) => {
  try {
    const update = await Update.findById(req.params.id)
      .populate('createdBy', 'name email');

    if (!update) {
      return res.status(404).json({
        status: 'fail',
        message: 'Update not found'
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        update
      }
    });
  } catch (error) {
    console.error('Get update error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch update'
    });
  }
};

// Update an existing update
const updateUpdate = async (req, res) => {
  try {
    const {
      title,
      description,
      type,
      priority,
      version,
      releaseDate,
      affectedFeatures,
      breakingChange,
      tags,
      isActive
    } = req.body;

    const update = await Update.findById(req.params.id);

    if (!update) {
      return res.status(404).json({
        status: 'fail',
        message: 'Update not found'
      });
    }

    // Update fields
    if (title) update.title = title;
    if (description) update.description = description;
    if (type) update.type = type;
    if (priority) update.priority = priority;
    if (version) update.version = version;
    if (releaseDate) update.releaseDate = new Date(releaseDate);
    if (affectedFeatures !== undefined) update.affectedFeatures = affectedFeatures;
    if (breakingChange !== undefined) update.breakingChange = breakingChange;
    if (tags !== undefined) update.tags = tags;
    if (isActive !== undefined) update.isActive = isActive;

    update.updatedAt = new Date();

    await update.save();
    await update.populate('createdBy', 'name email');

    res.status(200).json({
      status: 'success',
      message: 'Update updated successfully',
      data: {
        update
      }
    });
  } catch (error) {
    console.error('Update update error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update update'
    });
  }
};

// Delete an update
const deleteUpdate = async (req, res) => {
  try {
    const update = await Update.findById(req.params.id);

    if (!update) {
      return res.status(404).json({
        status: 'fail',
        message: 'Update not found'
      });
    }

    await Update.findByIdAndDelete(req.params.id);

    res.status(200).json({
      status: 'success',
      message: 'Update deleted successfully'
    });
  } catch (error) {
    console.error('Delete update error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to delete update'
    });
  }
};

// Toggle update active status
const toggleUpdateStatus = async (req, res) => {
  try {
    const update = await Update.findById(req.params.id);

    if (!update) {
      return res.status(404).json({
        status: 'fail',
        message: 'Update not found'
      });
    }

    update.isActive = !update.isActive;
    await update.save();

    res.status(200).json({
      status: 'success',
      message: `Update ${update.isActive ? 'activated' : 'deactivated'} successfully`,
      data: {
        update
      }
    });
  } catch (error) {
    console.error('Toggle update status error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to toggle update status'
    });
  }
};

// Get update statistics
const getUpdateStats = async (req, res) => {
  try {
    const totalUpdates = await Update.countDocuments();
    const activeUpdates = await Update.countDocuments({ isActive: true });
    const inactiveUpdates = await Update.countDocuments({ isActive: false });
    
    const updatesByType = await Update.aggregate([
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 }
        }
      }
    ]);

    const updatesByPriority = await Update.aggregate([
      {
        $group: {
          _id: '$priority',
          count: { $sum: 1 }
        }
      }
    ]);

    res.status(200).json({
      status: 'success',
      data: {
        totalUpdates,
        activeUpdates,
        inactiveUpdates,
        updatesByType,
        updatesByPriority
      }
    });
  } catch (error) {
    console.error('Get update stats error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch update statistics'
    });
  }
};

module.exports = {
  getAllUpdates,
  createUpdate,
  getUpdate,
  updateUpdate,
  deleteUpdate,
  toggleUpdateStatus,
  getUpdateStats
};
