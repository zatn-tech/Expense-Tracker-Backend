// scripts/reset-indexes.js
const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

async function resetIndexes() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/expensetracker');
    console.log('✅ Connected to MongoDB');

    // Get the User collection
    const User = require('../models/User');
    const collection = User.collection;

    // Drop all indexes except _id
    console.log('🗑️  Dropping existing indexes...');
    await collection.dropIndexes();
    console.log('✅ Indexes dropped');

    // Recreate indexes by ensuring the model
    console.log('🔧 Recreating indexes...');
    await User.createIndexes();
    console.log('✅ Indexes recreated');

    // List current indexes
    const indexes = await collection.listIndexes().toArray();
    console.log('📋 Current indexes:');
    indexes.forEach(index => {
      console.log(`  - ${JSON.stringify(index.key)}`);
    });

    await mongoose.disconnect();
    console.log('✅ Done!');
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

resetIndexes();
