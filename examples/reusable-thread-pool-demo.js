const { ThreadPoolReusable } = require('../index');
const pool = new ThreadPoolReusable(4);

async function main() {
  const task = async (data, ctx) => {
    let i = 0;

    ctx.port.on('message', m => {
      if (m?.type === 'cancel') throw new Error('cancelled inside worker');
    });
    
    for (; i < 3; i++) {
      await new Promise(r => setTimeout(r, 100));
      ctx.port.postMessage({ progress: (i + 1) * 33 });
    }

    return { value: data * 2 };
  };

  const t = pool.run(task, 21);
  pool.on('threadLog', console.log);
  pool.on('threadReady', (t) => console.log('thread ready', t.stats()));
  pool.on('threadError', console.error);

  const res = await t;
  console.log('result', res);

  await pool.shutdown();
}

main();