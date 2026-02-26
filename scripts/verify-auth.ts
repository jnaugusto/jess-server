import axios from 'axios';

const API_URL = process.env.VITE_API_URL ?? 'http://localhost:3005';

async function verifyAuth() {
  console.log(`Starting Auth Verification against ${API_URL}...`);
  const testEmail = `verify-${Date.now()}@test.com`;
  const testPassword = 'Password123!';
  const testName = 'Verification User';

  try {
    // 1. Test Sign Up
    console.log('1. Testing Sign Up...');
    const signupResponse = await axios.post(`${API_URL}/auth/sign-up/email`, {
      email: testEmail,
      password: testPassword,
      name: testName,
    });

    if (signupResponse.status === 200 && signupResponse.data.user) {
      console.log('✅ Sign Up Successful');
    } else {
      throw new Error(`Sign Up failed with status ${signupResponse.status}`);
    }

    const { token } = signupResponse.data;

    // 2. Test Sign In
    console.log('2. Testing Sign In...');
    const signinResponse = await axios.post(`${API_URL}/auth/sign-in/email`, {
      email: testEmail,
      password: testPassword,
    });

    if (signinResponse.status === 200 && signinResponse.data.token) {
      console.log('✅ Sign In Successful');
    } else {
      throw new Error('Sign In failed');
    }

    // 3. Test Protected PowerSync Route
    console.log('3. Testing PowerSync Token (Protected)...');
    const psResponse = await axios.get(`${API_URL}/powersync/token`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (psResponse.status === 200 && psResponse.data.token) {
      console.log('✅ PowerSync Token Fetch Successful');
    } else {
      throw new Error('PowerSync token fetch failed');
    }

    console.log('\n✨ ALL AUTH TESTS PASSED! ✨');
  } catch (error: any) {
    console.error('\n❌ AUTH VERIFICATION FAILED');
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error(`Data: ${JSON.stringify(error.response.data)}`);
    } else {
      console.error(error.message);
    }
    process.exit(1);
  }
}

verifyAuth();
