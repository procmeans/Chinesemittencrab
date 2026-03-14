function isAttachmentCarryEligibleMessageType(messageType) {
  const normalized = String(messageType || '').trim().toLowerCase();
  return normalized === 'file' || normalized === 'image' || normalized === 'post' || normalized === 'audio';
}

function hasExplicitBotMentionInMessage(message, {
  mentionAliases = [],
  botOpenId = '',
  parseMessageText = () => '',
  parsePostContent = () => ({ text: '' }),
  isBotMentioned = () => false,
  detectBotOpenIdCandidate = () => null,
  detectTextualBotMention = () => '',
} = {}) {
  const targetMessage = message || {};
  const messageType = String(targetMessage?.message_type || '').trim().toLowerCase();
  const mentions = Array.isArray(targetMessage?.mentions) ? targetMessage.mentions : [];
  const parsedText = messageType === 'text' ? parseMessageText(targetMessage?.content || '') : '';
  const parsedPost = messageType === 'post' ? parsePostContent(targetMessage?.content || '') : { text: '' };
  const normalizedMessageText = messageType === 'post' ? parsedPost.text : parsedText;
  if (isBotMentioned(mentions, botOpenId)) return true;
  if (detectBotOpenIdCandidate(mentions, mentionAliases)) return true;
  return Boolean(detectTextualBotMention(normalizedMessageText, mentionAliases));
}

function buildDispatchEnvelope(eventData, {
  mentionAliases = [],
  botOpenId = '',
  recentMentionedSenders = null,
  now = Date.now(),
  buildConversationScope = () => ({ key: '' }),
  isGroupChat = () => true,
  parseMessageText = () => '',
  parsePostContent = () => ({ text: '' }),
  isBotMentioned = () => false,
  detectBotOpenIdCandidate = () => null,
  detectTextualBotMention = () => '',
  rememberRecentMention = () => {},
  pruneMentionCarryState = () => {},
  getRecentMentionState = () => null,
} = {}) {
  const data = eventData || {};
  const message = data?.message || {};
  const chatID = String(message.chat_id || '').trim();
  const chatType = String(message.chat_type || '').trim().toLowerCase();
  const messageID = String(message.message_id || '').trim();
  const senderOpenID = String(data?.sender?.sender_id?.open_id || '').trim();
  const messageType = String(message.message_type || '').trim().toLowerCase();
  const conversationScope = buildConversationScope(chatID, chatType, senderOpenID, messageID);
  const explicitBotMention = hasExplicitBotMentionInMessage(message, {
    mentionAliases,
    botOpenId,
    parseMessageText,
    parsePostContent,
    isBotMentioned,
    detectBotOpenIdCandidate,
    detectTextualBotMention,
  });
  const groupChat = isGroupChat(chatType);

  let allowMentionCarry = false;
  if (groupChat && senderOpenID && recentMentionedSenders) {
    if (explicitBotMention) {
      const parsedText = messageType === 'text' ? parseMessageText(message.content || '') : '';
      const parsedPost = messageType === 'post' ? parsePostContent(message.content || '') : { text: '' };
      const normalizedMessageText = messageType === 'post' ? parsedPost.text : parsedText;
      const textMentionAlias = detectTextualBotMention(normalizedMessageText, mentionAliases);
      rememberRecentMention(recentMentionedSenders, chatID, senderOpenID, textMentionAlias, now);
    } else if (isAttachmentCarryEligibleMessageType(messageType)) {
      pruneMentionCarryState(recentMentionedSenders, now);
      allowMentionCarry = Boolean(getRecentMentionState(recentMentionedSenders, chatID, senderOpenID, now));
    }
  }

  return {
    taskKey: conversationScope.key || chatID || messageID || 'unknown',
    shouldSupersedeActiveTask: groupChat && explicitBotMention,
    payload: {
      eventData: data,
      dispatchMeta: {
        explicitBotMention,
        allowMentionCarry,
        receivedAt: now,
      },
    },
  };
}

module.exports = {
  buildDispatchEnvelope,
  hasExplicitBotMentionInMessage,
  isAttachmentCarryEligibleMessageType,
};
