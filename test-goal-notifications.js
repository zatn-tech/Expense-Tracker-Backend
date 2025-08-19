const mongoose = require('mongoose');
const dotenv = require('dotenv');
const { updateDependentModels } = require('./utils/modelUpdater');
const Transaction = require('./models/Transaction');

// Load environment variables
dotenv.config();

// Test configuration - using the user that has goals
const testUserId = '688df24e7e810818602e1be0'; // uit20227@rmd.ac.in

async function testGoalNotifications() {
  try {
    console.log('🧪 Testing goal notifications...');
    console.log('👤 Test user ID:', testUserId);
    
    // Connect to the same database as the server
    const DB = process.env.MONGODB_URI || 'mongodb://localhost:27017/expensetracker';
    console.log('🔗 Connecting to database...');
    
    await mongoose.connect(DB, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    console.log('✅ Connected to database');
    
    // Create and save a test transaction
    const testTransaction = new Transaction({
      amount: 100,
      type: 'income',
      category: 'Other',
      description: 'Test income transaction for goal notifications',
      transactionDate: new Date(),
      paymentMethod: 'cash',
      tags: [],
      location: {},
      userId: testUserId
    });
    
    console.log('📊 Test transaction:', {
      amount: testTransaction.amount,
      type: testTransaction.type,
      category: testTransaction.category,
      description: testTransaction.description,
      transactionDate: testTransaction.transactionDate,
      paymentMethod: testTransaction.paymentMethod,
      tags: testTransaction.tags,
      location: testTransaction.location,
      userId: testTransaction.userId
    });
    
    // Save the transaction to the database
    await testTransaction.save();
    console.log('✅ Transaction saved to database with ID:', testTransaction._id);
    
    // Test adding a transaction (this will recalculate goals)
    const results = await updateDependentModels(testUserId, testTransaction, 'add');
    
    console.log('📋 Results:', JSON.stringify(results, null, 2));
    
    if (results.goalUpdates.length > 0) {
      console.log('✅ Goal updates found:', results.goalUpdates.length);
      results.goalUpdates.forEach(update => {
        console.log(`  - ${update.goalName}: ${update.progress}% (completed: ${update.isCompleted})`);
      });
    } else {
      console.log('❌ No goal updates found');
    }
    
    if (results.goalNotifications.length > 0) {
      console.log('✅ Goal notifications found:', results.goalNotifications.length);
      results.goalNotifications.forEach(notification => {
        console.log(`  - ${notification.title}: ${notification.message}`);
      });
    } else {
      console.log('❌ No goal notifications found');
    }
    
    // Clean up - delete the test transaction
    await Transaction.findByIdAndDelete(testTransaction._id);
    console.log('🧹 Cleaned up test transaction');
    
  } catch (error) {
    console.error('❌ Error testing goal notifications:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from database');
  }
}

// Run the test
testGoalNotifications(); 