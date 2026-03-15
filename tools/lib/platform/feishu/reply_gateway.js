const { resolveTargetChatByName } = require('../../feishu_chat_target');
const { deliverFeishuTextReply } = require('../../feishu_chat_routing');

async function resolveReplyTarget({
  client,
  targetChatName = '',
  resolveTargetChatByNameFn = resolveTargetChatByName,
}) {
  const normalized = String(targetChatName || '').trim();
  if (!normalized) return null;
  return resolveTargetChatByNameFn(client, normalized);
}

async function deliverReplyText({
  client,
  sourceChatId,
  replyText,
  targetChatResolution,
  sendTextReplyFn,
  sendReplyPassthroughFn,
  shouldContinue,
}) {
  return deliverFeishuTextReply({
    client,
    sourceChatId,
    replyText,
    targetChatResolution,
    sendTextReplyFn,
    sendReplyPassthroughFn,
    shouldContinue,
  });
}

async function deliverReplyAttachments({
  client,
  chatID,
  attachments,
  cwd,
  shouldContinue,
  sendRequestedAttachmentsFn,
}) {
  return sendRequestedAttachmentsFn(
    client,
    chatID,
    attachments,
    cwd,
    shouldContinue
  );
}

module.exports = {
  deliverReplyAttachments,
  deliverReplyText,
  resolveReplyTarget,
};
