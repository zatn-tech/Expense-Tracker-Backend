const mongoose = require('mongoose');
const Budget = require('./models/Budget');
const Transaction = require('./models/Transaction');
const { checkBudgetAlerts } = require('./utils/budgetChecker');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/expense-tracker', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

async function testBudgetAlerts() {
  try {
    console.log('🧪 Testing Budget Alert System...\n');

    // Test user ID (replace with actual user ID from your database)
    const testUserId = '507f1f77bcf86cd799439011'; // Replace with actual user ID

    // 1. Create a test budget
    console.log('1. Creating test budget...');
    const testBudget = new Budget({
      userId: testUserId,
      name: 'Test Food Budget',
      type: 'category',
      category: 'Food & Dining',
      amount: 1000, // ₹1000 budget
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-12-31'),
      alertThreshold: 80, // Alert at 80%
      isActive: true
    });

    await testBudget.save();
    console.log('✅ Test budget created:', testBudget.name);

    // 2. Add a transaction that doesn't exceed budget
    console.log('\n2. Adding transaction within budget...');
    const smallTransaction = new Transaction({
      userId: testUserId,
      amount: 500, // ₹500 - within budget
      type: 'expense',
      category: 'Food & Dining',
      description: 'Test lunch',
      transactionDate: new Date(),
      paymentMethod: 'cash'
    });

    await smallTransaction.save();
    console.log('✅ Small transaction added (₹500)');

    // 3. Check budget alerts (should not trigger)
    console.log('\n3. Checking budget alerts (should not trigger)...');
    const alerts1 = await checkBudgetAlerts(testUserId, smallTransaction);
    console.log('Alerts found:', alerts1.length);

    // 4. Add a transaction that exceeds budget
    console.log('\n4. Adding transaction that exceeds budget...');
    const largeTransaction = new Transaction({
      userId: testUserId,
      amount: 600, // ₹600 - total now ₹1100, exceeding ₹1000 budget
      type: 'expense',
      category: 'Food & Dining',
      description: 'Test dinner',
      transactionDate: new Date(),
      paymentMethod: 'cash'
    });

    await largeTransaction.save();
    console.log('✅ Large transaction added (₹600)');

    // 5. Check budget alerts (should trigger)
    console.log('\n5. Checking budget alerts (should trigger)...');
    const alerts2 = await checkBudgetAlerts(testUserId, largeTransaction);
    console.log('Alerts found:', alerts2.length);
    
    if (alerts2.length > 0) {
      console.log('✅ Budget alert triggered!');
      alerts2.forEach(alert => {
        console.log(`   - ${alert.budgetName}: ${alert.isExceeded ? 'EXCEEDED' : 'THRESHOLD'}`);
        console.log(`     Spent: ₹${alert.spentAmount}, Budget: ₹${alert.budgetAmount}`);
        if (alert.isExceeded) {
          console.log(`     Excess: ₹${alert.excessAmount}`);
        }
      });
    } else {
      console.log('❌ No budget alerts triggered');
    }

    // 6. Clean up test data
    console.log('\n6. Cleaning up test data...');
    await Budget.deleteOne({ _id: testBudget._id });
    await Transaction.deleteOne({ _id: smallTransaction._id });
    await Transaction.deleteOne({ _id: largeTransaction._id });
    console.log('✅ Test data cleaned up');

    console.log('\n🎉 Budget alert test completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    mongoose.connection.close();
  }
}

// Run the test
testBudgetAlerts(); 