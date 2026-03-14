const FEISHU_DOCX_APPEND_BATCH_LIMIT = 50;

function chunkChildren(children, batchSize = FEISHU_DOCX_APPEND_BATCH_LIMIT) {
  const items = Array.isArray(children) ? children.filter(Boolean) : [];
  if (items.length === 0) return [];
  const size = Math.max(1, Number(batchSize) || FEISHU_DOCX_APPEND_BATCH_LIMIT);
  const batches = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

async function appendDocChildrenInBatches(client, documentID, children, batchSize = FEISHU_DOCX_APPEND_BATCH_LIMIT) {
  const batches = chunkChildren(children, batchSize);
  const createdChildren = [];

  for (const batch of batches) {
    const created = await client.docx.documentBlockChildren.create({
      path: {
        document_id: documentID,
        // Feishu docx uses the document root block id equal to document_id.
        block_id: documentID,
      },
      data: {
        children: batch,
      },
    });
    const appended = Array.isArray(created?.data?.children) ? created.data.children : [];
    createdChildren.push(...appended);
  }

  return createdChildren;
}

module.exports = {
  FEISHU_DOCX_APPEND_BATCH_LIMIT,
  appendDocChildrenInBatches,
};
