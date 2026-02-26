"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const API_URL = process.env.VITE_API_URL ?? 'http://localhost:3005';
async function verifyAuth() {
    console.log(`Starting Auth Verification against ${API_URL}...`);
    const testEmail = `verify-${Date.now()}@test.com`;
    const testPassword = 'Password123!';
    const testName = 'Verification User';
    try {
        console.log('1. Testing Sign Up...');
        const signupResponse = await axios_1.default.post(`${API_URL}/auth/sign-up/email`, {
            email: testEmail,
            password: testPassword,
            name: testName,
        });
        if (signupResponse.status === 200 && signupResponse.data.user) {
            console.log('✅ Sign Up Successful');
        }
        else {
            throw new Error(`Sign Up failed with status ${signupResponse.status}`);
        }
        const { token } = signupResponse.data;
        console.log('2. Testing Sign In...');
        const signinResponse = await axios_1.default.post(`${API_URL}/auth/sign-in/email`, {
            email: testEmail,
            password: testPassword,
        });
        if (signinResponse.status === 200 && signinResponse.data.token) {
            console.log('✅ Sign In Successful');
        }
        else {
            throw new Error('Sign In failed');
        }
        console.log('3. Testing PowerSync Token (Protected)...');
        const psResponse = await axios_1.default.get(`${API_URL}/powersync/token`, {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });
        if (psResponse.status === 200 && psResponse.data.token) {
            console.log('✅ PowerSync Token Fetch Successful');
        }
        else {
            throw new Error('PowerSync token fetch failed');
        }
        console.log('\n✨ ALL AUTH TESTS PASSED! ✨');
    }
    catch (error) {
        console.error('\n❌ AUTH VERIFICATION FAILED');
        if (error.response) {
            console.error(`Status: ${error.response.status}`);
            console.error(`Data: ${JSON.stringify(error.response.data)}`);
        }
        else {
            console.error(error.message);
        }
        process.exit(1);
    }
}
verifyAuth();
//# sourceMappingURL=verify-auth.js.map