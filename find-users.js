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

async function findUsers() {
  try {
    console.log('🔍 Finding users and their goals...');
    
    // Get all users
    const users = await User.find({});
    console.log(`📊 Found ${users.length} users`);
    
    for (const user of users) {
      console.log(`\n👤 User: ${user.email} (ID: ${user._id})`);
      
      // Get user's goals
      const goals = await Goal.find({ userId: user._id });
      console.log(`   Goals: ${goals.length}`);
      
      for (const goal of goals) {
        console.log(`     🎯 ${goal.name} - ${goal.type} - ${goal.category || 'Any'} - ${goal.progressPercentage}%`);
      }
      
      // Get user's transactions
      const transactions = await Transaction.find({ userId: user._id });
      console.log(`   Transactions: ${transactions.length}`);
      
      if (transactions.length > 0) {
        console.log('   Recent transactions:');
        transactions.slice(-3).forEach(txn => {
          console.log(`     💰 ${txn.type}: ₹${txn.amount} - ${txn.category}`);
        });
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    mongoose.connection.close();
  }
}

findUsers(); 