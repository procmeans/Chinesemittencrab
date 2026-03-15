const test = require('node:test');
const assert = require('node:assert/strict');

const {
  composeQuotedPrompt,
  resolveReferencedMessageContext,
  selectReferencedMessageId,
} = require('../tools/lib/referenced_message_context');

test('selectReferencedMessageId prefers parent_id over root_id', () => {
  assert.equal(
    selectReferencedMessageId({
      parent_id: 'om_parent',
      root_id: 'om_root',
    }),
    'om_parent'
  );
});

test('resolveReferencedMessageContext fetches and parses a referenced text message', async () => {
  const calls = [];
  const client = {
    im: {
      v1: {
        message: {
          async get(payload) {
            calls.push(payload);
            return {
              data: {
                items: [{
                  message_id: 'om_parent',
                  msg_type: 'text',
                  body: {
                    content: JSON.stringify({ text: '这是被引用的原文' }),
                  },
                }],
              },
            };
          },
        },
      },
    },
  };

  const result = await resolveReferencedMessageContext({
    client,
    message: {
      parent_id: 'om_parent',
      root_id: 'om_root',
    },
  });

  assert.deepEqual(calls, [{ path: { message_id: 'om_parent' } }]);
  assert.equal(result.messageId, 'om_parent');
  assert.equal(result.text, '这是被引用的原文');
});

test('resolveReferencedMessageContext parses referenced post messages into plain text', async () => {
  const client = {
    im: {
      v1: {
        message: {
          async get() {
            return {
              data: {
                items: [{
                  message_id: 'om_root',
                  msg_type: 'post',
                  body: {
                    content: JSON.stringify({
                      zh_cn: {
                        title: '更新汇总',
                        content: [
                          [{ tag: 'text', text: '第一段' }],
                          [{ tag: 'text', text: '第二段' }],
                        ],
                      },
                    }),
                  },
                }],
              },
            };
          },
        },
      },
    },
  };

  const result = await resolveReferencedMessageContext({
    client,
    message: {
      root_id: 'om_root',
    },
  });

  assert.equal(result.text, '更新汇总\n第一段\n第二段');
});

test('resolveReferencedMessageContext parses referenced interactive card messages into plain text', async () => {
  const client = {
    im: {
      v1: {
        message: {
          async get() {
            return {
              data: {
                items: [{
                  message_id: 'om_card',
                  msg_type: 'interactive',
                  body: {
                    content: JSON.stringify({
                      config: {
                        wide_screen_mode: true,
                      },
                      elements: [
                        { tag: 'markdown', content: '## 当前结论\n\n- 第一条\n- 第二条' },
                      ],
                    }),
                  },
                }],
              },
            };
          },
        },
      },
    },
  };

  const result = await resolveReferencedMessageContext({
    client,
    message: {
      parent_id: 'om_card',
    },
  });

  assert.equal(result.text, '## 当前结论\n\n- 第一条\n- 第二条');
});

test('resolveReferencedMessageContext summarizes referenced document-like messages with title and url', async () => {
  const client = {
    im: {
      v1: {
        message: {
          async get() {
            return {
              data: {
                items: [{
                  message_id: 'om_doc',
                  msg_type: 'text',
                  body: {
                    content: JSON.stringify({
                      text: '《飞机大厨资料汇总》 https://example.feishu.cn/docx/abc123',
                    }),
                  },
                }],
              },
            };
          },
        },
      },
    },
  };

  const result = await resolveReferencedMessageContext({
    client,
    message: {
      parent_id: 'om_doc',
    },
  });

  assert.equal(result.text, '飞机大厨资料汇总\nhttps://example.feishu.cn/docx/abc123');
});

test('composeQuotedPrompt prepends quoted text before the current message', () => {
  assert.equal(
    composeQuotedPrompt({
      quotedText: '被引用的原文',
      currentText: '继续扩展成 pdf',
    }),
    '引用消息：\n被引用的原文\n\n当前消息：\n继续扩展成 pdf'
  );
});
