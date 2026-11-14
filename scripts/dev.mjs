import { spawn } from 'node:child_process';
const children = [
  spawn(process.execPath, ['--watch-path=server', 'server/index.js'], { stdio: 'inherit' }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js'], { stdio: 'inherit' }),
];
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    children.forEach((p) => p.kill());
    process.exit();
  });
children.forEach((p) =>
  p.on('exit', (code) => {
    if (code) {
      children.forEach((c) => c.kill());
      process.exit(code);
    }
  }),
);
