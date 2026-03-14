const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createMonitorServer,
} = require('../tools/feishu_monitor_server');

test('createMonitorServer serves health, api status, and dashboard html', async () => {
  const payload = {
    generatedAt: '2026-03-12T12:00:00.000Z',
    summary: {
      total: 2,
      online: 1,
      stuck: 1,
      offline: 0,
      unknown: 0,
    },
    accounts: [
      {
        account: 'default',
        health: 'online',
        phaseLabel: 'Codex 执行中',
        subjectLabel: '开始分析消息',
        waitedText: '20 秒',
        taskSummary: '处理用户提问',
        pid: 1234,
        lastHeartbeatAt: '2026-03-12T11:59:58.000Z',
        lastReplySummary: '已发送最终答案',
        lastError: null,
        recentEvents: [],
      },
      {
        account: 'second',
        health: 'stuck',
        phaseLabel: '正在写入进度文档',
        subjectLabel: 'Codex 任务进度 2026-03-12 15:00',
        waitedText: '5 分 10 秒',
        taskSummary: '整理文档回复',
        pid: 5678,
        lastHeartbeatAt: '2026-03-12T11:59:10.000Z',
        lastReplySummary: '',
        lastError: { message: '飞书接口超时' },
        recentEvents: [],
      },
    ],
  };

  const server = createMonitorServer({
    host: '127.0.0.1',
    snapshotProvider() {
      return payload;
    },
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  const healthResponse = await fetch(`http://127.0.0.1:${port}/healthz`);
  assert.equal(healthResponse.status, 200);
  assert.equal(await healthResponse.text(), 'ok');

  const statusResponse = await fetch(`http://127.0.0.1:${port}/api/status`);
  assert.equal(statusResponse.status, 200);
  assert.deepEqual(await statusResponse.json(), payload);

  const pageResponse = await fetch(`http://127.0.0.1:${port}/`);
  const html = await pageResponse.text();
  assert.equal(pageResponse.status, 200);
  assert.match(html, /在线/);
  assert.match(html, /疑似卡死/);
  assert.match(html, /api\/status/);

  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
});
