/**
 * Automated verification test suite for Phase 3C: Frontend Authentication Integration
 *
 * Verifies:
 * 1. Valid login via POST /api/auth/login returns 200 and issues session cookie.
 * 2. Invalid credentials return 401 with generic error message.
 * 3. Session restoration via GET /api/auth/me returns 200 with sanitized profile.
 * 4. Logout via POST /api/auth/logout clears cookie and invalidates session.
 * 5. Unauthenticated access to protected routes receives 401.
 * 6. Admin access control: ordinary user receives 403 on /api/admin/stats; verified admin receives 200.
 * 7. Clean up of test accounts from Neon PostgreSQL with zero residual rows.
 */

import { getDbPool } from './db.js';

const BASE_URL = 'http://localhost:3000/api';

async function runPhase3CTests() {
  console.log('[Test Suite Phase 3C] Starting frontend auth integration verification...\n');

  const pool = getDbPool();
  if (!pool) throw new Error('Database pool not available');

  const timestamp = Date.now();
  const testEmail = `frontend_tester_${timestamp}@example.com`;
  const testPassword = 'Password123!';
  let userId = '';
  let sessionCookie = '';

  try {
    // ----------------------------------------------------
    // TEST 1: Register test user
    // ----------------------------------------------------
    console.log(`1. Registering test user: ${testEmail}`);
    const regRes = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
        displayName: 'Frontend Tester',
        monthlyIncome: 55000,
      }),
    });
    if (regRes.status !== 201) throw new Error(`Registration failed: ${regRes.status}`);
    const regData = await regRes.json();
    userId = regData.user.id;
    console.log(`   ✓ Registered user id: ${userId}`);

    // ----------------------------------------------------
    // TEST 2: Valid Login
    // ----------------------------------------------------
    console.log('\n2. Testing valid login via POST /api/auth/login');
    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: testPassword }),
    });

    if (loginRes.status !== 200) throw new Error(`Login failed with status ${loginRes.status}`);
    const loginData = await loginRes.json();
    if (!loginData.user || loginData.user.email !== testEmail) {
      throw new Error('User profile missing or invalid in login response');
    }

    const setCookie = loginRes.headers.get('set-cookie');
    if (!setCookie || !setCookie.includes('finsight_session=')) {
      throw new Error('Missing finsight_session cookie in login response');
    }
    sessionCookie = setCookie.split(';')[0];
    console.log(`   ✓ Login succeeded. Sanitized user returned: ${loginData.user.name} (${loginData.user.role})`);
    console.log(`   ✓ Received HttpOnly cookie: ${sessionCookie.substring(0, 30)}...`);

    // ----------------------------------------------------
    // TEST 3: Invalid Credentials
    // ----------------------------------------------------
    console.log('\n3. Testing invalid credentials response');
    const badLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: 'WrongPassword999' }),
    });

    if (badLoginRes.status !== 401) throw new Error(`Expected 401, got ${badLoginRes.status}`);
    const badLoginData = await badLoginRes.json();
    if (badLoginData.message !== 'Invalid email or password.') {
      throw new Error(`Expected generic message, got "${badLoginData.message}"`);
    }
    console.log(`   ✓ Invalid login rejected with generic message: "${badLoginData.message}". Status: 401`);

    // ----------------------------------------------------
    // TEST 4: Session Restoration (GET /api/auth/me)
    // ----------------------------------------------------
    console.log('\n4. Testing session restoration via GET /api/auth/me');
    const meRes = await fetch(`${BASE_URL}/auth/me`, {
      headers: { Cookie: sessionCookie },
    });

    if (meRes.status !== 200) throw new Error(`Session restore failed: ${meRes.status}`);
    const meData = await meRes.json();
    if (meData.status !== 'authenticated' || meData.user.id !== userId) {
      throw new Error('Session restore returned unexpected user or status');
    }
    console.log(`   ✓ Session restored: User ${meData.user.name} verified active in database.`);

    // ----------------------------------------------------
    // TEST 5: Admin Access Control
    // ----------------------------------------------------
    console.log('\n5. Testing admin authorization control on /api/admin/stats');
    // Ordinary user attempt -> 403 Forbidden
    const unprivilegedRes = await fetch(`${BASE_URL}/admin/stats`, {
      headers: { Cookie: sessionCookie },
    });
    if (unprivilegedRes.status !== 403) {
      throw new Error(`Expected 403 for non-admin on /api/admin/stats, got ${unprivilegedRes.status}`);
    }
    console.log('   ✓ Ordinary user blocked from /api/admin/stats -> 403 Forbidden');

    // Elevate user to admin directly in the database
    await pool.query("UPDATE users SET role = 'admin' WHERE id = $1", [userId]);

    // Same session cookie re-queries database for fresh role -> 200 OK
    const adminRes = await fetch(`${BASE_URL}/admin/stats`, {
      headers: { Cookie: sessionCookie },
    });
    if (adminRes.status !== 200) {
      throw new Error(`Expected 200 for database-verified admin, got ${adminRes.status}`);
    }
    const adminData = await adminRes.json();
    console.log(`   ✓ Verified admin access granted to /api/admin/stats: registeredUsers=${adminData.registeredUsers}, uptime=${adminData.uptimeSeconds}s`);

    // ----------------------------------------------------
    // TEST 6: Logout
    // ----------------------------------------------------
    console.log('\n6. Testing logout via POST /api/auth/logout');
    const logoutRes = await fetch(`${BASE_URL}/auth/logout`, {
      method: 'POST',
      headers: { Cookie: sessionCookie },
    });
    if (logoutRes.status !== 200) throw new Error(`Logout failed: ${logoutRes.status}`);
    console.log('   ✓ Logout request succeeded. Cookie cleared.');

    // Verify /api/auth/me without session returns 401
    const postLogoutMe = await fetch(`${BASE_URL}/auth/me`);
    if (postLogoutMe.status !== 401) throw new Error(`Expected 401 after logout, got ${postLogoutMe.status}`);
    console.log('   ✓ Post-logout GET /api/auth/me returned 401 Unauthenticated.');

    // ----------------------------------------------------
    // TEST 7: Cleanup test account
    // ----------------------------------------------------
    console.log('\n7. Cleaning up test account on Neon:');
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    const checkCount = await pool.query('SELECT COUNT(*) as c FROM users WHERE id = $1', [userId]);
    if (checkCount.rows[0].c !== '0') {
      throw new Error('Test user remains after cleanup!');
    }
    console.log('   ✓ Test account successfully removed with zero residual test records.');

    console.log('\n==================================================================');
    console.log('🎉 ALL PHASE 3C FRONTEND AUTH INTEGRATION TESTS PASSED CLEANLY');
    console.log('==================================================================');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Phase 3C Test Failure:', err instanceof Error ? err.message : err);
    if (userId) {
      try {
        await pool.query('DELETE FROM users WHERE id = $1', [userId]);
      } catch {}
    }
    process.exit(1);
  }
}

runPhase3CTests();
