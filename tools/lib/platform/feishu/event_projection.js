function compactText(raw, maxLength = 2000) {
  const text = String(raw || '').replace(/\r/g, '').trim();
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}\n...(已截断)`;
}

function normalizeRuntimeLabel(rawText, maxLength = 120) {
  return compactText(String(rawText || '').replace(/\s+/g, ' '), maxLength);
}

function uniqueStrings(items = []) {
  const out = [];
  const seen = new Set();
  for (const item of items) {
    const value = String(item || '').trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function parseMessageText(rawContent) {
  const content = String(rawContent || '').trim();
  if (!content) return '';
  try {
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed.text === 'string') return parsed.text.trim();
  } catch (_) {
    return '';
  }
  return '';
}

function parseImageKey(rawContent) {
  const content = String(rawContent || '').trim();
  if (!content) return '';
  try {
    const parsed = JSON.parse(content);
    return String(
      parsed?.image_key || parsed?.imageKey || parsed?.file_key || parsed?.fileKey || ''
    ).trim();
  } catch (_) {
    return '';
  }
}

function parsePostContent(rawContent) {
  const content = String(rawContent || '').trim();
  if (!content) return { text: '', imageKeys: [] };
  try {
    const parsed = JSON.parse(content);
    const post = parsed?.post || parsed;
    const localeEntries = Object.values(post || {});
    const preferred = post?.zh_cn || post?.en_us || localeEntries[0] || {};
    const blocks = Array.isArray(preferred?.content) ? preferred.content : [];
    const textParts = [];
    const imageKeys = [];

    if (typeof preferred?.title === 'string' && preferred.title.trim()) {
      textParts.push(preferred.title.trim());
    }

    for (const block of blocks) {
      if (!Array.isArray(block)) continue;
      for (const item of block) {
        const tag = String(item?.tag || '').trim().toLowerCase();
        if (tag === 'text') {
          const itemText = String(item?.text || '').trim();
          if (itemText) textParts.push(itemText);
          continue;
        }
        if (tag === 'img' || tag === 'image') {
          const imageKey = String(
            item?.image_key || item?.imageKey || item?.file_key || item?.fileKey || ''
          ).trim();
          if (imageKey) imageKeys.push(imageKey);
        }
      }
    }

    return {
      text: textParts.join('\n').trim(),
      imageKeys: uniqueStrings(imageKeys),
    };
  } catch (_) {
    return { text: '', imageKeys: [] };
  }
}

function parseFileMessageContent(rawContent) {
  const content = String(rawContent || '').trim();
  if (!content) return { fileKey: '', fileName: '', fileSize: 0 };
  try {
    const parsed = JSON.parse(content);
    const fileKey = String(
      parsed?.file_key
      || parsed?.fileKey
      || parsed?.file?.file_key
      || parsed?.file?.fileKey
      || ''
    ).trim();
    const fileName = String(
      parsed?.file_name
      || parsed?.fileName
      || parsed?.name
      || parsed?.file?.file_name
      || parsed?.file?.fileName
      || parsed?.file?.name
      || ''
    ).trim();
    const rawSize = Number(
      parsed?.file_size
      || parsed?.fileSize
      || parsed?.size
      || parsed?.file?.file_size
      || parsed?.file?.fileSize
      || parsed?.file?.size
      || 0
    );
    return {
      fileKey,
      fileName,
      fileSize: Number.isFinite(rawSize) ? rawSize : 0,
    };
  } catch (_) {
    return { fileKey: '', fileName: '', fileSize: 0 };
  }
}

function parseAudioMessageContent(rawContent) {
  const content = String(rawContent || '').trim();
  if (!content) return { fileKey: '', durationMs: 0 };
  try {
    const parsed = JSON.parse(content);
    const fileKey = String(
      parsed?.file_key
      || parsed?.fileKey
      || parsed?.audio_key
      || parsed?.audioKey
      || parsed?.audio?.file_key
      || parsed?.audio?.fileKey
      || parsed?.audio?.audio_key
      || parsed?.audio?.audioKey
      || ''
    ).trim();
    const rawDuration = Number(
      parsed?.duration
      || parsed?.duration_ms
      || parsed?.durationMs
      || parsed?.audio?.duration
      || parsed?.audio?.duration_ms
      || parsed?.audio?.durationMs
      || 0
    );
    return {
      fileKey,
      durationMs: Number.isFinite(rawDuration) ? rawDuration : 0,
    };
  } catch (_) {
    return { fileKey: '', durationMs: 0 };
  }
}

function formatDurationFromMs(durationMs) {
  const ms = Math.max(0, Number(durationMs) || 0);
  if (ms <= 0) return '';
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds} 秒`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (seconds === 0) return `${minutes} 分钟`;
  return `${minutes} 分 ${seconds} 秒`;
}

function isGroupChat(chatType) {
  const normalized = String(chatType || '').trim().toLowerCase();
  if (!normalized) return true;
  return normalized !== 'p2p';
}

