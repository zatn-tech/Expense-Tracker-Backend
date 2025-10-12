# Production TLS Configuration Fix

## Problem
Email scanning fails in production with TLS/SSL errors like:
```
❌ IMAP error on attempt 1: Error scanning custom email: Error
    at Connection.<anonymous> (/home/user/expenseapi/utils/emailScanner.js:558:20)
    at TLSSocket._emitTLSError (node:_tls_wrap:1034:10)
```

## Solution
Updated TLS configuration to be more compatible with production environments.

## Changes Made

### 1. Updated TLS Configuration (`emailScanner.js`)
- Replaced deprecated `secureProtocol` with modern `minVersion`/`maxVersion`
- Added environment-specific configurations
- Added shared hosting support
- Improved error handling and logging

### 2. Environment Variables
Add these to your production environment:

```bash
# For shared hosting environments (like cPanel, etc.)
SHARED_HOSTING=true

# For production environments
NODE_ENV=production
```

### 3. TLS Configuration Priority
1. **Shared Hosting** (`SHARED_HOSTING=true`): Most permissive settings
2. **Production** (`NODE_ENV=production`): Modern TLS with fallbacks
3. **Development**: Permissive settings for testing

## Testing
Run the TLS test script to verify configuration:
```bash
cd backend
node test-tls-config.js
```

## Troubleshooting

### If email scanning still fails:

1. **Check environment variables**:
   ```bash
   echo $NODE_ENV
   echo $SHARED_HOSTING
   ```

2. **Test with shared hosting mode**:
   ```bash
   SHARED_HOSTING=true node test-tls-config.js
   ```

3. **Check server logs** for detailed TLS configuration:
   ```
   🔐 Using TLS config for attempt 1: { host: 'imap.gmail.com', port: 993, ... }
   ```

4. **Verify email provider settings**:
   - Gmail: Use App Passwords, not regular passwords
   - Outlook: Enable IMAP in account settings
   - Other providers: Check IMAP/TLS requirements

### Common Solutions

1. **For shared hosting** (cPanel, GoDaddy, etc.):
   ```bash
   export SHARED_HOSTING=true
   ```

2. **For VPS/Dedicated servers**:
   ```bash
   export NODE_ENV=production
   ```

3. **For Gmail**:
   - Enable 2-factor authentication
   - Generate App Password
   - Use App Password in email connection

## Configuration Details

### Production TLS Config
- **TLS 1.2+** with modern ciphers
- **4 fallback configurations** for compatibility
- **Automatic retry** with different TLS settings
- **Detailed logging** for debugging

### Shared Hosting Config
- **Most permissive** TLS settings
- **Minimal validation** for compatibility
- **Works with** most shared hosting providers

## Deployment Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Set `SHARED_HOSTING=true` if using shared hosting
- [ ] Test email scanning with `test-tls-config.js`
- [ ] Check logs for TLS configuration details
- [ ] Verify email provider settings
- [ ] Test with actual email scanning

## Support

If issues persist after following this guide:
1. Check server logs for detailed error information
2. Run `test-tls-config.js` to diagnose TLS issues
3. Contact your hosting provider for TLS/SSL restrictions
4. Verify email provider IMAP settings and requirements

