const { Task } = require('../index');

async function main() {
  console.log('🧵 Starting a one-shot task...');

  const task = Task.run((n) => {
    let total = 0;

    for (let i = 0; i < n; i++) {
      total += Math.sqrt(i);
      
      if (i % 1e6 === 0 && i > 0) {
        const progress = ((i / n) * 100).toFixed(1);
        console.log(`[Worker] Progress: ${progress}%`);
      }
    }
    
    return total;
  }, 5e7);

  task.then(result => {
    console.log('✅ Task completed, result:', result);
  }).catch(err => {
    console.error('❌ Task failed or cancelled:', err.message);
  });

  setTimeout(() => {
    console.log('⛔️ Aborting task...');
    task.abort();
  }, 2000);
}

main();