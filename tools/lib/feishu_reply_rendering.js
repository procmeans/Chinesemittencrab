const FEISHU_MARKDOWN_CARD_CHUNK_LIMIT = 4000;

function shouldRenderFeishuMarkdown(rawText) {
  const text = String(rawText || '').replace(/\r/g, '').trim();
  if (!text) return false;
  if (text.includes('```')) return true;
  if (/`[^`\n]+`/.test(text)) return true;
  if (/\[[^\]]+\]\([^)]+\)/.test(text)) return true;
  if (/(\*\*|__|~~).+?\1/.test(text)) return true;

  const lines = text.split('\n');
  let structuralHits = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) continue;
    if (/^#{1,6}\s/.test(line)) return true;
    if (/^>\s+/.test(line)) return true;
    if (/^\s*[-*+]\s+/.test(line)) structuralHits += 1;
    if (/^\s*\d+\.\s+/.test(line)) structuralHits += 1;
    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?[\s:-]+\|[\s|:-]*$/.test(lines[i + 1].trim())) {
      return true;
    }
  }
  return structuralHits >= 2;
}

function buildMarkdownCardPayload(markdown) {
  const safeMarkdown = String(markdown || '').replace(/\r/g, '').trim();
  if (!safeMarkdown) {
    throw new Error('markdown reply is empty');
  }
  return {
    config: {
      wide_screen_mode: true,
      enable_forward: true,
    },
    elements: [
      {
        tag: 'markdown',
        content: safeMarkdown,
      },
    ],
  };
}

async function deliverRenderedReply(rawText, {
  shouldContinue = null,
  preferMarkdown = true,
  splitText = (text) => [text],
  sendText,
  sendMarkdown,
  textChunkLimit = 4000,
  markdownChunkLimit = FEISHU_MARKDOWN_CARD_CHUNK_LIMIT,
  onMarkdownError = () => {},
} = {}) {
  const normalized = String(rawText || '').replace(/\r/g, '').trim();
  if (!normalized) return 0;
  if (typeof sendText !== 'function') {
    throw new Error('sendText is required');
  }

  const renderMarkdown = preferMarkdown
    && typeof sendMarkdown === 'function'
    && shouldRenderFeishuMarkdown(normalized);
  const chunkLimit = renderMarkdown ? markdownChunkLimit : textChunkLimit;
  const chunks = splitText(normalized, chunkLimit);
  let sent = 0;

  for (let idx = 0; idx < chunks.length; idx += 1) {
    const chunk = chunks[idx];
    if (typeof shouldContinue === 'function' && !shouldContinue()) break;
    if (!chunk) continue;

    if (renderMarkdown) {
      try {
        await sendMarkdown(chunk, {
          index: idx + 1,
          total: chunks.length,
        });
        sent += 1;
        continue;
      } catch (err) {
        onMarkdownError(err, {
          index: idx + 1,
          total: chunks.length,
          chunk,
        });
      }
    }

    await sendText(chunk, {
      index: idx + 1,
      total: chunks.length,
    });
    sent += 1;
  }

  return sent;
}

module.exports = {
  FEISHU_MARKDOWN_CARD_CHUNK_LIMIT,
  buildMarkdownCardPayload,
  deliverRenderedReply,
  shouldRenderFeishuMarkdown,
};
