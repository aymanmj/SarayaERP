const API_URL = 'http://localhost:3000'; // Adjust port if needed

async function verify() {
  try {
    console.log('1. Logging in...');
    const loginRes = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'admin',
        password: 'password123'
      })
    });
    
    if (!loginRes.ok) {
        const err = await loginRes.text();
        console.error('Login failed:', err);
        return;
    }

    const loginData = await loginRes.json();
    if (!loginData.accessToken) {
      console.error('Login failed: No token', loginData);
      return;
    }
    const token = loginData.accessToken;
    console.log('Login successful. Token obtained.');

    console.log('2. Triggering Test Push...');
    const pushRes = await fetch(`${API_URL}/notifications/test-push`, {
      method: 'POST',
      headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
      }
    });

    if(!pushRes.ok) {
        console.error('Push failed:', await pushRes.text());
        return;
    }
    
    const pushData = await pushRes.json();
    console.log('Push Result:', pushData);

    console.log('3. Checking Notifications...');
    const notifRes = await fetch(`${API_URL}/notifications`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if(!notifRes.ok) {
        console.error('Get notifications failed:', await notifRes.text());
        return;
    }

    const notifData = await notifRes.json();
    const found = notifData.find((n: any) => n.title === 'Test Notification');
    
    if (found) {
      console.log('SUCCESS: Notification found in list!', found);
    } else {
      console.error('FAILURE: Test notification not found.');
    }

  } catch (error: any) {
    console.error('Error during verification:', error.message);
  }
}

verify();
