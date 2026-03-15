const test = require('node:test');
const assert = require('node:assert/strict');

const {
  RESERVED_CONFIG_ENTRY_NAMES,
  listResolvableConfigEntryNames,
  resolvePresetConfig,
} = require('../tools/lib/config/preset_resolver');

test('resolvePresetConfig merges system defaults, preset values, and account overrides', () => {
  const root = {
    presets: {
      dev_assistant: {
        reply_mode: 'codex',
        require_mention: true,
        progress: {
          enabled: true,
          mode: 'doc',
        },
        codex: {
          history_turns: 6,
          sandbox: 'danger-full-access',
        },
      },
    },
    default: {
      preset: 'dev_assistant',
      bot_name: '默认机器人',
      codex: {
        history_turns: 10,
      },
    },
  };

  const resolved = resolvePresetConfig(root, 'default', {
    systemDefaults: {
      domain: 'feishu',
      progress: {
        enabled: false,
        message: '已接收，正在执行。',
      },
      codex: {
        history_turns: 4,
        approval_policy: 'never',
      },
    },
  });

  assert.deepEqual(resolved, {
    domain: 'feishu',
    reply_mode: 'codex',
    require_mention: true,
    bot_name: '默认机器人',
    progress: {
      enabled: true,
      message: '已接收，正在执行。',
      mode: 'doc',
    },
    codex: {
      history_turns: 10,
      sandbox: 'danger-full-access',
      approval_policy: 'never',
    },
  });
});

test('resolvePresetConfig defaults accounts without explicit preset to the shared default preset', () => {
  const root = {
    presets: {
      dev_assistant: {
        reply_mode: 'codex',
        progress: {
          mode: 'doc',
        },
      },
    },
    default: {
      preset: 'dev_assistant',
    },
    yy_cooking_dev: {
      bot_name: 'YY的烹饪游戏开发助手',
    },
  };

  const resolved = resolvePresetConfig(root, 'yy_cooking_dev', {
    defaultPresetName: root.default.preset,
    systemDefaults: {
      require_mention: true,
      progress: {
        enabled: true,
      },
    },
  });

  assert.deepEqual(resolved, {
    require_mention: true,
    reply_mode: 'codex',
    bot_name: 'YY的烹饪游戏开发助手',
    progress: {
      enabled: true,
      mode: 'doc',
    },
  });
});

test('resolvePresetConfig preserves backward compatibility for the flat config shape', () => {
  const root = {
    default: {
      reply_prefix: 'AI 助手：',
      progress: {
        enabled: true,
        mode: 'message',
      },
      codex: {
        cwd: '/workspace/default',
      },
    },
    second: {
      bot_name: '小草的机器人',
      progress: {
        mode: 'doc',
      },
    },
  };

  const defaultResolved = resolvePresetConfig(root, 'default', {
    systemDefaults: {
      domain: 'feishu',
      auto_reply: true,
    },
  });
  const secondResolved = resolvePresetConfig(root, 'second', {
    systemDefaults: defaultResolved,
  });

  assert.deepEqual(secondResolved, {
    domain: 'feishu',
    auto_reply: true,
    reply_prefix: 'AI 助手：',
    bot_name: '小草的机器人',
    progress: {
      enabled: true,
      mode: 'doc',
    },
    codex: {
      cwd: '/workspace/default',
    },
  });
});

test('listResolvableConfigEntryNames excludes reserved config metadata keys', () => {
  const root = {
    presets: {
      dev_assistant: {},
    },
    default: {
      preset: 'dev_assistant',
    },
    second: {
      bot_name: '小草的机器人',
    },
  };

  assert.equal(RESERVED_CONFIG_ENTRY_NAMES.has('presets'), true);
  assert.deepEqual(listResolvableConfigEntryNames(root), ['default', 'second']);
});
