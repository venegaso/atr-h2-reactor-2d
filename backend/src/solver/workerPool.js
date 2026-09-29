'use strict';
const path = require('path');
const os = require('os');
const { Worker } = require('worker_threads');

const POOL_SIZE = Math.max(1, Math.min(4, os.cpus().length));
const WORKER_PATH = path.join(__dirname, 'worker.js');

class WorkerPool {
  constructor(size) {
    this.size = size;
    this.workers = [];
    this.idle = [];
    this.pending = new Map(); // id -> { resolve, reject }
    this.queue = []; // tareas esperando un worker libre
    this.nextId = 1;
    for (let i = 0; i < size; i++) this._spawn();
  }

  _spawn() {
    const worker = new Worker(WORKER_PATH);
    worker.on('message', (msg) => {
      const pending = this.pending.get(msg.id);
      if (pending) {
        this.pending.delete(msg.id);
        if (msg.ok) pending.resolve(msg.result);
        else pending.reject(new Error(msg.error));
      }
      this.idle.push(worker);
      this._drainQueue();
    });
    worker.on('error', (err) => {
      // eslint-disable-next-line no-console
      console.error('Worker error:', err);
      this.workers = this.workers.filter((w) => w !== worker);
      this._spawn();
    });
    this.workers.push(worker);
    this.idle.push(worker);
  }

  _drainQueue() {
    while (this.queue.length > 0 && this.idle.length > 0) {
      const task = this.queue.shift();
      const worker = this.idle.shift();
      this.pending.set(task.id, { resolve: task.resolve, reject: task.reject });
      worker.postMessage({ id: task.id, type: task.type, payload: task.payload });
    }
  }

  run(type, payload, timeoutMs = 20000) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('La simulacion tardo demasiado (timeout)'));
      }, timeoutMs);
      const wrappedResolve = (v) => { clearTimeout(timer); resolve(v); };
      const wrappedReject = (e) => { clearTimeout(timer); reject(e); };
      this.queue.push({
        id, type, payload, resolve: wrappedResolve, reject: wrappedReject,
      });
      this._drainQueue();
    });
  }
}

const pool = new WorkerPool(POOL_SIZE);

module.exports = { pool, POOL_SIZE };
