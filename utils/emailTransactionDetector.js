const EmailTransaction = require('../models/EmailTransaction');
const Transaction = require('../models/Transaction');
const Category = require('../models/Category');

class EmailTransactionDetector {
  constructor() {
    // Common transaction patterns - more specific and restrictive
    this.amountPatterns = [
      // Currency symbols followed by amounts (most reliable)
      /(?:Rs\.?|₹|INR|USD|EUR|GBP)\s*([0-9,]+(?:\.[0-9]{2})?)/gi,
      // Amounts followed by currency symbols
      /([0-9,]+(?:\.[0-9]{2})?)\s*(?:Rs\.?|₹|INR|USD|EUR|GBP)/gi,
      // Amount with strong transaction context
      /(?:amount|total|charged|debited|credited|payment|price|cost)[:\s]+(?:Rs\.?|₹|INR|USD|EUR|GBP)?\s*([0-9,]+(?:\.[0-9]{2})?)/gi,
      // UPI transaction amounts
      /(?:upi|transfer|sent|received)[:\s]+(?:Rs\.?|₹|INR|USD|EUR|GBP)?\s*([0-9,]+(?:\.[0-9]{2})?)/gi,
      // Bank transaction amounts
      /(?:bank|account|card)[:\s]+(?:Rs\.?|₹|INR|USD|EUR|GBP)?\s*([0-9,]+(?:\.[0-9]{2})?)/gi,
      // Invoice/bill amounts
      /(?:invoice|bill|receipt)[:\s]+(?:Rs\.?|₹|INR|USD|EUR|GBP)?\s*([0-9,]+(?:\.[0-9]{2})?)/gi,
      // Order/purchase amounts
      /(?:order|purchase|booking)[:\s]+(?:Rs\.?|₹|INR|USD|EUR|GBP)?\s*([0-9,]+(?:\.[0-9]{2})?)/gi
      // Removed generic amount pattern to avoid false positives
    ];

    // Date patterns
    this.datePatterns = [
      // DD/MM/YYYY or DD-MM-YYYY
      /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/g,
      // YYYY/MM/DD or YYYY-MM-DD
      /(\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/g,
      // DD/MM/YY or DD-MM-YY (Indian format)
      /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2})/g,
      // Date with context
      /(?:date|on)[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/gi,
      /(?:date|on)[:\s]+(\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/gi,
      // Date with context (Indian format)
      /(?:date|on)[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2})/gi
    ];

    // Transaction type indicators
    this.expenseKeywords = [
      'purchase', 'payment', 'charge', 'debit', 'spent', 'expense', 'bill',
      'subscription', 'order', 'booking', 'reservation', 'rent', 'utilities',
      'groceries', 'fuel', 'transport', 'food', 'shopping', 'entertainment'
    ];

    this.incomeKeywords = [
      'credit', 'deposit', 'salary', 'bonus', 'refund', 'cashback', 'reward',
      'dividend', 'interest', 'payment received', 'income', 'earnings'
    ];

    this.transferKeywords = [
      'transfer', 'moved', 'sent', 'received', 'between accounts', 'account transfer'
    ];

    // Category mapping keywords
    this.categoryKeywords = {
      'Food & Dining': ['food', 'restaurant', 'cafe', 'dining', 'meal', 'lunch', 'dinner', 'breakfast', 'snack', 'coffee', 'tea'],
      'Transportation': ['fuel', 'gas', 'petrol', 'diesel', 'uber', 'ola', 'taxi', 'bus', 'train', 'metro', 'parking', 'toll'],
      'Shopping': ['amazon', 'flipkart', 'myntra', 'shopping', 'clothes', 'electronics', 'books', 'fashion', 'retail'],
      'Entertainment': ['netflix', 'prime', 'hotstar', 'movie', 'cinema', 'theatre', 'concert', 'show', 'game', 'gaming'],
      'Bills & Utilities': ['electricity', 'water', 'gas', 'internet', 'phone', 'mobile', 'broadband', 'utility', 'bill'],
      'Healthcare': ['medicine', 'pharmacy', 'doctor', 'hospital', 'medical', 'health', 'dental', 'optical'],
      'Education': ['course', 'training', 'class', 'tuition', 'school', 'college', 'university', 'education', 'learning'],
      'Travel': ['flight', 'hotel', 'booking', 'travel', 'vacation', 'trip', 'accommodation', 'airbnb'],
      'Groceries': ['grocery', 'supermarket', 'vegetables', 'fruits', 'milk', 'bread', 'grocery store'],
      'Home & Garden': ['home', 'garden', 'furniture', 'decoration', 'maintenance', 'repair', 'renovation']
    };
  }

