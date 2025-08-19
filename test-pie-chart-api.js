#!/usr/bin/env node

const http = require('http');

console.log('🧪 Testing Pie Chart API Endpoint...');
console.log('====================================');

// Test the category-expenses endpoint
const testPieChartAPI = () => {
  const options = {
    hostname: '192.168.0.15',
    port: 2003,
    path: '/api/user/test-user-id/transactions/category-expenses/all',
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
  };

  const req = http.request(options, (res) => {
    console.log('📡 Response Status:', res.statusCode);
    console.log('🔒 Response Headers:');
    
    Object.keys(res.headers).forEach(header => {
      console.log(`  ${header}: ${res.headers[header]}`);
    });
    
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      console.log('\n📊 Response Body:');
      try {
        const jsonData = JSON.parse(data);
        console.log(JSON.stringify(jsonData, null, 2));
        
        if (res.statusCode === 200) {
          console.log('\n🎉 API endpoint is accessible!');
        } else if (res.statusCode === 401) {
          console.log('\n🔐 Authentication required (expected for test user)');
        } else {
          console.log('\n❌ Unexpected response');
        }
      } catch (e) {
        console.log('Raw response:', data);
      }
    });
  });

  req.on('error', (error) => {
    console.error('❌ Error testing API:', error.message);
    console.log('\n💡 Make sure your backend server is running and accessible');
  });

  req.end();
};

console.log('📍 Testing endpoint: http://192.168.0.15:2003/api/user/test-user-id/transactions/category-expenses/all');
console.log('🔒 Note: This will return 401 (authentication required) which is expected');
console.log('');

testPieChartAPI(); 