// Runs the Vite frontend and the Python geometry service together; stopping either stops both.
import { spawn } from 'node:child_process';
import net from 'node:net';

const GEOMETRY_PORT = 8001;
const inUse = await new Promise(resolve => {
  const socket = net.connect(GEOMETRY_PORT, '127.0.0.1');
  socket.once('connect', () => { socket.destroy(); resolve(true); });
  socket.once('error', () => resolve(false));
});

const commands = [['web', 'npm', ['run', 'dev:web']]];
if (inUse) console.log(`[dev] geometry service already running on :${GEOMETRY_PORT}; reusing it`);
else commands.push(['geometry', 'npm', ['run', 'geometry']]);

const children = commands.map(([name, cmd, args]) => {
  const child = spawn(cmd, args, { stdio: 'inherit' });
  child.on('exit', code => {
    console.log(`[dev] ${name} exited${code ? ` with code ${code}` : ''}; stopping the rest`);
    stop(code ?? 0);
  });
  return child;
});

let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  setTimeout(() => process.exit(code), 300);
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
