function normalizeChatTargetName(rawText) {
  return String(rawText || '')
    .replace(/[\u200b-\u200d\uFEFF]/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeCandidate(item) {
  const chatId = String(item?.chat_id || '').trim();
  const chatName = normalizeChatTargetName(item?.name || '');
  const chatStatus = String(item?.chat_status || '').trim().toLowerCase();
  if (!chatId || !chatName) return null;
  if (chatStatus && chatStatus !== 'normal') return null;
  return {
    chatId,
    chatName,
    normalizedName: chatName.toLowerCase(),
  };
}

function dedupeCandidates(items = []) {
  const deduped = [];
  const seen = new Set();
  for (const item of items || []) {
    const normalized = normalizeCandidate(item);
    if (!normalized || seen.has(normalized.chatId)) continue;
    seen.add(normalized.chatId);
    deduped.push(normalized);
  }
  return deduped;
}

function pickBestChatMatches(query, items = []) {
  const normalizedQuery = normalizeChatTargetName(query).toLowerCase();
  if (!normalizedQuery) return [];

  const candidates = dedupeCandidates(items);
  const exactMatches = candidates.filter((item) => item.normalizedName === normalizedQuery);
  const selected = exactMatches.length > 0
    ? exactMatches
    : candidates.filter((item) => item.normalizedName.includes(normalizedQuery));

  return selected.map(({ chatId, chatName }) => ({ chatId, chatName }));
}

async function resolveTargetChatByName(client, query) {
  const chatName = normalizeChatTargetName(query);
  if (!chatName) {
    return {
      status: 'not_found',
      chatName: '',
    };
  }

  const response = await client.im.v1.chat.search({
    params: {
      query: chatName,
      page_size: 20,
    },
  });
  const matches = pickBestChatMatches(chatName, response?.data?.items || []);

  if (matches.length === 1) {
    return {
      status: 'resolved',
      chatId: matches[0].chatId,
      chatName: matches[0].chatName,
    };
  }
  if (matches.length > 1) {
    return {
      status: 'ambiguous',
      chatName,
      candidates: matches,
    };
  }
  return {
    status: 'not_found',
    chatName,
  };
}

module.exports = {
  normalizeChatTargetName,
  pickBestChatMatches,
  resolveTargetChatByName,
};
