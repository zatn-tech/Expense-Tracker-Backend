const EmailTransactionDetector = require('./utils/emailTransactionDetector');

// Create detector instance
const detector = new EmailTransactionDetector();

// Sample email content for testing
const sampleEmails = [
  {
    content: `
    Subject: Payment Confirmation - Rs. 1,250.00
    From: payments@example.com
    Date: 2024-01-15
    
    Dear Customer,
    
    Your payment of Rs. 1,250.00 has been successfully processed.
    Transaction ID: TXN123456
    Date: 15/01/2024
    Amount: Rs. 1,250.00
    
    Thank you for your business.
    `,
    metadata: {
      id: 'test1',
      subject: 'Payment Confirmation - Rs. 1,250.00',
      from: 'payments@example.com',
      date: new Date('2024-01-15')
    }
  },
  {
    content: `
    Subject: Amazon Order - $29.99
    From: orders@amazon.com
    Date: 2024-01-16
    
    Your order has been confirmed.
    Total Amount: $29.99
    Order Date: 16/01/2024
    Payment Method: Credit Card
    
    Items:
    - Product 1: $19.99
    - Product 2: $10.00
    `,
    metadata: {
      id: 'test2',
      subject: 'Amazon Order - $29.99',
      from: 'orders@amazon.com',
      date: new Date('2024-01-16')
    }
  },
  {
    content: `
    Subject: Uber Ride - ₹180
    From: noreply@uber.com
    Date: 2024-01-17
    
    Trip Summary:
    Amount: ₹180
    Date: 17/01/2024
    Distance: 5.2 km
    
    Thank you for using Uber!
    `,
    metadata: {
      id: 'test3',
      subject: 'Uber Ride - ₹180',
      from: 'noreply@uber.com',
      date: new Date('2024-01-17')
    }
  }
];

async function debugTransactionDetection() {
  console.log('🔍 Testing Transaction Detection Logic\n');
  
  for (let i = 0; i < sampleEmails.length; i++) {
    const email = sampleEmails[i];
    console.log(`📧 Testing Email ${i + 1}: ${email.metadata.subject}`);
    console.log(`From: ${email.metadata.from}`);
    console.log(`Date: ${email.metadata.date.toDateString()}`);
    console.log('---');
    
    try {
      // Test transaction detection
      const transactions = await detector.detectTransactions(
        email.content,
        email.metadata,
        'test-user-id',
        'test-connection-id'
      );
      
      if (transactions.length > 0) {
        console.log(`✅ Detected ${transactions.length} transaction(s):`);
        transactions.forEach((txn, idx) => {
          console.log(`  ${idx + 1}. Amount: ${txn.detectedAmount}, Type: ${txn.detectedType}, Category: ${txn.detectedCategory}`);
        });
      } else {
        console.log('❌ No transactions detected');
      }
      
      // Debug why no transactions were detected
      console.log('🔍 Debugging detection:');
      
      // Test amount detection with detailed logging
      console.log('  Testing amount detection:');
      const amounts = detector.detectAmounts(email.content);
      console.log(`    Amounts found: ${amounts.length > 0 ? amounts.join(', ') : 'None'}`);
      
      // Test individual patterns
      console.log('    Testing individual patterns:');
      for (let j = 0; j < detector.amountPatterns.length; j++) {
        const pattern = detector.amountPatterns[j];
        const matches = email.content.match(pattern);
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
            } else {
              console.log(`          No numeric part found`);
            }
          });
        } else {
          console.log(`      Pattern ${j + 1}: No matches`);
        }
      }
      
      // Test date detection
      const dates = detector.detectDates(email.content);
      console.log(`  Dates found: ${dates.length > 0 ? dates.map(d => d.toDateString()).join(', ') : 'None'}`);
      
      // Test transaction type detection
      const transactionType = detector.detectTransactionType(email.content);
      console.log(`  Transaction type: ${transactionType}`);
      
      // Test category detection
      const category = detector.detectCategory(email.content);
      console.log(`  Category: ${category}`);
      
    } catch (error) {
      console.error(`❌ Error detecting transactions: ${error.message}`);
    }
    
    console.log('\n' + '='.repeat(50) + '\n');
  }
}

// Run the debug test
if (require.main === module) {
  debugTransactionDetection().catch(console.error);
}

module.exports = { debugTransactionDetection }; 