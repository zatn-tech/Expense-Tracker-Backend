// utils/appError.js
class AppError extends Error {
  constructor(message, statusCode, validationErrors = []) {
    super(message);
    
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;
    this.validationErrors = validationErrors;

    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
