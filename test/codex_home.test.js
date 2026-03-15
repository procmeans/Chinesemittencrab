const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  bootstrapCodexHomeAuth,
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

test('bootstrapCodexHomeAuth copies shared auth files into an isolated CODEX_HOME when missing', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-home-auth-'));

  try {
    const sharedHome = path.join(tempRoot, 'shared');
    const isolatedHome = path.join(tempRoot, 'isolated');
    fs.mkdirSync(sharedHome, { recursive: true });
    fs.mkdirSync(isolatedHome, { recursive: true });
    fs.writeFileSync(path.join(sharedHome, 'auth.json'), '{"token":"shared"}');
    fs.writeFileSync(path.join(sharedHome, 'config.toml'), 'model = "gpt-5.4"\n');

    bootstrapCodexHomeAuth({
      codexHome: isolatedHome,
      sharedCodexHome: sharedHome,
    });

    assert.equal(
      fs.readFileSync(path.join(isolatedHome, 'auth.json'), 'utf8'),
      '{"token":"shared"}'
    );
    assert.equal(
      fs.readFileSync(path.join(isolatedHome, 'config.toml'), 'utf8'),
      'model = "gpt-5.4"\n'
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('bootstrapCodexHomeAuth preserves account-local auth files when they already exist', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-home-auth-'));

  try {
    const sharedHome = path.join(tempRoot, 'shared');
    const isolatedHome = path.join(tempRoot, 'isolated');
    fs.mkdirSync(sharedHome, { recursive: true });
    fs.mkdirSync(isolatedHome, { recursive: true });
    fs.writeFileSync(path.join(sharedHome, 'auth.json'), '{"token":"shared"}');
    fs.writeFileSync(path.join(sharedHome, 'config.toml'), 'model = "gpt-5.4"\n');
    fs.writeFileSync(path.join(isolatedHome, 'auth.json'), '{"token":"account"}');
    fs.writeFileSync(path.join(isolatedHome, 'config.toml'), 'model = "account-local"\n');

    bootstrapCodexHomeAuth({
      codexHome: isolatedHome,
      sharedCodexHome: sharedHome,
    });

    assert.equal(
      fs.readFileSync(path.join(isolatedHome, 'auth.json'), 'utf8'),
      '{"token":"account"}'
    );
    assert.equal(
      fs.readFileSync(path.join(isolatedHome, 'config.toml'), 'utf8'),
      'model = "account-local"\n'
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
