import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDbPool } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations(): Promise<{ success: boolean; message: string; appliedFiles: string[] }> {
  const pool = getDbPool();
  if (!pool) {
    throw new Error('DATABASE_NOT_CONFIGURED: DATABASE_URL environment variable is missing.');
  }

  const client = await pool.connect();
  const appliedFiles: string[] = [];

  try {
    const migrationsDir = path.resolve(__dirname, 'migrations');
    if (!fs.existsSync(migrationsDir)) {
      return { success: true, message: 'No migrations directory found.', appliedFiles: [] };
    }

    const files = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    // Ensure migrations tracking table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Fetch already applied migrations
    const appliedRes = await client.query('SELECT filename FROM schema_migrations;');
    const alreadyApplied = new Set<string>(appliedRes.rows.map((r: any) => r.filename));

    await client.query('BEGIN');

    for (const file of files) {
      if (alreadyApplied.has(file)) {
        console.log(`[Migration] Skipping already applied: ${file}`);
        continue;
      }

      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf-8');
      console.log(`[Migration] Executing: ${file}`);
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1);', [file]);
      appliedFiles.push(file);
    }

    await client.query('COMMIT');
    console.log(`[Migration] Successfully processed migrations. ${appliedFiles.length} new migration(s) applied.`);

    return {
      success: true,
      message: `Successfully processed migrations. ${appliedFiles.length} new migration(s) applied.`,
      appliedFiles,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    const safeMsg = error instanceof Error ? error.message : 'Unknown migration error';
    console.error('[Migration Error]:', safeMsg);
    throw new Error(`Migration failed: ${safeMsg}`);
  } finally {
    client.release();
  }
}

// Allow direct execution via CLI: tsx server/migrate.ts
if (process.argv[1] && (process.argv[1].endsWith('migrate.ts') || process.argv[1].endsWith('migrate.js') || process.argv[1].includes('migrate'))) {
  runMigrations()
    .then((result) => {
      console.log('[Migration CLI Completed]:', result.message);
      process.exit(0);
    })
    .catch((err) => {
      console.error('[Migration CLI Failed]:', err.message);
      process.exit(1);
    });
}
