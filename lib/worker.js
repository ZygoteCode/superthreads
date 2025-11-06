const { parentPort, workerData, isMainThread, threadId } = require('node:worker_threads');

if (isMainThread) {
  process.exit(0);
}

let isReady = false;

async function initialize() {
  for (const mod of workerData.imports || []) {
    try {
      const name = mod.split('/').pop();
      try {
        global[name] = require(mod);
      } catch (e) {
        if (mod === 'fs/promises') {
          const fs = require('fs');
          global['promises'] = fs.promises;
        } else {
          throw e;
        }
      }
    } catch (err) {
      parentPort.postMessage({ type: 'error', error: `Failed to load import "${mod}": ${err.message}` });
      process.exit(1);
    }
  }

  parentPort.on('message', handleTask);

  isReady = true;
  parentPort.postMessage({ type: 'ready' });
}

async function handleTask(msg) {
  if (!isReady || !msg || msg.type !== 'task') return;
  const { fnString, data, taskId, port } = msg;
  try {
    const fn = eval('(' + fnString + ')');
    const context = { port };
    const result = await Promise.resolve(fn(data, context));
    parentPort.postMessage({ type: 'result', taskId, result });
  } catch (err) {
    parentPort.postMessage({ type: 'error', taskId, error: err?.message || String(err) });
  } finally {
    if (port && typeof port.close === 'function') {
      try { port.close(); } catch(e){}
    }
  }
}

initialize().catch(err => {
  parentPort.postMessage({ type: 'error', error: `Worker init failed: ${err.message}` });
  process.exit(1);
});