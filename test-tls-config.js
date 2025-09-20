#!/usr/bin/env node

/**
 * Test script to verify TLS configuration for IMAP connections in production
 * This script helps diagnose TLS/SSL issues that commonly occur in production environments
 */

const EmailScanner = require('./utils/emailScanner');
const EmailConnection = require('./models/EmailConnection');

async function testTLSConfiguration() {
  console.log('🔧 Testing TLS Configuration for Production Environment\n');
  
  try {
    // Find a test email connection
    const testConnection = await EmailConnection.findOne({ 
      provider: 'custom',
      'imap.host': { $exists: true }
    });
    
    if (!testConnection) {
      console.log('❌ No custom email connection found for testing');
      console.log('Please create an email connection first to test TLS configuration');
      return;
    }
    
    console.log(`📧 Testing connection: ${testConnection.email}`);
    console.log(`🏠 Host: ${testConnection.imap.host}:${testConnection.imap.port}`);
    console.log(`🔒 Secure: ${testConnection.imap.secure}\n`);
    
    const scanner = new EmailScanner();
    
    // Test different TLS configurations
    console.log('🧪 Testing TLS configurations...\n');
    
    for (let attempt = 0; attempt < 3; attempt++) {
      console.log(`📋 Attempt ${attempt + 1}/3:`);
      
      const tlsConfig = scanner.getTLSConfig(testConnection, attempt);
      console.log(`   TLS: ${tlsConfig.tls}`);
      console.log(`   Protocol: ${tlsConfig.tlsOptions.secureProtocol || 'default'}`);
      console.log(`   Ciphers: ${tlsConfig.tlsOptions.ciphers ? 'custom' : 'default'}`);
      console.log(`   Reject Unauthorized: ${tlsConfig.tlsOptions.rejectUnauthorized}`);
      
      try {
        const result = await scanner.testIMAPConnection(testConnection);
        
        if (result.success) {
          console.log(`   ✅ SUCCESS: ${result.message}`);
          console.log(`   📊 Messages: ${result.messagesTotal}, Unseen: ${result.messagesUnseen}\n`);
          break;
        } else {
          console.log(`   ❌ FAILED: ${result.error}\n`);
        }
      } catch (error) {
        console.log(`   ❌ ERROR: ${error.message}\n`);
      }
    }
    
    console.log('🎯 TLS Configuration Test Complete');
    console.log('\n💡 If all attempts failed, check:');
    console.log('   • Email server supports TLS 1.2+');
    console.log('   • Firewall allows IMAP connections');
    console.log('   • Server certificate is valid');
    console.log('   • Credentials are correct');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
if (require.main === module) {
  testTLSConfiguration()
    .then(() => {
      console.log('\n✅ Test completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Test failed:', error);
      process.exit(1);
    });
}

module.exports = { testTLSConfiguration };
