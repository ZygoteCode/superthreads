class AbortToken {
  constructor() {
    this.controller = new AbortController();
  }
  abort() {
    this.controller.abort();
  }
  get signal() {
    return this.controller.signal;
  }
}

module.exports = { AbortToken };