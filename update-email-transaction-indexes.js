#!/usr/bin/env node

/**
 * Update Email Transaction Indexes
 * 
 * This script updates the database indexes for EmailTransaction model:
 * 1. Removes the unique constraint on emailId
 * 2. Adds composite unique constraint for better duplicate prevention
 */

const mongoose = require('mongoose');
require('dotenv').config();

async function updateIndexes() {
  try {
    console.log('🔧 Updating Email Transaction Indexes...');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    // Get the EmailTransaction collection
    const db = mongoose.connection.db;
    const collection = db.collection('emailtransactions');
    
    console.log('\n📊 Current Indexes:');
    const currentIndexes = await collection.indexes();
    currentIndexes.forEach((index, i) => {
      console.log(`   ${i + 1}. ${index.name}: ${JSON.stringify(index.key)} ${index.unique ? '(unique)' : ''}`);
    });
    
    // Remove the old unique constraint on emailId
    console.log('\n🗑️  Removing old unique constraint on emailId...');
    try {
      await collection.dropIndex('emailId_1');
      console.log('   ✅ Removed emailId_1 unique index');
    } catch (error) {
      if (error.message.includes('index not found')) {
        console.log('   ℹ️  emailId_1 index not found (already removed)');
      } else {
        console.log('   ⚠️  Error removing emailId_1 index:', error.message);
      }
    }
    
    // Create new non-unique index on emailId
    console.log('\n📝 Creating new non-unique index on emailId...');
    try {
      await collection.createIndex({ emailId: 1 });
      console.log('   ✅ Created emailId_1 index (non-unique)');
    } catch (error) {
      console.log('   ⚠️  Error creating emailId_1 index:', error.message);
    }
    
    // Create composite unique constraint
    console.log('\n🔒 Creating composite unique constraint...');
    try {
      await collection.createIndex({ 
        userId: 1, 
        emailId: 1, 
        detectedAmount: 1, 
        detectedDate: 1, 
        detectedType: 1 
      }, { 
        unique: true,
        name: 'composite_unique_transaction'
      });
      console.log('   ✅ Created composite unique constraint');
    } catch (error) {
      console.log('   ⚠️  Error creating composite unique constraint:', error.message);
    }
    
    // Show updated indexes
    console.log('\n📊 Updated Indexes:');
    const updatedIndexes = await collection.indexes();
    updatedIndexes.forEach((index, i) => {
      console.log(`   ${i + 1}. ${index.name}: ${JSON.stringify(index.key)} ${index.unique ? '(unique)' : ''}`);
    });
    
    console.log('\n✅ Index update completed successfully!');
    console.log('\n💡 What changed:');
    console.log('   • Removed unique constraint on emailId (allows multiple transactions per email)');
    console.log('   • Added composite unique constraint (prevents exact duplicates)');
    console.log('   • Now multiple transactions can come from the same email');
    
  } catch (error) {
    console.error('❌ Error updating indexes:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Run the update
if (require.main === module) {
  updateIndexes();
}

module.exports = updateIndexes; 