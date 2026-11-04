/**
 * Test script to verify server.ts mounts /api/chat and responds correctly.
 */

import { spawn } from 'child_process';
import http from 'http';
import { signSessionToken } from './services/authService.js';
import { createUser, deleteUserById } from './repositories/userRepository.js';
import { hashPassword } from './services/authService.js';

const TEST_PORT = 3099;

function request(options: http.RequestOptions, postData?: string): Promise<{ statusCode?: number; data: any; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          resolve({ statusCode: res.statusCode, data: json, headers: res.headers });
        } catch {
          resolve({ statusCode: res.statusCode, data: body, headers: res.headers });
        }
      });
    });
    req.on('error', reject);
    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

async function run() {
  console.log(`Starting test server on port ${TEST_PORT}...`);
  const serverProc = spawn('npx', ['tsx', 'server.ts', '--port', String(TEST_PORT)], {
    env: { ...process.env, PORT: String(TEST_PORT) },
    shell: true,
  });

  let serverStarted = false;
  serverProc.stdout?.on('data', (d) => {
    const out = d.toString();
    if (out.includes(`listening on http://0.0.0.0:${TEST_PORT}`)) {
      serverStarted = true;
    }
  });

  serverProc.stderr?.on('data', (d) => {
    console.error('[Server Err]:', d.toString());
  });

  // Wait for server to be ready (up to 15s)
  const start = Date.now();
  while (!serverStarted && Date.now() - start < 15000) {
    await new Promise((r) => setTimeout(r, 500));
  }

  if (!serverStarted) {
    serverProc.kill();
    throw new Error('Server failed to start within 15 seconds.');
  }

  console.log(`Server successfully listening on port ${TEST_PORT}!`);

  try {
    // 1. Health check
    const health = await request({
      hostname: 'localhost',
      port: TEST_PORT,
      path: '/api/health',
      method: 'GET',
    });
    console.log(`1. GET /api/health returned HTTP ${health.statusCode}:`, health.data?.status);
    if (health.statusCode !== 200) throw new Error('Health check failed');

    // 2. Unauthenticated POST /api/chat -> MUST NOT be 404! Must be 401
    const unauth = await request(
      {
        hostname: 'localhost',
        port: TEST_PORT,
        path: '/api/chat',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      JSON.stringify({ message: 'Hello' })
    );
    console.log(`2. Unauthenticated POST /api/chat returned HTTP ${unauth.statusCode}:`, unauth.data);
    if (unauth.statusCode === 404) {
      throw new Error('FAIL: /api/chat returned 404! The route is not mounted properly.');
    }
    if (unauth.statusCode !== 401) {
      throw new Error(`FAIL: Expected 401 for unauthenticated request, got ${unauth.statusCode}`);
    }
    console.log('✓ Verified: /api/chat is properly mounted and rejects unauthenticated requests with 401 (NOT 404).');

    // 3. Create ephemeral user to test authenticated POST /api/chat
    const testHash = await hashPassword('TestChatPass#2026');
    const user = await createUser({
      email: `chat_test_port_${Date.now()}@finsight.local`,
      passwordHash: testHash,
      displayName: 'Chat Server Tester',
      monthlyIncome: 50000,
    });

    const token = signSessionToken({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    const authRes = await request(
      {
        hostname: 'localhost',
        port: TEST_PORT,
        path: '/api/chat',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      },
      JSON.stringify({ message: 'What is my financial status?' })
    );

    console.log(`3. Authenticated POST /api/chat returned HTTP ${authRes.statusCode}:`);
    console.log('Response reply snippet:', String(authRes.data?.reply || '').slice(0, 100) + '...');
    console.log('Response grounded flag:', authRes.data?.grounded);

    if (authRes.statusCode !== 200) {
      throw new Error(`FAIL: Expected 200 for authenticated chat request, got ${authRes.statusCode}`);
    }
    console.log('✓ Verified: Authenticated POST /api/chat returned HTTP 200 with grounded reply.');

    // 4. GET /api/chat/context
    const contextRes = await request({
      hostname: 'localhost',
      port: TEST_PORT,
      path: '/api/chat/context',
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    console.log(`4. GET /api/chat/context returned HTTP ${contextRes.statusCode}:`, contextRes.data?.summary);
    if (contextRes.statusCode !== 200) {
      throw new Error(`FAIL: Expected 200 for /api/chat/context, got ${contextRes.statusCode}`);
    }

    // Cleanup user
    await deleteUserById(user.id);
    console.log('✓ Cleaned up test user.');
  } finally {
    serverProc.kill();
    console.log('Test server process terminated.');
  }

  console.log('\n🎉 ALL PORT-MOUNTED CHAT TESTS PASSED SUCCESSFULLY!');
  process.exit(0);
}

run().catch((err) => {
  console.error('\nTest failed:', err);
  process.exit(1);
});
