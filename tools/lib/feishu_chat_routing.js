function buildTargetChatAmbiguityNotice(candidates = []) {
  const lines = ['找到多个匹配群，请提供更精确的群名：'];
  let index = 1;
  for (const candidate of candidates || []) {
    const chatName = String(candidate?.chatName || '').trim();
    if (!chatName) continue;
    lines.push(`${index}. ${chatName}`);
    index += 1;
  }
  return lines.join('\n').trim();
}

function buildTargetChatNotFoundNotice(chatName = '') {
  return `未找到群：${String(chatName || '').trim()}`;
}

async function deliverFeishuTextReply({
  client,
  sourceChatId = '',
  replyText = '',
  targetChatResolution = null,
  sendTextReplyFn,
  sendReplyPassthroughFn,
  shouldContinue = null,
} = {}) {
  const sourceChat = String(sourceChatId || '').trim();
  const finalText = String(replyText || '').trim();
  const resolution = targetChatResolution && typeof targetChatResolution === 'object'
    ? targetChatResolution
    : null;

  if (!resolution || !resolution.status) {
    await sendReplyPassthroughFn(client, sourceChat, finalText, shouldContinue);
    return {
      deliveryKind: 'source_chat',
      finalReplyForLog: finalText,
      sourceNotice: '',
      targetChatId: '',
      targetChatName: '',
    };
  }

  if (resolution.status === 'resolved') {
    await sendReplyPassthroughFn(client, resolution.chatId, finalText, shouldContinue);
    const sourceNotice = `已完成，已发送到 ${resolution.chatName}`;
    await sendTextReplyFn(client, sourceChat, sourceNotice);
    return {
      deliveryKind: 'target_chat',
      finalReplyForLog: `${finalText}\n[已发送到群] ${resolution.chatName}`.trim(),
      sourceNotice,
      targetChatId: String(resolution.chatId || '').trim(),
      targetChatName: String(resolution.chatName || '').trim(),
    };
  }

  const sourceNotice = resolution.status === 'ambiguous'
    ? buildTargetChatAmbiguityNotice(resolution.candidates)
    : buildTargetChatNotFoundNotice(resolution.chatName);
  await sendTextReplyFn(client, sourceChat, sourceNotice);
  return {
    deliveryKind: 'source_only_notice',
    finalReplyForLog: sourceNotice,
    sourceNotice,
    targetChatId: '',
    targetChatName: String(resolution.chatName || '').trim(),
  };
}

module.exports = {
  buildTargetChatAmbiguityNotice,
  buildTargetChatNotFoundNotice,
  deliverFeishuTextReply,
};
