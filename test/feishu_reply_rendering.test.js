const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildMarkdownCardPayload,
  deliverRenderedReply,
  shouldRenderFeishuMarkdown,
} = require('../tools/lib/feishu_reply_rendering');

test('shouldRenderFeishuMarkdown ignores plain text replies', () => {
  assert.equal(shouldRenderFeishuMarkdown('今天一切正常，继续推进即可。'), false);
});

test('shouldRenderFeishuMarkdown detects structured markdown replies', () => {
  const reply = [
    '## 当前进展',
    '',
    '- 已完成队列保护',
    '- 已完成引用上下文',
  ].join('\n');

  assert.equal(shouldRenderFeishuMarkdown(reply), true);
});

test('buildMarkdownCardPayload creates a headerless Feishu interactive card', () => {
  assert.deepEqual(buildMarkdownCardPayload('**Hello**'), {
    config: {
      wide_screen_mode: true,
      enable_forward: true,
    },
    elements: [
      {
        tag: 'markdown',
        content: '**Hello**',
      },
    ],
  });
});

test('deliverRenderedReply prefers markdown card delivery for markdown content', async () => {
  const textChunks = [];
  const markdownChunks = [];

  const sent = await deliverRenderedReply('## 标题\n\n- A\n- B', {
    splitText(text) {
      return [text];
    },
    async sendText(chunk) {
      textChunks.push(chunk);
    },
    async sendMarkdown(chunk) {
      markdownChunks.push(chunk);
    },
  });

  assert.equal(sent, 1);
  assert.deepEqual(textChunks, []);
  assert.deepEqual(markdownChunks, ['## 标题\n\n- A\n- B']);
});

test('deliverRenderedReply falls back to plain text when markdown delivery fails', async () => {
  const textChunks = [];
  const markdownErrors = [];

  const sent = await deliverRenderedReply('```js\nconsole.log(1)\n```', {
    splitText(text) {
      return [text];
    },
    async sendText(chunk) {
      textChunks.push(chunk);
    },
    async sendMarkdown() {
      throw new Error('interactive unavailable');
    },
    onMarkdownError(err, meta) {
      markdownErrors.push(`${meta.index}/${meta.total}:${err.message}`);
    },
  });

  assert.equal(sent, 1);
  assert.deepEqual(textChunks, ['```js\nconsole.log(1)\n```']);
  assert.deepEqual(markdownErrors, ['1/1:interactive unavailable']);
});
