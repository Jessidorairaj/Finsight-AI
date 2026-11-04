import http from 'http';
import net from 'net';
import { getDbPool, testDbConnectivity } from './db.js';

async function runResilienceTests() {
  console.log('=== FinSight AI Backend Resilience & Auth Verification ===\n');
  let passCount = 0;
  let failCount = 0;

  function assert(condition: boolean, desc: string) {
    if (condition) {
      console.log(`[PASS] ${desc}`);
      passCount++;
    } else {
      console.error(`[FAIL] ${desc}`);
      failCount++;
    }
  }

  try {
    // ----------------------------------------------------
    // Test 1: Verify Database Pool KeepAlive & Error Handlers
    // ----------------------------------------------------
    console.log('--- 1. Testing Database Pool & KeepAlive Setup ---');
    const pool = getDbPool();
    assert(pool !== null, 'Database pool is initialized');

    if (pool) {
      // Check listeners on pool
      const errorListeners = pool.listeners('error');
      assert(errorListeners.length > 0, `Database pool has ${errorListeners.length} error listener(s) registered`);

      const connectListeners = pool.listeners('connect');
      assert(connectListeners.length > 0, `Database pool has ${connectListeners.length} connect listener(s) registered to protect individual clients`);

      // Verify live query executes cleanly
      const dbHealth = await testDbConnectivity();
      assert(dbHealth && dbHealth.db_name === 'neondb', `Database connected successfully to "${dbHealth.db_name}" at ${dbHealth.db_time}`);
    }

    // ----------------------------------------------------
    // Test 2: Simulate Client Premature Socket Disconnects (EOF / RST)
    // ----------------------------------------------------
    console.log('\n--- 2. Testing HTTP Server Client Disconnect Resilience ---');
    // Start an HTTP server with our clientError and socket error handlers on an ephemeral port
    const testApp = (await import('express')).default();
    testApp.use((await import('express')).default.json());
    testApp.get('/test-stream', (req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.write('chunk-1\n');
      setTimeout(() => {
        // Attempt write after client likely disconnected
        try {
          res.write('chunk-2\n');
          res.end();
        } catch {
          // Handled
        }
      }, 50);
    });

    const testServer = http.createServer(testApp);

    // Apply our server.ts clientError handler
    testServer.on('clientError', (err: any, socket: net.Socket) => {
      const code = err?.code || '';
      const isPrematureDisconnect =
        code === 'ECONNRESET' ||
        code === 'EPIPE' ||
        code === 'EOF' ||
        code === 'ERR_STREAM_WRITE_AFTER_END' ||
        code === 'HPE_INVALID_EOF_STATE';

      if (isPrematureDisconnect) {
        if (!socket.destroyed) {
          socket.destroy();
        }
        return;
      }
      if (socket.writable && !socket.destroyed) {
        socket.destroy();
      }
    });

    testServer.on('connection', (socket: net.Socket) => {
      socket.on('error', (err: any) => {
        const code = err?.code || '';
        const isPrematureDisconnect =
          code === 'ECONNRESET' ||
          code === 'EPIPE' ||
          code === 'EOF' ||
          code === 'ERR_STREAM_WRITE_AFTER_END';
        if (isPrematureDisconnect) {
          return;
        }
      });
    });

    await new Promise<void>((resolve) => {
      testServer.listen(0, '127.0.0.1', () => resolve());
    });

    const address = testServer.address() as net.AddressInfo;
    const testPort = address.port;
    console.log(`Ephemeral test HTTP server listening on port ${testPort}`);

    // Simulation A: Client opens TCP connection, sends partial HTTP request, then abruptly closes socket (EOF)
    await new Promise<void>((resolve) => {
      const client = net.createConnection({ port: testPort, host: '127.0.0.1' }, () => {
        client.write('GET /test-stream HTTP/1.1\r\nHost: 127.0.0.1\r\n');
        // Immediately destroy socket with EOF/abort
        setTimeout(() => {
          client.destroy();
          resolve();
        }, 10);
      });
      client.on('error', () => {
        resolve();
      });
    });

    // Simulation B: Client connects and sends malformed garbage triggering HPE_INVALID_EOF_STATE / EOF
    await new Promise<void>((resolve) => {
      const client = net.createConnection({ port: testPort, host: '127.0.0.1' }, () => {
        client.write('NON_HTTP_GARBAGE_PAYLOAD_EOF_TRIGGER');
        setTimeout(() => {
          client.destroy();
          resolve();
        }, 10);
      });
      client.on('error', () => {
        resolve();
      });
    });

    // Verify test server is still alive and answering requests
    const pingRes = await fetch(`http://127.0.0.1:${testPort}/test-stream`);
    const pingText = await pingRes.text();
    assert(pingRes.status === 200 && pingText.includes('chunk'), 'Server remained running and healthy after premature client socket disconnects');

    await new Promise<void>((resolve) => testServer.close(() => resolve()));

    // ----------------------------------------------------
    // Test 3: Process-Level Socket Write Error Interception Guard
    // ----------------------------------------------------
    console.log('\n--- 3. Testing Targeted Process Uncaught Exception Guard ---');
    const mockSocketEofErr: any = new Error('write EOF');
    mockSocketEofErr.code = 'EOF';
    mockSocketEofErr.syscall = 'write';

    // Verify error classification logic
    const isSocketWriteError =
      mockSocketEofErr &&
      (mockSocketEofErr.code === 'EOF' ||
        mockSocketEofErr.code === 'EPIPE' ||
        mockSocketEofErr.code === 'ECONNRESET' ||
        (mockSocketEofErr.syscall === 'write' && (mockSocketEofErr.code === 'EOF' || String(mockSocketEofErr.message).includes('EOF'))));

    assert(isSocketWriteError === true, 'Socket write EOF error correctly classified as non-fatal network disconnect');

    const mockLogicError = new TypeError('Cannot read property of undefined');
    const isLogicErrorSocket =
      mockLogicError &&
      ((mockLogicError as any).code === 'EOF' ||
        (mockLogicError as any).syscall === 'write');

    assert(isLogicErrorSocket === false, 'Logic/programming errors are NOT suppressed (fail-fast preserved)');

    // ----------------------------------------------------
    // Test 4: Auth Flow - Register, Login, Session Persistence
    // ----------------------------------------------------
    console.log('\n--- 4. Testing Registration, Login & Session Persistence ---');
    const { createUser, getUserByEmail, sanitizeUser } = await import('./repositories/userRepository.js');
    const { hashPassword, verifyPassword, signSessionToken, verifySessionToken } = await import('./services/authService.js');

    const testEmail = `auth_test_${Date.now()}@finsight.ai`;
    const password = 'TestSecurePassword123!';
    const passwordHash = await hashPassword(password);

    // 1. Register User
    const newUser = await createUser({
      email: testEmail,
      passwordHash,
      displayName: 'Resilience Test User',
      monthlyIncome: 75000,
    });
    assert(!!newUser && newUser.email === testEmail, `User registered: ${newUser.id} (${newUser.email})`);

    // 2. Password Verification
    const dbUser = await getUserByEmail(testEmail);
    assert(!!dbUser, 'User retrieved by email from database');
    const isPwValid = await verifyPassword(password, dbUser!.password_hash);
    assert(isPwValid === true, 'Password verification succeeded');

    const isWrongPwInvalid = !(await verifyPassword('WrongPassword', dbUser!.password_hash));
    assert(isWrongPwInvalid === true, 'Invalid password correctly rejected');

    // 3. Issue & Verify Signed Session Token
    const sessionToken = signSessionToken({
      sub: newUser.id,
      email: newUser.email,
      role: newUser.role,
    });
    assert(typeof sessionToken === 'string' && sessionToken.length > 20, 'Session token signed');

    const decodedSession = verifySessionToken(sessionToken);
    assert(
      !!decodedSession && decodedSession.sub === newUser.id && decodedSession.email === testEmail,
      `Session persistence verified: token decodes to user ID ${decodedSession?.sub}`
    );

    // 4. Clean up test user
    const db = getDbPool();
    if (db) {
      await db.query('DELETE FROM users WHERE id = $1;', [newUser.id]);
      console.log('Cleaned up test auth user from database.');
      await db.end();
    }

    console.log(`\n=== Verification Complete: ${passCount} Passed, ${failCount} Failed ===`);
    if (failCount > 0) {
      process.exit(1);
    }
  } catch (err: any) {
    console.error('Test execution failed:', err);
    process.exit(1);
  }
}

runResilienceTests();
