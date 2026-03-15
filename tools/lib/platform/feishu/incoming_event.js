const { buildDispatchEnvelope } = require('../../feishu_dispatch_envelope');
const { projectFeishuMessageEvent } = require('./event_projection');

function normalizeIncomingFeishuEvent(eventData, deps = {}) {
  const dispatchEnvelope = buildDispatchEnvelope(eventData, deps);
  const projection = projectFeishuMessageEvent(eventData);
  const message = projection.message || {};

  return {
    dispatchEnvelope,
    projection,
    eventData: dispatchEnvelope.payload?.eventData || eventData || {},
    message,
    chatID: projection.chatID,
    chatType: String(message.chat_type || '').trim(),
    messageID: projection.messageID,
    messageType: projection.messageType,
    senderOpenID: projection.senderOpenID,
    mentions: Array.isArray(message.mentions) ? message.mentions : [],
    rawText: projection.incomingText,
    taskKey: dispatchEnvelope.taskKey || projection.chatID || projection.messageID || 'unknown',
  };
}

module.exports = {
  normalizeIncomingFeishuEvent,
};
