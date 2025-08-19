const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Goal = require('./models/Goal');
const Transaction = require('./models/Transaction');

// Load environment variables
dotenv.config();

// Test configuration
const testUserId = '688df24e7e810818602e1be0'; // uit20227@rmd.ac.in

async function debugGoalMatching() {
  try {
    console.log('🔍 Debugging goal matching...');
    
    // Connect to the same database as the server
    const DB = process.env.MONGODB_URI || 'mongodb://localhost:27017/expensetracker';
    console.log('🔗 Connecting to database...');
    
    await mongoose.connect(DB, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    console.log('✅ Connected to database');
    
    // Find all goals for the user (including inactive ones)
    const allGoals = await Goal.find({ userId: testUserId });
    
    console.log(`📋 Found ${allGoals.length} total goals for user ${testUserId}:`);
    allGoals.forEach(goal => {
      console.log(`  - ${goal.title || 'Untitled'} (${goal.type}) - Category: ${goal.category || 'Any'} - Active: ${goal.isActive} - Completed: ${goal.isCompleted} - Progress: ${goal.progressPercentage}%`);
    });
    
    // Find active goals only
    const activeGoals = await Goal.find({ 
      userId: testUserId, 
      isActive: true,
      isCompleted: false 
    });
    
    console.log(`\n🎯 Found ${activeGoals.length} active goals:`);
    activeGoals.forEach(goal => {
      console.log(`  - ${goal.title || 'Untitled'} (${goal.type}) - Category: ${goal.category || 'Any'} - Progress: ${goal.progressPercentage}%`);
    });
    
    // Find recent transactions
    const transactions = await Transaction.find({ 
      userId: testUserId 
    }).sort({ transactionDate: -1 }).limit(5);
    
    console.log(`\n📊 Found ${transactions.length} recent transactions:`);
    transactions.forEach(txn => {
      console.log(`  - ${txn.type} ${txn.category}: ₹${txn.amount} (${txn.transactionDate})`);
    });
    
    // Test goal matching for each transaction
    for (const txn of transactions) {
      console.log(`\n🔍 Testing transaction: ${txn.type} ${txn.category} ₹${txn.amount}`);
      
      for (const goal of activeGoals) {
        let shouldUpdate = false;
        
        if (goal.category && goal.category === txn.category) {
          shouldUpdate = true;
          console.log(`  ✅ Goal "${goal.title || 'Untitled'}" matches by category: ${txn.category}`);
        } else if (!goal.category) {
          if (goal.type === 'savings') {
            shouldUpdate = true;
            console.log(`  ✅ Goal "${goal.title || 'Untitled'}" (savings) affected by all transactions`);
          } else if (goal.type === 'spending_limit' && txn.type === 'expense') {
            shouldUpdate = true;
            console.log(`  ✅ Goal "${goal.title || 'Untitled'}" (spending_limit) affected by expense`);
          } else if (goal.type === 'debt_payoff' && txn.type === 'expense' && 
                    /debt|loan|credit/i.test(txn.category)) {
            shouldUpdate = true;
            console.log(`  ✅ Goal "${goal.title || 'Untitled'}" (debt_payoff) affected by debt-related expense`);
          } else if (goal.type === 'income_target' && txn.type === 'income') {
            shouldUpdate = true;
            console.log(`  ✅ Goal "${goal.title || 'Untitled'}" (income_target) affected by income`);
          } else {
            console.log(`  ❌ Goal "${goal.title || 'Untitled'}" not affected by this transaction`);
          }
        } else {
          console.log(`  ❌ Goal "${goal.title || 'Untitled'}" category mismatch: goal=${goal.category}, txn=${txn.category}`);
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Error debugging goal matching:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from database');
  }
}

// Run the debug
debugGoalMatching(); 