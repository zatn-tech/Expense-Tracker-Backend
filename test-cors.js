#!/usr/bin/env node

const http = require('http');

console.log('🧪 Testing CORS Configuration...');
console.log('================================');

// Test CORS preflight request
const testCors = () => {
  const options = {
    hostname: '192.168.0.15',
    port: 2003,
    path: '/api/auth/login',
    method: 'OPTIONS',
    headers: {
      'Origin': 'http://192.168.0.15:3000',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'Content-Type'
    }
  };

  const req = http.request(options, (res) => {
    console.log('📡 Response Status:', res.statusCode);
    console.log('🔒 CORS Headers:');
    
    const corsHeaders = [
      'access-control-allow-origin',
      'access-control-allow-methods',
      'access-control-allow-headers',
      'access-control-allow-credentials'
    ];
    
    corsHeaders.forEach(header => {
      if (res.headers[header]) {
        console.log(`  ✅ ${header}: ${res.headers[header]}`);
      } else {
        console.log(`  ❌ ${header}: Not found`);
      }
    });
    
    if (res.statusCode === 200) {
      console.log('\n🎉 CORS is working! Your mobile app should work now.');
    } else {
      console.log('\n❌ CORS test failed. Check your backend configuration.');
    }
  });

  req.on('error', (error) => {
    console.error('❌ Error testing CORS:', error.message);
    console.log('\n💡 Make sure your backend server is running on port 2003');
  });

  req.end();
};

// Test if backend is accessible
const testBackendAccess = () => {
  const options = {
    hostname: '192.168.0.15',
    port: 2003,
    path: '/api/auth/login',
    method: 'GET'
  };

  const req = http.request(options, (res) => {
    console.log('✅ Backend is accessible');
    console.log('📡 Status:', res.statusCode);
    testCors();
  });

  req.on('error', (error) => {
    console.error('❌ Cannot reach backend:', error.message);
    console.log('\n🔧 Troubleshooting:');
    console.log('1. Make sure backend is running: npm start');
    console.log('2. Check if port 2003 is open');
    console.log('3. Verify IP address is correct');
  });

  req.end();
};

console.log('📍 Testing backend access at: http://192.168.0.15:2003');
console.log('📱 Testing CORS for mobile origin: http://192.168.0.15:3000');
console.log('');

testBackendAccess(); 