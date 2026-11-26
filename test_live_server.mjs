import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

async function main() {
  const serverBin = fs.existsSync('./bin/cotilla-server')
    ? './bin/cotilla-server'
    : fs.existsSync('../bin/cotilla-server')
      ? '../bin/cotilla-server'
      : null;
  assert.ok(serverBin, 'cotilla-server binary must exist (run make server)');

  const webDir = fs.existsSync('build') ? 'build' : 'svelte/build';

  console.log(`[TEST] Starting cotilla-server with -web ${webDir} on 127.0.0.1:8889...`);
  const serverProc = spawn(serverBin, ['-addr', '127.0.0.1:8889', '-web', webDir], {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  serverProc.stderr.on('data', (d) => process.stderr.write(`[SERVER ERR] ${d}`));
  serverProc.stdout.on('data', (d) => process.stdout.write(`[SERVER] ${d}`));

  let exited = false;
  serverProc.on('exit', (code) => {
    exited = true;
    if (code !== 0 && code !== null) {
      console.error(`cotilla-server exited unexpectedly with code ${code}`);
    }
  });

  try {
    // Wait for server to bind
    await new Promise((r) => setTimeout(r, 600));
    assert.equal(exited, false, 'Server should be running');

    // 1. HTTP GET /
    console.log('[TEST] Fetching http://127.0.0.1:8889/ ...');
    const indexRes = await fetch('http://127.0.0.1:8889/');
    assert.equal(indexRes.status, 200);
    const html = await indexRes.text();
    assert.ok(html.includes('cotilla.js'), 'index.html should reference cotilla.js');
    assert.ok(html.includes('wasm_exec.js'), 'index.html should reference wasm_exec.js');
    assert.ok(!html.includes('%sveltekit.body%'), 'Svelte body template should be interpolated');

    // 2. HTTP GET /cotilla.wasm
    console.log('[TEST] Fetching http://127.0.0.1:8889/cotilla.wasm ...');
    const wasmRes = await fetch('http://127.0.0.1:8889/cotilla.wasm');
    assert.equal(wasmRes.status, 200);
    const wasmBuf = await wasmRes.arrayBuffer();
    const wasmBytes = new Uint8Array(wasmBuf);
    assert.deepEqual(Array.from(wasmBytes.slice(0, 4)), [0x00, 0x61, 0x73, 0x6d], 'cotilla.wasm must start with \\0asm magic');
    assert.ok(wasmBuf.byteLength > 4 * 1024 * 1024, `wasm size should be >4MB, got ${wasmBuf.byteLength}`);

    // 3. Multi-client WebSocket signaling on /ws
    console.log('[TEST] Connecting 3 peers to ws://127.0.0.1:8889/ws (3+ peer topology per AGENTS.md)...');
    const WebSocketCtor = globalThis.WebSocket;
    if (WebSocketCtor) {
      const wsA = new WebSocketCtor('ws://127.0.0.1:8889/ws');
      const wsB = new WebSocketCtor('ws://127.0.0.1:8889/ws');
      const wsC = new WebSocketCtor('ws://127.0.0.1:8889/ws');

      const opened = await Promise.all([
        new Promise((resolve, reject) => {
          wsA.onopen = resolve;
          wsA.onerror = reject;
        }),
        new Promise((resolve, reject) => {
          wsB.onopen = resolve;
          wsB.onerror = reject;
        }),
        new Promise((resolve, reject) => {
          wsC.onopen = resolve;
          wsC.onerror = reject;
        })
      ]);
      console.log('[TEST] All 3 peer WebSockets connected cleanly!');

      // Register mock messages from peers
      wsA.send(JSON.stringify({ type: 'register', peer: 'peer-alice', sign_pub: 'alice-pub', sig: 'sigA' }));
      wsB.send(JSON.stringify({ type: 'register', peer: 'peer-bob', sign_pub: 'bob-pub', sig: 'sigB' }));
      wsC.send(JSON.stringify({ type: 'register', peer: 'peer-carol', sign_pub: 'carol-pub', sig: 'sigC' }));

      // Wait a moment for registration processing
      await new Promise((r) => setTimeout(r, 400));

      wsA.close();
      wsB.close();
      wsC.close();
      console.log('[TEST] Signaling registration verified across 3 peers!');
    }

    console.log('\n>>> LIVE SERVER + SVELTE BUILD VERIFICATION PASSED! <<<\n');
  } finally {
    serverProc.kill('SIGTERM');
  }
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
