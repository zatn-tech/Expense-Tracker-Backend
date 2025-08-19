const express = require('express');
const passport = require('passport');
const jwt = require('jsonwebtoken');
const router = express.Router();

// Helper function to generate JWT token
const generateToken = (user) => {
  return jwt.sign(
    { id: user._id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

// Helper function to handle successful authentication
const handleAuthSuccess = async (req, res) => {
  const user = req.user;
  const token = generateToken(user);
  
  
  // Update last login and ensure email is verified for social auth users
  user.lastLogin = new Date();
  user.emailVerified = true; // Social auth users are automatically verified
  await user.save();
  
  // Prepare user data for frontend
  const userData = {
    id: user._id,
    name: user.name,
    email: user.email,
    profilePicture: user.profilePicture || '',
    emailVerified: user.emailVerified || true // Social login users are verified
  };
  
  
  // Redirect to frontend with token
  const redirectUrl = `${process.env.CLIENT_URL || 'http://localhost:3000'}/auth/callback?token=${token}&user=${encodeURIComponent(JSON.stringify(userData))}`;
  
  
  res.redirect(redirectUrl);
};

// Google OAuth Routes
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/google/callback', 
  passport.authenticate('google', { failureRedirect: '/login' }),
  handleAuthSuccess
);

// Facebook OAuth Routes
router.get('/facebook', passport.authenticate('facebook', { scope: ['email'] }));

router.get('/facebook/callback',
  passport.authenticate('facebook', { failureRedirect: '/login' }),
  handleAuthSuccess
);

// GitHub OAuth Routes
router.get('/github', passport.authenticate('github', { scope: ['user:email'] }));

router.get('/github/callback',
  passport.authenticate('github', { failureRedirect: '/login' }),
  handleAuthSuccess
);

// Get social auth status
router.get('/status', (req, res) => {
  res.json({
    google: !!process.env.GOOGLE_CLIENT_ID,
    facebook: !!process.env.FACEBOOK_APP_ID,
    github: !!process.env.GITHUB_CLIENT_ID
  });
});

// Link social account to existing account
router.post('/link/:provider', async (req, res) => {
  try {
    const { provider } = req.params;
    const { userId, socialId } = req.body;
    
    // This would typically be protected by authentication middleware
    // For now, we'll implement basic linking logic
    
    const User = require('../models/User');
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Update social auth info
    switch (provider) {
      case 'google':
        user.socialAuth.googleId = socialId;
        break;
      case 'facebook':
        user.socialAuth.facebookId = socialId;
        break;
      case 'github':
        user.socialAuth.githubId = socialId;
        break;
      default:
        return res.status(400).json({ error: 'Invalid provider' });
    }
    
    user.socialAuth.provider = provider;
    await user.save();
    
    res.json({ message: `${provider} account linked successfully` });
  } catch (error) {
    console.error('Error linking social account:', error);
    res.status(500).json({ error: 'Failed to link social account' });
  }
});

// Unlink social account
router.delete('/unlink/:provider', async (req, res) => {
  try {
    const { provider } = req.params;
    const { userId } = req.body;
    
    const User = require('../models/User');
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Remove social auth info
    switch (provider) {
      case 'google':
        user.socialAuth.googleId = undefined;
        break;
      case 'facebook':
        user.socialAuth.facebookId = undefined;
        break;
      case 'github':
        user.socialAuth.githubId = undefined;
        break;
      default:
        return res.status(400).json({ error: 'Invalid provider' });
    }
    
    // If no social auth left, clear provider
    if (!user.socialAuth.googleId && !user.socialAuth.facebookId && !user.socialAuth.githubId) {
      user.socialAuth.provider = undefined;
    }
    
    await user.save();
    
    res.json({ message: `${provider} account unlinked successfully` });
  } catch (error) {
    console.error('Error unlinking social account:', error);
    res.status(500).json({ error: 'Failed to unlink social account' });
  }
});

module.exports = router; 