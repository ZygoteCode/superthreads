// worker.js
'use strict';
const { parentPort, workerData, MessageChannel } = require('node:worker_threads');

const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;

async function init() {
  // import iniziali opzionali (es. side-effects / polyfills)
  try {
    const imports = workerData?.imports || [];
    if (imports.length) {
      // dynamic import in worker (note: returns a Promise)
      await Promise.all(imports.map(m => import(m)));
    }
  } catch (e) {
    parentPort.postMessage({ type: 'log', msg: `worker import error: ${e?.stack || e?.message}` });
    // non abortiamo: eventuali errori saranno visibili ai task singoli
  }

  parentPort.postMessage({ type: 'ready' });

  parentPort.on('message', async (msg) => {
    if (!msg || msg.type !== 'task') return;
    const { taskId, fnString, data } = msg;

    // If a port was sent it will be present as msg.port
    // (Node deserializza automaticamente i MessagePort trasferiti)
    const port = msg.port || null;

    try {
      const fn = new AsyncFunction('data', 'context', '"use strict"; return (' + fnString + ')(data, context)');
      // context exposes the port so user func can listen on it (cancellation, progress, etc.)
      const context = { port };

      let result = await fn(data, context);

      // ensure port close if provided
      if (port && typeof port.close === 'function') {
        try { port.close(); } catch(_) {}
      }

      parentPort.postMessage({ type: 'result', taskId, result });
    } catch (e) {
      if (port && typeof port.close === 'function') {
        try { port.close(); } catch(_) {}
      }
      parentPort.postMessage({ type: 'error', taskId, error: e?.stack || e?.message || String(e) });
    }
  });
}

init().catch(err => {
  parentPort.postMessage({ type: 'log', msg: 'worker init failed: ' + (err?.stack || err?.message || String(err)) });
});