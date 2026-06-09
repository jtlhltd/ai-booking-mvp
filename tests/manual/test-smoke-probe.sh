#!/bin/bash
# Manual test script for automation smoke probe single-fire behavior
# This script demonstrates that the probe fires only once per instance

echo "=== Automation Smoke Probe Single-Fire Test ==="
echo ""
echo "This test demonstrates that /automation-smoke throws an error only"
echo "on the first invocation, then returns a cached result on subsequent calls."
echo ""

# Check if server is running
if ! curl -s http://localhost:3000/healthz > /dev/null 2>&1; then
    echo "❌ Server is not running on port 3000"
    echo "Please start the server with: AUTOMATION_SMOKE_ENABLED=true npm start"
    exit 1
fi

echo "✓ Server is running"
echo ""

# Check if smoke probe is enabled
echo "Testing /automation-smoke endpoint..."
echo ""

# First call - should return 500
echo "1. First call (should throw error and return 500):"
HTTP_CODE=$(curl -s -o /tmp/smoke_response1.txt -w "%{http_code}" http://localhost:3000/automation-smoke)
echo "   HTTP Status: $HTTP_CODE"
if [ "$HTTP_CODE" = "500" ]; then
    echo "   ✓ Correctly returned 500 (error thrown for Sentry)"
else
    echo "   ❌ Expected 500, got $HTTP_CODE"
    if [ "$HTTP_CODE" = "404" ]; then
        echo "   Note: Endpoint returned 404. Is AUTOMATION_SMOKE_ENABLED=true?"
    fi
fi
echo ""

# Second call - should return 200 with cached result
echo "2. Second call (should return 200 with cached result):"
sleep 0.5
HTTP_CODE=$(curl -s -o /tmp/smoke_response2.txt -w "%{http_code}" http://localhost:3000/automation-smoke)
RESPONSE=$(cat /tmp/smoke_response2.txt)
echo "   HTTP Status: $HTTP_CODE"
echo "   Response: $RESPONSE"
if [ "$HTTP_CODE" = "200" ] && echo "$RESPONSE" | grep -q "smoke probe already fired"; then
    echo "   ✓ Correctly returned 200 with cached result"
else
    echo "   ❌ Expected 200 with cached message, got $HTTP_CODE"
fi
echo ""

# Third call - should still return 200
echo "3. Third call (should still return 200 with cached result):"
sleep 0.5
HTTP_CODE=$(curl -s -o /tmp/smoke_response3.txt -w "%{http_code}" http://localhost:3000/automation-smoke)
RESPONSE=$(cat /tmp/smoke_response3.txt)
echo "   HTTP Status: $HTTP_CODE"
echo "   Response: $RESPONSE"
if [ "$HTTP_CODE" = "200" ] && echo "$RESPONSE" | grep -q "smoke probe already fired"; then
    echo "   ✓ Correctly returned 200 with cached result"
else
    echo "   ❌ Expected 200 with cached message, got $HTTP_CODE"
fi
echo ""

# Cleanup
rm -f /tmp/smoke_response*.txt

echo "=== Test Complete ==="
echo ""
echo "Expected behavior:"
echo "  - First call: HTTP 500 (error thrown, captured by Sentry)"
echo "  - Subsequent calls: HTTP 200 with cached result"
echo "  - No additional errors thrown after first invocation"
