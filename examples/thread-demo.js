const { Thread } = require('../index');

async function main() {
  console.log('🧵 Running a one-shot thread...');

  const result = await Thread.run((n) => {
    let sum = 0;
    
    for (let i = 0; i < n; i++) {
      sum += Math.sqrt(i);
    }

    return sum;
  }, 1e7);

  console.log('✅ Result from thread:', result);
}

main().catch(console.error);