  /**
   * Detect transactions from email content
   */
  async detectTransactions(emailContent, emailMetadata, userId, emailConnectionId) {
    const detectedTransactions = [];
    
    try {
      console.log(`   🔍 Starting transaction detection for email: ${emailMetadata.subject}`);
      
      // Extract text content from email
      const textContent = this.extractTextContent(emailContent);
      console.log(`   📝 Extracted text content length: ${textContent.length} characters`);
      
      // Detect amounts
      const amounts = this.detectAmounts(textContent);
      console.log(`   💰 Detected amounts: ${amounts.length > 0 ? amounts.join(', ') : 'None'}`);
      
      // Detect dates
      const dates = this.detectDates(textContent);
      console.log(`   📅 Detected dates: ${dates.length > 0 ? dates.map(d => d.toDateString()).join(', ') : 'None'}`);
      
      // Detect transaction type
      const transactionType = this.detectTransactionType(textContent);
      console.log(`   🏷️  Transaction type: ${transactionType}`);
      
      // Detect category
      const category = this.detectCategory(textContent);
      console.log(`   📂 Category: ${category}`);
      
      // Detect description
      const description = this.detectDescription(textContent, emailMetadata);
      console.log(`   📋 Description: ${description}`);
      
      // Process each detected amount
      console.log(`   🔄 Processing ${amounts.length} detected amounts...`);
      for (const amount of amounts) {
        console.log(`   💸 Processing amount: ${amount}`);
        const transaction = await this.createEmailTransaction({
          userId,
          emailConnectionId,
          emailMetadata,
          amount,
          dates,
          transactionType,
          category,
          description,
          textContent
        });
        
        if (transaction) {
          detectedTransactions.push(transaction);
          console.log(`   ✅ Created transaction for amount: ${amount}`);
        } else {
          console.log(`   ❌ Failed to create transaction for amount: ${amount}`);
        }
      }
      
      console.log(`   🎯 Total transactions created: ${detectedTransactions.length}`);
      return detectedTransactions;
    } catch (error) {
      console.error('Error detecting transactions:', error);
      throw error;
    }
  }

  /**
   * Extract text content from email
   */
  extractTextContent(emailContent) {
    if (typeof emailContent === 'string') {
      return this.cleanTextContent(emailContent);
    }
    
    // Handle different email content formats
    if (emailContent.html) {
      // Remove HTML tags and extract text
      const textContent = emailContent.html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      return this.cleanTextContent(textContent);
    }
    
    if (emailContent.text) {
      return this.cleanTextContent(emailContent.text);
    }
    
    return '';
  }

  /**
   * Clean and normalize text content
   */
  cleanTextContent(text) {
    if (!text) return '';
    
    // First decode quoted-printable encoding
    text = this.decodeQuotedPrintable(text);
    
    return text
      // Remove HTML tags but preserve some structure
      .replace(/<[^>]*>/g, ' ') // Remove HTML tags
      // Remove excessive whitespace but preserve line breaks
      .replace(/[ \t]+/g, ' ') // Replace multiple spaces/tabs with single space
      .replace(/\n\s*\n\s*\n+/g, '\n\n') // Replace multiple line breaks with double line break
      // Remove common email artifacts
      .replace(/--\s*\n/g, '\n') // Remove email separators
      // Remove common email headers that might appear in body
      .replace(/^(From|To|Subject|Date|Reply-To|CC|BCC):\s*.*$/gmi, '')
      // Remove email signatures
      .replace(/\n--\s*\n.*$/s, '') // Remove everything after --
      .replace(/\nBest regards.*$/i, '')
      .replace(/\nRegards.*$/i, '')
      .replace(/\nSincerely.*$/i, '')
      .replace(/\nThank you.*$/i, '')
      // Clean up the result
      .trim()
      .replace(/\n\s*\n/g, '\n') // Normalize line breaks
      .replace(/[ \t]+/g, ' '); // Normalize spaces within lines
  }

