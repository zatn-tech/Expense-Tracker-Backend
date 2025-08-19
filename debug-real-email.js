const EmailTransactionDetector = require('./utils/emailTransactionDetector');

// Create detector instance
const detector = new EmailTransactionDetector();

// Real HDFC Bank transaction email
const realEmail = {
  content: `Dear Customer, Rs.196.00 has been debited from account 5511 to VPA swiggy1online.gpay@okpayaxis Swiggy Limited on 16-08-25. Your UPI transaction reference number is 109918792747. If you did not authorize this transaction, please report it immediately by calling 18002586161 Or SMS BLOCK UPI to 7308080808. Warm Regards, HDFC Bank`,
  metadata: {
    id: 'real-hdfc-email',
    subject: 'HDFC Bank - UPI Transaction Alert',
    from: 'alerts@hdfcbank.com',
    date: new Date('2025-08-16')
  }
};

async function debugRealEmail() {
  console.log('🔍 Testing Real HDFC Bank Transaction Email\n');
  console.log(`📧 Email: ${realEmail.metadata.subject}`);
  console.log(`From: ${realEmail.metadata.from}`);
  console.log(`Date: ${realEmail.metadata.date.toDateString()}`);
  console.log('---');
  console.log('Content:');
  console.log(realEmail.content);
  console.log('---\n');
  
  try {
    // Test transaction detection
    const transactions = await detector.detectTransactions(
      realEmail.content,
      realEmail.metadata,
      'test-user-id',
      'test-connection-id'
    );
    
    if (transactions.length > 0) {
      console.log(`✅ Detected ${transactions.length} transaction(s):`);
      transactions.forEach((txn, idx) => {
        console.log(`  ${idx + 1}. Amount: ${txn.detectedAmount}, Type: ${txn.detectedType}, Category: ${txn.detectedCategory}`);
        console.log(`     Description: ${txn.detectedDescription}`);
        console.log(`     Date: ${txn.detectedDate}`);
      });
    } else {
      console.log('❌ No transactions detected');
    }
    
    // Debug why no transactions were detected
    console.log('\n🔍 Debugging detection:');
    
    // Test amount detection with detailed logging
    console.log('  Testing amount detection:');
    const amounts = detector.detectAmounts(realEmail.content);
    console.log(`    Amounts found: ${amounts.length > 0 ? amounts.join(', ') : 'None'}`);
    
    // Test individual patterns
    console.log('    Testing individual patterns:');
    for (let j = 0; j < detector.amountPatterns.length; j++) {
      const pattern = detector.amountPatterns[j];
      const matches = realEmail.content.match(pattern);
      if (matches) {
        console.log(`      Pattern ${j + 1}: ${matches.length} matches`);
        matches.forEach((match, idx) => {
          console.log(`        Match ${idx + 1}: "${match}"`);
          // Test the numeric extraction
          const numericMatch = match.match(/([0-9,]+(?:\.[0-9]{2})?)/);
          if (numericMatch) {
            console.log(`          Numeric part: "${numericMatch[1]}"`);
            const amount = parseFloat(numericMatch[1].replace(/,/g, ''));
            console.log(`          Parsed amount: ${amount}`);
            
            // Test if this amount would pass our validation
            const isValid = detector.isValidTransactionAmount(amount, match, realEmail.content);
            console.log(`          Valid transaction amount: ${isValid}`);
          } else {
            console.log(`          No numeric part found`);
          }
        });
      } else {
        console.log(`      Pattern ${j + 1}: No matches`);
      }
    }
    
    // Test date detection
    const dates = detector.detectDates(realEmail.content);
    console.log(`  Dates found: ${dates.length > 0 ? dates.map(d => d.toDateString()).join(', ') : 'None'}`);
    
    // Test transaction type detection
    const transactionType = detector.detectTransactionType(realEmail.content);
    console.log(`  Transaction type: ${transactionType}`);
    
    // Test category detection
    const category = detector.detectCategory(realEmail.content);
    console.log(`  Category: ${category}`);
    
    // Test description detection
    const description = detector.detectDescription(realEmail.content, realEmail.metadata);
    console.log(`  Description: ${description}`);
    
  } catch (error) {
    console.error(`❌ Error detecting transactions: ${error.message}`);
    console.error(error.stack);
  }
}

// Run the debug test
if (require.main === module) {
  debugRealEmail().catch(console.error);
}

module.exports = { debugRealEmail }; 