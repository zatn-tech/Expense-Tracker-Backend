const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const GitHubStrategy = require('passport-github2').Strategy;
const User = require('../models/User');
const jwt = require('jsonwebtoken');

// Serialize user for the session
passport.serializeUser((user, done) => {
  done(null, user.id);
});

// Deserialize user from the session
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

// Google OAuth Strategy
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: `${process.env.BACKEND_URL || 'http://localhost:2003'}/api/auth/google/callback`,
  scope: ['profile', 'email']
}, async (accessToken, refreshToken, profile, done) => {
  try {
    // Check if user already exists
    let user = await User.findOne({ 
      $or: [
        { email: profile.emails[0].value },
        { 'socialAuth.googleId': profile.id }
      ]
    });

    if (user) {
      // Update social auth info if not exists
      if (!user.socialAuth.googleId) {
        user.socialAuth.googleId = profile.id;
        await user.save();
      }
      return done(null, user);
    }

    // Create new user
    user = new User({
      name: profile.displayName,
      email: profile.emails[0].value,
      profilePicture: profile.photos[0]?.value || '',
      socialAuth: {
        googleId: profile.id,
        provider: 'google'
      },
      emailVerified: true, // Google emails are verified
      preferences: {
        theme: 'light',
        currency: 'INR',
        notifications: {
          email: true,
          push: true,
          budgetAlerts: true,
          goalUpdates: true,
          lowBalanceAlerts: true
        }
      }
    });

    await user.save();
    return done(null, user);
  } catch (error) {
    return done(error, null);
  }
}));

// Facebook OAuth Strategy
passport.use(new FacebookStrategy({
  clientID: process.env.FACEBOOK_APP_ID,
  clientSecret: process.env.FACEBOOK_APP_SECRET,
  callbackURL: `${process.env.BACKEND_URL || 'http://localhost:2003'}/api/auth/facebook/callback`,
  profileFields: ['id', 'displayName', 'photos', 'email']
}, async (accessToken, refreshToken, profile, done) => {
  try {
    // Check if user already exists
    let user = await User.findOne({ 
      $or: [
        { email: profile.emails[0]?.value },
        { 'socialAuth.facebookId': profile.id }
      ]
    });

    if (user) {
      // Update social auth info if not exists
      if (!user.socialAuth.facebookId) {
        user.socialAuth.facebookId = profile.id;
        await user.save();
      }
      return done(null, user);
    }

    // Create new user
    user = new User({
      name: profile.displayName,
      email: profile.emails[0]?.value || `facebook_${profile.id}@temp.com`,
      profilePicture: profile.photos[0]?.value || '',
      socialAuth: {
        facebookId: profile.id,
        provider: 'facebook'
      },
      emailVerified: true, // Social auth users are verified
      preferences: {
        theme: 'light',
        currency: 'INR',
        notifications: {
          email: true,
          push: true,
          budgetAlerts: true,
          goalUpdates: true,
          lowBalanceAlerts: true
        }
      }
    });

    await user.save();
    return done(null, user);
  } catch (error) {
    return done(error, null);
  }
}));

// GitHub OAuth Strategy
passport.use(new GitHubStrategy({
  clientID: process.env.GITHUB_CLIENT_ID,
  clientSecret: process.env.GITHUB_CLIENT_SECRET,
  callbackURL: `${process.env.BACKEND_URL || 'http://localhost:2003'}/api/auth/github/callback`,
  scope: ['user:email']
}, async (accessToken, refreshToken, profile, done) => {
  try {
    // Check if user already exists
    let user = await User.findOne({ 
      $or: [
        { email: profile.emails[0]?.value },
        { 'socialAuth.githubId': profile.id }
      ]
    });

    if (user) {
      // Update social auth info if not exists
      if (!user.socialAuth.githubId) {
        user.socialAuth.githubId = profile.id;
        await user.save();
      }
      return done(null, user);
    }

    // Create new user
    user = new User({
      name: profile.displayName || profile.username,
      email: profile.emails[0]?.value || `github_${profile.id}@temp.com`,
      profilePicture: profile.photos[0]?.value || '',
      socialAuth: {
        githubId: profile.id,
        provider: 'github'
      },
      emailVerified: true, // Social auth users are verified
      preferences: {
        theme: 'light',
        currency: 'INR',
        notifications: {
          email: true,
          push: true,
          budgetAlerts: true,
          goalUpdates: true,
          lowBalanceAlerts: true
        }
      }
    });

    await user.save();
    return done(null, user);
  } catch (error) {
    return done(error, null);
  }
}));

module.exports = passport; 