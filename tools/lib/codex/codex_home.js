const os = require('os');
const path = require('path');

function asPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}

function resolveHomePath(value, homeDir = os.homedir()) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw === '~') return path.resolve(homeDir);
  if (raw.startsWith('~/')) return path.resolve(homeDir, raw.slice(2));
  return path.resolve(raw);
}

function buildDefaultCodexHome({ accountName = 'default', homeDir = os.homedir() } = {}) {
  const account = String(accountName || 'default').trim() || 'default';
  return path.resolve(homeDir, '.codex', 'feishu', account);
}

function resolveCodexHome({ accountName = 'default', config = {}, env = process.env, homeDir = os.homedir() } = {}) {
  const cfg = asPlainObject(config);
  const codexConfig = asPlainObject(cfg.codex);
  const explicit = [
    env?.FEISHU_CODEX_HOME,
    codexConfig.home,
    codexConfig.codex_home,
    cfg.codex_home,
  ].find((candidate) => String(candidate || '').trim());

  if (explicit) {
    return resolveHomePath(explicit, homeDir);
  }

  return buildDefaultCodexHome({ accountName, homeDir });
}

module.exports = {
  buildDefaultCodexHome,
  resolveCodexHome,
  resolveHomePath,
};
