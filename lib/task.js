const { Thread } = require('./thread');

class Task {
  constructor(promise, abortController = null) {
    this._promise = promise;
    this._abortController = abortController;

    this.then = this._promise.then.bind(this._promise);
    this.catch = this._promise.catch.bind(this._promise);
    this.finally = this._promise.finally.bind(this._promise);
  }

  abort() {
    if (this._abortController) {
      this._abortController.abort();
    }
  }

  static run(fn, data, { imports } = {}) {
    const controller = new AbortController();
    const promise = Thread.run(fn, data, { imports, signal: controller.signal });
    return new Task(promise, controller);
  }
}

module.exports = { Task };