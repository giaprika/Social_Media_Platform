import { AsyncLocalStorage } from "async_hooks";

class RequestContext {
  constructor() {
    this.storage = new AsyncLocalStorage();
  }

  run(store, callback) {
    return this.storage.run(store, callback);
  }

  get(key) {
    const store = this.storage.getStore();
    return store ? store[key] : undefined;
  }

  set(key, value) {
    const store = this.storage.getStore();
    if (store) {
      store[key] = value;
    }
  }

  getHeaders() {
    return this.get("headers") || {};
  }

  getUser() {
    return this.get("user");
  }

  getCorrelationId() {
    return this.get("correlationId");
  }
}

export default new RequestContext();
