function parseTextContent(rawContent) {
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

function parsePostContent(rawContent) {
  const content = String(rawContent || '').trim();
  if (!content) return '';
  try {
    const parsed = JSON.parse(content);
    const post = parsed?.post || parsed;
    const localeEntries = Object.values(post || {});
    const preferred = post?.zh_cn || post?.en_us || localeEntries[0] || {};
    const blocks = Array.isArray(preferred?.content) ? preferred.content : [];
    const textParts = [];

    if (typeof preferred?.title === 'string' && preferred.title.trim()) {
      textParts.push(preferred.title.trim());
    }

    for (const block of blocks) {
      if (!Array.isArray(block)) continue;
      for (const item of block) {
        if (String(item?.tag || '').trim().toLowerCase() !== 'text') continue;
        const itemText = String(item?.text || '').trim();
        if (itemText) textParts.push(itemText);
      }
    }

    return textParts.join('\n').trim();
  } catch (_) {
    return '';
  }
}

function selectReferencedMessageId(message = {}) {
  const parentId = String(message?.parent_id || '').trim();
  if (parentId) return parentId;
  return String(message?.root_id || '').trim();
}

function parseReferencedMessageText(message = {}) {
  const messageType = String(message?.msg_type || message?.message_type || '').trim().toLowerCase();
  const rawContent = message?.body?.content || message?.content || '';

  if (messageType === 'text') return parseTextContent(rawContent);
  if (messageType === 'post') return parsePostContent(rawContent);
  if (messageType === 'image') return '[引用了一条图片消息]';
  if (messageType === 'file') return '[引用了一个文件消息]';
  if (messageType === 'audio') return '[引用了一条语音消息]';
  return '';
}

function unwrapFetchedMessage(response) {
  return response?.data?.items?.[0] || response?.data?.item || response?.data || null;
}

async function resolveReferencedMessageContext({ client, message }) {
  const messageId = selectReferencedMessageId(message);
  if (!messageId) return { messageId: '', messageType: '', text: '', errorMessage: '' };

  try {
    const response = await client.im.v1.message.get({
      path: {
        message_id: messageId,
      },
    });
    const fetchedMessage = unwrapFetchedMessage(response);
    const messageType = String(
      fetchedMessage?.msg_type || fetchedMessage?.message_type || ''
    ).trim().toLowerCase();
    return {
      messageId,
      messageType,
      text: parseReferencedMessageText(fetchedMessage),
      errorMessage: '',
    };
  } catch (err) {
    return {
      messageId,
      messageType: '',
      text: '',
      errorMessage: String(err?.message || err || '').trim(),
    };
  }
}

function composeQuotedPrompt({ quotedText = '', currentText = '' }) {
  const normalizedQuotedText = String(quotedText || '').trim();
  const normalizedCurrentText = String(currentText || '').trim();
  if (!normalizedQuotedText) return normalizedCurrentText;
  if (!normalizedCurrentText) return `引用消息：\n${normalizedQuotedText}`;
  return `引用消息：\n${normalizedQuotedText}\n\n当前消息：\n${normalizedCurrentText}`;
}

module.exports = {
  composeQuotedPrompt,
  resolveReferencedMessageContext,
  selectReferencedMessageId,
};
