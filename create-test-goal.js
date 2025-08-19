const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Goal = require('./models/Goal');

// Load environment variables
dotenv.config();

// Test configuration
const testUserId = '688df24e7e810818602e1be0'; // uit20227@rmd.ac.in

async function createTestGoal() {
  try {
    console.log('🎯 Creating test goal...');
    
    // Connect to the same database as the server
    const DB = process.env.MONGODB_URI || 'mongodb://localhost:27017/expensetracker';
    console.log('🔗 Connecting to database...');
    
    await mongoose.connect(DB, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    console.log('✅ Connected to database');
    
    // Create a new active goal
    const testGoal = new Goal({
      userId: testUserId,
      title: 'Test Savings Goal',
      description: 'A test goal for notification testing',
      type: 'savings',
      targetAmount: 5000,
      currentAmount: 0,
      startDate: new Date(),
      targetDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      isActive: true,
      isCompleted: false,
      category: 'Other', // Provide a category
      milestones: []
    });
    
    await testGoal.save();
    
    console.log('✅ Test goal created successfully:');
    console.log(`  - Title: ${testGoal.title}`);
    console.log(`  - Type: ${testGoal.type}`);
    console.log(`  - Target: ₹${testGoal.targetAmount}`);
    console.log(`  - Active: ${testGoal.isActive}`);
    console.log(`  - Completed: ${testGoal.isCompleted}`);
    console.log(`  - Progress: ${testGoal.progressPercentage}%`);
    
  } catch (error) {
    console.error('❌ Error creating test goal:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from database');
  }
}

// Run the script
createTestGoal(); 