import pg from 'pg';
import dns from 'dns';
import dotenv from 'dotenv';

dotenv.config();

// Fix for Windows environments where getaddrinfo fails on CNAME aliases for Neon
const NEON_PRESEEDED_IPS: Record<string, string[]> = {
  'ep-cold-voice-aof69bkk-pooler.c-2.ap-southeast-1.aws.neon.tech': ['13.251.17.193', '3.0.167.45', '18.138.49.39'],
};

try {
  dns.setDefaultResultOrder?.('ipv4first');
} catch {
  // Ignore on older node versions
}

const originalLookup = dns.lookup;
(dns as any).lookup = (hostname: string, options: any, callback: any) => {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }

  // Use preseeded IPs or cached IPs if available
  const preseeded = NEON_PRESEEDED_IPS[hostname];
  if (preseeded && preseeded.length > 0) {
    if (options && options.all) {
      return callback(null, preseeded.map(a => ({ address: a, family: 4 })));
    }
    return callback(null, preseeded[0], 4);
  }

  dns.resolve4(hostname, (err, addresses) => {
    if (!err && addresses && addresses.length > 0) {
      NEON_PRESEEDED_IPS[hostname] = addresses;
      if (options && options.all) {
        return callback(null, addresses.map(a => ({ address: a, family: 4 })));
      }
      return callback(null, addresses[0], 4);
    }
    return originalLookup(hostname, options, callback);
  });
};

const { Pool } = pg;

// Singleton PostgreSQL connection pool
let pool: pg.Pool | null = null;

/**
 * Returns the singleton PostgreSQL pool instance.
 * Reads DATABASE_URL exclusively from server-side process.env.
 * Ensures TLS certificate validation is preserved for secure Neon connectivity.
 */
export function getDbPool(): pg.Pool | null {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString || connectionString.trim() === '') {
    return null;
  }

  if (!pool) {
    pool = new Pool({
      connectionString,
      ssl: {
        rejectUnauthorized: true, // Secure TLS certificate validation preserved
      },
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000, // Probe connection every 10s to keep serverless socket active
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 15000,
    });

    pool.on('error', (err: any) => {
      const code = err?.code || '';
      const isDisconnect = code === 'EOF' || code === 'ECONNRESET' || code === 'EPIPE' || err?.message?.includes('EOF');
      if (isDisconnect) {
        console.warn(`[DB Pool Warning]: Idle PostgreSQL connection closed by serverless peer (${code || err.message}). Reconnecting on next query.`);
      } else {
        // Log sanitized internal message without exposing credentials or connection string
        console.error('[DB Pool Error]: Unexpected client error:', err.message);
      }
    });

    pool.on('connect', (client: any) => {
      // Prevent unhandled error events on checked out or connecting client instances
      client.on('error', (err: any) => {
        const code = err?.code || '';
        const isDisconnect = code === 'EOF' || code === 'ECONNRESET' || code === 'EPIPE' || err?.message?.includes('EOF');
        if (isDisconnect) {
          console.warn(`[DB Client Warning]: PostgreSQL connection closed by remote peer (${code || err.message}).`);
        } else {
          console.error('[DB Client Error]:', err?.message || err);
        }
      });
    });
  }

  return pool;
}

/**
 * Executes a read-only query against the database pool.
 */
export async function testDbConnectivity(): Promise<{ db_time: string; db_name: string }> {
  const p = getDbPool();
  if (!p) {
    throw new Error('DATABASE_NOT_CONFIGURED');
  }

  const result = await p.query('SELECT NOW() AS db_time, current_database() AS db_name');
  const row = result.rows[0];

  return {
    db_time: row.db_time instanceof Date ? row.db_time.toISOString() : String(row.db_time),
    db_name: String(row.db_name),
  };
}

/**
 * Gracefully shuts down the PostgreSQL pool by closing all open connections.
 */
export async function closeDbPool(): Promise<void> {
  if (pool) {
    const activePool = pool;
    pool = null;
    await activePool.end();
  }
}
