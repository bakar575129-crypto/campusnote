// Geliştirme: API (3000) + Vite (5173) birlikte. Tarayıcıda http://localhost:5173 açın.
import {spawn} from 'node:child_process';
const run = (cmd, args) => spawn(cmd, args, {stdio: 'inherit', shell: process.platform === 'win32'});
const children = [run('node', ['--watch', 'server/main.mjs']), run('npx', ['vite'])];
const stop = () => { for (const c of children) c.kill(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
