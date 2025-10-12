const mongoose = require('mongoose');
const User = require('./models/User');

// Make a user admin by email
const makeUserAdmin = async (email) => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://Yokesh:Yokesh11@cluster0.hvswkm0.mongodb.net/expense-tracker?retryWrites=true&w=majority&appName=Cluster0');

    console.log('Connected to MongoDB');

    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      console.log(`User with email ${email} not found`);
      return;
    }

    // Update user to admin
    user.role = 'admin';
    user.isAdmin = true;
    await user.save();

    console.log(`✅ User ${user.name} (${user.email}) has been made an admin`);
    console.log(`Role: ${user.role}`);
    console.log(`IsAdmin: ${user.isAdmin}`);

  } catch (error) {
    console.error('Error making user admin:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
};

// Get email from command line argument
const email = process.argv[2];

if (!email) {
  console.log('Usage: node make-user-admin.js <email>');
  console.log('Example: node make-user-admin.js user@example.com');
  process.exit(1);
}

makeUserAdmin(email);
