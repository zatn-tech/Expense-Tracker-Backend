const UserPreferences = require('../models/UserPreferences');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

// Get user preferences
exports.getUserPreferences = catchAsync(async (req, res, next) => {
  // Use the authenticated user's ID directly
  const userId = req.user._id;
  
  let preferences = await UserPreferences.findOne({ userId });
  
  // If no preferences exist, create default ones
  if (!preferences) {
    preferences = await UserPreferences.create({ userId });
  }
  
  res.status(200).json({
    status: 'success',
    data: {
      preferences
    }
  });
});

// Update user preferences
exports.updateUserPreferences = catchAsync(async (req, res, next) => {
  // Use the authenticated user's ID directly
  const userId = req.user._id;
  const updateData = req.body;
  
  // Validate color codes if provided
  if (updateData.theme) {
    const colorFields = ['primaryColor', 'secondaryColor', 'accentColor', 'backgroundColor', 'textColor'];
    for (const field of colorFields) {
      if (updateData.theme[field] && !/^#[0-9A-F]{6}$/i.test(updateData.theme[field])) {
        return next(new AppError(`Invalid color code for ${field}`, 400));
      }
    }
  }
  
  let preferences = await UserPreferences.findOne({ userId });
  
  if (!preferences) {
    preferences = await UserPreferences.create({ userId, ...updateData });
  } else {
    // Deep merge the update data
    const mergedData = deepMerge(preferences.toObject(), updateData);
    preferences.set(mergedData);
    await preferences.save();
  }
  
  res.status(200).json({
    status: 'success',
    data: {
      preferences
    }
  });
});

// Reset preferences to defaults
exports.resetPreferences = catchAsync(async (req, res, next) => {
  // Use the authenticated user's ID directly
  const userId = req.user._id;
  
  let preferences = await UserPreferences.findOne({ userId });
  
  if (!preferences) {
    preferences = await UserPreferences.create({ userId });
  } else {
    await preferences.resetToDefaults();
  }
  
  res.status(200).json({
    status: 'success',
    data: {
      preferences
    }
  });
});

// Update specific section of preferences
exports.updateSection = catchAsync(async (req, res, next) => {
  // Use the authenticated user's ID directly
  const userId = req.user._id;
  const { section } = req.params;
  const updateData = req.body;
  
  // Validate section
  const validSections = ['theme', 'typography', 'layout', 'components', 'dashboard', 'accessibility', 'export'];
  if (!validSections.includes(section)) {
    return next(new AppError('Invalid section', 400));
  }
  
  // Validate color codes if theme section
  if (section === 'theme') {
    const colorFields = ['primaryColor', 'secondaryColor', 'accentColor', 'backgroundColor', 'textColor'];
    for (const field of colorFields) {
      if (updateData[field] && !/^#[0-9A-F]{6}$/i.test(updateData[field])) {
        return next(new AppError(`Invalid color code for ${field}`, 400));
      }
    }
  }
  
  let preferences = await UserPreferences.findOne({ userId });
  
  if (!preferences) {
    preferences = await UserPreferences.create({ userId });
  }
  
  // Update the specific section
  preferences[section] = { ...preferences[section], ...updateData };
  await preferences.save();
  
  res.status(200).json({
    status: 'success',
    data: {
      preferences
    }
  });
});

// Export preferences
exports.exportPreferences = catchAsync(async (req, res, next) => {
  // Use the authenticated user's ID directly
  const userId = req.user._id;
  
  const preferences = await UserPreferences.findOne({ userId });
  
  if (!preferences) {
    return next(new AppError('No preferences found', 404));
  }
  
  res.status(200).json({
    status: 'success',
    data: {
      preferences: preferences.toObject()
    }
  });
});

// Import preferences
exports.importPreferences = catchAsync(async (req, res, next) => {
  // Use the authenticated user's ID directly
  const userId = req.user._id;
  const { preferences } = req.body;
  
  if (!preferences) {
    return next(new AppError('Preferences data is required', 400));
  }
  
  // Validate the imported preferences structure
  const validSections = ['theme', 'typography', 'layout', 'components', 'dashboard', 'accessibility', 'export'];
  for (const section of validSections) {
    if (preferences[section]) {
      // Basic validation - could be enhanced
      if (typeof preferences[section] !== 'object') {
        return next(new AppError(`Invalid ${section} data`, 400));
      }
    }
  }
  
  let userPreferences = await UserPreferences.findOne({ userId });
  
  if (!userPreferences) {
    userPreferences = await UserPreferences.create({ userId, ...preferences });
  } else {
    userPreferences.set(preferences);
    await userPreferences.save();
  }
  
  res.status(200).json({
    status: 'success',
    data: {
      preferences: userPreferences
    }
  });
});

// Helper function to deep merge objects
function deepMerge(target, source) {
  const result = { ...target };
  
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  
  return result;
}
