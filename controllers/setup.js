const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const User = require('../models/User');
const Account = require('../models/Account');
const Category = require('../models/Category');

// Check setup completion status
const checkSetupStatus = catchAsync(async (req, res, next) => {
  const userId = req.user.id;

  // Check if user has at least one account
  const accountCount = await Account.countDocuments({ userId, isActive: true });
  
  // Check if user has categories (they should be auto-created, but let's verify)
  const categoryCount = await Category.countDocuments({ userId, isActive: true });
  
  // Check if user has set basic preferences
  const user = await User.findById(userId);
  const hasBasicPreferences = user.preferences && user.preferences.currency;

  const setupStatus = {
    accounts: {
      required: true,
      completed: accountCount > 0,
      count: accountCount,
      message: accountCount > 0 ? 'At least one account created' : 'Create at least one account'
    },
    categories: {
      required: true,
      completed: categoryCount > 0,
      count: categoryCount,
      message: categoryCount > 0 ? 'Categories initialized' : 'Categories need to be initialized'
    },
    preferences: {
      required: true,
      completed: hasBasicPreferences,
      message: hasBasicPreferences ? 'Basic preferences set' : 'Set currency and basic preferences'
    },
    emailVerified: {
      required: true,
      completed: user.emailVerified,
      message: user.emailVerified ? 'Email verified' : 'Please verify your email'
    }
  };

  const isComplete = Object.values(setupStatus).every(item => !item.required || item.completed);

  res.status(200).json({
    status: 'success',
    data: {
      setupStatus,
      isComplete,
      progress: Math.round((Object.values(setupStatus).filter(item => item.completed).length / Object.values(setupStatus).length) * 100)
    }
  });
});

// Complete setup step
const completeSetupStep = catchAsync(async (req, res, next) => {
  const userId = req.user.id;
  const { step, data } = req.body;

  let updated = false;

  switch (step) {
    case 'accounts':
      // Check if user has at least one account
      const accountCount = await Account.countDocuments({ userId, isActive: true });
      if (accountCount === 0) {
        return next(new AppError('Please create at least one account first', 400));
      }
      updated = true;
      break;

    case 'categories':
      // Check if user has categories
      const categoryCount = await Category.countDocuments({ userId, isActive: true });
      if (categoryCount === 0) {
        // Auto-create default categories if none exist
        const defaultCategories = Category.getDefaultCategories();
        const categoriesToCreate = defaultCategories.map(cat => ({
          ...cat,
          userId: userId
        }));
        await Category.insertMany(categoriesToCreate);
      }
      updated = true;
      break;

    case 'preferences':
      // Update user preferences
      if (data && data.currency) {
        await User.findByIdAndUpdate(userId, {
          'preferences.currency': data.currency,
          'preferences.theme': data.theme || 'system',
          'preferences.language': data.language || 'en'
        });
        updated = true;
      }
      break;

    case 'email_verification':
      // Check if email is verified
      const user = await User.findById(userId);
      if (!user.emailVerified) {
        return next(new AppError('Please verify your email first', 400));
      }
      updated = true;
      break;

    default:
      return next(new AppError('Invalid setup step', 400));
  }

  if (updated) {
    // Check if all setup steps are complete
    const accountCount = await Account.countDocuments({ userId, isActive: true });
    const categoryCount = await Category.countDocuments({ userId, isActive: true });
    const user = await User.findById(userId);
    const hasBasicPreferences = user.preferences && user.preferences.currency;
    
    const isSetupComplete = accountCount > 0 && categoryCount > 0 && hasBasicPreferences && user.emailVerified;

    if (isSetupComplete) {
      await User.findByIdAndUpdate(userId, { isSetupComplete: true });
    }

    res.status(200).json({
      status: 'success',
      message: `Setup step '${step}' completed successfully`,
      data: {
        step,
        isSetupComplete
      }
    });
  } else {
    res.status(200).json({
      status: 'success',
      message: `Setup step '${step}' status checked`,
      data: { step }
    });
  }
});

// Mark setup as complete (for manual override)
const markSetupComplete = catchAsync(async (req, res, next) => {
  const userId = req.user.id;

  await User.findByIdAndUpdate(userId, { isSetupComplete: true });

  res.status(200).json({
    status: 'success',
    message: 'Setup marked as complete',
    data: {
      isSetupComplete: true
    }
  });
});

module.exports = {
  checkSetupStatus,
  completeSetupStep,
  markSetupComplete
}; 