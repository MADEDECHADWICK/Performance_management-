import fetch from 'node-fetch';

async function testLogin() {
  try {
    console.log('Testing backend login endpoint...\n');

    const response = await fetch('http://localhost:4000/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'admin@ronalds.com',
        password: 'password123'
      })
    });

    const data = await response.json();
    
    console.log('Response status:', response.status);
    console.log('Response data:', JSON.stringify(data, null, 2));

    if (response.ok) {
      console.log('✅ Login successful!');
      console.log('Token received:', data.token ? 'YES' : 'NO');
    } else {
      console.log('❌ Login failed');
    }

  } catch (error) {
    console.error('Error testing login:', error);
  }
}

testLogin();