function buildConversationScope(chatID, chatType, senderOpenID, messageID = '') {
  const chat = String(chatID || '').trim();
  if (!chat) {
    return {
      key: '',
      stateKey: '',
      kind: 'missing_chat',
    };
  }
  if (!isGroupChat(chatType)) {
    return {
      key: chat,
      stateKey: chat,
      kind: 'p2p',
    };
  }

  const sender = String(senderOpenID || '').trim();
  const fallbackMessage = String(messageID || '').trim();
  const senderKey = sender || (fallbackMessage ? `message:${fallbackMessage}` : 'unknown_sender');
  const scoped = `${chat}::${senderKey}`;
  return {
    key: scoped,
    stateKey: scoped,
    kind: sender ? 'group_sender' : 'group_message_fallback',
  };
}

function buildRuntimeMessageSubjectLabel({
  messageType = '',
  incomingText = '',
  parsedFile = {},
  parsedAudio = {},
  imageCount = 0,
}) {
  const type = String(messageType || '').trim().toLowerCase();
  if (type === 'file') {
    return normalizeRuntimeLabel(parsedFile?.fileName || '文件消息', 120);
  }
  if (type === 'audio') {
    const durationText = formatDurationFromMs(parsedAudio?.durationMs || 0);
    return durationText ? `语音消息（${durationText}）` : '语音消息';
  }
  if ((type === 'image' || type === 'post') && imageCount > 0) {
    return `${imageCount} 张图片`;
  }
  return normalizeRuntimeLabel(incomingText || '文本消息', 120) || '文本消息';
}

function buildRuntimeTaskSummary({
  messageType = '',
  incomingText = '',
  userText = '',
  parsedFile = {},
  parsedAudio = {},
  imageCount = 0,
}) {
  const type = String(messageType || '').trim().toLowerCase();
  const normalizedText = normalizeRuntimeLabel(userText || incomingText, 140);
  if (type === 'file') {
    const fileName = normalizeRuntimeLabel(parsedFile?.fileName || '未命名文件', 80);
    return normalizedText ? `文件消息：${fileName}｜${normalizedText}` : `文件消息：${fileName}`;
  }
  if (type === 'audio') {
    const durationText = formatDurationFromMs(parsedAudio?.durationMs || 0);
    const prefix = durationText ? `语音消息（${durationText}）` : '语音消息';
    return normalizedText ? `${prefix}｜${normalizedText}` : prefix;
  }
  if ((type === 'image' || type === 'post') && imageCount > 0) {
    return normalizedText ? `图片消息（${imageCount} 张）｜${normalizedText}` : `图片消息（${imageCount} 张）`;
  }
  return normalizedText || '文本消息';
}

function projectFeishuMessageEvent(data = {}) {
  const eventData = data?.event || data;
  const message = eventData?.message || {};
  const sender = eventData?.sender || {};
  const messageType = String(message.message_type || '').trim().toLowerCase();
  const postContent = messageType === 'post'
    ? parsePostContent(message.content || '')
    : { text: '', imageKeys: [] };
  const incomingText = messageType === 'post'
    ? postContent.text
    : parseMessageText(message.content || '');
  const normalizedImageKeys = messageType === 'image'
    ? uniqueStrings([parseImageKey(message.content || '')].filter(Boolean))
    : postContent.imageKeys;
  const parsedFile = messageType === 'file'
    ? parseFileMessageContent(message.content || '')
    : { fileKey: '', fileName: '', fileSize: 0 };
  const parsedAudio = messageType === 'audio'
    ? parseAudioMessageContent(message.content || '')
    : { fileKey: '', durationMs: 0 };
  const chatID = String(message.chat_id || '').trim();
  const messageID = String(message.message_id || '').trim();
  const senderOpenID = String(sender?.sender_id?.open_id || '').trim();
  const conversationScope = buildConversationScope(
    chatID,
    message.chat_type || '',
    senderOpenID,
    messageID
  );

  return {
    eventData,
    message,
    sender,
    chatID,
    messageID,
    senderOpenID,
    messageType,
    incomingText,
    normalizedImageKeys,
    parsedFile,
    parsedAudio,
    conversationScope,
    groupChat: isGroupChat(message.chat_type || ''),
    runtimeMessageSubjectLabel: buildRuntimeMessageSubjectLabel({
      messageType,
      incomingText,
      parsedFile,
      parsedAudio,
      imageCount: normalizedImageKeys.length,
    }),
    runtimeTaskSummary: buildRuntimeTaskSummary({
      messageType,
      incomingText,
      parsedFile,
      parsedAudio,
      imageCount: normalizedImageKeys.length,
    }),
  };
}

module.exports = {
  buildConversationScope,
  buildRuntimeMessageSubjectLabel,
  buildRuntimeTaskSummary,
  formatDurationFromMs,
  isGroupChat,
  parseAudioMessageContent,
  parseFileMessageContent,
  parseImageKey,
  parseMessageText,
  parsePostContent,
  projectFeishuMessageEvent,
};
