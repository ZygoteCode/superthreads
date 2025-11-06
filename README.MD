# ⚡️ Superthreads — Effortless Multithreading for Node.js

> 🧵 High-performance, elegant multithreading utilities built on top of Node.js `worker_threads`.
> 🚀 Simplify concurrency, scale effortlessly, and run code in parallel like a pro.

![npm](https://img.shields.io/npm/v/superthreads?color=brightgreen)
![license](https://img.shields.io/badge/license-MIT-blue.svg)
![node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)
![build](https://img.shields.io/badge/status-stable-success)

---

## ✨ Features

* 🧠 **Thread** — Run isolated functions in worker threads easily.
* 🧩 **ThreadPool** — Manage multiple threads efficiently with queuing and priorities.
* 🔁 **ReusableThread** — Keep a worker alive and reuse it for multiple tasks.
* ⚙️ **ThreadPoolReusable** — Hybrid pool using reusable threads.
* 📈 **AutoScalingPool** — Dynamically scales workers up or down based on load.
* 🚩 **AbortToken** — Graceful task cancellation support.
* 🧰 **Task** — Promise-like task wrapper with additional metadata.

---

## 📦 Installation

```bash
npm install superthreads
```

or

```bash
yarn add superthreads
```

---

## 🧙‍♂️ Quick Start

### 🧵 Simple Thread

```js
const { Thread } = require('superthreads');

(async () => {
  const result = await Thread.run((n) => n * 2, 21);
  console.log('Result:', result); // 42
})();
```

---

## ⚙️ ThreadPool Example

```js
const { ThreadPool } = require('superthreads');
const path = require('node:path');

const pool = new ThreadPool(4, { imports: ['fs/promises'] });

// Optional: attach some event listeners for visibility
pool.on('taskStart', ({ taskId, workerId }) => console.log(`Task ${taskId} started (worker ${workerId})...`));
pool.on('taskEnd', ({ taskId, workerId }) => console.log(`Task ${taskId} finished (worker ${workerId}).`));
pool.on('error', (err, meta) => console.error('Error in the pool:', err, meta));
pool.on('workerLog', ({ workerId, msg }) => console.log(`WorkerLog ${workerId}:`, msg));
pool.on('taskMessage', ({ taskId, message }) => console.log('Message from worker (task):', taskId, message));

async function main() {
  console.log('Initial stats:', pool.stats());

  // 🧮 CPU-intensive task
  const r1 = await pool.run((n) => {
    let total = 0;
    for (let i = 0; i < n; i++) total += i;
    return total;
  }, 1e7);

  console.log('Result 1:', r1);

  // 📄 Async FS operation with context port
  const task = pool.run(async (data, context) => {
    const fsPromises = global.promises;
    const stats = await fsPromises.stat(data.file);

    if (context.port) {
      context.port.postMessage({ status: 'Mid progress' });
    }

    return stats.size;
  }, { file: path.join(__dirname, '..', 'package.json') }, { priority: 'high' });

  console.log('Result 2:', await task);
  await pool.shutdown();

  console.log('Final stats:', pool.stats());
}

main().catch(console.error);
```

---

## 🔁 Reusable Threads

Keep a thread alive and reuse it for multiple tasks:

```js
const { ReusableThread } = require('superthreads');

(async () => {
  const thread = new ReusableThread();

  const result1 = await thread.run((n) => n * 2, 21);
  console.log('result1:', result1); // 42

  const result2 = await thread.run((s) => `Hello, ${s}!`, 'World');
  console.log('result2:', result2); // Hello, World!

  await thread.terminate();
})();
```

---

## 🧵 ThreadPoolReusable Example

Run multiple reusable threads efficiently:

```js
const { ThreadPoolReusable } = require('superthreads');

const pool = new ThreadPoolReusable(4);

(async () => {
  const tasks = [
    pool.run((n) => n * 2, 10),
    pool.run((n) => n + 5, 37),
    pool.run((s) => s.toUpperCase(), 'superthreads')
  ];

  const results = await Promise.all(tasks);
  console.log('Results:', results); // [20, 42, "SUPERTHREADS"]

  await pool.terminate();
})();
```

---

## 🧠 AutoScalingPool Example

Automatically scale threads based on demand:

```js
const { AutoScalingPool } = require('superthreads');

const autoPool = new AutoScalingPool({ min: 2, max: 8 });

(async () => {
  const results = await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      autoPool.run((x) => x ** 2, i)
    )
  );

  console.log('Squares:', results);
  await autoPool.shutdown();
})();
```

---

## 🚩 AbortToken Example

Cancel a task before it completes:

```js
const { Thread, AbortToken } = require('superthreads');

(async () => {
  const controller = new AbortToken();
  const signal = controller.signal;

  const task = Thread.run(async (_, ctx) => {
    for (let i = 0; i < 5; i++) {
      if (ctx.signal?.aborted) throw new Error('Aborted!');
      await new Promise(r => setTimeout(r, 500));
    }
    return 'Done';
  }, null, { signal });

  setTimeout(() => controller.abort(), 1000); // Abort after 1s

  try {
    console.log(await task);
  } catch (err) {
    console.error('Task aborted:', err.message);
  }
})();
```

---

## 📊 Stats API

Every pool provides `pool.stats()` for quick insight:

```js
console.log(pool.stats());
// {
//   totalWorkers: 4,
//   idleWorkers: 2,
//   activeWorkers: 2,
//   pendingTasks: 3
// }
```

---

## 🛠️ Requirements

* Node.js >= 18.0.0
* Works with both CommonJS (`require`) and ESM (`import`).

---

## 🔥 Why Superthreads?

* Zero dependencies
* Simple, readable API
* Advanced thread reuse & pooling
* Safe aborts, smart auto-scaling, and detailed stats
* Built for real-world high-performance Node.js applications

---

## ⚖️ License

**MIT** © 2025 — Created with ❤️ by [ZygoteCode](https://github.com/ZygoteCode)

---

### 🚀 Made with Node.js, love, and way too much coffee.