  /**
   * Decode quoted-printable encoding
   */
  decodeQuotedPrintable(text) {
    try {
      // Replace quoted-printable encoded characters
      return text
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
      return text; // Return original text if decoding fails
    }
  }

  /**
   * Detect amounts in text content
   */
  detectAmounts(textContent) {
    const amounts = new Set();
    
    for (const pattern of this.amountPatterns) {
      const matches = textContent.match(pattern);
      if (matches) {
        matches.forEach(match => {
                      // Extract numeric value
            const numericMatch = match.match(/([0-9,]+(?:\.[0-9]{2})?)/);
            if (numericMatch) {
              const amount = parseFloat(numericMatch[1].replace(/,/g, ''));
              
              // Filter out invalid amounts (NaN, commas, etc.)
              if (!isNaN(amount) && amount > 0) {
                // Filter out non-transaction amounts
                if (this.isValidTransactionAmount(amount, match, textContent)) {
                  amounts.add(amount);
                }
              }
            }
        });
      }
    }
    
    return Array.from(amounts).sort((a, b) => b - a); // Sort by amount descending
  }

  /**
   * Check if an amount is likely a transaction amount
   */
  isValidTransactionAmount(amount, match, textContent) {
    // Basic range check - be more restrictive
    if (amount <= 0 || amount >= 1000000) return false;
    
    // Filter out very small amounts that are likely not transactions
    if (amount < 10) return false;
    
    // Filter out dates (common date patterns)
    if (amount >= 1 && amount <= 31) {
      // Check if this looks like a date
      const datePatterns = [
        /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/g,
        /\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}/g
      ];
      
      for (const datePattern of datePatterns) {
        if (datePattern.test(match)) return false;
      }
      
      // Also filter out standalone day numbers that are likely dates
      const nearbyText = textContent.substring(
        Math.max(0, textContent.indexOf(match) - 30),
        Math.min(textContent.length, textContent.indexOf(match) + 30)
      );
      
      if (nearbyText.includes('Date:') || nearbyText.includes('date:') || 
          nearbyText.includes('Date ') || nearbyText.includes('date ')) {
        return false;
      }
    }
    
    // Filter out years
    if (amount >= 2000 && amount <= 2030) {
      // Check if this looks like a year in context
      const yearPatterns = [
        /date[:\s]+\d{1,2}[\/\-]\d{1,2}[\/\-](\d{4})/gi,
        /(\d{4})[\/\-]\d{1,2}[\/\-]\d{1,2}/g
      ];
      
      for (const yearPattern of yearPatterns) {
        if (yearPattern.test(match)) return false;
      }
      
      // Also filter out standalone years that are likely dates
      const nearbyText = textContent.substring(
        Math.max(0, textContent.indexOf(match) - 30),
        Math.min(textContent.length, textContent.indexOf(match) + 30)
      );
      
      if (nearbyText.includes('Date:') || nearbyText.includes('date:') || 
          nearbyText.includes('Date ') || nearbyText.includes('date ')) {
        return false;
      }
    }
    
    // Filter out transaction IDs (usually 6+ digits)
    if (amount >= 100000 && amount <= 999999) {
      // Check if this looks like a transaction ID
      if (match.includes('ID') || match.includes('TXN') || match.includes('transaction') ||
          match.includes('Ref') || match.includes('Reference')) {
        return false;
      }
    }
    
