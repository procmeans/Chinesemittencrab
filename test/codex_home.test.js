const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  buildDefaultCodexHome,
  resolveCodexHome,
} = require('../tools/lib/codex/codex_home');

test('buildDefaultCodexHome derives a per-account path under ~/.codex/feishu/<account>', () => {
  const resolved = buildDefaultCodexHome({
    accountName: 'yy_cooking_dev',
    homeDir: '/Users/procmeans',
  });

  assert.equal(resolved, path.resolve('/Users/procmeans/.codex/feishu/yy_cooking_dev'));
});

test('resolveCodexHome honors an explicit config override', () => {
  const resolved = resolveCodexHome({
    accountName: 'default',
    homeDir: '/Users/procmeans',
    env: {},
    config: {
      codex: {
        home: '~/Library/Application Support/SunCodexClaw/default-home',
      },
    },
  });

  assert.equal(
    resolved,
    path.resolve('/Users/procmeans/Library/Application Support/SunCodexClaw/default-home')
  );
});

test('resolveCodexHome falls back to the default per-account path when no override is configured', () => {
  const resolved = resolveCodexHome({
    accountName: 'second',
    homeDir: '/Users/procmeans',
    env: {},
    config: {
      codex: {
        cwd: '/Users/procmeans/Documents/App Factory/dancidanyu',
      },
    },
  });

  assert.equal(resolved, path.resolve('/Users/procmeans/.codex/feishu/second'));
});
