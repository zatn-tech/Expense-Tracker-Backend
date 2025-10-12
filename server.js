// server.js
const mongoose = require('mongoose');
const dotenv = require('dotenv');

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.log('UNCAUGHT EXCEPTION! 💥 Shutting down...');
  console.log(err.name, err.message);
  process.exit(1);
});

// Load environment variables FIRST
dotenv.config();

// Import app AFTER environment variables are loaded
const app = require('./app');

// Connect to MongoDB
const DB = process.env.MONGODB_URI || 'mongodb://localhost:27017/expensetracker';

mongoose.connect(DB).then(() => {
  console.log('✅ MongoDB connected successfully');
}).catch((err) => {
  console.error('❌ MongoDB connection error:', err);
  process.exit(1);
});

// Start server
const port = process.env.PORT || 2003;
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${port} in ${process.env.NODE_ENV} mode`);
  console.log(`🌐 Server accessible at:`);
  console.log(`   📱 Local: http://localhost:${port}`);
  console.log(`   📱 Network: http://192.168.0.105:${port}`);
  console.log(`   📱 Mobile: http://192.168.0.105:3000`);
  console.log(`🔒 CORS configured for mobile access`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.log('UNHANDLED REJECTION! 💥 Shutting down...');
  console.log(err.name, err.message);
  server.close(() => {
    process.exit(1);
  });
});

// Handle SIGTERM (for deployment platforms like Heroku)
process.on('SIGTERM', () => {
  console.log('👋 SIGTERM RECEIVED. Shutting down gracefully');
  server.close(() => {
    console.log('💥 Process terminated!');
  });
});
