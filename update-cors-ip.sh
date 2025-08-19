#!/bin/bash

echo "🔧 Updating Backend CORS IP Address for Mobile Development"
echo "=========================================================="

# Get current IP address
echo "🔍 Finding your current IP address..."
NEW_IP=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -1)

if [ -z "$NEW_IP" ]; then
    echo "❌ Could not find your IP address automatically"
    echo "Please run 'ifconfig' (Mac/Linux) or 'ipconfig' (Windows) to find your IP"
    exit 1
fi

echo "✅ Your current IP address is: $NEW_IP"

# Check if IP has changed in CORS configuration
CURRENT_IP=$(grep "http://.*:3000" app.js | grep -o "http://[0-9.]*:3000" | head -1 | sed 's|http://||' | sed 's|:3000||')

if [ "$CURRENT_IP" = "$NEW_IP" ]; then
    echo "✅ CORS IP address is already up to date: $CURRENT_IP"
else
    echo "🔄 Updating CORS IP address from $CURRENT_IP to $NEW_IP"
    
    # Update the CORS configuration in app.js
    sed -i '' "s/http:\/\/$CURRENT_IP:3000/http:\/\/$NEW_IP:3000/g" app.js
    
    echo "✅ CORS IP address updated successfully!"
    echo "📍 New IP: $NEW_IP"
    echo "🌐 Frontend URL: http://$NEW_IP:3000"
    echo "🔧 Backend API URL: http://$NEW_IP:2003"
fi

echo ""
echo "📋 Next Steps:"
echo "=============="
echo "1. Restart your backend server"
echo "2. Make sure your frontend is running on port 3000"
echo "3. Test mobile access at: http://$NEW_IP:3000"
echo "4. Check backend console for CORS logs"
echo ""

echo "🎯 Your backend should now accept requests from mobile devices!"
echo "💡 If you see '🚫 CORS blocked origin' logs, the IP might have changed again." 