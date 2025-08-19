const mongoose = require('mongoose');
const Transaction = require('./models/Transaction');
const Goal = require('./models/Goal');
const { updateDependentModels } = require('./utils/modelUpdater');

// Load environment variables
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

async function debugGoalUpdate() {
  try {
    console.log('🔍 Starting goal update debug...');
    
    // Get a test user ID (replace with actual user ID)
    const testUserId = '688df24e7e810818602e1be0'; // User with goals and transactions
    
    // Check if user has goals
    const userGoals = await Goal.find({ 
      userId: testUserId, 
      isActive: true,
      isCompleted: false 
    });
    
    console.log(`📊 Found ${userGoals.length} active goals for user`);
    
    if (userGoals.length === 0) {
      console.log('❌ No active goals found. Please create a goal first.');
      return;
    }
    
    // Show current goals
    for (const goal of userGoals) {
      console.log(`\n🎯 Goal: ${goal.name}`);
      console.log(`   Type: ${goal.type}`);
      console.log(`   Category: ${goal.category || 'Any'}`);
      console.log(`   Target: ₹${goal.targetAmount}`);
      console.log(`   Current: ₹${goal.currentAmount}`);
      console.log(`   Progress: ${goal.progressPercentage}%`);
      console.log(`   Completed: ${goal.isCompleted}`);
    }
    
    // Check recent transactions
    const recentTransactions = await Transaction.find({ 
      userId: testUserId 
    }).sort({ createdAt: -1 }).limit(5);
    
    console.log(`\n💰 Found ${recentTransactions.length} recent transactions`);
    
    for (const transaction of recentTransactions) {
      console.log(`   ${transaction.type}: ₹${transaction.amount} - ${transaction.category} - ${transaction.description}`);
    }
    
    // Test goal calculation for each goal
    console.log('\n🧮 Testing goal calculations...');
    
    for (const goal of userGoals) {
      console.log(`\n📈 Testing goal: ${goal.name}`);
      
      const previousProgress = goal.progressPercentage;
      console.log(`   Previous progress: ${previousProgress}%`);
      
      await goal.calculateProgressFromTransactions();
      const newProgress = goal.progressPercentage;
      
      console.log(`   New progress: ${newProgress}%`);
      console.log(`   Progress change: ${newProgress - previousProgress}%`);
      console.log(`   Current amount: ₹${goal.currentAmount}`);
      console.log(`   Is completed: ${goal.isCompleted}`);
    }
    
    // Test model updater with a sample transaction
    if (recentTransactions.length > 0) {
      console.log('\n🔧 Testing model updater...');
      
      const sampleTransaction = recentTransactions[0];
      console.log(`   Using transaction: ${sampleTransaction.type} ₹${sampleTransaction.amount} - ${sampleTransaction.category}`);
      
      const modelUpdates = await updateDependentModels(testUserId, sampleTransaction, 'add');
      
      console.log(`   Budget alerts: ${modelUpdates.budgetAlerts.length}`);
      console.log(`   Goal updates: ${modelUpdates.goalUpdates.length}`);
      console.log(`   Goal notifications: ${modelUpdates.goalNotifications.length}`);
      
      if (modelUpdates.goalUpdates.length > 0) {
        console.log('   Goal updates:');
        modelUpdates.goalUpdates.forEach(update => {
          console.log(`     - ${update.goalName}: ${update.progress}% (${update.isCompleted ? 'Completed' : 'In Progress'})`);
        });
      }
    }
    
  } catch (error) {
    console.error('❌ Debug error:', error);
  } finally {
    mongoose.connection.close();
  }
}

// Run the debug
debugGoalUpdate(); 