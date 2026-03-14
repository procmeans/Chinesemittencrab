const FEISHU_SEND_FILE_DIRECTIVE_PREFIX = '[[FEISHU_SEND_FILE:';
const FEISHU_SEND_IMAGE_DIRECTIVE_PREFIX = '[[FEISHU_SEND_IMAGE:';
const FEISHU_SEND_CHAT_DIRECTIVE_PREFIX = '[[FEISHU_SEND_CHAT:';

function normalizeDirectivePayload(rawText) {
  return String(rawText || '').trim();
}

function extractFeishuReplyDirectives(rawText) {
  const lines = String(rawText || '').replace(/\r/g, '').split('\n');
  const attachments = [];
  const keptLines = [];
  const seen = new Set();
  const targetChats = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.endsWith(']]')) {
      if (trimmed.startsWith(FEISHU_SEND_FILE_DIRECTIVE_PREFIX)) {
        const payload = normalizeDirectivePayload(trimmed.slice(FEISHU_SEND_FILE_DIRECTIVE_PREFIX.length, -2));
        const dedupeKey = `file:${payload}`;
        if (payload && !seen.has(dedupeKey)) {
          seen.add(dedupeKey);
          attachments.push({ type: 'file', path: payload });
        }
        continue;
      }
      if (trimmed.startsWith(FEISHU_SEND_IMAGE_DIRECTIVE_PREFIX)) {
        const payload = normalizeDirectivePayload(trimmed.slice(FEISHU_SEND_IMAGE_DIRECTIVE_PREFIX.length, -2));
        const dedupeKey = `image:${payload}`;
        if (payload && !seen.has(dedupeKey)) {
          seen.add(dedupeKey);
          attachments.push({ type: 'image', path: payload });
        }
        continue;
      }
      if (trimmed.startsWith(FEISHU_SEND_CHAT_DIRECTIVE_PREFIX)) {
        const payload = normalizeDirectivePayload(trimmed.slice(FEISHU_SEND_CHAT_DIRECTIVE_PREFIX.length, -2));
        if (payload) targetChats.push(payload);
        continue;
      }
    }
    keptLines.push(line);
  }

  let targetChatName = '';
  let targetChatDirectiveError = '';
  if (targetChats.length === 1) {
    [targetChatName] = targetChats;
  } else if (targetChats.length > 1) {
    targetChatDirectiveError = 'multiple_target_chats';
  }

  return {
    text: keptLines.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
    attachments,
    targetChatName,
    targetChatDirectiveError,
  };
}

module.exports = {
  FEISHU_SEND_CHAT_DIRECTIVE_PREFIX,
  FEISHU_SEND_FILE_DIRECTIVE_PREFIX,
  FEISHU_SEND_IMAGE_DIRECTIVE_PREFIX,
  extractFeishuReplyDirectives,
};
