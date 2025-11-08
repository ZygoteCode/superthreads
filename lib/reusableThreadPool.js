'use strict';
const { Worker, MessageChannel } = require('node:worker_threads');
const { EventEmitter } = require('node:events');
const path = require('node:path');

const WORKER_FILE = path.resolve(__dirname, 'reusableWorker.js');

class ReusableThread extends EventEmitter {
  constructor({ workerFile = WORKER_FILE, imports = [] } = {}) {
    super();
    this.workerFile = workerFile;
    this.imports = imports;
    this.worker = null;
    this.status = 'init';
    this._taskQueue = [];
    this._current = null;
    this._taskCounter = 0;
    this._startWorker();
  }

_startWorker() {
  this.status = 'starting';

  const workerPath = path.resolve(__dirname, 'reusableWorker.js');

  this.worker = new Worker(workerPath, {
    workerData: { imports: this.imports }
  });

  this.worker.on('message', (msg) => this._handleMessage(msg));
  this.worker.on('error', (err) => this._handleError(err));
  this.worker.on('exit', (code) => this._handleExit(code));
}

  _handleMessage(msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'ready') {
      this.status = this._current ? 'busy' : 'idle';
      this.emit('ready');
      this._tryDequeue();
      return;
    }

    if (msg.type === 'result' && this._current && msg.taskId === this._current.id) {
      const { resolve } = this._current;
      try { resolve(msg.result); } catch(_) {}
      this._cleanupCurrent();
      this._tryDequeue();
      return;
    }

    if (msg.type === 'error' && this._current && msg.taskId === this._current.id) {
      const { reject } = this._current;
      try { reject(new Error(msg.error || 'Worker error')); } catch(_) {}
      this._cleanupCurrent();
      this._tryDequeue();
      return;
    }

    if (msg.type === 'log') {
      this.emit('log', msg.msg);
    }
  }

  _handleError(err) {
    if (this._current) {
      try { this._current.reject(err); } catch(_) {}
      this._cleanupCurrent();
    }
    this.emit('error', err);
    this._respawn();
  }

  _handleExit(code) {
    const err = new Error(`worker exited with code ${code}`);
    if (this._current) {
      try { this._current.reject(err); } catch(_) {}
      this._cleanupCurrent();
    }
    this.emit('exit', code);
    if (this.status !== 'dead') this._respawn();
  }

  _respawn() {
    this.status = 'starting';
    this.worker.removeAllListeners?.();
    try { this.worker.terminate?.(); } catch(_) {}
    this.worker = null;
    setTimeout(() => this._startWorker(), 50);
  }

  _cleanupCurrent() {
    if (!this._current) return;
    if (this._current.port && typeof this._current.port.close === 'function') {
      try { this._current.port.close(); } catch(_) {}
    }
    if (this._current.onAbort && this._current.signal) {
      try { this._current.signal.removeEventListener('abort', this._current.onAbort); } catch(_) {}
    }
    this._current = null;
    this.status = 'idle';
  }

  _tryDequeue() {
    if (this.status === 'starting' || this.status === 'busy') return;
    const entry = this._taskQueue.shift();
    if (!entry) return;
    this._runTaskEntry(entry);
  }

  _runTaskEntry(entry) {
    if (this.status === 'starting' || this.status === 'busy') {
      this._taskQueue.unshift(entry);
      return;
    }

    const { fnString, data, resolve, reject, signal } = entry;
    const taskId = ++this._taskCounter;
    const { port1, port2 } = new MessageChannel();

    const onAbort = () => {
      try { port1.postMessage({ type: 'cancel' }); } catch(_) {}
      try { reject(new Error('Task aborted')); } catch(_) {}
      this._cleanupCurrent();
      this._tryDequeue();
    };

    if (signal?.aborted) {
      reject(new Error('Task aborted before start'));
      return;
    }

    if (signal) signal.addEventListener('abort', onAbort, { once: true });

    this._current = { id: taskId, resolve, reject, port: port1, signal, onAbort };
    this.status = 'busy';

    port1.on('message', (m) => {
      this.emit('taskMessage', { thread: this, taskId, message: m });
    });

    try {
      this.worker.postMessage({
        type: 'task',
        taskId,
        fnString,
        data,
        port: port2
      }, [port2]);
    } catch (e) {
      if (signal && onAbort) signal.removeEventListener('abort', onAbort);
      this._current = null;
      this.status = 'idle';
      reject(e);
      this._tryDequeue();
    }
  }

  run(fn, data, { signal } = {}) {
    if (typeof fn !== 'function') return Promise.reject(new Error('run expects a function'));

    return new Promise((resolve, reject) => {
      const entry = { fnString: fn.toString(), data, resolve, reject, signal };
      this._taskQueue.push(entry);
      this._tryDequeue();
    });
  }

  stats() {
    return {
      status: this.status,
      queueLength: this._taskQueue.length,
      currentTaskId: this._current?.id ?? null
    };
  }

  async destroy() {
    while (this._taskQueue.length) {
      const e = this._taskQueue.shift();
      try { e.reject(new Error('Thread destroyed')); } catch(_) {}
    }
    if (this._current) {
      try { this._current.reject(new Error('Thread destroyed')); } catch(_) {}
      this._cleanupCurrent();
    }
    this.status = 'dead';
    try {
      await this.worker.terminate();
    } catch(_) {}
    this.worker = null;
    this.emit('destroyed');
  }

  async terminate() {
    if (!this.worker) return;
    this.status = 'dead';
    try {
      await this.worker.terminate();
    } catch (err) {
      this.emit('error', err);
    } finally {
      this.worker = null;
    }
  }
}

class ThreadPoolReusable extends EventEmitter {
  constructor(size = 4, { imports = [] } = {}) {
    super();
    this.size = Math.max(1, size);
    this.imports = imports;
    this.threads = [];
    for (let i = 0; i < this.size; i++) {
      const t = new ReusableThread({ workerFile: WORKER_FILE, imports: this.imports });
      t.on('ready', () => this.emit('threadReady', t));
      t.on('log', (m) => this.emit('threadLog', m));
      t.on('error', (e) => this.emit('threadError', e));
      this.threads.push(t);
    }
    this._rr = 0;
  }

  _chooseThread() {
    let best = null;
    for (const t of this.threads) {
      if (t.status === 'idle') return t;
      if (!best || t._taskQueue.length < best._taskQueue.length) best = t;
    }
    return best || this.threads[this._rr++ % this.threads.length];
  }

  run(fn, data, opts = {}) {
    const thread = this._chooseThread();
    return thread.run(fn, data, opts);
  }

  map(array, fn, opts = {}) {
    return Promise.all(array.map(item => this.run(fn, item, opts)));
  }

  stats() {
    return {
      totalThreads: this.threads.length,
      threads: this.threads.map(t => t.stats())
    };
  }

  async shutdown() {
    await Promise.all(this.threads.map(t => t.destroy()));
    this.threads = [];
    this.emit('shutdown');
  }
}

module.exports = { ReusableThread, ThreadPoolReusable };