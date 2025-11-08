'use strict';
const { ThreadPoolReusable, ReusableThread } = require('./reusableThreadPool');

class AutoScalingPoolReusable extends ThreadPoolReusable {
  constructor({ min = 2, max = 8, imports = [], checkInterval = 5000, idleTimeout = 30000 } = {}) {
    super(min, { imports });

    this.min = Math.max(1, Math.floor(min));
    this.max = Math.max(this.min, Math.floor(max));
    this.idleTimeout = Math.max(0, Number(idleTimeout));

    this.threads.forEach(t => (t.idleSince = null));

    this.managerInterval = setInterval(() => this._managePool(), checkInterval);
    if (typeof this.managerInterval?.unref === 'function') this.managerInterval.unref();
  }

  _markIdle(thread) {
    thread.idleSince = Date.now();
  }

  async run(fn, data, options = {}) {
    const result = await super.run(fn, data, options);
    const thread = this._lastUsedThread;
    if (thread) this._markIdle(thread);
    return result;
  }

  _checkQueue() {
    super._checkQueue();

    const pending = this.queue.length;
    const hasIdle = this.threads.some(t => t.status === 'idle');

    if (pending > 0 && !hasIdle) {
      this._scaleUp();
    }
  }

  _scaleUp() {
    if (this.threads.length >= this.max) return;

    const newThread = new ReusableThread(undefined, { imports: this.imports });
    newThread.idleSince = null;

    this.threads.push(newThread);
    this.size = this.threads.length;
    this.emit('scalingUp', { from: this.threads.length - 1, to: this.threads.length });

    newThread.on('ready', () => {
      newThread.idleSince = Date.now();
    });
  }

  _managePool() {
    try {
      const now = Date.now();
      const idleCandidates = this.threads.filter(
        t => t.status === 'idle' && typeof t.idleSince === 'number' && (now - t.idleSince) > this.idleTimeout
      );

      if (idleCandidates.length === 0) return;
      if (this.threads.length > this.min) {
        const toRemove = idleCandidates.sort((a, b) => a.idleSince - b.idleSince)[0];
        if (toRemove) {
          this.emit('scalingDown', { threadId: toRemove.id });
          toRemove.terminate?.();
          this.threads = this.threads.filter(t => t !== toRemove);
          this.size = this.threads.length;
        }
      }
    } catch (err) {
      this.emit('error', err, { subsystem: 'AutoScalingPoolReusable._managePool' });
    }
  }

  _onExit(thread, code) {
    this.emit('threadExit', { threadId: thread.id, code });
    this.threads = this.threads.filter(t => t !== thread);

    if (this.threads.length < this.min) {
      const newThread = new ReusableThread(undefined, { imports: this.imports });
      this.threads.push(newThread);
      this.size = this.threads.length;
    }
  }

  async shutdown() {
    if (this.managerInterval) {
      clearInterval(this.managerInterval);
      this.managerInterval = null;
    }

    for (const t of this.threads) {
      try {
        await t.terminate();
      } catch (_) {}
    }

    this.threads = [];
    this.emit('shutdown');
  }
}

module.exports = { AutoScalingPoolReusable };