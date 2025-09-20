const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/expense-tracker', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

const EmailConnection = require('./models/EmailConnection');

async function fixEmailConnections() {
  try {
    console.log('🔧 Starting email connection fix...');
    
    // Find all custom provider connections
    const connections = await EmailConnection.find({ 
      provider: 'custom',
      'imap.secure': { $exists: false }
    });
    
    console.log(`📧 Found ${connections.length} connections without secure field`);
    
    if (connections.length === 0) {
      console.log('✅ All connections already have the secure field');
      return;
    }
    
    // Update each connection
    for (const connection of connections) {
      console.log(`🔧 Fixing connection ${connection._id} for ${connection.email}`);
      
      // Set default values
      if (!connection.imap.secure) {
        connection.imap.secure = true; // Default to secure
      }
      if (!connection.imap.port) {
        connection.imap.port = connection.imap.secure ? 993 : 143;
      }
      
      // Save the updated connection
      await connection.save();
      console.log(`✅ Fixed connection ${connection._id}: secure=${connection.imap.secure}, port=${connection.imap.port}`);
    }
    
    console.log('🎉 All connections fixed successfully!');
    
  } catch (error) {
    console.error('❌ Error fixing connections:', error);
  } finally {
    mongoose.connection.close();
    console.log('🔌 Database connection closed');
  }
}

// Run the fix
fixEmailConnections();
