const { ReusableThread } = require('../lib/reusableThreadPool');

(async () => {
  const thread = new ReusableThread({ imports: [] });
  await thread.ready;

  const result1 = await thread.run((data) => data.x * 2, { x: 21 });
  console.log('Result 1', result1);

  const result2 = await thread.run((data) => `Hello, ${data.name}!`, { name: 'World' });
  console.log('Result 2:', result2);

  const result3 = await thread.run((data, ctx) => {
    ctx.port.postMessage('Ping from worker');
    return data.value + 10;
  }, { value: 32 });

  console.log('Result 3:', result3);
  await thread.terminate();
})();