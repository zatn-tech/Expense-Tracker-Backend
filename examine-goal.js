const mongoose = require('mongoose');
const User = require('./models/User');
const Goal = require('./models/Goal');
const Transaction = require('./models/Transaction');

// Load environment variables
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

async function examineGoal() {
  try {
    console.log('🔍 Examining goal details...');
    
    const userId = '688df24e7e810818602e1be0';
    
    // Get all goals for this user (not just active ones)
    const goals = await Goal.find({ userId });
    console.log(`📊 Found ${goals.length} goals for user`);
    
    for (const goal of goals) {
      console.log('\n🎯 Goal Details:');
      console.log(`   ID: ${goal._id}`);
      console.log(`   Name: "${goal.name}"`);
      console.log(`   Type: ${goal.type}`);
      console.log(`   Category: "${goal.category}"`);
      console.log(`   Target Amount: ₹${goal.targetAmount}`);
      console.log(`   Current Amount: ₹${goal.currentAmount}`);
      console.log(`   Progress: ${goal.progressPercentage}%`);
      console.log(`   Is Active: ${goal.isActive}`);
      console.log(`   Is Completed: ${goal.isCompleted}`);
      console.log(`   Start Date: ${goal.startDate}`);
      console.log(`   End Date: ${goal.endDate}`);
      console.log(`   Created: ${goal.createdAt}`);
      console.log(`   Updated: ${goal.updatedAt}`);
      
      // Check if goal should be active
      const now = new Date();
      const isActiveByDate = goal.startDate <= now && goal.endDate >= now;
      console.log(`   Should be active by date: ${isActiveByDate}`);
      
      // Get transactions for this user
      const transactions = await Transaction.find({ userId });
      console.log(`\n💰 Found ${transactions.length} transactions for user`);
      
      // Show transactions that should affect this goal
      console.log('\n📋 Transactions that should affect this goal:');
      let affectingTransactions = [];
      
      for (const transaction of transactions) {
        let shouldAffect = false;
        let reason = '';
        
        if (goal.category && goal.category === transaction.category) {
          shouldAffect = true;
          reason = 'Category matches';
        } else if (!goal.category) {
          if (goal.type === 'savings') {
            shouldAffect = true;
            reason = 'Savings goal - affects all transactions';
          } else if (goal.type === 'spending_limit' && transaction.type === 'expense') {
            shouldAffect = true;
            reason = 'Spending limit goal - affects expenses';
          } else if (goal.type === 'debt_payoff' && transaction.type === 'expense' && 
                    /debt|loan|credit/i.test(transaction.category)) {
            shouldAffect = true;
            reason = 'Debt payoff goal - affects debt-related expenses';
          } else if (goal.type === 'income_target' && transaction.type === 'income') {
            shouldAffect = true;
            reason = 'Income target goal - affects income';
          }
        }
        
        if (shouldAffect) {
          affectingTransactions.push({ transaction, reason });
          console.log(`   ✅ ${transaction.type}: ₹${transaction.amount} - ${transaction.category} (${reason})`);
        } else {
          console.log(`   ❌ ${transaction.type}: ₹${transaction.amount} - ${transaction.category} (doesn't affect goal)`);
        }
      }
      
      console.log(`\n📈 Total affecting transactions: ${affectingTransactions.length}`);
      
      // Test goal calculation
      console.log('\n🧮 Testing goal calculation...');
      const previousProgress = goal.progressPercentage;
      const previousAmount = goal.currentAmount;
      
      await goal.calculateProgressFromTransactions();
      
      console.log(`   Previous progress: ${previousProgress}%`);
      console.log(`   New progress: ${goal.progressPercentage}%`);
      console.log(`   Progress change: ${goal.progressPercentage - previousProgress}%`);
      console.log(`   Previous amount: ₹${previousAmount}`);
      console.log(`   New amount: ₹${goal.currentAmount}`);
      console.log(`   Amount change: ₹${goal.currentAmount - previousAmount}`);
      console.log(`   Is completed: ${goal.isCompleted}`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    mongoose.connection.close();
  }
}

examineGoal(); 