'use strict';

const { Worker } = require('node:worker_threads');
const WORKER_CODE = `import{parentPort,workerData,MessageChannel}from'node:worker_threads';const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;const safeEval=(code)=>new AsyncFunction('data','context','"use strict";return('+code+')(data,context)');(async()=>{try{const{fnString,data,imports}=workerData;if(imports?.length)await Promise.all(imports.map(m=>import(m)));const{port1}=new MessageChannel();const context={port:port1};const fn=safeEval(fnString);const result=await fn(data,context);port1.close();parentPort.postMessage({ok:1,result});}catch(e){parentPort.postMessage({ok:0,error:e?.stack||e?.message||String(e)});}})();`;

class Thread {
  constructor(fn, { data, imports, signal } = {}) {
    if (typeof fn !== 'function') throw new TypeError('Thread expects a function');
    this.fnString = fn.toString();
    this.data = data;
    this.imports = imports || [];
    this.signal = signal;
  }

  async start() {
    if (this.signal?.aborted) throw new Error('Thread aborted before start');

    const worker = new Worker(WORKER_CODE, {
      eval: true,
      workerData: { fnString: this.fnString, data: this.data, imports: this.imports }
    });

    const cleanup = () => {
      worker.removeAllListeners();
      worker.terminate().catch(() => {});
    };

    return new Promise((resolve, reject) => {
      if (this.signal) {
        const onAbort = () => {
          cleanup();
          reject(new Error('Thread aborted'));
        };
        if (this.signal.aborted) return onAbort();
        this.signal.addEventListener('abort', onAbort, { once: true });
      }

      worker.once('message', msg => {
        cleanup();
        msg.ok ? resolve(msg.result) : reject(new Error(msg.error));
      });

      worker.once('error', err => {
        cleanup();
        reject(err);
      });
    });
  }

  static run(fn, data, opts) {
    return new Thread(fn, opts ? { ...opts, data } : { data }).start();
  }
}

module.exports = { Thread };