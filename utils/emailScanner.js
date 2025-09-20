const nodemailer = require('nodemailer');
const { google } = require('googleapis');
const Imap = require('imap');
const EmailTransactionDetector = require('./emailTransactionDetector');

class EmailScanner {
  constructor() {
    this.detector = new EmailTransactionDetector();
  }

  /**
   * Scan emails for a specific email connection
   */
  async scanEmails(emailConnection, scanOptions = {}) {
    try {
      let emails = [];
      
      // Apply scan options
      const maxEmails = scanOptions.maxEmails || emailConnection.syncSettings?.maxEmailsPerScan || 50;
      const scanDays = scanOptions.scanDays || emailConnection.syncSettings?.scanDays || 7;
      const customKeywords = scanOptions.customKeywords || emailConnection.syncSettings?.scanKeywords;
      
      console.log(`🔍 Scanning with options: maxEmails=${maxEmails}, scanDays=${scanDays}`);
      
      switch (emailConnection.provider) {
        case 'gmail':
          emails = await this.scanGmail(emailConnection, { maxEmails, scanDays });
          break;
        case 'outlook':
          emails = await this.scanOutlook(emailConnection, { maxEmails, scanDays });
          break;
        case 'yahoo':
          emails = await this.scanYahoo(emailConnection, { maxEmails, scanDays });
          break;
        case 'custom':
          emails = await this.scanCustom(emailConnection, { maxEmails, scanDays });
          break;
        default:
          throw new Error(`Unsupported email provider: ${emailConnection.provider}`);
      }
      
            // Process emails for transaction detection
      const detectedTransactions = [];
      const processedEmailIds = new Set(); // Track processed emails to avoid duplicates
      console.log(`🔍 Processing ${emails.length} emails for transaction detection...`);
      
      for (let i = 0; i < emails.length; i++) {
        const email = emails[i];
        
        // Skip if we've already processed this email ID
        if (processedEmailIds.has(email.id)) {
          console.log(`   ⚠️  Email ${email.id} already processed, skipping...`);
          continue;
        }
        processedEmailIds.add(email.id);
        
        
        try {
          const transactions = await this.detector.detectTransactions(
            email.content,
            {
              id: email.id,
              subject: email.subject,
              from: email.from,
              date: email.date
            },
            emailConnection.userId,
            emailConnection._id
          );
          
          console.log(`   Transactions detected: ${transactions.length}`);
          
          // Save detected transactions to database
          for (const transactionData of transactions) {
            try {
              const EmailTransaction = require('../models/EmailTransaction');
              
              // Check for duplicates using the model's method
              const existingTransaction = await EmailTransaction.checkForDuplicate(
                transactionData.userId,
                transactionData.emailId,
                transactionData.detectedAmount,
                transactionData.detectedDate,
                transactionData.detectedType
              );
              
              if (existingTransaction) {
                console.log(`   ⚠️  Similar transaction already exists: ${transactionData.detectedAmount} ${transactionData.detectedType} from email ${transactionData.emailId} on ${transactionData.detectedDate.toDateString()}, skipping...`);
                continue;
              }
              
              const emailTransaction = new EmailTransaction(transactionData);
              await emailTransaction.save();
              detectedTransactions.push(emailTransaction);
              console.log(`   ✅ Saved transaction: ${transactionData.detectedAmount} from email ${transactionData.emailId}`);
            } catch (error) {
              if (error.code === 11000) {
                // Handle composite unique constraint violation
                const keyPattern = error.keyPattern || {};
                if (keyPattern.userId && keyPattern.emailId && keyPattern.detectedAmount && keyPattern.detectedDate && keyPattern.detectedType) {
                  console.log(`   ⚠️  Exact duplicate detected for email ${transactionData.emailId}, skipping...`);
                  continue;
                }
              }
              console.error('Error saving email transaction:', error);
              // Continue with other transactions
            }
          }
        } catch (error) {
          console.error(`   ❌ Error detecting transactions: ${error.message}`);
        }
      }
      
      // Update connection status
      await emailConnection.updateLastSync('success');
      
      return {
        emailsScanned: emails.length,
        transactionsDetected: detectedTransactions.length,
        transactions: detectedTransactions
      };
      
    } catch (error) {
      console.error('Error scanning emails:', error);
      await emailConnection.recordError(error.message);
      throw error;
    }
  }

  /**
   * Scan Gmail using OAuth2
   */
  async scanGmail(emailConnection) {
    try {
      // Validate OAuth2 credentials
      if (!emailConnection.oauth2 || !emailConnection.oauth2.accessToken) {
        throw new Error('OAuth2 credentials are required for Gmail. Please complete the Google OAuth2 authorization flow.');
      }
      
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
      );
      
      oauth2Client.setCredentials({
        access_token: emailConnection.oauth2.accessToken,
        refresh_token: emailConnection.oauth2.refreshToken
      });
      
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
      
      // Calculate date range for scanning
      const scanDays = emailConnection.syncSettings.scanDays || 7;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - scanDays);
      
      // Search for emails in the date range
      const response = await gmail.users.messages.list({
        userId: 'me',
        q: `after:${startDate.toISOString().split('T')[0]}`,
        maxResults: 100
      });
      
