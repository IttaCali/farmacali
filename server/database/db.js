import '../config.js';
import { mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import pg from 'pg';

export class Database {
  constructor(
    url = process.env.DATABASE_URL,
    file = process.env.SQLITE_FILE ||
      (process.env.NODE_TEST_CONTEXT ? ':memory:' : 'data/farmacia.sqlite'),
  ) {
    this.cloud = !!url;
    if (url)
      this.pool = new pg.Pool({
        connectionString: url,
        ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : false,
      });
    else {
      mkdirSync('data', { recursive: true });
      this.sqlite = new DatabaseSync(file);
      this.sqlite.exec(
        'PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;',
      );
    }
    this.queue = Promise.resolve();
  }
  async query(sql, params = [], client = null) {
    if (this.cloud) return (client || this.pool).query(sql, params);
    // SQLite binds parameters in textual order; PostgreSQL binds by numeric index.
    const ordered = [];
    const text = sql.replace(/\$(\d+)/g, (_, n) => {
      ordered.push(params[Number(n) - 1]);
      return '?';
    });
    const statement = this.sqlite.prepare(text);
    if (/^\s*(SELECT|WITH|PRAGMA)/i.test(sql) || /RETURNING/i.test(sql)) {
      const rows = statement.all(...ordered);
      return { rows, rowCount: rows.length };
    }
    const result = statement.run(...ordered);
    return { rows: [], rowCount: Number(result.changes) };
  }
  async transaction(fn) {
    if (this.cloud) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
        const out = await fn((s, p) => this.query(s, p, client));
        await client.query('COMMIT');
        return out;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }
    const task = this.queue.then(async () => {
      this.sqlite.exec('BEGIN IMMEDIATE');
      try {
        const out = await fn((s, p) => this.query(s, p));
        this.sqlite.exec('COMMIT');
        return out;
      } catch (error) {
        this.sqlite.exec('ROLLBACK');
        throw error;
      }
    });
    this.queue = task.catch(() => {});
    return task;
  }
  async close() {
    if (this.cloud) await this.pool.end();
    else this.sqlite.close();
  }
}
export const db = new Database();
