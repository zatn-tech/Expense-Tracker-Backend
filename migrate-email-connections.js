const mongoose = require('mongoose');
const EmailConnection = require('./models/EmailConnection');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/expensetracker', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

async function migrateEmailConnections() {
  try {
    console.log('🔍 Checking for email connections with legacy hashed passwords...');
    
    // Find all email connections
    const connections = await EmailConnection.find({});
    console.log(`Found ${connections.length} email connections`);
    
    let migratedCount = 0;
    let needsRecreationCount = 0;
    
    for (const connection of connections) {
      console.log(`\n📧 Processing connection: ${connection.email} (${connection.provider})`);
      
      // Check if password is hashed (64 characters, hex only)
      if (connection.imap && connection.imap.password) {
        const password = connection.imap.password;
        if (password.length === 64 && /^[a-f0-9]+$/i.test(password)) {
          console.log('⚠️  Legacy SHA-256 hash detected');
          console.log('❌ Password cannot be recovered from hash');
          console.log('💡 User needs to recreate this connection');
          
          // Mark connection as inactive
          connection.isActive = false;
          connection.lastError = {
            message: 'Legacy SHA-256 hash detected. Password cannot be recovered. Please recreate the connection.',
            timestamp: new Date(),
            retryCount: 0
          };
          await connection.save();
          
          needsRecreationCount++;
        } else {
          console.log('✅ Password appears to be properly encrypted');
          migratedCount++;
        }
      } else {
        console.log('ℹ️  No IMAP password found');
        migratedCount++;
      }
    }
    
    console.log('\n📊 Migration Summary:');
    console.log('=====================');
    console.log(`✅ Properly encrypted: ${migratedCount}`);
    console.log(`❌ Need recreation: ${needsRecreationCount}`);
    console.log(`📧 Total connections: ${connections.length}`);
    
    if (needsRecreationCount > 0) {
      console.log('\n🔧 Next Steps:');
      console.log('1. Delete the inactive connections');
      console.log('2. Recreate them with the correct passwords');
      console.log('3. Passwords will now be properly encrypted');
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    mongoose.connection.close();
  }
}

// Run migration if called directly
if (require.main === module) {
  migrateEmailConnections().catch(console.error);
}

module.exports = { migrateEmailConnections }; 