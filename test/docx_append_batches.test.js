const test = require('node:test');
const assert = require('node:assert/strict');

const { appendDocChildrenInBatches } = require('../tools/lib/docx_append_batches');

test('appendDocChildrenInBatches splits children into batches of 50 and preserves order', async () => {
  const calls = [];
  const client = {
    docx: {
      documentBlockChildren: {
        create: async ({ path, data }) => {
          calls.push({
            documentID: path.document_id,
            blockID: path.block_id,
            count: data.children.length,
            first: data.children[0]?.id,
            last: data.children[data.children.length - 1]?.id,
          });
          return {
            data: {
              children: data.children.map((child) => ({ block_id: `created-${child.id}` })),
            },
          };
        },
      },
    },
  };

  const blocks = Array.from({ length: 120 }, (_, index) => ({ id: index + 1 }));
  const created = await appendDocChildrenInBatches(client, 'doc-1', blocks);

  assert.equal(calls.length, 3);
  assert.deepEqual(calls.map((call) => call.count), [50, 50, 20]);
  assert.deepEqual(calls.map((call) => [call.first, call.last]), [[1, 50], [51, 100], [101, 120]]);
  assert.equal(created.length, 120);
  assert.deepEqual(created.slice(0, 3), [
    { block_id: 'created-1' },
    { block_id: 'created-2' },
    { block_id: 'created-3' },
  ]);
});
