const mongoose = require('mongoose');
const EmailConnection = require('./models/EmailConnection');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/expensetracker', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

async function checkEmailConnections() {
  try {
    console.log('🔍 Checking email connections in database...');
    
    const connections = await EmailConnection.find({});
    
    if (connections.length === 0) {
      console.log('📭 No email connections found in database');
      return;
    }
    
    console.log(`📧 Found ${connections.length} email connection(s):`);
    
    connections.forEach((connection, index) => {
      console.log(`\n--- Connection ${index + 1} ---`);
      console.log(`ID: ${connection._id}`);
      console.log(`Email: ${connection.email}`);
      console.log(`Provider: ${connection.provider}`);
      console.log(`Active: ${connection.isActive}`);
      
      if (connection.imap) {
        console.log(`IMAP Host: ${connection.imap.host}`);
        console.log(`IMAP Port: ${connection.imap.port}`);
        console.log(`IMAP Username: ${connection.imap.username}`);
        console.log(`IMAP Secure: ${connection.imap.secure}`);
        console.log(`IMAP Password: ${connection.imap.password ? '***SET***' : 'NOT SET'}`);
      }
      
      if (connection.oauth2) {
        console.log(`OAuth2 Access Token: ${connection.oauth2.accessToken ? '***SET***' : 'NOT SET'}`);
        console.log(`OAuth2 Refresh Token: ${connection.oauth2.refreshToken ? '***SET***' : 'NOT SET'}`);
      }
    });
    
  } catch (error) {
    console.error('❌ Error checking email connections:', error);
  } finally {
    mongoose.connection.close();
  }
}

if (require.main === module) {
  checkEmailConnections().catch(console.error);
}

module.exports = { checkEmailConnections }; 