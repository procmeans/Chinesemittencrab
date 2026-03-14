const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeChatTargetName,
  pickBestChatMatches,
  resolveTargetChatByName,
} = require('../tools/lib/feishu_chat_target');

test('normalizeChatTargetName trims repeated whitespace', () => {
  assert.equal(normalizeChatTargetName('  YY   专用   机器人群  '), 'YY 专用 机器人群');
});

test('exact-name match wins over contains match', () => {
  const items = [
    { chat_id: 'oc_2', name: 'YY专用机器人群-备份', chat_status: 'normal' },
    { chat_id: 'oc_1', name: 'YY专用机器人群', chat_status: 'normal' },
  ];

  assert.deepEqual(
    pickBestChatMatches('YY专用机器人群', items),
    [
      { chatId: 'oc_1', chatName: 'YY专用机器人群' },
    ]
  );
});

test('single contains match resolves successfully', async () => {
  const client = {
    im: {
      v1: {
        chat: {
          search: async () => ({
            data: {
              items: [
                { chat_id: 'oc_1', name: 'YY专用机器人群', chat_status: 'normal' },
              ],
            },
          }),
        },
      },
    },
  };

  assert.deepEqual(
    await resolveTargetChatByName(client, 'YY专用'),
    {
      status: 'resolved',
      chatId: 'oc_1',
      chatName: 'YY专用机器人群',
    }
  );
});

test('multiple matches return ambiguity result', async () => {
  const client = {
    im: {
      v1: {
        chat: {
          search: async () => ({
            data: {
              items: [
                { chat_id: 'oc_1', name: 'YY专用机器人群', chat_status: 'normal' },
                { chat_id: 'oc_2', name: 'YY专用机器人群-备份', chat_status: 'normal' },
              ],
            },
          }),
        },
      },
    },
  };

  assert.deepEqual(
    await resolveTargetChatByName(client, 'YY专用'),
    {
      status: 'ambiguous',
      chatName: 'YY专用',
      candidates: [
        { chatId: 'oc_1', chatName: 'YY专用机器人群' },
        { chatId: 'oc_2', chatName: 'YY专用机器人群-备份' },
      ],
    }
  );
});

test('zero matches return not_found result', async () => {
  const client = {
    im: {
      v1: {
        chat: {
          search: async () => ({
            data: {
              items: [],
            },
          }),
        },
      },
    },
  };

  assert.deepEqual(
    await resolveTargetChatByName(client, '不存在的群'),
    {
      status: 'not_found',
      chatName: '不存在的群',
    }
  );
});

test('duplicate chat ids are deduplicated', () => {
  const items = [
    { chat_id: 'oc_1', name: 'YY专用机器人群', chat_status: 'normal' },
    { chat_id: 'oc_1', name: 'YY专用机器人群', chat_status: 'normal' },
  ];

  assert.deepEqual(
    pickBestChatMatches('YY专用机器人群', items),
    [
      { chatId: 'oc_1', chatName: 'YY专用机器人群' },
    ]
  );
});
