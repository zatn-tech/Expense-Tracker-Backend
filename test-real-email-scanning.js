const mongoose = require('mongoose');
const EmailConnection = require('./models/EmailConnection');
const EmailScanner = require('./utils/emailScanner');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/expensetracker', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

async function testRealEmailScanning() {
  try {
    console.log('🔍 Testing Real Email Scanning...\n');
    
    // Find all email connections
    const connections = await EmailConnection.find({});
    
    if (connections.length === 0) {
      console.log('📭 No email connections found in database');
      return;
    }
    
    console.log(`📧 Found ${connections.length} email connection(s):`);
    
    for (const connection of connections) {
      console.log(`\n--- Testing Connection: ${connection.email} ---`);
      console.log(`Provider: ${connection.provider}`);
      console.log(`Active: ${connection.isActive}`);
      console.log(`Scanning Enabled: ${connection.syncSettings?.enabled}`);
      
      if (connection.imap) {
        console.log(`IMAP Host: ${connection.imap.host}`);
        console.log(`IMAP Port: ${connection.imap.port}`);
        console.log(`IMAP Username: ${connection.imap.username}`);
        console.log(`IMAP Secure: ${connection.imap.secure}`);
      }
      
      if (!connection.isActive) {
        console.log('⚠️  Connection is inactive, skipping...');
        continue;
      }
      
      if (!connection.syncSettings?.enabled) {
        console.log('⚠️  Scanning is disabled for this connection');
        continue;
      }
      
      console.log('\n🚀 Starting email scan...');
      
      try {
        const scanner = new EmailScanner();
        const scanResult = await scanner.scanEmails(connection);
        
        console.log('📊 Scan Results:');
        console.log(`  Emails Scanned: ${scanResult.emailsScanned}`);
        console.log(`  Transactions Detected: ${scanResult.transactionsDetected}`);
        
        if (scanResult.transactions && scanResult.transactions.length > 0) {
          console.log('\n✅ Detected Transactions:');
          scanResult.transactions.forEach((txn, idx) => {
            console.log(`  ${idx + 1}. Amount: ${txn.detectedAmount}`);
            console.log(`     Type: ${txn.detectedType}`);
            console.log(`     Category: ${txn.detectedCategory}`);
            console.log(`     Description: ${txn.detectedDescription}`);
            console.log(`     Date: ${txn.detectedDate}`);
            console.log(`     Email: ${txn.emailSubject}`);
            console.log('     ---');
          });
        } else {
          console.log('\n❌ No transactions detected');
          
          // Debug: Check if emails were scanned
          if (scanResult.emailsScanned > 0) {
            console.log('\n🔍 Debug: Emails were scanned but no transactions detected');
            console.log('This suggests the transaction detection logic needs adjustment');
          } else {
            console.log('\n🔍 Debug: No emails were scanned');
            console.log('This suggests an IMAP connection or email fetching issue');
          }
        }
        
      } catch (error) {
        console.error('❌ Error during email scanning:', error.message);
        console.error('Stack:', error.stack);
      }
    }
    
  } catch (error) {
    console.error('❌ Error testing email scanning:', error);
  } finally {
    mongoose.connection.close();
  }
}

// Run the test
if (require.main === module) {
  testRealEmailScanning().catch(console.error);
}

module.exports = { testRealEmailScanning }; 