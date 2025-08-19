// app.js
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const session = require('express-session');

const globalErrorHandler = require('./middleware/globalErrorHandler');
const AppError = require('./utils/appError');

// Import Passport configuration
const passport = require('./config/passport');

// Import routes
const authRoutes = require('./routes/auth');
const socialAuthRoutes = require('./routes/socialAuth');
const userRoutes = require('./routes/users');
const transactionRoutes = require('./routes/transactions');
const budgetRoutes = require('./routes/budgets');
const profileRoutes = require('./routes/profile');
const reportsRoutes = require('./routes/reports');
const recurringTransactionRoutes = require('./routes/recurringTransactions');
const goalRoutes = require('./routes/goals');
const categoryRoutes = require('./routes/categories');
const notificationRoutes = require('./routes/notifications');
const transferRoutes = require('./routes/transfers');
const emailConnectionRoutes = require('./routes/emailConnections');
const setupRoutes = require('./routes/setup');

const app = express();

// Trust proxy
app.set('trust proxy', 1);

// CORS Configuration for Mobile Development
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or Postman)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://192.168.0.105:3000', // Your computer's IP for mobile access
      process.env.CLIENT_URL
    ].filter(Boolean); // Remove undefined values
    
    // Check if origin is allowed
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      // Log blocked origins for debugging
      console.log('🚫 CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Range', 'X-Content-Range']
};

app.use(cors(corsOptions));

// Security
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }
  })
);

// Body parser
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());

// Session middleware (required for Passport)
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Rate limiting
const limiter = rateLimit({
  max: 100,
  windowMs: 60 * 60 * 1000,
  message: 'Too many requests from this IP, please try again in an hour!'
});
app.use('/api', limiter);

// Uploads middleware with updated CORS
app.use('/uploads', (req, res, next) => {
  const origin = req.headers.origin;
  if (origin && [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://192.168.0.105:3000'
  ].includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/auth', socialAuthRoutes);
app.use('/api/user', require('./routes/accounts'));
app.use('/api/user', transactionRoutes);
app.use('/api/user', budgetRoutes);
app.use('/api/user', profileRoutes);
app.use('/api/user', reportsRoutes);
app.use('/api/user', recurringTransactionRoutes);
app.use('/api/user', goalRoutes);
app.use('/api/user', categoryRoutes);
app.use('/api/user', userRoutes);
app.use('/api/transfers', transferRoutes);
app.use('/api/user', emailConnectionRoutes);
app.use('/api/setup', setupRoutes);

app.use('/api/notifications', notificationRoutes);

// Fixed version - wildcard with parameter name
app.all('*path', (req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

// Global error handler
app.use(globalErrorHandler);

module.exports = app;
