'use strict';

const { parentPort, workerData } = require('node:worker_threads');
const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;

async function init() {
  try {
    const imports = workerData?.imports || [];
    const importedModules = {};

    if (imports.length) {
      for (const m of imports) {
        try {
          const imported = await import(m);
          const name = m.replace(/[^\w]/g, '_');

          global[name] = imported;
          importedModules[m] = imported;

          if (m === 'fs/promises') {
            global.promises = imported;
          }

          parentPort.postMessage({ type: 'log', msg: `✅ Imported ${m} as global.${name}` });
        } catch (_) {}
      }
    }

    parentPort.postMessage({ type: 'ready' });

    parentPort.on('message', async (msg) => {
      if (!msg || msg.type !== 'task') return;
      const { taskId, fnString, data, port } = msg;

      try {
        const fn = new AsyncFunction('data', 'context', '"use strict";return(' + fnString + ')(data,context)');
        const context = { port };
        const result = await fn(data, context);

        if (port && typeof port.close === 'function') {
          try { port.close(); } catch (_) {}
        }

        parentPort.postMessage({ type: 'result', taskId, result });
      } catch (_) {
        if (port && typeof port.close === 'function') {
          try { port.close(); } catch (_) {}
        }
        parentPort.postMessage({
          type: 'error',
          taskId,
          error: e?.stack || e?.message || String(e)
        });
      }
    });
  } catch (_) {}
}

init();