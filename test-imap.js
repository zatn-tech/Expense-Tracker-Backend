const Imap = require('imap');

// Test IMAP connection
function testIMAPConnection(host, port, username, password, secure = true) {
  return new Promise((resolve) => {
    console.log(`Testing IMAP connection to ${host}:${port}`);
    console.log(`Username: ${username}`);
    console.log(`Secure: ${secure}`);
    
    const imap = new Imap({
      user: username,
      password: password,
      host: host,
      port: port,
      tls: secure,
      tlsOptions: { rejectUnauthorized: false },
      connTimeout: 30000,
      authTimeout: 3000
    });

    imap.once('ready', () => {
      console.log('✅ IMAP connection ready');
      imap.openBox('INBOX', false, (err, box) => {
        if (err) {
          console.log('❌ Failed to open INBOX:', err.message);
          imap.end();
          return resolve({ success: false, error: err.message });
        }

        console.log('✅ INBOX opened successfully');
        console.log('📧 Total messages:', box.messages.total);
        console.log('📬 Unread messages:', box.messages.unseen);
        console.log('🆕 Recent messages:', box.messages.recent);

        imap.end();
        resolve({
          success: true,
          message: 'IMAP connection successful',
          stats: {
            total: box.messages.total,
            unseen: box.messages.unseen,
            recent: box.messages.recent
          }
        });
      });
    });

    imap.once('error', (err) => {
      console.log('❌ IMAP connection error:', err.message);
      resolve({
        success: false,
        error: err.message,
        textCode: err.textCode
      });
    });

    imap.once('end', () => {
      console.log('🔌 IMAP connection ended');
    });

    // Set connection timeout
    setTimeout(() => {
      imap.end();
      resolve({
        success: false,
        error: 'IMAP connection timeout'
      });
    }, 30000);

    console.log('🔌 Connecting to IMAP server...');
    imap.connect();
  });
}

// Test with Gmail settings
async function testGmailIMAP() {
  console.log('🧪 Testing Gmail IMAP Connection');
  console.log('================================');
  
  // You need to replace these with your actual credentials
  const result = await testIMAPConnection(
    'imap.gmail.com',  // Gmail IMAP host
    993,                // Gmail IMAP port
    'your-email@gmail.com',  // Replace with your Gmail
    'your-app-password',      // Replace with your app password
    true                       // Use SSL/TLS
  );
  
  console.log('\n📊 Test Results:');
  console.log('================');
  console.log('Success:', result.success);
  if (result.success) {
    console.log('Message:', result.message);
    console.log('Stats:', result.stats);
  } else {
    console.log('Error:', result.error);
    if (result.textCode) {
      console.log('Text Code:', result.textCode);
    }
  }
}

// Run the test
if (require.main === module) {
  testGmailIMAP().catch(console.error);
}

module.exports = { testIMAPConnection }; 