    // Filter out account numbers (usually 4-6 digits)
    if (amount >= 1000 && amount <= 999999) {
      const nearbyText = textContent.substring(
        Math.max(0, textContent.indexOf(match) - 30),
        Math.min(textContent.length, textContent.indexOf(match) + 30)
      );
      
      if (nearbyText.includes('account') || nearbyText.includes('Account') || 
          nearbyText.includes('acc') || nearbyText.includes('Acc') ||
          nearbyText.includes('card') || nearbyText.includes('Card')) {
        return false;
      }
    }
    
    // Filter out phone numbers (usually 10 digits)
    if (amount >= 1000000000 && amount <= 9999999999) {
      const nearbyText = textContent.substring(
        Math.max(0, textContent.indexOf(match) - 30),
        Math.min(textContent.length, textContent.indexOf(match) + 30)
      );
      
      if (nearbyText.includes('phone') || nearbyText.includes('Phone') ||
          nearbyText.includes('mobile') || nearbyText.includes('Mobile') ||
          nearbyText.includes('contact') || nearbyText.includes('Contact')) {
        return false;
      }
    }
    
    // STRICT REQUIREMENT: Must have clear transaction context
    const nearbyText = textContent.substring(
      Math.max(0, textContent.indexOf(match) - 100),
      Math.min(textContent.length, textContent.indexOf(match) + 100)
    );
    
    // Look for strong transaction indicators
    const strongTransactionIndicators = [
      'amount', 'total', 'charged', 'debited', 'credited', 'payment', 'price', 'cost',
      'transaction', 'txn', 'upi', 'transfer', 'sent', 'received', 'paid', 'billed',
      'invoice', 'receipt', 'order', 'purchase', 'booking', 'reservation'
    ];
    
    const hasStrongIndicator = strongTransactionIndicators.some(indicator => 
      nearbyText.toLowerCase().includes(indicator)
    );
    
    if (!hasStrongIndicator) {
      return false;
    }
    
    // Look for currency symbols or context in the match itself
    const hasCurrency = /(?:Rs\.?|₹|INR|USD|EUR|GBP)/i.test(match);
    const hasContext = /(?:amount|total|charged|debited|credited|payment|price|cost)/i.test(match);
    
    // If it has currency or context, it's likely a transaction amount
    if (hasCurrency || hasContext) return true;
    
    // For amounts without clear context, be very restrictive
    // Only include amounts that are reasonable transaction amounts with strong context
    if (amount >= 50 && amount <= 50000) {
      // Check for additional transaction context
      const additionalIndicators = [
        'bank', 'account', 'card', 'upi', 'wallet', 'payment', 'transaction',
        'merchant', 'vendor', 'store', 'shop', 'service', 'bill', 'invoice'
      ];
      
      return additionalIndicators.some(indicator => 
        nearbyText.toLowerCase().includes(indicator)
      );
    }
    
