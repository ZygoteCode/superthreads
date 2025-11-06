const { ThreadPool } = require('./threadPool');

class AutoScalingPool extends ThreadPool {
  constructor({ min = 2, max = 8, imports = [], checkInterval = 5000, idleTimeout = 30000 } = {}) {
    super(min, { imports });

    this.min = Math.max(1, Math.floor(min));
    this.max = Math.max(this.min, Math.floor(max));
    this.idleTimeout = Math.max(0, Number(idleTimeout));
    this.workers.forEach(w => { w.idleSince = null; });
    this.managerInterval = setInterval(() => this._managePool(), checkInterval);

    if (typeof this.managerInterval?.unref === 'function') {
      this.managerInterval.unref();
    }
  }

  _onMessage(workerWrapper, msg) {
    super._onMessage(workerWrapper, msg);

    if (workerWrapper.status === 'idle') {
      workerWrapper.idleSince = Date.now();
    }
  }

  _checkQueue() {
    super._checkQueue();

    const pending = (this.queue.high.length + this.queue.normal.length + this.queue.low.length);
    const hasIdle = this.workers.some(w => w.status === 'idle');

    if (pending > 0 && !hasIdle) {
      this._scaleUp();
    }
  }

  _scaleUp() {
    const pending = (this.queue.high.length + this.queue.normal.length + this.queue.low.length);

    if (pending <= 0) return;
    if (this.workers.length >= this.max) return;

    this.emit('scalingUp', { from: this.workers.length, to: this.workers.length + 1 });

    const newWrapper = this._addWorker();
    newWrapper.idleSince = null;

    const onMsgOnce = (msg) => {
      if (msg && msg.type === 'ready') {
        newWrapper.idleSince = Date.now();
      }
    };

    newWrapper.worker.once('message', onMsgOnce);
    this.size = this.workers.length;
  }

  _managePool() {
    try {
      const now = Date.now();

      const idleCandidates = this.workers
        .filter(w => w.status === 'idle' && typeof w.idleSince === 'number' && (now - w.idleSince) > this.idleTimeout);

      if (idleCandidates.length === 0) return;

      if (this.workers.length > this.min) {
        const workerToRemove = idleCandidates.sort((a, b) => a.idleSince - b.idleSince)[0];
        if (workerToRemove) {
          this.emit('scalingDown', { workerId: workerToRemove.id });

          workerToRemove.isTerminated = true;

          try {
            workerToRemove.worker.terminate();
          } catch (e) {

          }

          this.workers = this.workers.filter(w => w !== workerToRemove);
          this.size = this.workers.length;
        }
      }
    } catch (err) {
      this.emit('error', err, { subsystem: 'AutoScalingPool._managePool' });
    }
  }

  _onExit(workerWrapper, code) {
    this.workers = this.workers.filter(w => w !== workerWrapper);
    this.emit('workerExit', { workerId: workerWrapper.id, code });

    if (!workerWrapper.isTerminated && this.workers.length < this.min) {
      const newW = this._addWorker();
      newW.idleSince = null;
    }

    this.size = this.workers.length;
  }

  async shutdown() {
    if (this.managerInterval) {
      clearInterval(this.managerInterval);
      this.managerInterval = null;
    }
    await super.shutdown();
  }
}

module.exports = { AutoScalingPool };