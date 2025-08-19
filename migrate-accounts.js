#!/usr/bin/env node

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from backend directory
dotenv.config({ path: path.join(__dirname, '.env') });

const User = require('./models/User');
const Transaction = require('./models/Transaction');
const Account = require('./models/Account');

const DB = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/expensetracker';

async function migrateAccounts() {
  try {
    console.log('🚀 Starting Account Migration...');
    console.log(`🔗 Connecting to: ${DB.replace(/\/\/.*@/, '//***@')}`);
    
    // Connect to MongoDB using the same approach as server.js
    await mongoose.connect(DB);
    console.log('✅ Connected to MongoDB');
    
    // Get all users
    const users = await User.find({});
    console.log(`👥 Found ${users.length} users to migrate`);
    
    let totalAccountsCreated = 0;
    let totalTransactionsUpdated = 0;
    
    for (const user of users) {
      console.log(`\n🔄 Processing user: ${user.email} (${user._id})`);
      
      // Check if user already has accounts
      const existingAccounts = await Account.find({ userId: user._id });
      
      if (existingAccounts.length > 0) {
        console.log(`   ⚠️  User already has ${existingAccounts.length} accounts, skipping...`);
        continue;
      }
      
      // Create default account for user
      const defaultAccount = new Account({
        name: 'Default Account',
        type: 'other',
        balance: 0,
        userId: user._id,
        isDefault: true,
        isActive: true,
        description: 'Default account created during migration',
        currency: 'INR'
      });
      
      await defaultAccount.save();
      totalAccountsCreated++;
      console.log(`   ✅ Created default account: ${defaultAccount._id}`);
      
      // Get all transactions for this user
      const userTransactions = await Transaction.find({ userId: user._id });
      console.log(`   📊 Found ${userTransactions.length} transactions to update`);
      
      if (userTransactions.length > 0) {
        // Update all transactions to reference the default account
        const updateResult = await Transaction.updateMany(
          { userId: user._id },
          { accountId: defaultAccount._id }
        );
        
        totalTransactionsUpdated += updateResult.modifiedCount;
        console.log(`   ✅ Updated ${updateResult.modifiedCount} transactions`);
        
        // Calculate and update account balance based on existing transactions
        let balance = 0;
        for (const transaction of userTransactions) {
          if (transaction.type === 'income') {
            balance += transaction.amount;
          } else {
            balance -= transaction.amount;
          }
        }
        
        // Update account balance
        defaultAccount.balance = balance;
        await defaultAccount.save();
        console.log(`   💰 Updated account balance to: ₹${balance.toFixed(2)}`);
      }
    }
    
    console.log('\n🎉 Migration completed successfully!');
    console.log(`📊 Summary:`);
    console.log(`   - Total accounts created: ${totalAccountsCreated}`);
    console.log(`   - Total transactions updated: ${totalTransactionsUpdated}`);
    console.log(`   - Users processed: ${users.length}`);
    
    // Verify migration
    console.log('\n🔍 Verifying migration...');
    const totalAccounts = await Account.countDocuments();
    const totalTransactions = await Transaction.countDocuments();
    const transactionsWithoutAccount = await Transaction.countDocuments({ accountId: { $exists: false } });
    
    console.log(`   - Total accounts in system: ${totalAccounts}`);
    console.log(`   - Total transactions in system: ${totalTransactions}`);
    console.log(`   - Transactions without account: ${transactionsWithoutAccount}`);
    
    if (transactionsWithoutAccount === 0) {
      console.log('   ✅ All transactions now have account references!');
    } else {
      console.log(`   ⚠️  ${transactionsWithoutAccount} transactions still missing account references`);
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Run migration if this file is executed directly
if (require.main === module) {
  migrateAccounts();
}

module.exports = { migrateAccounts }; 