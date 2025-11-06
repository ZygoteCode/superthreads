const { AutoScalingPool } = require('../index');

const pool = new AutoScalingPool({
  min: 2,
  max: 8,
  imports: [],
  checkInterval: 2000,
  idleTimeout: 5000
});

pool.on('scalingUp', ({ from, to }) => console.log(`⚙️  Scaling up: ${from} → ${to}`));
pool.on('scalingDown', ({ workerId }) => console.log(`🧹 Worker ${workerId} removed for inactivity`));
pool.on('taskStart', ({ workerId, taskId }) => console.log(`🚀 Task ${taskId} started on worker ${workerId}`));
pool.on('taskEnd', ({ workerId, taskId }) => console.log(`✅ Task ${taskId} completed on worker ${workerId}`));
pool.on('workerExit', ({ workerId }) => console.log(`💀 Worker ${workerId} finished`));

async function main() {
  console.log('📊 Initial stats:', pool.stats());

  const batch1 = [];
  for (let i = 0; i < 10; i++) {
    batch1.push(pool.run((n) => {
      let total = 0;
      for (let i = 0; i < n; i++) total += Math.sqrt(i);
      return total;
    }, 5e6));
  }

  const results1 = await Promise.all(batch1);
  console.log('✅ Batch 1 completed, results:', results1.slice(0, 3), '...');
  console.log('📈 Stats after batch 1:', pool.stats());
  console.log('🕒 Waiting 10 seconds to observe the scale-down...');

  await new Promise(r => setTimeout(r, 10000));
  console.log('📉 Stats after inactivity:', pool.stats());

  const batch2 = [];
  for (let i = 0; i < 15; i++) {
    batch2.push(pool.run((n) => {
      let total = 0;
      for (let i = 0; i < n; i++) total += Math.sin(i);
      return total;
    }, 7e6));
  }

  await Promise.all(batch2);
  console.log('✅ Batch 2 completed.');
  console.log('📊 Final stats:', pool.stats());

  await pool.shutdown();
  console.log('👋 Pool terminated.');
}

main().catch(console.error);