const { ThreadPool } = require('../index');
const pool = new ThreadPool(4, { imports: ['fs/promises'] });

pool.on('taskStart', ({ taskId, workerId }) => console.log(`Task ${taskId} ran (worker ${workerId})...`));
pool.on('taskEnd', ({ taskId, workerId }) => console.log(`Task ${taskId} finished (worker ${workerId}).`));
pool.on('error', (err, meta) => console.error('Errore in the pool:', err, meta));
pool.on('workerLog', ({ workerId, msg }) => console.log(`WorkerLog ${workerId}:`, msg));
pool.on('taskMessage', ({ taskId, message }) => console.log('Message from worker (task):', taskId, message));

async function main() {
  console.log('Initial stats:', pool.stats());

  const r1 = await pool.run((n) => {
    let total = 0;
    for (let i = 0; i < n; i++) total += i;
    return total;
  }, 1e7);

  console.log('Result 1:', r1);

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

const path = require('node:path');
main().catch(err => console.error(err));