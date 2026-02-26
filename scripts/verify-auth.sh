#!/bin/bash
API_URL="http://localhost:3005"
TEST_EMAIL="verify-$(date +%s)@test.com"
TEST_PASSWORD="Password123!"
TEST_NAME="Verification User"

echo "Starting Auth Verification against $API_URL..."

# 1. Sign Up
echo "1. Testing Sign Up..."
SIGNUP_RESPONSE=$(curl -s -X POST "$API_URL/auth/sign-up/email" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\", \"password\":\"$TEST_PASSWORD\", \"name\":\"$TEST_NAME\"}")

USER_ID=$(echo $SIGNUP_RESPONSE | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)
TOKEN=$(echo $SIGNUP_RESPONSE | grep -o '"token":"[^"]*' | head -1 | cut -d'"' -f4)

if [ -n "$USER_ID" ] && [ -n "$TOKEN" ]; then
  echo "✅ Sign Up Successful (User ID: $USER_ID)"
else
  echo "❌ Sign Up Failed"
  echo "Response: $SIGNUP_RESPONSE"
  exit 1
fi

# 2. Sign In
echo "2. Testing Sign In..."
SIGNIN_RESPONSE=$(curl -s -X POST "$API_URL/auth/sign-in/email" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\", \"password\":\"$TEST_PASSWORD\"}")

SIGNIN_TOKEN=$(echo $SIGNIN_RESPONSE | grep -o '"token":"[^"]*' | head -1 | cut -d'"' -f4)

if [ -n "$SIGNIN_TOKEN" ]; then
  echo "✅ Sign In Successful"
else
  echo "❌ Sign In Failed"
  echo "Response: $SIGNIN_RESPONSE"
  exit 1
fi

# 3. PowerSync Token (Protected)
echo "3. Testing PowerSync Token (Protected)..."
PS_RESPONSE=$(curl -s -X GET "$API_URL/powersync/token" \
  -H "Authorization: Bearer $TOKEN")

PS_TOKEN=$(echo $PS_RESPONSE | grep -o '"token":"[^"]*' | head -1 | cut -d'"' -f4)

if [ -n "$PS_TOKEN" ]; then
  echo "✅ PowerSync Token Fetch Successful"
else
  echo "❌ PowerSync Token Fetch Failed"
  echo "Response: $PS_RESPONSE"
  exit 1
fi

echo -e "\n✨ ALL AUTH TESTS PASSED! ✨"