    return false;
  }

  /**
   * Detect dates in text content
   */
  detectDates(textContent) {
    const dates = [];
    
    for (const pattern of this.datePatterns) {
      const matches = textContent.match(pattern);
      if (matches) {
        matches.forEach(match => {
          try {
            let date;
            
            // Handle Indian date format (DD-MM-YY)
            if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2}$/.test(match)) {
              const parts = match.split(/[\/\-]/);
              const day = parseInt(parts[0]);
              const month = parseInt(parts[1]) - 1; // Month is 0-indexed
              const year = parseInt(parts[2]);
              
              // Convert 2-digit year to 4-digit
              let fullYear = year;
              if (year < 50) {
                fullYear = 2000 + year; // 00-49 -> 2000-2049
              } else {
                fullYear = 1900 + year; // 50-99 -> 1950-1999
              }
              
              date = new Date(fullYear, month, day);
            } else {
              // Handle other date formats
              date = new Date(match);
            }
            
            if (!isNaN(date.getTime()) && date > new Date('2000-01-01')) {
              dates.push(date);
            }
          } catch (error) {
            // Skip invalid dates
          }
        });
      }
    }
    
    return dates.sort((a, b) => b - a); // Sort by date descending
  }

  /**
   * Detect transaction type based on keywords
   */
  detectTransactionType(textContent) {
    const lowerContent = textContent.toLowerCase();
    
    // Count keyword matches
    let expenseScore = 0;
    let incomeScore = 0;
    let transferScore = 0;
    
    this.expenseKeywords.forEach(keyword => {
      if (lowerContent.includes(keyword)) expenseScore++;
    });
    
    this.incomeKeywords.forEach(keyword => {
      if (lowerContent.includes(keyword)) incomeScore++;
    });
    
    this.transferKeywords.forEach(keyword => {
      if (lowerContent.includes(keyword)) transferScore++;
    });
    
    // Determine type based on highest score
    if (expenseScore > incomeScore && expenseScore > transferScore) {
      return 'expense';
    } else if (incomeScore > expenseScore && incomeScore > transferScore) {
      return 'income';
    } else if (transferScore > 0) {
      return 'transfer';
    }
    
    // Default to expense if no clear indicators
    return 'expense';
  }

  /**
   * Detect category based on keywords
   */
  detectCategory(textContent) {
    const lowerContent = textContent.toLowerCase();
    let bestCategory = 'Other';
    let bestScore = 0;
    
    for (const [category, keywords] of Object.entries(this.categoryKeywords)) {
      let score = 0;
      keywords.forEach(keyword => {
        if (lowerContent.includes(keyword)) {
          score += 1;
        }
      });
      
      if (score > bestScore) {
        bestScore = score;
        bestCategory = category;
      }
    }
    
    return bestScore > 0 ? bestCategory : 'Other';
  }

  /**
   * Detect description from email content
   */
  detectDescription(textContent, emailMetadata) {
    // Try to extract meaningful description
    let description = '';
    
    // First, try to find specific transaction details in content (highest priority)
    const lines = textContent.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      // Look for lines that mention payment, transaction, or service details
      if (trimmed.length > 10 && trimmed.length < 150 &&
          (trimmed.toLowerCase().includes('payment') || 
           trimmed.toLowerCase().includes('transaction') ||
           trimmed.toLowerCase().includes('service') ||
           trimmed.toLowerCase().includes('ride') ||
           trimmed.toLowerCase().includes('uber') ||
           trimmed.toLowerCase().includes('ola') ||
           trimmed.toLowerCase().includes('taxi') ||
           trimmed.toLowerCase().includes('food') ||
           trimmed.toLowerCase().includes('order') ||
           trimmed.toLowerCase().includes('purchase'))) {
        
        // Clean up the line to make it a good description
        description = trimmed
          .replace(/^(amount|total|price|cost|description|category|type):\s*/i, '') // Remove common prefixes
          .replace(/^(rs\.?|₹|inr|usd|eur|gbp)\s*\d+/gi, '') // Remove currency amounts
          .replace(/^\d+\s*(rs\.?|₹|inr|usd|eur|gbp)/gi, '') // Remove amounts with currency
          .trim();
        
        if (description.length > 5) {
          break;
        }
      }
    }
    
    // If no transaction details found, try to find merchant name or description in content
    if (!description || description.length < 10) {
      for (const line of lines) {
        const trimmed = line.trim();
        // Look for lines that could be merchant names or descriptions
        if (trimmed.length > 5 && trimmed.length < 100 && 
            !trimmed.match(/^\d/) && // Doesn't start with number
            !trimmed.includes('@') && // Doesn't contain email
            !trimmed.includes('http') && // Doesn't contain URL
            !trimmed.includes('Rs') && // Doesn't contain currency
            !trimmed.includes('₹') && // Doesn't contain currency
            !trimmed.includes('Amount') && // Doesn't contain common labels
            !trimmed.includes('Date') && // Doesn't contain common labels
            !trimmed.includes('From') && // Doesn't contain common labels
            !trimmed.includes('Subject') && // Doesn't contain common labels
            !trimmed.match(/^[A-Z\s]+$/) && // Not all caps (likely headers)
            trimmed.match(/[a-z]/i)) { // Contains letters
          
          // Check if this looks like a meaningful description
          const meaningfulWords = trimmed.split(' ').filter(word => 
            word.length > 2 && !['the', 'and', 'or', 'for', 'with', 'from', 'to', 'in', 'on', 'at', 'by'].includes(word.toLowerCase())
          );
          
          if (meaningfulWords.length >= 2) {
            description = trimmed;
            break;
          }
        }
      }
    }
    
    // If still no description, use email subject if it's meaningful
    if (!description || description.length < 10) {
      if (emailMetadata.subject && emailMetadata.subject !== 'No Subject' && emailMetadata.subject.length > 5) {
        // Clean up the subject
        const cleanSubject = emailMetadata.subject
          .replace(/Re:|Fwd:|FW:|RE:|FW:/gi, '') // Remove common email prefixes
          .replace(/\[.*?\]/g, '') // Remove brackets and their content
          .trim();
        
        if (cleanSubject.length > 5) {
          description = cleanSubject;
        }
      }
    }
    
    // If still no description, try to extract from email metadata
    if (!description || description.length < 10) {
      if (emailMetadata.from && emailMetadata.from !== 'Unknown Sender') {
        // Extract domain from email address
        const domainMatch = emailMetadata.from.match(/@(.+)/);
        if (domainMatch) {
          const domain = domainMatch[1].replace(/\.com$|\.org$|\.net$|\.in$|\.co\.uk$/i, '');
          if (domain.length > 3) {
            description = `Transaction from ${domain}`;
          }
        }
      }
    }
    
    // Final fallback
    if (!description || description.length < 5) {
      description = 'Transaction from email';
    }
    
    // Clean up the description
    description = description
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .replace(/^\s+|\s+$/g, '') // Trim whitespace
      .substring(0, 200); // Limit length
    
    return description;
  }

  /**
   * Create email transaction record
   */
  async createEmailTransaction(data) {
    try {
      const {
        userId,
        emailConnectionId,
        emailMetadata,
        amount,
        dates,
        transactionType,
        category,
        description,
        textContent
      } = data;
      
      // Calculate confidence scores
      const confidence = this.calculateConfidence(textContent, amount, category, description);
      
      // Return detected transaction data (don't save to database yet)
      return {
        userId,
        emailConnectionId,
        emailId: emailMetadata.id,
        emailSubject: emailMetadata.subject,
        emailFrom: emailMetadata.from,
        emailDate: emailMetadata.date,
        detectedAmount: amount,
        detectedType: transactionType,
        detectedCategory: category,
        detectedDescription: description,
        detectedDate: dates.length > 0 ? dates[0] : new Date(),
        confidence,
        rawContent: textContent.substring(0, 1000), // Limit content length
        parsingData: {
          amountPatterns: this.getMatchingPatterns(textContent, this.amountPatterns),
          categoryKeywords: this.getCategoryKeywords(textContent, category),
          datePatterns: this.getMatchingPatterns(textContent, this.datePatterns),
          merchantNames: this.extractMerchantNames(textContent),
          transactionTypes: this.getTransactionTypeIndicators(textContent, transactionType)
        }
      };
      
    } catch (error) {
      console.error('Error creating email transaction:', error);
      throw error;
    }
  }

  /**
   * Calculate confidence scores for different aspects
   */
  calculateConfidence(textContent, amount, category, description) {
    // Amount confidence - based on pattern matching strength
    let amountConfidence = 50;
    if (amount > 0) {
      amountConfidence = 80;
      if (amount > 100) amountConfidence = 90;
    }
    
    // Category confidence - based on keyword matches
    let categoryConfidence = 30;
    const lowerContent = textContent.toLowerCase();
    const categoryKeywords = this.categoryKeywords[category] || [];
    const matches = categoryKeywords.filter(keyword => lowerContent.includes(keyword)).length;
    if (matches > 0) {
      categoryConfidence = Math.min(90, 30 + (matches * 20));
    }
    
    // Description confidence - based on description quality
    let descriptionConfidence = 40;
    if (description && description.length > 10) {
      descriptionConfidence = 70;
      if (description.length > 20) descriptionConfidence = 85;
    }
    
    return {
      amount: amountConfidence,
      category: categoryConfidence,
      description: descriptionConfidence,
      overall: 0 // Will be calculated by the model
    };
  }

  /**
   * Get matching patterns for debugging
   */
  getMatchingPatterns(textContent, patterns) {
    const matches = [];
    patterns.forEach(pattern => {
      if (textContent.match(pattern)) {
        matches.push(pattern.source);
      }
    });
    return matches;
  }

  /**
   * Get category keywords that matched
   */
  getCategoryKeywords(textContent, category) {
    const lowerContent = textContent.toLowerCase();
    const keywords = this.categoryKeywords[category] || [];
    return keywords.filter(keyword => lowerContent.includes(keyword));
  }

  /**
   * Extract potential merchant names
   */
  extractMerchantNames(textContent) {
    const lines = textContent.split('\n');
    const merchants = [];
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length > 3 && trimmed.length < 50 && 
          !trimmed.match(/^\d/) && 
          !trimmed.includes('@') &&
          !trimmed.includes('http') &&
          !trimmed.includes('Rs') &&
          !trimmed.includes('₹')) {
        merchants.push(trimmed);
      }
    }
    
    return merchants.slice(0, 5); // Limit to 5 merchants
  }

  /**
   * Get transaction type indicators
   */
  getTransactionTypeIndicators(textContent, transactionType) {
    const lowerContent = textContent.toLowerCase();
    const indicators = [];
    
    if (transactionType === 'expense') {
      this.expenseKeywords.forEach(keyword => {
        if (lowerContent.includes(keyword)) indicators.push(keyword);
      });
    } else if (transactionType === 'income') {
      this.incomeKeywords.forEach(keyword => {
        if (lowerContent.includes(keyword)) indicators.push(keyword);
      });
    } else if (transactionType === 'transfer') {
      this.transferKeywords.forEach(keyword => {
        if (lowerContent.includes(keyword)) indicators.push(keyword);
      });
    }
    
    return indicators.slice(0, 3); // Limit to 3 indicators
  }

  /**
   * Process pending email transactions
   */
  async processPendingTransactions(userId, accountId) {
    try {
      const pendingTransactions = await EmailTransaction.getPendingTransactions(userId);
      const processed = [];
      
      for (const emailTransaction of pendingTransactions) {
        if (emailTransaction.confidence.overall >= 80) {
          // Auto-create transaction if confidence is high
          const transaction = await this.createTransactionFromEmail(emailTransaction, accountId);
          if (transaction) {
            await emailTransaction.autoCreate(transaction._id);
            processed.push({ emailTransaction, transaction, action: 'auto_created' });
          }
        } else {
          // Mark for user review
          processed.push({ emailTransaction, action: 'pending_review' });
        }
      }
      
      return processed;
    } catch (error) {
      console.error('Error processing pending transactions:', error);
      throw error;
    }
  }

  /**
   * Create actual transaction from email transaction
   */
  async createTransactionFromEmail(emailTransaction, accountId) {
    try {
      // Validate accountId
      if (!accountId || accountId === 'default-account-id') {
        throw new Error('Valid accountId is required to create transaction');
      }
      
      // Validate accountId format (should be a valid ObjectId)
      if (!accountId.match(/^[0-9a-fA-F]{24}$/)) {
        throw new Error('Invalid accountId format. Must be a valid MongoDB ObjectId');
      }
      
      const transactionData = {
        userId: emailTransaction.userId,
        accountId,
        amount: emailTransaction.detectedAmount,
        type: emailTransaction.detectedType,
        category: emailTransaction.detectedCategory,
        description: emailTransaction.detectedDescription,
        transactionDate: emailTransaction.detectedDate,
        paymentMethod: 'other', // Use valid enum value instead of 'email_detected'
        tags: ['email_detected', 'auto_imported'],
        importId: `email_${emailTransaction._id}`
      };
      
      const transaction = new Transaction(transactionData);
      await transaction.save();
      
      return transaction;
    } catch (error) {
      console.error('Error creating transaction from email:', error);
      throw error;
    }
  }
}

module.exports = EmailTransactionDetector; 