      const emails = [];
      if (response.data.messages) {
        for (const message of response.data.messages) {
          try {
            const email = await this.fetchGmailMessage(gmail, message.id);
            if (email) {
              emails.push(email);
            }
          } catch (error) {
            console.error(`Error fetching Gmail message ${message.id}:`, error);
          }
        }
      }
      
      return emails;
      
    } catch (error) {
      console.error('Error scanning Gmail:', error);
      throw error;
    }
  }



  /**
   * Fetch individual Gmail message
   */
  async fetchGmailMessage(gmail, messageId) {
    try {
      const response = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full'
      });
      
      const message = response.data;
      const headers = message.payload.headers;
      
      const email = {
        id: messageId,
        subject: this.getHeaderValue(headers, 'Subject') || '',
        from: this.getHeaderValue(headers, 'From') || '',
        date: new Date(this.getHeaderValue(headers, 'Date') || Date.now()),
        content: this.extractGmailContent(message.payload)
      };
      
      return email;
      
    } catch (error) {
      console.error(`Error fetching Gmail message ${messageId}:`, error);
      return null;
    }
  }

  /**
   * Extract content from Gmail message payload
   */
  extractGmailContent(payload) {
    if (payload.body && payload.body.data) {
      // Simple text message
      return Buffer.from(payload.body.data, 'base64').toString('utf-8');
    }
    
    if (payload.parts) {
      // Multipart message
      for (const part of payload.parts) {
        if (part.mimeType === 'text/plain' && part.body && part.body.data) {
          return Buffer.from(part.body.data, 'base64').toString('utf-8');
        }
        if (part.mimeType === 'text/html' && part.body && part.body.data) {
          return {
            html: Buffer.from(part.body.data, 'base64').toString('utf-8')
          };
        }
      }
    }
    
    return '';
  }

  /**
   * Get header value from Gmail headers
   */
  getHeaderValue(headers, name) {
    const header = headers.find(h => h.name === name);
    return header ? header.value : '';
  }

  /**
   * Scan Outlook using OAuth2
   */
  async scanOutlook(emailConnection) {
    try {
      // For Outlook, you would use Microsoft Graph API
      // This is a simplified implementation
      const emails = [];
      
      // TODO: Implement Microsoft Graph API integration
      // For now, return empty array
      console.log('Outlook scanning not yet implemented');
      
      return emails;
      
    } catch (error) {
      console.error('Error scanning Outlook:', error);
      throw error;
    }
  }

  /**
   * Scan Yahoo using IMAP
   */
  async scanYahoo(emailConnection) {
    try {
      // Yahoo typically uses IMAP
      return await this.scanIMAP(emailConnection);
    } catch (error) {
      console.error('Error scanning Yahoo:', error);
      throw error;
    }
  }

  /**
   * Scan custom email provider using IMAP
   */
  async scanCustom(emailConnection, scanOptions = {}) {
    try {
      // Validate IMAP credentials
      if (!emailConnection.imap || !emailConnection.imap.host || !emailConnection.imap.username || !emailConnection.imap.password) {
        throw new Error('IMAP credentials are required: host, username, and password');
      }
      
      return await this.scanIMAP(emailConnection, scanOptions);
    } catch (error) {
      console.error('Error scanning custom email:', error);
      
      // Provide better error messages for common issues
      if (error.message.includes('AUTHENTICATIONFAILED')) {
        throw new Error(`Gmail IMAP Authentication Failed: ${error.message}\n\nTo fix this:\n1. Enable 2-Factor Authentication in your Google Account\n2. Generate an App Password (not your regular password)\n3. Use the App Password in the connection settings`);
      } else if (error.message.includes('Invalid credentials')) {
        throw new Error(`Invalid IMAP Credentials: ${error.message}\n\nFor Gmail, you need an App Password, not your regular password.\n\nSteps:\n1. Go to Google Account Security\n2. Enable 2-Step Verification\n3. Generate App Password for Mail\n4. Use the 16-character app password`);
      } else if (error.message.includes('timeout') || error.message.includes('Timed out')) {
        throw new Error(`Email server connection timeout. This usually means:\n\n1. Email server is slow or overloaded\n2. Network connection issues\n3. Firewall blocking the connection\n4. Incorrect server settings\n\nSolutions:\n- Wait a few minutes and try again\n- Check your internet connection\n- Verify server host and port settings\n- Contact your email provider if the issue persists\n\nOriginal error: ${error.message}`);
      }
      
      throw error;
    }
  }

  /**
   * Get TLS configuration for IMAP connection
   */
  getTLSConfig(emailConnection, attempt = 0) {
    const isSecure = emailConnection.imap.secure === true || emailConnection.imap.secure === 'true';
    
    // Different TLS configurations to try
    const tlsConfigs = [
      // Production-optimized configuration (first attempt)
      {
        rejectUnauthorized: false,
        secureProtocol: 'TLSv1_2_method',
        ciphers: 'ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-AES128-SHA256:ECDHE-RSA-AES256-SHA384',
        honorCipherOrder: true,
        checkServerIdentity: () => false, // Must be a function, not boolean
        servername: emailConnection.imap.host
      },
      // Fallback configuration for older servers
      {
        rejectUnauthorized: false,
        secureProtocol: 'TLSv1_method',
        ciphers: 'HIGH:!aNULL:!eNULL:!EXPORT:!DES:!RC4:!MD5:!PSK:!SRP:!CAMELLIA',
        honorCipherOrder: true,
        checkServerIdentity: () => false // Must be a function, not boolean
      },
      // Most permissive configuration (last resort)
      {
        rejectUnauthorized: false,
        checkServerIdentity: () => false // Must be a function, not boolean
      }
    ];
    
    return {
      tls: isSecure,
      tlsOptions: tlsConfigs[attempt] || tlsConfigs[tlsConfigs.length - 1]
    };
  }

  /**
   * Scan email using IMAP with retry logic
   */
  async scanIMAP(emailConnection, retryCount = 0) {
    const maxRetries = 3;
    const retryDelay = 5000; // 5 seconds between retries
    const operationTimeout = 60000; // 60 second timeout for entire operation

    return new Promise((resolve, reject) => {
      // Set operation timeout
      const timeoutId = setTimeout(() => {
        console.log('⏱️ IMAP operation timed out, ending connection...');
        imap.end();
        reject(new Error('IMAP operation timed out after 60 seconds'));
      }, operationTimeout);
      
      let imap; // Declare imap variable for timeout handler
      try {
        // Decrypt password for IMAP connection
        const decryptedPassword = emailConnection.decrypt(emailConnection.imap.password);
        
        // Get TLS configuration based on retry attempt
        const tlsConfig = this.getTLSConfig(emailConnection, retryCount);
        
        imap = new Imap({
          user: emailConnection.imap.username,
          password: decryptedPassword,
          host: emailConnection.imap.host,
          port: emailConnection.imap.port,
          tls: tlsConfig.tls,
          tlsOptions: tlsConfig.tlsOptions,
          connTimeout: 30000, // Reduced from 60s to 30s
          authTimeout: 15000,  // Reduced from 30s to 15s
          keepalive: true,     // Keep connection alive
          debug: false         // Disable debug logging for cleaner output
        });

        const emails = [];
        let emailCount = 0;
        const scanDays = emailConnection.syncSettings?.scanDays || 7;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - scanDays);

        imap.once('ready', () => {
                      imap.openBox('INBOX', false, (err, box) => {
              if (err) {
                clearTimeout(timeoutId);
                imap.end();
                return reject(err);
              }

            // Search for emails in the date range with optimization
            const searchCriteria = [
              ['SINCE', startDate],
              ['SMALLER', 50000] // Only fetch emails smaller than 50KB for faster processing
            ];

            imap.search(searchCriteria, (err, results) => {
              if (err) {
                clearTimeout(timeoutId);
                imap.end();
                return reject(err);
              }

              if (results.length === 0) {
                clearTimeout(timeoutId);
                imap.end();
                return resolve([]);
              }

              // Limit to last 50 emails for faster processing (reduced from 100)
              const emailsToFetch = results.slice(-50);
              emailCount = emailsToFetch.length;

              if (emailCount === 0) {
                clearTimeout(timeoutId);
                imap.end();
                return resolve([]);
              }

              emailsToFetch.forEach((uid) => {
                const fetch = imap.fetch(uid, { 
                  bodies: ['HEADER.FIELDS (FROM TO SUBJECT DATE)', '1'], 
                  struct: true 
                });

                fetch.on('message', (msg, seqno) => {
                  let buffer = '';
                  let attributes = {};
                  let headers = '';

                  msg.on('body', (stream, info) => {
                    if (info.which === 'HEADER.FIELDS (FROM TO SUBJECT DATE)') {
                      // Fetch headers
                      stream.on('data', (chunk) => {
                        headers += chunk.toString('utf8');
                      });
                    } else if (info.which === '1') {
                      // Fetch body
                      stream.on('data', (chunk) => {
                        buffer += chunk.toString('utf8');
                      });
                    }
                  });

                  msg.once('attributes', (attrs) => {
                    attributes = attrs;
                  });

                  msg.once('end', () => {
                    try {
                      // Parse email content with headers
                      const email = this.parseIMAPEmailWithHeaders(buffer, headers, attributes, uid);
                      if (email) {
                        emails.push(email);
                      } else {
                        // Fallback to original parsing method
                        const fallbackEmail = this.parseIMAPEmail(buffer, attributes, uid);
                        if (fallbackEmail) {
                          emails.push(fallbackEmail);
                        }
                      }
                    } catch (error) {
                      // Try fallback method
                      try {
                        const fallbackEmail = this.parseIMAPEmail(buffer, attributes, uid);
                        if (fallbackEmail) {
                          emails.push(fallbackEmail);
                        }
                      } catch (fallbackError) {
                        // Silently continue with next email
                      }
                    }

                    emailCount--;
                    if (emailCount === 0) {
                      clearTimeout(timeoutId); // Clear timeout on success
                      imap.end();
                      resolve(emails);
                    }
                  });
                });

                fetch.once('error', (err) => {
                  console.error('Fetch error:', err);
                  emailCount--;
                  if (emailCount === 0) {
                    imap.end();
                    resolve(emails);
                  }
                });
              });
            });
          });
        });

        imap.once('error', async (err) => {
          clearTimeout(timeoutId);
          console.error(`❌ IMAP error on attempt ${retryCount + 1}:`, err.message);
          
          // Check if this is a timeout, TLS, or network error that we should retry
          const shouldRetry = (
            err.source === 'timeout-auth' || 
            err.message.includes('timeout') || 
            err.message.includes('ECONNRESET') ||
            err.message.includes('ENOTFOUND') ||
            err.message.includes('ECONNREFUSED') ||
            err.message.includes('TLS') ||
            err.message.includes('SSL') ||
            err.message.includes('certificate') ||
            err.message.includes('handshake')
          ) && retryCount < maxRetries;
          
          if (shouldRetry) {
            console.log(`⏳ Retrying IMAP connection in ${retryDelay/1000} seconds... (attempt ${retryCount + 2}/${maxRetries + 1})`);
            setTimeout(async () => {
              try {
                const result = await this.scanIMAP(emailConnection, retryCount + 1);
                resolve(result);
              } catch (retryError) {
                reject(retryError);
              }
            }, retryDelay);
          } else {
            // Provide better error messages for common issues
            let errorMessage = err.message;
            if (err.source === 'timeout-auth' || err.message.includes('timeout')) {
              errorMessage = `Email server authentication timeout. This can happen when:\n` +
                           `1. Email server is slow to respond\n` +
                           `2. Network connection is unstable\n` +
                           `3. Server is temporarily overloaded\n\n` +
                           `Please try again in a few minutes. If this persists, check your email provider's server status.`;
            } else if (err.message.includes('TLS') || err.message.includes('SSL') || err.message.includes('certificate')) {
              errorMessage = `TLS/SSL connection error. This is common in production environments:\n` +
                           `1. Server certificate validation issues\n` +
                           `2. TLS version incompatibility\n` +
                           `3. Cipher suite mismatch\n\n` +
                           `The system will automatically retry with different TLS settings.\n` +
                           `If this persists, contact your email provider for server configuration details.`;
            } else if (err.message.includes('handshake')) {
              errorMessage = `TLS handshake failed. This usually indicates:\n` +
                           `1. Server doesn't support the requested TLS version\n` +
                           `2. Cipher suite incompatibility\n` +
                           `3. Certificate chain issues\n\n` +
                           `The system will retry with compatible settings.`;
            }
            reject(new Error(errorMessage));
          }
        });

        imap.once('end', () => {
          // Connection ended
        });

        imap.connect();

      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  /**
   * Parse IMAP email content
   */
  parseIMAPEmail(buffer, attributes, uid) {
    try {
      // Extract email headers with better parsing
      const lines = buffer.split('\n');
      let subject = '';
      let from = '';
      let date = new Date();
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmedLine = line.trim();
        
        // Look for Subject header (case-insensitive, handle various formats)
        if (trimmedLine.toLowerCase().startsWith('subject:')) {
          subject = trimmedLine.substring(8).trim();
          
          // Handle encoded subjects (like =?utf-8?B?...)
          if (subject.startsWith('=?') && subject.includes('?=')) {
            try {
              subject = this.decodeSubject(subject);
            } catch (e) {
              // Continue with original subject
            }
          }
        } 
        // Look for From header (case-insensitive, handle various formats)
        else if (trimmedLine.toLowerCase().startsWith('from:')) {
          from = trimmedLine.substring(5).trim();
          
          // Clean up email addresses
          if (from.includes('<') && from.includes('>')) {
            from = from.match(/<(.+?)>/)?.[1] || from;
            console.log(`   🧹 Cleaned From: "${from}"`);
          }
        } 
        // Look for Date header (case-insensitive, handle various formats)
        else if (trimmedLine.toLowerCase().startsWith('date:')) {
          const dateStr = trimmedLine.substring(5).trim();
          console.log(`   📅 Found Date: "${dateStr}"`);
          
          try {
            date = new Date(dateStr);
            if (isNaN(date.getTime())) {
              date = new Date();
              console.log(`   ⚠️  Invalid date, using current date`);
            } else {
              console.log(`   ✅ Parsed date: ${date.toISOString()}`);
            }
          } catch (e) {
            date = new Date();
            console.log(`   ⚠️  Date parsing error, using current date`);
          }
        }
        
        // Stop parsing headers after we find a blank line or after reasonable number of lines
        if (trimmedLine === '' || i > 50) {
          break;
        }
      }

      // Extract email body content - improved parsing
      let content = '';
      
      // Try multiple approaches to extract content
      const bodyStart = buffer.indexOf('\n\n');
      if (bodyStart !== -1) {
        content = buffer.substring(bodyStart + 2);
      }
      
      // If still no content, try different separators
      if (!content || content.length < 20) {
        const separators = ['\r\n\r\n', '\n\r\n\r\n', '\r\n\n\r\n', '\n\n\r\n'];
        for (const sep of separators) {
          const sepIndex = buffer.indexOf(sep);
          if (sepIndex !== -1) {
            content = buffer.substring(sepIndex + sep.length);
            if (content.length > 20) break;
          }
        }
      }
      
      // If still no content, try to find the first meaningful line after headers
      if (!content || content.length < 20) {
        const headerEnd = buffer.indexOf('\n\n');
        if (headerEnd !== -1) {
          const afterHeaders = buffer.substring(headerEnd + 2);
          const firstLine = afterHeaders.split('\n')[0];
          if (firstLine && firstLine.trim().length > 10) {
            content = afterHeaders;
          }
        }
      }
      
      // Fallback: use the entire buffer if no body found
      if (!content || content.length < 20) {
        content = buffer;
      }
      
      // Clean HTML content and decode quoted-printable
      if (content.includes('<!DOCTYPE html>') || content.includes('<html')) {
        content = this.extractTextFromHTML(content);
      }
      
      // Decode quoted-printable encoding
      content = this.decodeQuotedPrintable(content);

      return {
        id: uid.toString(),
        subject: subject || 'No Subject',
        from: from || 'Unknown Sender',
        date: date,
        content: content || 'No Content'
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Parse IMAP email content with separate headers
   */
  parseIMAPEmailWithHeaders(bodyBuffer, headersBuffer, attributes, uid) {
    try {
      // Parse headers first
      const headers = this.parseHeaders(headersBuffer);
      
      // Extract email body content
      let content = bodyBuffer;
      
      // Clean HTML content and decode quoted-printable
      if (content.includes('<!DOCTYPE html>') || content.includes('<html')) {
        content = this.extractTextFromHTML(content);
      }
      
      // Decode quoted-printable encoding
      content = this.decodeQuotedPrintable(content);
      
      console.log(`   📝 Final content length: ${content.length} characters`);
      console.log(`   📝 Content preview: ${content.substring(0, 100)}...`);
      console.log(`   📧 Final parsed email:`);
      console.log(`      Subject: "${headers.subject}"`);
      console.log(`      From: "${headers.from}"`);
      console.log(`      Date: ${headers.date.toISOString()}`);

      return {
        id: uid.toString(),
        subject: headers.subject || 'No Subject',
        from: headers.from || 'Unknown Sender',
        date: headers.date,
        content: content || 'No Content'
      };
    } catch (error) {
      console.error('Error parsing IMAP email with headers:', error);
      return null;
    }
  }

  /**
   * Parse email headers from header buffer
   */
  parseHeaders(headersBuffer) {
    const headers = {
      subject: '',
      from: '',
      date: new Date()
    };
    
    const lines = headersBuffer.split('\n');
    console.log(`   📋 Parsing ${lines.length} header lines...`);
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Debug: show first few header lines
      if (i < 10) {
        console.log(`   📝 Header line ${i}: "${line}"`);
      }
      
      // Look for Subject header
      if (line.toLowerCase().startsWith('subject:')) {
        headers.subject = line.substring(8).trim();
        console.log(`   🎯 Found Subject: "${headers.subject}"`);
        
        // Handle encoded subjects
        if (headers.subject.startsWith('=?') && headers.subject.includes('?=')) {
          try {
            headers.subject = this.decodeSubject(headers.subject);
            console.log(`   🔓 Decoded Subject: "${headers.subject}"`);
          } catch (e) {
            console.log(`   ⚠️  Could not decode subject: ${headers.subject}`);
          }
        }
      } 
      // Look for From header
      else if (line.toLowerCase().startsWith('from:')) {
        headers.from = line.substring(5).trim();
        console.log(`   👤 Found From: "${headers.from}"`);
        
        // Clean up email addresses
        if (headers.from.includes('<') && headers.from.includes('>')) {
          headers.from = headers.from.match(/<(.+?)>/)?.[1] || headers.from;
          console.log(`   🧹 Cleaned From: "${headers.from}"`);
        }
      } 
      // Look for Date header
      else if (line.toLowerCase().startsWith('date:')) {
        const dateStr = line.substring(5).trim();
        console.log(`   📅 Found Date: "${dateStr}"`);
        
        try {
          headers.date = new Date(dateStr);
          if (isNaN(headers.date.getTime())) {
            headers.date = new Date();
            console.log(`   ⚠️  Invalid date, using current date`);
          } else {
            console.log(`   ✅ Parsed date: ${headers.date.toISOString()}`);
          }
        } catch (e) {
          headers.date = new Date();
          console.log(`   ⚠️  Date parsing error, using current date`);
        }
      }
    }
    
    return headers;
  }

  /**
   * Decode quoted-printable encoding
   */
  decodeQuotedPrintable(content) {
    try {
      // Replace quoted-printable encoded characters
      return content
        .replace(/=0D=0A/g, '\n') // Carriage return + line feed
        .replace(/=0D/g, '\r') // Carriage return
        .replace(/=0A/g, '\n') // Line feed
        .replace(/=3D/g, '=') // Equals sign
        .replace(/=20/g, ' ') // Space
        .replace(/=2E/g, '.') // Period
        .replace(/=2C/g, ',') // Comma
        .replace(/=3A/g, ':') // Colon
        .replace(/=2F/g, '/') // Forward slash
        .replace(/=5C/g, '\\') // Backslash
        .replace(/=28/g, '(') // Left parenthesis
        .replace(/=29/g, ')') // Right parenthesis
        .replace(/=2B/g, '+') // Plus sign
        .replace(/=2D/g, '-') // Hyphen
        .replace(/=40/g, '@') // At symbol
        .replace(/=23/g, '#') // Hash
        .replace(/=24/g, '$') // Dollar sign
        .replace(/=25/g, '%') // Percent
        .replace(/=26/g, '&') // Ampersand
        .replace(/=27/g, "'") // Single quote
        .replace(/=22/g, '"') // Double quote
        .replace(/=3B/g, ';') // Semicolon
        .replace(/=3C/g, '<') // Less than
        .replace(/=3E/g, '>') // Greater than
        .replace(/=3F/g, '?') // Question mark
        .replace(/=5B/g, '[') // Left bracket
        .replace(/=5D/g, ']') // Right bracket
        .replace(/=7B/g, '{') // Left brace
        .replace(/=7D/g, '}') // Right brace
        .replace(/=7C/g, '|') // Vertical bar
        .replace(/=60/g, '`') // Backtick
        .replace(/=7E/g, '~') // Tilde
        .replace(/=5F/g, '_') // Underscore
        .replace(/=5E/g, '^') // Caret
        .replace(/=21/g, '!') // Exclamation mark
        .replace(/=2A/g, '*') // Asterisk
        .replace(/=2F/g, '/') // Forward slash
        .replace(/=5C/g, '\\') // Backslash
        .replace(/=28/g, '(') // Left parenthesis
        .replace(/=29/g, ')') // Right parenthesis
        .replace(/=2B/g, '+') // Plus sign
        .replace(/=2D/g, '-') // Hyphen
        .replace(/=40/g, '@') // At symbol
        .replace(/=23/g, '#') // Hash
        .replace(/=24/g, '$') // Dollar sign
        .replace(/=25/g, '%') // Percent
        .replace(/=26/g, '&') // Ampersand
        .replace(/=27/g, "'") // Single quote
        .replace(/=22/g, '"') // Double quote
        .replace(/=3B/g, ';') // Semicolon
        .replace(/=3C/g, '<') // Less than
        .replace(/=3E/g, '>') // Greater than
        .replace(/=3F/g, '?') // Question mark
        .replace(/=5B/g, '[') // Left bracket
        .replace(/=5D/g, ']') // Right bracket
        .replace(/=7B/g, '{') // Left brace
        .replace(/=7D/g, '}') // Right brace
        .replace(/=7C/g, '|') // Vertical bar
        .replace(/=60/g, '`') // Backtick
        .replace(/=7E/g, '~') // Tilde
        .replace(/=5F/g, '_') // Underscore
        .replace(/=5E/g, '^') // Caret
        .replace(/=21/g, '!') // Exclamation mark
        .replace(/=2A/g, '*') // Asterisk
        // Handle hex encoded characters (e.g., =E2=80=99 for smart quote)
        .replace(/=([0-9A-Fa-f]{2})/g, (match, hex) => {
          try {
            return String.fromCharCode(parseInt(hex, 16));
          } catch (e) {
            return match; // Return original if decoding fails
          }
        });
    } catch (error) {
      console.log('   ⚠️  Error decoding quoted-printable:', error.message);
      return content; // Return original content if decoding fails
    }
  }

  /**
   * Decode encoded email subjects
   */
  decodeSubject(encodedSubject) {
    try {
      console.log(`   🔓 Attempting to decode subject: ${encodedSubject}`);
      
      // Handle UTF-8 quoted-printable encoding
      if (encodedSubject.includes('utf-8') && encodedSubject.includes('q')) {
        // Format: =?UTF-8?Q?encoded_text?=
        const match = encodedSubject.match(/=\?utf-8\?q\?(.+?)\?=/i);
        if (match) {
          try {
            // First decode quoted-printable
            let decoded = this.decodeQuotedPrintable(match[1]);
            
            // Then handle UTF-8 sequences properly
            decoded = decoded.replace(/=([0-9A-Fa-f]{2})/g, (match, hex) => {
              try {
                const charCode = parseInt(hex, 16);
                // Handle UTF-8 continuation bytes
                if (charCode >= 0x80) {
                  return String.fromCharCode(charCode);
                }
                return match;
              } catch (e) {
                return match;
              }
            });
            
            console.log(`   ✅ Decoded UTF-8 quoted-printable: "${decoded}"`);
            return decoded;
          } catch (e) {
            console.log(`   ⚠️  UTF-8 decoding failed: ${e.message}`);
            // Fallback to basic decoding
            const decoded = this.decodeQuotedPrintable(match[1]);
            return decoded;
          }
        }
      }
      
      // Handle UTF-8 quoted-printable with different case variations
      if (encodedSubject.toLowerCase().includes('utf-8') && encodedSubject.toLowerCase().includes('q')) {
        // Format: =?UTF-8?Q?encoded_text?= (case insensitive)
        const match = encodedSubject.match(/=\?utf-8\?q\?(.+?)\?=/i);
        if (match) {
          try {
            // First decode quoted-printable
            let decoded = this.decodeQuotedPrintable(match[1]);
            
            // Then handle UTF-8 sequences properly
            decoded = decoded.replace(/=([0-9A-Fa-f]{2})/g, (match, hex) => {
              try {
                const charCode = parseInt(hex, 16);
                // Handle UTF-8 continuation bytes
                if (charCode >= 0x80) {
                  return String.fromCharCode(charCode);
                }
                return match;
              } catch (e) {
                return match;
              }
            });
            
            console.log(`   ✅ Decoded UTF-8 quoted-printable (case insensitive): "${decoded}"`);
            return decoded;
          } catch (e) {
            console.log(`   ⚠️  UTF-8 decoding failed: ${e.message}`);
            // Fallback to basic decoding
            const decoded = this.decodeQuotedPrintable(match[1]);
            return decoded;
          }
        }
      }
      
      // Handle UTF-8 base64 encoding
      if (encodedSubject.includes('utf-8') && encodedSubject.includes('b')) {
        // Format: =?UTF-8?B?base64_text?=
        const match = encodedSubject.match(/=\?utf-8\?b\?(.+?)\?=/i);
        if (match) {
          try {
            const decoded = Buffer.from(match[1], 'base64').toString('utf-8');
            console.log(`   ✅ Decoded UTF-8 base64: "${decoded}"`);
            return decoded;
          } catch (e) {
            console.log(`   ⚠️  Base64 decoding failed: ${e.message}`);
          }
        }
      }
      
      // Handle other encodings
      if (encodedSubject.includes('iso-8859-1') && encodedSubject.includes('q')) {
        const match = encodedSubject.match(/=\?iso-8859-1\?q\?(.+?)\?=/i);
        if (match) {
          const decoded = this.decodeQuotedPrintable(match[1]);
          console.log(`   ✅ Decoded ISO-8859-1 quoted-printable: "${decoded}"`);
          return decoded;
        }
      }
      
      // Handle Windows-1252 encoding
      if (encodedSubject.includes('windows-1252') && encodedSubject.includes('q')) {
        const match = encodedSubject.match(/=\?windows-1252\?q\?(.+?)\?=/i);
        if (match) {
          const decoded = this.decodeQuotedPrintable(match[1]);
          console.log(`   ✅ Decoded Windows-1252 quoted-printable: "${decoded}"`);
          return decoded;
        }
      }
      
      // If no specific encoding found, try to decode as quoted-printable
      if (encodedSubject.includes('?=')) {
        // Extract the encoded part
        const match = encodedSubject.match(/=\?[^?]+\?[^?]+\?(.+?)\?=/);
        if (match) {
          try {
            const decoded = this.decodeQuotedPrintable(match[1]);
            console.log(`   ✅ Decoded generic quoted-printable: "${decoded}"`);
            return decoded;
          } catch (e) {
            console.log(`   ⚠️  Generic decoding failed: ${e.message}`);
          }
        }
      }
      
      console.log(`   ⚠️  Could not decode subject, returning original`);
      return encodedSubject;
      
    } catch (error) {
      console.log(`   ❌ Subject decoding error: ${error.message}`);
      return encodedSubject;
    }
  }

  /**
   * Extract text content from HTML
   */
  extractTextFromHTML(htmlContent) {
    // Remove HTML tags and decode HTML entities
    let text = htmlContent
      .replace(/<[^>]*>/g, ' ') // Remove HTML tags
      .replace(/&nbsp;/g, ' ') // Replace &nbsp; with space
      .replace(/&amp;/g, '&') // Replace &amp; with &
      .replace(/&lt;/g, '<') // Replace &lt; with <
      .replace(/&gt;/g, '>') // Replace &gt; with >
      .replace(/&quot;/g, '"') // Replace &quot; with "
      .replace(/&#39;/g, "'") // Replace &#39; with '
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .trim();
    
    return text;
  }

  /**
   * Test email connection
   */
  async testConnection(emailConnection) {
    try {
      switch (emailConnection.provider) {
        case 'gmail':
          return await this.testGmailConnection(emailConnection);
        case 'outlook':
          return await this.testOutlookConnection(emailConnection);
        case 'custom':
          return await this.testIMAPConnection(emailConnection);
        default:
          throw new Error(`Unsupported provider: ${emailConnection.provider}`);
      }
    } catch (error) {
      console.error('Error testing connection:', error);
      throw error;
    }
  }

  /**
   * Test Gmail connection
   */
  async testGmailConnection(emailConnection) {
    try {
      // Validate OAuth2 credentials
      if (!emailConnection.oauth2 || !emailConnection.oauth2.accessToken) {
        return {
          success: false,
          error: 'OAuth2 credentials are required for Gmail. Please complete the Google OAuth2 authorization flow.'
        };
      }
      
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
      );
      
      oauth2Client.setCredentials({
        access_token: emailConnection.oauth2.accessToken,
        refresh_token: emailConnection.oauth2.refreshToken
      });
      
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
      
      // Try to fetch user profile to test connection
      const response = await gmail.users.getProfile({
        userId: 'me'
      });
      
      return {
        success: true,
        email: response.data.emailAddress,
        messagesTotal: response.data.messagesTotal,
        threadsTotal: response.data.threadsTotal
      };
      
    } catch (error) {
      console.error('Error testing Gmail connection:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Test Outlook connection
   */
  async testOutlookConnection(emailConnection) {
    // TODO: Implement Microsoft Graph API test
    return {
      success: false,
      error: 'Outlook testing not yet implemented'
    };
  }

  /**
   * Test IMAP connection with improved timeout handling
   */
  async testIMAPConnection(emailConnection) {
    return new Promise((resolve) => {
      try {
        console.log(`🔍 Testing IMAP connection for ${emailConnection.email}...`);
        
        // Get TLS configuration for test connection
        const tlsConfig = this.getTLSConfig(emailConnection, 0);
        
        const imap = new Imap({
          user: emailConnection.imap.username,
          password: emailConnection.decrypt(emailConnection.imap.password),
          host: emailConnection.imap.host,
          port: emailConnection.imap.port,
          tls: tlsConfig.tls,
          tlsOptions: tlsConfig.tlsOptions,
          connTimeout: 60000,
          authTimeout: 30000,
          keepalive: false
        });

        imap.once('ready', () => {
          imap.openBox('INBOX', false, (err, box) => {
            if (err) {
              imap.end();
              return resolve({
                success: false,
                error: `Failed to open INBOX: ${err.message}`
              });
            }

            // Get mailbox stats
            const stats = {
              success: true,
              message: 'IMAP connection successful',
              email: emailConnection.imap.username,
              messagesTotal: box.messages.total,
              messagesUnseen: box.messages.unseen,
              messagesRecent: box.messages.recent
            };

            imap.end();
            resolve(stats);
          });
        });

        imap.once('error', (err) => {
          let errorMessage = `IMAP connection error: ${err.message}`;
          
          // Handle timeout errors specifically
          if (err.source === 'timeout-auth' || err.message.includes('timeout')) {
            errorMessage = `Connection timeout while authenticating with email server.\n\n`;
            errorMessage += `This commonly happens when:\n`;
            errorMessage += `• Email server is slow or overloaded\n`;
            errorMessage += `• Network connection is unstable\n`;
            errorMessage += `• Firewall is blocking the connection\n`;
            errorMessage += `• Server settings are incorrect\n\n`;
            errorMessage += `Solutions:\n`;
            errorMessage += `• Wait a few minutes and try again\n`;
            errorMessage += `• Check your internet connection\n`;
            errorMessage += `• Verify server host and port settings\n`;
            errorMessage += `• For Gmail: Use imap.gmail.com:993 with SSL enabled\n`;
            errorMessage += `• Contact your email provider if this persists`;
          }
          // Handle TLS/SSL errors in production
          else if (err.message.includes('TLS') || err.message.includes('SSL') || err.message.includes('certificate') || err.message.includes('handshake')) {
            errorMessage = `TLS/SSL connection error in production environment:\n\n`;
            errorMessage += `This is common when:\n`;
            errorMessage += `• Server certificate validation fails\n`;
            errorMessage += `• TLS version incompatibility\n`;
            errorMessage += `• Cipher suite mismatch\n`;
            errorMessage += `• Production security policies are stricter\n\n`;
            errorMessage += `Solutions:\n`;
            errorMessage += `• The system will retry with compatible TLS settings\n`;
            errorMessage += `• Check if your email provider supports TLS 1.2+\n`;
            errorMessage += `• Verify server hostname matches certificate\n`;
            errorMessage += `• Contact your email provider for server configuration\n\n`;
            errorMessage += `Original error: ${err.message}`;
          }
          // Provide specific guidance for common Gmail issues
          else if (err.textCode === 'AUTHENTICATIONFAILED') {
            errorMessage += '\n\n🔑 Authentication failed. For Gmail, you need:';
            errorMessage += '\n1. 2-Factor Authentication enabled';
            errorMessage += '\n2. App Password (not regular password)';
            errorMessage += '\n3. IMAP enabled in Gmail settings';
            errorMessage += '\n\n📱 To get app password:';
            errorMessage += '\n1. Go to Google Account Security';
            errorMessage += '\n2. Enable 2-Step Verification';
            errorMessage += '\n3. Generate App Password for Mail';
          } else if (err.textCode === 'LOGIN') {
            errorMessage += '\n\n🔐 Login failed. Check username and password.';
          } else if (err.textCode === 'CAPABILITY') {
            errorMessage += '\n\n🚫 Server capability error. Check host and port settings.';
          }
          
          resolve({
            success: false,
            error: errorMessage,
            textCode: err.textCode,
            source: err.source
          });
        });

        imap.once('end', () => {
          // Connection ended
        });

        // Set connection timeout with better error message
        setTimeout(() => {
          imap.end();
          resolve({
            success: false,
            error: 'IMAP connection timeout after 60 seconds. The email server is not responding. Please check your server settings and try again.'
          });
        }, 60000);

        imap.connect();

      } catch (error) {
        resolve({
          success: false,
          error: `IMAP setup error: ${error.message}`
        });
      }
    });
  }

  /**
   * Refresh OAuth2 tokens
   */
  async refreshTokens(emailConnection) {
    try {
      if (emailConnection.provider === 'gmail') {
        return await this.refreshGmailTokens(emailConnection);
      }
      
      throw new Error(`Token refresh not supported for provider: ${emailConnection.provider}`);
      
    } catch (error) {
      console.error('Error refreshing tokens:', error);
      throw error;
    }
  }

  /**
   * Refresh Gmail OAuth2 tokens
   */
  async refreshGmailTokens(emailConnection) {
    try {
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
      );
      
      oauth2Client.setCredentials({
        refresh_token: emailConnection.oauth2.refreshToken
      });
      
      const { credentials } = await oauth2Client.refreshAccessToken();
      
      // Update connection with new tokens
      emailConnection.oauth2.accessToken = credentials.access_token;
      if (credentials.refresh_token) {
        emailConnection.oauth2.refreshToken = credentials.refresh_token;
      }
      emailConnection.oauth2.expiresAt = new Date(Date.now() + (credentials.expiry_date || 3600000));
      
      await emailConnection.save();
      
      return {
        success: true,
        accessToken: credentials.access_token,
        expiresAt: emailConnection.oauth2.expiresAt
      };
      
    } catch (error) {
      console.error('Error refreshing Gmail tokens:', error);
      throw error;
    }
  }
}

module.exports = EmailScanner; 