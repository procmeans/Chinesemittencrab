function escapeRegExp(rawText) {
  return String(rawText || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeAliasText(rawText) {
  return String(rawText || '')
    .replace(/[\u200b-\u200d\uFEFF]/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeMentionAlias(rawText) {
  let text = normalizeAliasText(rawText);
  if (!text) return '';
  text = text.replace(/[：:]+$/g, '').trim();
  text = text.replace(/[|｜]\s*任务进度$/i, '').trim();
  text = text.replace(/^[“"']+|[”"']+$/g, '').trim();
  text = text.replace(/[，,。.!！?？;；、]+$/g, '').trim();
  return text;
}

function buildFlexibleAliasPattern(alias) {
  const normalized = normalizeMentionAlias(alias);
  if (!normalized) return '';
  return escapeRegExp(normalized).replace(/\s+/g, '\\s+');
}

function stripLeadingTextMentions(rawText, aliases = []) {
  let text = String(rawText || '');
  if (!text) return '';

  let previous = null;
  while (text !== previous) {
    previous = text;
    for (const alias of aliases || []) {
      const pattern = buildFlexibleAliasPattern(alias);
      if (!pattern) continue;
      const regex = new RegExp(`^\\s*[@＠]\\s*${pattern}(?:\\s*[:：,，;；、-]\\s*|\\s+|$)`, 'i');
      text = text.replace(regex, ' ');
    }
    text = text.replace(/^\s+/, '');
  }

  return text;
}

function normalizeIncomingText(rawText, mentions = [], mentionAliases = []) {
  let text = String(rawText || '');
  if (!text) return '';

  for (const mention of mentions || []) {
    const key = String(mention?.key || '').trim();
    if (!key) continue;
    text = text.split(key).join(' ');
  }

  text = text.replace(/<at\b[^>]*>.*?<\/at>/gi, ' ');
  text = stripLeadingTextMentions(text, mentionAliases);
  text = text.replace(/\u00a0/g, ' ');
  text = text.replace(/^(?:@\S+\s*)+/, '');
  return text.trim();
}

function shouldSupersedeActiveTask({
  messageType = '',
  rawText = '',
  mentions = [],
  mentionAliases = [],
} = {}) {
  const type = String(messageType || '').trim().toLowerCase();
  if (!type) return false;
  if (type === 'text') {
    return Boolean(normalizeIncomingText(rawText, mentions, mentionAliases));
  }
  return type === 'image' || type === 'post' || type === 'file' || type === 'audio';
}

module.exports = {
  shouldSupersedeActiveTask,
};
