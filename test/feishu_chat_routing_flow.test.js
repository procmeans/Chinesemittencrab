const test = require('node:test');
const assert = require('node:assert/strict');

const {
  deliverFeishuTextReply,
} = require('../tools/lib/feishu_chat_routing');

test('resolved target chat sends final text to target group and completion notice to source group', async () => {
  const sentTexts = [];
  const sentPassthroughs = [];

  const result = await deliverFeishuTextReply({
    client: {},
    sourceChatId: 'oc_source',
    replyText: '这是最终结果',
    targetChatResolution: {
      status: 'resolved',
      chatId: 'oc_target',
      chatName: 'YY专用机器人群',
    },
    sendTextReplyFn: async (_client, chatId, text) => {
      sentTexts.push({ chatId, text });
    },
    sendReplyPassthroughFn: async (_client, chatId, text) => {
      sentPassthroughs.push({ chatId, text });
      return 1;
    },
  });

  assert.deepEqual(sentPassthroughs, [
    { chatId: 'oc_target', text: '这是最终结果' },
  ]);
  assert.deepEqual(sentTexts, [
    { chatId: 'oc_source', text: '已完成，已发送到 YY专用机器人群' },
  ]);
  assert.deepEqual(result, {
    deliveryKind: 'target_chat',
    finalReplyForLog: '这是最终结果\n[已发送到群] YY专用机器人群',
    sourceNotice: '已完成，已发送到 YY专用机器人群',
    targetChatId: 'oc_target',
    targetChatName: 'YY专用机器人群',
  });
});

test('ambiguous target chat sends only the ambiguity prompt to the source group', async () => {
  const sentTexts = [];

  const result = await deliverFeishuTextReply({
    client: {},
    sourceChatId: 'oc_source',
    replyText: '这是最终结果',
    targetChatResolution: {
      status: 'ambiguous',
      chatName: 'YY专用',
      candidates: [
        { chatId: 'oc_1', chatName: 'YY专用机器人群' },
        { chatId: 'oc_2', chatName: 'YY专用机器人群-备份' },
      ],
    },
    sendTextReplyFn: async (_client, chatId, text) => {
      sentTexts.push({ chatId, text });
    },
    sendReplyPassthroughFn: async () => {
      throw new Error('should not send passthrough');
    },
  });

  assert.deepEqual(sentTexts, [
    {
      chatId: 'oc_source',
      text: '找到多个匹配群，请提供更精确的群名：\n1. YY专用机器人群\n2. YY专用机器人群-备份',
    },
  ]);
  assert.deepEqual(result, {
    deliveryKind: 'source_only_notice',
    finalReplyForLog: '找到多个匹配群，请提供更精确的群名：\n1. YY专用机器人群\n2. YY专用机器人群-备份',
    sourceNotice: '找到多个匹配群，请提供更精确的群名：\n1. YY专用机器人群\n2. YY专用机器人群-备份',
    targetChatId: '',
    targetChatName: 'YY专用',
  });
});

test('missing target chat sends only the not-found prompt to the source group', async () => {
  const sentTexts = [];

  const result = await deliverFeishuTextReply({
    client: {},
    sourceChatId: 'oc_source',
    replyText: '这是最终结果',
    targetChatResolution: {
      status: 'not_found',
      chatName: '不存在的群',
    },
    sendTextReplyFn: async (_client, chatId, text) => {
      sentTexts.push({ chatId, text });
    },
    sendReplyPassthroughFn: async () => {
      throw new Error('should not send passthrough');
    },
  });

  assert.deepEqual(sentTexts, [
    { chatId: 'oc_source', text: '未找到群：不存在的群' },
  ]);
  assert.deepEqual(result, {
    deliveryKind: 'source_only_notice',
    finalReplyForLog: '未找到群：不存在的群',
    sourceNotice: '未找到群：不存在的群',
    targetChatId: '',
    targetChatName: '不存在的群',
  });
});
