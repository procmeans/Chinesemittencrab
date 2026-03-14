const FEISHU_GROUP_MENTION_CARRY_WINDOW_MS = 2 * 60 * 1000;

function buildMentionCarryKey(chatID, senderOpenID) {
  const chat = String(chatID || '').trim();
  const sender = String(senderOpenID || '').trim();
  if (!chat || !sender) return '';
  return `${chat}:${sender}`;
}

function pruneMentionCarryState(stateMap, now = Date.now()) {
  if (!stateMap || typeof stateMap.size !== 'number' || stateMap.size === 0) return;
  for (const [key, value] of stateMap.entries()) {
    if (!value || now - value.timestamp > FEISHU_GROUP_MENTION_CARRY_WINDOW_MS) {
      stateMap.delete(key);
    }
  }
}

function rememberRecentMention(stateMap, chatID, senderOpenID, alias = '', now = Date.now()) {
  const key = buildMentionCarryKey(chatID, senderOpenID);
  if (!key) return;
  stateMap.set(key, {
    timestamp: now,
    alias: String(alias || '').trim(),
  });
}

function getRecentMentionState(stateMap, chatID, senderOpenID, now = Date.now()) {
  const key = buildMentionCarryKey(chatID, senderOpenID);
  if (!key) return null;
  const cached = stateMap.get(key);
  if (!cached) return null;
  if (now - cached.timestamp > FEISHU_GROUP_MENTION_CARRY_WINDOW_MS) {
    stateMap.delete(key);
    return null;
  }
  return cached;
}

function isMentionCarryEligibleMessage(messageType, rawText = '') {
  const type = String(messageType || '').trim().toLowerCase();
  if (!type) return false;
  if (type === 'text') return !/[@＠]/.test(String(rawText || ''));
  return type === 'file' || type === 'image' || type === 'post' || type === 'audio';
}

function isMentionlessGroupFileAllowed(messageType) {
  return String(messageType || '').trim().toLowerCase() === 'file';
}

module.exports = {
  FEISHU_GROUP_MENTION_CARRY_WINDOW_MS,
  getRecentMentionState,
  isMentionCarryEligibleMessage,
  isMentionlessGroupFileAllowed,
  pruneMentionCarryState,
  rememberRecentMention,
};
