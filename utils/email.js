// utils/email.js
const nodemailer = require('nodemailer');
const pug = require('pug');
const { convert } = require('html-to-text');

class Email {
  constructor(user, url) {
    this.to = user.email;
    this.firstName = user.name.split(' ')[0];
    this.url = url;
    this.from = `ExpenseTracker <${process.env.EMAIL_FROM}>`;
  }

  newTransport() {
    if (process.env.NODE_ENV === 'production') {
      // Try SendGrid first if configured
      if (process.env.SENDGRID_API_KEY) {
        console.log('📧 Using SendGrid for email delivery');
        return nodemailer.createTransport({
          service: 'SendGrid',
          auth: {
            user: 'apikey',
            pass: process.env.SENDGRID_API_KEY
          }
        });
      }
      
      // Fallback to SMTP with multiple attempts
      console.log('📧 Using SMTP for email delivery');
      
      // Try without authentication first (as test showed this works)
      if (process.env.EMAIL_NO_AUTH === 'true') {
        console.log('📧 Using SMTP without authentication');
        return nodemailer.createTransport({
          host: process.env.EMAIL_HOST || 'mail.zatn.in',
          port: process.env.EMAIL_PORT || 587,
          secure: false,
          tls: {
            rejectUnauthorized: false
          }
        });
      }
      
      // Try with authentication
      return nodemailer.createTransport({
        host: process.env.EMAIL_HOST || 'mail.zatn.in',
        port: process.env.EMAIL_PORT || 587,
        secure: process.env.EMAIL_PORT == 465,
        tls: {
          rejectUnauthorized: false
        },
        auth: {
          user: process.env.EMAIL_USERNAME,
          pass: process.env.EMAIL_PASSWORD
        }
      });
    }

    // Development - use Mailtrap or similar testing service
    return nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT,
      secure: process.env.EMAIL_PORT == 465, // true for 465, false for other ports
      tls: {
        rejectUnauthorized: false // Allow self-signed certificates for shared hosting
      },
      auth: {
        user: process.env.EMAIL_USERNAME,
        pass: process.env.EMAIL_PASSWORD
      }
    });
  }

  // Send the actual email
  async send(template, subject) {
    // 1) Render HTML based on a pug template (if you want to use templates)
    // For now, we'll use simple HTML strings
    let html;
    
    switch (template) {
      case 'welcome':
        html = this.getWelcomeHTML();
        break;
      case 'passwordReset':
        html = this.getPasswordResetHTML();
        break;
      case 'emailVerification':
        html = this.getEmailVerificationHTML();
        break;
      default:
        html = `<p>Hello ${this.firstName},</p><p>Please visit this link: <a href="${this.url}">${this.url}</a></p>`;
    }
    const text = convert(html, {
    wordwrap: false,
    // any other options you had
  });

    // 2) Define email options
    const mailOptions = {
      from: this.from,
      to: this.to,
      subject,
      html,
      text
    };

    // 3) Create a transport and send email
    await this.newTransport().sendMail(mailOptions);
  }

  async sendWelcome() {
    await this.send('welcome', 'Welcome to ExpenseTracker! Please verify your email.');
  }

  async sendPasswordReset() {
    await this.send('passwordReset', 'Password Reset Request (valid for 10 minutes)');
  }

  async sendEmailVerification() {
    await this.send('emailVerification', 'Please verify your email address');
  }

  // HTML templates
  getWelcomeHTML() {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Welcome to ExpenseTracker</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>💰 Welcome to ExpenseTracker!</h1>
              <p>Start managing your finances with ease</p>
            </div>
            <div class="content">
              <h2>Hello ${this.firstName}!</h2>
              <p>Thank you for signing up for ExpenseTracker. We're excited to help you take control of your finances.</p>
              
              <p>To get started, please verify your email address by clicking the button below:</p>
              
              <div style="text-align: center;">
                <a href="${this.url}" class="button">Verify Email Address</a>
              </div>
              
              <p>Or copy and paste this link in your browser:</p>
              <p style="word-break: break-all; background: #e9e9e9; padding: 10px; border-radius: 5px;">
                ${this.url}
              </p>
              
              <p>This link will expire in 24 hours for security reasons.</p>
              
              <h3>What's next?</h3>
              <ul>
                <li>Add your first expense or income</li>
                <li>Set up categories that work for you</li>
                <li>View detailed reports and insights</li>
                <li>Export your data anytime</li>
              </ul>
              
              <p>If you have any questions, feel free to reply to this email.</p>
              
              <p>Happy tracking!<br>The ExpenseTracker Team</p>
            </div>
            <div class="footer">
              <p>© 2024 ExpenseTracker. All rights reserved.</p>
              <p>If you didn't create an account, please ignore this email.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  getPasswordResetHTML() {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Password Reset - ExpenseTracker</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; background: #f5576c; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .warning { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🔒 Password Reset Request</h1>
              <p>Reset your ExpenseTracker password</p>
            </div>
            <div class="content">
              <h2>Hello ${this.firstName}!</h2>
              <p>We received a request to reset your password for your ExpenseTracker account.</p>
              
              <p>Click the button below to create a new password:</p>
              
              <div style="text-align: center;">
                <a href="${this.url}" class="button">Reset My Password</a>
              </div>
              
              <p>Or copy and paste this link in your browser:</p>
              <p style="word-break: break-all; background: #e9e9e9; padding: 10px; border-radius: 5px;">
                ${this.url}
              </p>
              
              <div class="warning">
                <strong>⏰ Important:</strong> This password reset link will expire in 10 minutes for security reasons.
              </div>
              
              <p>If you didn't request a password reset, please ignore this email. Your password will remain unchanged.</p>
              
              <p>For security reasons, we recommend:</p>
              <ul>
                <li>Using a strong, unique password</li>
                <li>Not sharing your password with anyone</li>
                <li>Logging out of shared devices</li>
              </ul>
              
              <p>Best regards,<br>The ExpenseTracker Team</p>
            </div>
            <div class="footer">
              <p>© 2024 ExpenseTracker. All rights reserved.</p>
              <p>If you're having trouble with the button, copy and paste the URL into your browser.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  getEmailVerificationHTML() {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Verify Email - ExpenseTracker</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; background: #4facfe; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>📧 Verify Your Email</h1>
              <p>Confirm your ExpenseTracker account</p>
            </div>
            <div class="content">
              <h2>Hello ${this.firstName}!</h2>
              <p>Please verify your email address to complete your ExpenseTracker account setup.</p>
              
              <div style="text-align: center;">
                <a href="${this.url}" class="button">Verify Email Address</a>
              </div>
              
              <p>Or copy and paste this link in your browser:</p>
              <p style="word-break: break-all; background: #e9e9e9; padding: 10px; border-radius: 5px;">
                ${this.url}
              </p>
              
              <p>This verification link will expire in 24 hours.</p>
              
              <p>Once verified, you'll be able to:</p>
              <ul>
                <li>Access your dashboard</li>
                <li>Add transactions</li>
                <li>Generate reports</li>
                <li>Export your data</li>
              </ul>
              
              <p>Thank you for choosing ExpenseTracker!</p>
              
              <p>Best regards,<br>The ExpenseTracker Team</p>
            </div>
            <div class="footer">
              <p>© 2024 ExpenseTracker. All rights reserved.</p>
              <p>If you didn't create this account, please ignore this email.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }
}

module.exports = Email;
