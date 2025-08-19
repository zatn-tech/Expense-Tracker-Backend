const express = require('express');
const router = express.Router();
const Goal = require('../models/Goal');
const auth = require('../middleware/auth');
const validateUserAccess = require('../middleware/validateUserAccess');

// Get all goals for a user
router.get('/:userId/goals', auth, validateUserAccess, async (req, res) => {
  try {
    const { userId } = req.params;
    const { status, type, priority } = req.query;
    
    let query = { userId };
    
    // Filter by status
    if (status) {
      if (status === 'active') {
        query.isActive = true;
        query.isCompleted = false;
      } else if (status === 'completed') {
        query.isCompleted = true;
      } else if (status === 'overdue') {
        query.isActive = true;
        query.isCompleted = false;
        query.targetDate = { $lt: new Date() };
      }
    }
    
    // Filter by type
    if (type) {
      query.type = type;
    }
    
    // Filter by priority
    if (priority) {
      query.priority = priority;
    }
    
    const goals = await Goal.find(query)
      .sort({ priority: -1, targetDate: 1, createdAt: -1 });
    
    res.json(goals);
  } catch (error) {
    console.error('Error fetching goals:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get a specific goal
router.get('/:userId/goals/:id', auth, validateUserAccess, async (req, res) => {
  try {
    const { id } = req.params;
    
    const goal = await Goal.findById(id);
    
    if (!goal) {
      return res.status(404).json({ message: 'Goal not found' });
    }
    
    res.json(goal);
  } catch (error) {
    console.error('Error fetching goal:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create a new goal
router.post('/:userId/goals', auth, validateUserAccess, async (req, res) => {
  try {
    const { userId } = req.params;
    const {
      title,
      description,
      type,
      targetAmount,
      startDate,
      targetDate,
      category,
      priority,
      color,
      icon,
      notes,
      tags,
      milestones
    } = req.body;
    
    // Validate required fields
    if (!title || !type || !targetAmount || !startDate || !targetDate || !category) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    
    // Validate dates
    const start = new Date(startDate);
    const target = new Date(targetDate);
    
    if (start >= target) {
      return res.status(400).json({ message: 'Start date must be before target date' });
    }
    
    const goal = new Goal({
      userId,
      title,
      description,
      type,
      targetAmount: parseFloat(targetAmount),
      startDate: start,
      targetDate: target,
      category,
      priority: priority || 'medium',
      color: color || '#3B82F6',
      icon: icon || '🎯',
      notes,
      tags: tags || [],
      milestones: milestones || []
    });
    
    await goal.save();
    
    // Automatically calculate progress from existing transactions
    try {
      await goal.calculateProgressFromTransactions();
    } catch (calcError) {
      console.error('Error calculating initial progress for goal:', goal._id, calcError);
      // Continue even if calculation fails - goal was created successfully
    }
    
    res.status(201).json(goal);
  } catch (error) {
    console.error('Error creating goal:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update a goal
router.put('/:userId/goals/:id', auth, validateUserAccess, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    // Remove fields that shouldn't be updated directly
    delete updateData.userId;
    delete updateData.currentAmount;
    delete updateData.isCompleted;
    delete updateData.completedDate;
    
    // Validate dates if provided
    if (updateData.startDate && updateData.targetDate) {
      const start = new Date(updateData.startDate);
      const target = new Date(updateData.targetDate);
      
      if (start >= target) {
        return res.status(400).json({ message: 'Start date must be before target date' });
      }
    }
    
    const goal = await Goal.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );
    
    if (!goal) {
      return res.status(404).json({ message: 'Goal not found' });
    }
    
    res.json(goal);
  } catch (error) {
    console.error('Error updating goal:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete a goal
router.delete('/:userId/goals/:id', auth, validateUserAccess, async (req, res) => {
  try {
    const { id } = req.params;
    
    const goal = await Goal.findByIdAndDelete(id);
    
    if (!goal) {
      return res.status(404).json({ message: 'Goal not found' });
    }
    
    res.json({ message: 'Goal deleted successfully' });
  } catch (error) {
    console.error('Error deleting goal:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update goal progress
router.patch('/:userId/goals/:id/progress', auth, validateUserAccess, async (req, res) => {
  try {
    const { id } = req.params;
    const { currentAmount } = req.body;
    
    if (currentAmount === undefined || currentAmount < 0) {
      return res.status(400).json({ message: 'Invalid current amount' });
    }
    
    const goal = await Goal.findById(id);
    
    if (!goal) {
      return res.status(404).json({ message: 'Goal not found' });
    }
    
    await goal.updateProgress(parseFloat(currentAmount));
    
    res.json(goal);
  } catch (error) {
    console.error('Error updating goal progress:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Calculate progress from transactions
router.post('/:userId/goals/:id/calculate-progress', auth, validateUserAccess, async (req, res) => {
  try {
    const { id } = req.params;
    
    const goal = await Goal.findById(id);
    
    if (!goal) {
      return res.status(404).json({ message: 'Goal not found' });
    }
    
    await goal.calculateProgressFromTransactions();
    
    res.json(goal);
  } catch (error) {
    console.error('Error calculating goal progress:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Add milestone to goal
router.post('/:userId/goals/:id/milestones', auth, validateUserAccess, async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, description } = req.body;
    
    if (!amount || !description) {
      return res.status(400).json({ message: 'Amount and description are required' });
    }
    
    const goal = await Goal.findById(id);
    
    if (!goal) {
      return res.status(404).json({ message: 'Goal not found' });
    }
    
    await goal.addMilestone(parseFloat(amount), description);
    
    res.json(goal);
  } catch (error) {
    console.error('Error adding milestone:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Toggle goal completion
router.patch('/:userId/goals/:id/toggle', auth, validateUserAccess, async (req, res) => {
  try {
    const { id } = req.params;
    
    const goal = await Goal.findById(id);
    
    if (!goal) {
      return res.status(404).json({ message: 'Goal not found' });
    }
    
    goal.isCompleted = !goal.isCompleted;
    
    if (goal.isCompleted && !goal.completedDate) {
      goal.completedDate = new Date();
    } else if (!goal.isCompleted) {
      goal.completedDate = null;
    }
    
    await goal.save();
    
    res.json(goal);
  } catch (error) {
    console.error('Error toggling goal completion:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get goal statistics
router.get('/:userId/goals/stats/overview', auth, validateUserAccess, async (req, res) => {
  try {
    const { userId } = req.params;
    
    const stats = await Goal.aggregate([
      { $match: { userId: require('mongoose').Types.ObjectId(userId) } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          active: {
            $sum: { $cond: [{ $and: ['$isActive', { $not: '$isCompleted' }] }, 1, 0] }
          },
          completed: {
            $sum: { $cond: ['$isCompleted', 1, 0] }
          },
          overdue: {
            $sum: { 
              $cond: [
                { 
                  $and: [
                    '$isActive', 
                    { $not: '$isCompleted' }, 
                    { $lt: ['$targetDate', new Date()] }
                  ] 
                }, 
                1, 
                0 
              ] 
            }
          },
          totalTargetAmount: { $sum: '$targetAmount' },
          totalCurrentAmount: { $sum: '$currentAmount' }
        }
      }
    ]);
    
    const typeStats = await Goal.aggregate([
      { $match: { userId: require('mongoose').Types.ObjectId(userId) } },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
          totalTarget: { $sum: '$targetAmount' },
          totalCurrent: { $sum: '$currentAmount' }
        }
      }
    ]);
    
    const priorityStats = await Goal.aggregate([
      { $match: { userId: require('mongoose').Types.ObjectId(userId) } },
      {
        $group: {
          _id: '$priority',
          count: { $sum: 1 }
        }
      }
    ]);
    
    const result = {
      overview: stats[0] || {
        total: 0,
        active: 0,
        completed: 0,
        overdue: 0,
        totalTargetAmount: 0,
        totalCurrentAmount: 0
      },
      byType: typeStats,
      byPriority: priorityStats
    };
    
    res.json(result);
  } catch (error) {
    console.error('Error fetching goal stats:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router; 