const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('../models/User');
const Account = require('../models/Account');
const Category = require('../models/Category');

// Load environment variables
dotenv.config();

const DB = process.env.MONGODB_URI || 'mongodb://localhost:27017/expensetracker';

async function migrateSetupStatus() {
  try {
    // Connect to MongoDB
    await mongoose.connect(DB, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ Connected to MongoDB');

    // Get all users
    const users = await User.find({});
    console.log(`Found ${users.length} users`);

    let updatedCount = 0;
    let skippedCount = 0;

    for (const user of users) {
      // Check if user already has isSetupComplete field
      if (user.isSetupComplete !== undefined) {
        console.log(`User ${user.email} already has isSetupComplete field, skipping...`);
        skippedCount++;
        continue;
      }

      // Check if user has at least one account
      const accountCount = await Account.countDocuments({ userId: user._id, isActive: true });
      
      // Check if user has categories
      const categoryCount = await Category.countDocuments({ userId: user._id, isActive: true });
      
      // Check if user has set basic preferences
      const hasBasicPreferences = user.preferences && user.preferences.currency;
      
      // Determine if setup is complete
      const isSetupComplete = accountCount > 0 && 
                            categoryCount > 0 && 
                            hasBasicPreferences && 
                            user.emailVerified;

      // Update user with isSetupComplete field
      await User.findByIdAndUpdate(user._id, { 
        isSetupComplete,
        $setOnInsert: { isSetupComplete }
      }, { 
        upsert: false,
        new: true 
      });

      console.log(`✅ Updated user ${user.email} - isSetupComplete: ${isSetupComplete}`);
      updatedCount++;
    }

    console.log('\n📊 Migration Summary:');
    console.log(`✅ Updated ${updatedCount} users`);
    console.log(`⏭️  Skipped ${skippedCount} users (already had field)`);
    console.log(`📝 Total users processed: ${users.length}`);

  } catch (error) {
    console.error('❌ Error migrating setup status:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
    process.exit(0);
  }
}

// Run the migration
migrateSetupStatus(); 