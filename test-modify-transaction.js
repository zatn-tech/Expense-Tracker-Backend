#!/usr/bin/env node

/**
 * Test script to debug email transaction modification
 * This script helps test the modify transaction functionality
 */

const EmailTransaction = require('./models/EmailTransaction');
const mongoose = require('mongoose');

async function testModifyTransaction() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/expensetracker');
    console.log('✅ Connected to MongoDB');
    
    // Find a test email transaction
    const testTransaction = await EmailTransaction.findOne({ 
      status: 'pending' 
    });
    
    if (!testTransaction) {
      console.log('❌ No pending email transactions found for testing');
      console.log('Please create some email transactions first');
      return;
    }
    
    console.log(`📧 Found test transaction: ${testTransaction._id}`);
    console.log(`   Status: ${testTransaction.status}`);
    console.log(`   Is Processed: ${testTransaction.isProcessed}`);
    console.log(`   Amount: ${testTransaction.detectedAmount}`);
    console.log(`   Type: ${testTransaction.detectedType}`);
    console.log(`   Category: ${testTransaction.detectedCategory}`);
    
    // Test the modify method
    console.log('\n🧪 Testing modify method...');
    
    const modifiedData = {
      amount: testTransaction.detectedAmount + 10, // Add 10 to amount
      type: testTransaction.detectedType,
      category: testTransaction.detectedCategory,
      description: testTransaction.detectedDescription + ' (modified)',
      date: testTransaction.detectedDate
    };
    
    console.log('   Original data:', {
      amount: testTransaction.detectedAmount,
      description: testTransaction.detectedDescription
    });
    
    console.log('   Modified data:', modifiedData);
    
    // Call the modify method
    await testTransaction.modify(modifiedData);
    
    console.log('✅ Transaction modified successfully!');
    console.log(`   New status: ${testTransaction.status}`);
    console.log(`   New amount: ${testTransaction.modifiedData.amount}`);
    console.log(`   New description: ${testTransaction.modifiedData.description}`);
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the test
if (require.main === module) {
  testModifyTransaction()
    .then(() => {
      console.log('\n✅ Test completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Test failed:', error);
      process.exit(1);
    });
}

module.exports = { testModifyTransaction };
