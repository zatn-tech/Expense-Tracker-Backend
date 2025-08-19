const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Category = require('../models/Category');
const User = require('../models/User');

// Load environment variables
dotenv.config();

const DB = process.env.MONGODB_URI || 'mongodb://localhost:27017/expensetracker';

async function initializeCategories() {
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

    let initializedCount = 0;
    let skippedCount = 0;

    for (const user of users) {
      // Check if user already has categories
      const existingCategories = await Category.find({ userId: user._id });
      
      if (existingCategories.length > 0) {
        console.log(`User ${user.email} already has ${existingCategories.length} categories, skipping...`);
        skippedCount++;
        continue;
      }

      // Get default categories
      const defaultCategories = Category.getDefaultCategories();
      const categoriesToCreate = defaultCategories.map(cat => ({
        ...cat,
        userId: user._id
      }));

      // Create categories for the user
      await Category.insertMany(categoriesToCreate);
      console.log(`✅ Initialized ${defaultCategories.length} categories for user ${user.email}`);
      initializedCount++;
    }

    console.log('\n📊 Summary:');
    console.log(`✅ Initialized categories for ${initializedCount} users`);
    console.log(`⏭️  Skipped ${skippedCount} users (already had categories)`);
    console.log(`📝 Total users processed: ${users.length}`);

  } catch (error) {
    console.error('❌ Error initializing categories:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
    process.exit(0);
  }
}

// Run the script
initializeCategories(); 