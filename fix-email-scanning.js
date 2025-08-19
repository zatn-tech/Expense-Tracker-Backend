#!/usr/bin/env node

/**
 * Fix Email Scanning Issues
 * 
 * This script:
 * 1. Removes duplicate email transactions
 * 2. Resets email scanning state
 * 3. Cleans up corrupted data
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const EmailTransaction = require('./models/EmailTransaction');
const EmailConnection = require('./models/EmailConnection');

async function fixEmailScanning() {
  try {
    console.log('🔧 Starting email scanning fix...');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    // 1. Find and remove duplicate email transactions
    console.log('\n🔍 Looking for duplicate email transactions...');
    
    // Find duplicates based on the new composite unique constraint
    const duplicates = await EmailTransaction.aggregate([
      {
        $group: {
          _id: {
            userId: '$userId',
            emailId: '$emailId',
            detectedAmount: '$detectedAmount',
            detectedDate: {
              $dateToString: { 
                format: '%Y-%m-%d', 
                date: '$detectedDate' 
              }
            },
            detectedType: '$detectedType'
          },
          count: { $sum: 1 },
          docs: { $push: '$$ROOT' }
        }
      },
      {
        $match: {
          count: { $gt: 1 }
        }
      }
    ]);
    
    console.log(`Found ${duplicates.length} composite duplicates`);
    
    let removedCount = 0;
    for (const duplicate of duplicates) {
      console.log(`\n📧 Composite key: ${JSON.stringify(duplicate._id)} has ${duplicate.count} duplicates`);
      
      // Keep the first one, remove the rest
      const docsToRemove = duplicate.docs.slice(1);
      const idsToRemove = docsToRemove.map(doc => doc._id);
      
      console.log(`   Keeping: ${duplicate.docs[0]._id} (created: ${duplicate.docs[0].createdAt})`);
      console.log(`   Removing: ${idsToRemove.length} duplicates`);
      
      const deleteResult = await EmailTransaction.deleteMany({ _id: { $in: idsToRemove } });
      removedCount += deleteResult.deletedCount;
      
      console.log(`   ✅ Removed ${deleteResult.deletedCount} duplicates`);
    }
    
    console.log(`\n📊 Total duplicates removed: ${removedCount}`);
    
    // 2. Reset email connection scanning state
    console.log('\n🔄 Resetting email connection scanning state...');
    
    const connections = await EmailConnection.find({ isActive: true });
    console.log(`Found ${connections.length} active email connections`);
    
    for (const connection of connections) {
      console.log(`   📧 ${connection.email} (${connection.provider})`);
      
      // Reset last sync and error state
      connection.lastSync = null;
      connection.lastSyncStatus = null;
      connection.lastError = null;
      connection.errorCount = 0;
      
      await connection.save();
      console.log(`   ✅ Reset scanning state`);
    }
    
    // 3. Clean up corrupted email transactions
    console.log('\n🧹 Cleaning up corrupted email transactions...');
    
    const corruptedTransactions = await EmailTransaction.find({
      $or: [
        { detectedAmount: { $exists: false } },
        { detectedAmount: null },
        { detectedAmount: 0 },
        { detectedType: { $exists: false } },
        { detectedType: null },
        { emailId: { $exists: false } },
        { emailId: null },
        { emailId: '' }
      ]
    });
    
    console.log(`Found ${corruptedTransactions.length} corrupted transactions`);
    
    if (corruptedTransactions.length > 0) {
      const deleteResult = await EmailTransaction.deleteMany({
        _id: { $in: corruptedTransactions.map(t => t._id) }
      });
      console.log(`✅ Removed ${deleteResult.deletedCount} corrupted transactions`);
    }
    
    // 4. Show final statistics
    console.log('\n📈 Final Statistics:');
    
    const totalTransactions = await EmailTransaction.countDocuments();
    const pendingTransactions = await EmailTransaction.countDocuments({ status: 'pending' });
    const processedTransactions = await EmailTransaction.countDocuments({ status: { $in: ['approved', 'rejected', 'modified', 'auto_created'] } });
    
    // Show email distribution
    const emailStats = await EmailTransaction.aggregate([
      {
        $group: {
          _id: '$emailId',
          transactionCount: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: null,
          totalEmails: { $sum: 1 },
          avgTransactionsPerEmail: { $avg: '$transactionCount' },
          maxTransactionsPerEmail: { $max: '$transactionCount' }
        }
      }
    ]);
    
    console.log(`   Total email transactions: ${totalTransactions}`);
    console.log(`   Pending review: ${pendingTransactions}`);
    console.log(`   Processed: ${processedTransactions}`);
    
    if (emailStats.length > 0) {
      const stats = emailStats[0];
      console.log(`   Unique emails processed: ${stats.totalEmails}`);
      console.log(`   Average transactions per email: ${stats.avgTransactionsPerEmail.toFixed(1)}`);
      console.log(`   Max transactions per email: ${stats.maxTransactionsPerEmail}`);
    }
    
    console.log('\n✅ Email scanning fix completed successfully!');
    console.log('\n💡 Next steps:');
    console.log('   1. Test email scanning with a single connection');
    console.log('   2. Check that multiple transactions from same email are handled properly');
    console.log('   3. Verify that descriptions are clean and meaningful');
    console.log('   4. Monitor for any new duplicate issues');
    
  } catch (error) {
    console.error('❌ Error fixing email scanning:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Run the fix
if (require.main === module) {
  fixEmailScanning();
}

module.exports = fixEmailScanning; 