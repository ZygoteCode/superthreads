const { Worker, MessageChannel } = require('node:worker_threads');
const { EventEmitter } = require('node:events');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

const { Task } = require('./task');

const WORKER_FILE = path.resolve(__dirname, 'worker.js');

class ThreadPool extends EventEmitter {
  constructor(size = 4, { imports = [] } = {}) {
    super();
    this.size = size;
    this.imports = imports;
    this.workers = [];
    this.taskCounter = 0;
    this.tasks = new Map();
    this.queue = { high: [], normal: [], low: [] };
    this._initializePool();
  }

  _initializePool() {
    for (let i = 0; i < this.size; i++) this._addWorker();
  }

  _addWorker() {
    const workerUrl = pathToFileURL(WORKER_FILE);
    const worker = new Worker(workerUrl, {
      workerData: { imports: this.imports }
    });

    const wrapper = { id: null, worker, status: 'starting' };

    wrapper.id = worker.threadId;

    worker.on('message', (msg) => this._onMessage(wrapper, msg));
    worker.on('error', (err) => this._onError(wrapper, err));
    worker.on('exit', (code) => this._onExit(wrapper, code));

    this.workers.push(wrapper);
    return wrapper;
  }

  _onMessage(wrapper, msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'ready') {
      wrapper.status = 'idle';
      this.emit('workerReady', { workerId: wrapper.id });
      this._checkQueue();
      return;
    }

    if (msg.type === 'log') {
      this.emit('workerLog', { workerId: wrapper.id, msg: msg.msg });
      return;
    }

    if (msg.type === 'result') {
      const task = this.tasks.get(msg.taskId);
      if (!task) return;
      task.resolve(msg.result);
      this._finishTask(wrapper, msg.taskId);
      return;
    }

    if (msg.type === 'error') {
      const task = this.tasks.get(msg.taskId);
      const error = new Error(msg.error || 'Unknown worker error');
      if (task) {
        task.reject(error);
        this._finishTask(wrapper, msg.taskId);
      } else {
        this.emit('error', error, { workerId: wrapper.id });
      }
    }
  }

  _finishTask(wrapper, taskId) {
    this.tasks.delete(taskId);
    wrapper.status = 'idle';
    this.emit('taskEnd', { workerId: wrapper.id, taskId });
    this._checkQueue();
  }

  _onError(wrapper, err) {
    this.emit('error', err, { workerId: wrapper.id });
    this._replaceWorker(wrapper);
  }

  _onExit(wrapper, code) {
    this.emit('workerExit', { workerId: wrapper.id, code });
    if (!wrapper.isTerminated) this._replaceWorker(wrapper);
  }

  _replaceWorker(bad) {
    bad.isTerminated = true;
    bad.worker.terminate().catch(()=>{});
    this.workers = this.workers.filter(w => w !== bad);
    this._addWorker();
  }

  _checkQueue() {
    const idle = this.workers.find(w => w.status === 'idle');
    if (!idle) return;

    const entry = this.queue.high.shift() || this.queue.normal.shift() || this.queue.low.shift();
    if (!entry) return;

    if (entry.signal?.aborted) {
      entry.reject(new Error('Task aborted before execution'));
      this.tasks.delete(entry.taskId);
      return this._checkQueue();
    }

    idle.status = 'busy';
    this.emit('taskStart', { workerId: idle.id, taskId: entry.taskId });

    idle.worker.postMessage({
      type: 'task',
      taskId: entry.taskId,
      fnString: entry.fnString,
      data: entry.data,
      port: entry.port
    }, [entry.port]);
    
    const stored = this.tasks.get(entry.taskId);
    if (stored?.port) {
      stored.port.on('message', (m) => {
        this.emit('taskMessage', { taskId: entry.taskId, message: m });
      });
    }
  }

  run(fn, data, { priority = 'normal', signal } = {}) {
    if (typeof fn !== 'function') {
      return new Task(Promise.reject(new Error('Pool.run expects a function')));
    }

    if (!['high','normal','low'].includes(priority)) priority = 'normal';

    const taskId = this.taskCounter++;
    const { port1, port2 } = new MessageChannel();

    const promise = new Promise((resolve, reject) => {
      const taskQueueEntry = {
        taskId,
        fnString: fn.toString(),
        data,
        port: port2,
        priority,
        signal,
        resolve,
        reject
      };

      this.tasks.set(taskId, { resolve, reject, signal, port: port1 });

      if (signal) {
        const onAbort = () => {
          const q = this.queue[priority];
          const idx = q.indexOf(taskQueueEntry);
          if (idx !== -1) {
            q.splice(idx,1);
            reject(new Error('Task aborted from queue'));
            this.tasks.delete(taskId);
          }
        };
        signal.addEventListener('abort', onAbort, { once: true });
      }

      this.queue[priority].push(taskQueueEntry);
      this.emit('taskQueued', { taskId, priority });
      this._checkQueue();
    });

    const t = new Task(promise);
    t.taskId = taskId;
    return t;
  }

  async runAll(tasksArr = []) {
    return Promise.all(tasksArr.map(([fn,data]) => this.run(fn,data)));
  }

  async map(array, fn) {
    const tasks = array.map(item => [fn, item]);
    return this.runAll(tasks);
  }

  stats() {
    const active = this.workers.filter(w => w.status === 'busy').length;
    const pending = this.queue.high.length + this.queue.normal.length + this.queue.low.length;
    return {
      totalWorkers: this.workers.length,
      idleWorkers: this.workers.filter(w => w.status === 'idle').length,
      activeWorkers: active,
      pendingTasks: pending
    };
  }

  async shutdown() {
    this.queue = { high: [], normal: [], low: [] };
    for (const [taskId, task] of this.tasks.entries()) {
      task.reject?.(new Error('ThreadPool shutting down'));
      this.tasks.delete(taskId);
    }
    await Promise.all(this.workers.map(w => {
      w.isTerminated = true;
      return w.worker.terminate();
    }));
    this.workers = [];
    this.emit('shutdown');
  }
}

module.exports = { ThreadPool };