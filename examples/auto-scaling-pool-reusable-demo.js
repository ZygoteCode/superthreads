'use strict';
const path = require('node:path');
const { AutoScalingPoolReusable } = require('../lib/autoScalingPoolReusable');

const pool = new AutoScalingPoolReusable({
  min: 2,
  max: 6,
  checkInterval: 2000,
  idleTimeout: 5000,
  imports: ['fs/promises']
});

pool.on('scalingUp', ({ from, to }) =>
  console.log(`🆙 Scaling up: from ${from} → ${to}`)
);

pool.on('scalingDown', ({ threadId }) =>
  console.log(`⬇️ Scaling down: removing thread ${threadId}`)
);

pool.on('error', (err, meta) =>
  console.error('❌ Pool error:', err, meta)
);

pool.on('shutdown', () =>
  console.log('✅ Pool shutdown complete')
);

async function main() {
  console.log('📊 Initial stats:', pool.stats ? pool.stats() : 'N/A');

  const task1 = pool.run((n) => {
    let total = 0;
    for (let i = 0; i < n; i++) total += i;
    return total;
  }, 5e7);

  const task2 = pool.run(async (data) => {
    const fs = global.promises;
    const stats = await fs.stat(data.file);
    return { file: data.file, size: stats.size };
  }, { file: path.join(__dirname, '..', 'package.json') });

  const task3 = pool.run(async (ms) => {
    await new Promise(r => setTimeout(r, ms));
    return `Slept ${ms}ms`;
  }, 2000);

  const results = await Promise.all([task1, task2, task3]);
  console.log('📦 Results:', results);

  for (let i = 0; i < 10; i++) {
    pool.run(async (x) => {
      await new Promise(r => setTimeout(r, 500 + Math.random() * 1500));
      return `Processed item ${x}`;
    }, i).then(res => console.log('✅', res));
  }

  console.log('⏳ Waiting for scaling to occur...');
  await new Promise(r => setTimeout(r, 12000));

  console.log('📉 Stats before shutdown:', pool.stats ? pool.stats() : 'N/A');
  await pool.shutdown();
}

main().catch(err => console.error(err));