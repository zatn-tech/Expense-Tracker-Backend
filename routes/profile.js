const express = require('express');
const router = express.Router();
const User = require('../models/User');
const auth = require('../middleware/auth');
const validateUserAccess = require('../middleware/validateUserAccess');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Create uploads directory if it doesn't exist
const uploadDir = 'uploads/profiles/';
if (!fs.existsSync('uploads/')) {
  fs.mkdirSync('uploads/');
}
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: async function (req, file, cb) {
    try {
      const user = await User.findById(req.params.userId);
      if (!user) {
        return cb(new Error('User not found'));
      }
      
      const timestamp = Date.now();
      const extension = path.extname(file.originalname);
      const filename = `${user.email}_${timestamp}${extension}`;
      
      cb(null, filename);
    } catch (error) {
      cb(error);
    }
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Get user profile by ID
router.get('/:userId/profile', auth, validateUserAccess, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select('-password');
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update user profile by ID
router.put('/:userId/profile', auth, validateUserAccess, async (req, res) => {
  const { name, phone, bio, dateOfBirth, preferences } = req.body;
  
  try {
    const updateFields = {};
    
    if (name !== undefined) updateFields.name = name;
    if (phone !== undefined) updateFields.phone = phone;
    if (bio !== undefined) updateFields.bio = bio;
    
    if (dateOfBirth !== undefined) {
      if (dateOfBirth === null || dateOfBirth === '') {
        updateFields.dateOfBirth = null;
      } else {
        const date = new Date(dateOfBirth + 'T00:00:00.000Z');
        updateFields.dateOfBirth = date;
      }
    }
    
    if (preferences !== undefined) {
      const currentUser = await User.findById(req.params.userId);
      updateFields.preferences = { 
        ...(currentUser.preferences || {}), 
        ...preferences 
      };
    }

    const result = await User.findByIdAndUpdate(
      req.params.userId,
      { $set: updateFields },
      {
        new: true,
        runValidators: true
      }
    ).select('-password');

    if (!result) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result);
    
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(400).json({ error: err.message });
  }
});

// Upload profile picture by ID
router.post('/:userId/upload-picture', auth, validateUserAccess, upload.single('profilePicture'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Delete old profile picture if it exists
    if (user.profilePicture) {
      const oldFilePath = path.join(__dirname, '..', user.profilePicture);
      if (fs.existsSync(oldFilePath)) {
        fs.unlinkSync(oldFilePath);
      }
    }

    user.profilePicture = `/uploads/profiles/${req.file.filename}`;
    await user.save();

    res.json({ 
      message: 'Profile picture updated successfully',
      profilePicture: user.profilePicture 
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(400).json({ error: err.message });
  }
});

// Change password by ID
router.put('/:userId/change-password', auth, validateUserAccess, async (req, res) => {
  const { oldPassword, newPassword } = req.body;

  if (!oldPassword || !newPassword) {
    return res.status(400).json({ error: 'Old password and new password are required' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters long' });
  }

  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const isMatch = await user.comparePassword(oldPassword);
    if (!isMatch) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    user.password = newPassword;
    await user.save();

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
