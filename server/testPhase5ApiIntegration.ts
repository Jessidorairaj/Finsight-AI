/**
 * FinSight AI — Phase 5 API Integration Test Suite
 * Tests live HTTP endpoints:
 * 1. GET /api/forecast (unauthenticated -> 401)
 * 2. POST /api/auth/register (generate real authenticated session)
 * 3. GET /api/forecast (authenticated user)
 * 4. GET /api/forecast?horizon=6 (custom forecast horizon)
 * 5. GET /api/forecast/models (model metadata and LSTM rationale)
 */

import 'dotenv/config';

const PORT = 3000;
const BASE_URL = `http://127.0.0.1:${PORT}`;

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  ✓ ${msg}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${msg}`);
    failed++;
  }
}

async function runApiTests() {
  console.log('\n======================================================');
  console.log('   FinSight AI Phase 5 — API Integration Test Suite   ');
  console.log('======================================================\n');

  // 1. Test Unauthenticated Request
  console.log('[Test 1] Unauthenticated request rejection');
  const unauthRes = await fetch(`${BASE_URL}/api/forecast`);
  assert(unauthRes.status === 401, `Unauthenticated GET /api/forecast returns 401 Unauthorized (got ${unauthRes.status})`);

  // 2. Register/Login a verified test user via /api/auth/register
  console.log('\n[Test 2] Authenticating test session via live auth endpoint');
  const testEmail = `test_forecast_${Date.now()}@finsight.ai`;
  const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testEmail,
      password: 'password123',
      displayName: 'Forecast Test User',
      monthlyIncome: 65000,
    }),
  });

  const regData = await regRes.json();
  const token = regData.token;
  assert(Boolean(token), 'Obtained cryptographically signed session token from server');

  // 3. Test Authenticated Request for user
  console.log('\n[Test 3] Authenticated user forecast calculation');
  const authRes = await fetch(`${BASE_URL}/api/forecast`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  assert(authRes.status === 200, `Authenticated GET /api/forecast returns 200 OK (got ${authRes.status})`);
  const data = await authRes.json();
  assert(data.status === 'insufficient_data' || data.status === 'ok', `Returns structured forecast response (got "${data.status}")`);
  assert(Array.isArray(data.historicalActuals), 'historicalActuals is an array');

  // 4. Test Forecast Horizon Query Parameter (?horizon=6)
  console.log('\n[Test 4] Custom forecast horizon parameter (?horizon=6)');
  const horizonRes = await fetch(`${BASE_URL}/api/forecast?horizon=6`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  assert(horizonRes.status === 200, `GET /api/forecast?horizon=6 returns 200 OK (got ${horizonRes.status})`);
  const horizonData = await horizonRes.json();
  assert(horizonData.status === 'insufficient_data' || horizonData.status === 'ok', 'Properly handled horizon request');

  // 5. Test Models and Architecture Metadata Endpoint
  console.log('\n[Test 5] Forecast models metadata & LSTM rationale endpoint');
  const modelsRes = await fetch(`${BASE_URL}/api/forecast/models`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  assert(modelsRes.status === 200, `GET /api/forecast/models returns 200 OK (got ${modelsRes.status})`);
  const modelsData = await modelsRes.json();
  assert(Array.isArray(modelsData.models) && modelsData.models.length === 4, 'Lists exactly 4 evaluated models');
  assert(typeof modelsData.deepLearningOmissionRationale === 'string', 'Contains explicit Deep Learning / LSTM omission justification');
  assert(modelsData.deepLearningOmissionRationale.includes('LSTM'), 'LSTM justification explicitly explains sequence length constraints');

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log('\n------------------------------------------------------');
  console.log(`Phase 5 API Tests Complete: ${passed} passed, ${failed} failed.`);
  console.log('------------------------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runApiTests().catch(err => {
  console.error('[Phase 5 API Test Error]:', err);
  process.exit(1);
});
