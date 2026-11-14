import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
export async function startQa() {
  const port = 3101 + Math.floor(Math.random() * 200),
    base = `http://127.0.0.1:${port}`;
  const file = `data/qa-${randomUUID()}.sqlite`;
  const server = spawn(process.execPath, ['server/index.js'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      PORT: String(port),
      SQLITE_FILE: file,
      DATABASE_URL: '',
      DEMO_MODE: 'true',
      APP_ORIGIN: base,
      QA_CLOCK: '2026-10-04T16:00:00Z',
    },
  });
  let errors = '';
  server.stderr.on('data', (b) => (errors += String(b)));
  for (let i = 0; i < 300; i++) {
    try {
      const res = await fetch(base + '/api/health');
      if (res.ok) return { base, file, server, stop: () => server.kill() };
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  server.kill();
  throw new Error('El servidor QA no pudo iniciar: ' + errors);
}
export class Client {
  constructor(base) {
    this.base = base;
    this.jar = new Map();
  }
  async request(path, body, method = body ? 'POST' : 'GET', extra = {}) {
    const response = await fetch(this.base + '/api' + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Cookie: [...this.jar].map(([k, v]) => `${k}=${v}`).join('; '),
        'X-CSRF-Token': this.jar.get('csrf') || '',
        ...extra,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    for (const line of response.headers.getSetCookie()) {
      const pair = line.split(';')[0],
        sep = pair.indexOf('=');
      this.jar.set(pair.slice(0, sep), pair.slice(sep + 1));
    }
    let data;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    return { status: response.status, data, response };
  }
  browserCookies() {
    const u = new URL(this.base);
    return [...this.jar].map(([name, value]) => ({
      name,
      value,
      domain: u.hostname,
      path: name === 'csrf' ? '/' : '/api',
      httpOnly: name !== 'csrf',
      sameSite: 'Strict',
      secure: false,
    }));
  }
}
