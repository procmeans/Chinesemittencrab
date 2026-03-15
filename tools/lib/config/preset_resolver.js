function asPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}

function deepMerge(...items) {
  const out = {};
  for (const item of items) {
    const src = asPlainObject(item);
    for (const [key, value] of Object.entries(src)) {
      if (Array.isArray(value)) {
        out[key] = value.slice();
        continue;
      }
      if (value && typeof value === 'object') {
        out[key] = deepMerge(asPlainObject(out[key]), value);
        continue;
      }
      out[key] = value;
    }
  }
  return out;
}

function omitKeys(value, keys) {
  const src = asPlainObject(value);
  const out = {};
  for (const [key, entryValue] of Object.entries(src)) {
    if (keys.has(key)) continue;
    out[key] = entryValue;
  }
  return out;
}

const RESERVED_CONFIG_ENTRY_NAMES = new Set(['presets']);

function listResolvableConfigEntryNames(root) {
  return Object.keys(asPlainObject(root))
    .filter((name) => !RESERVED_CONFIG_ENTRY_NAMES.has(name))
    .sort();
}

function resolvePresetConfig(root, entryName = 'default', options = {}) {
  const configRoot = asPlainObject(root);
  const key = String(entryName || '').trim();
  if (!key || RESERVED_CONFIG_ENTRY_NAMES.has(key)) {
    return asPlainObject(options.fallback);
  }

  const systemDefaults = asPlainObject(options.systemDefaults);
  const defaultPresetName = String(options.defaultPresetName || '').trim();
  const entry = asPlainObject(configRoot[key]);
  const presetName = String(entry.preset || '').trim() || defaultPresetName;
  const presets = asPlainObject(configRoot.presets);
  const presetConfig = presetName ? asPlainObject(presets[presetName]) : {};
  const entryOverrides = omitKeys(entry, new Set(['preset']));

  return deepMerge(systemDefaults, presetConfig, entryOverrides);
}

module.exports = {
  RESERVED_CONFIG_ENTRY_NAMES,
  listResolvableConfigEntryNames,
  resolvePresetConfig,
};
