# Feishu Group Name Routing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Feishu bot capability that resolves a target group by human-readable name and sends the final plain-text result to that group.

**Architecture:** Extend the existing “model emits internal directives, runtime executes them” flow with a new target-chat directive, resolve the group name through `im.v1.chat.search`, then route the final plain-text reply to the resolved `chat_id` while keeping the source chat limited to a completion notice.

**Tech Stack:** Node.js, existing `@larksuiteoapi/node-sdk`, existing Feishu bot runtime, `node:test`

---

### Task 1: Add reply directive parsing tests and minimal target-chat parsing

**Files:**
- Create: `test/feishu_reply_directives.test.js`
- Create: `tools/lib/feishu_reply_directives.js`
- Modify: `tools/feishu_ws_bot.js`

**Step 1: Write the failing test**

Cover:
- extracting plain reply text with no directives
- extracting `[[FEISHU_SEND_FILE:...]]` and `[[FEISHU_SEND_IMAGE:...]]` exactly as today
- extracting one `[[FEISHU_SEND_CHAT:群名]]`
- rejecting multiple target-chat directives

Use a small fixture like:

```js
const raw = [
  '这是最终结果',
  '[[FEISHU_SEND_CHAT:YY专用机器人群]]',
].join('\\n');
```

Expect:
- `text === '这是最终结果'`
- `targetChatName === 'YY专用机器人群'`
- attachments unchanged

**Step 2: Run test to verify it fails**

Run: `node --test /Users/procmeans/Documents/SunCodexClaw/test/feishu_reply_directives.test.js`
Expected: FAIL because `tools/lib/feishu_reply_directives.js` does not exist yet.

**Step 3: Write minimal implementation**

Create `tools/lib/feishu_reply_directives.js` with:
- `FEISHU_SEND_CHAT_DIRECTIVE_PREFIX`
- `extractFeishuReplyDirectives(rawText)`

Return shape:

```js
{
  text: '...',
  attachments: [],
  targetChatName: '',
  targetChatDirectiveError: '',
}
```

Move the current attachment parsing logic into this helper instead of duplicating it.

**Step 4: Run the focused test**

Run: `node --test /Users/procmeans/Documents/SunCodexClaw/test/feishu_reply_directives.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git -C /Users/procmeans/Documents/SunCodexClaw add test/feishu_reply_directives.test.js tools/lib/feishu_reply_directives.js tools/feishu_ws_bot.js
git -C /Users/procmeans/Documents/SunCodexClaw commit -m "feat: parse Feishu target chat directives"
```

### Task 2: Add group-name resolution helper with failing tests

**Files:**
- Create: `tools/lib/feishu_chat_target.js`
- Create: `test/feishu_chat_target.test.js`

**Step 1: Write the failing test**

Cover:
- exact-name match wins over contains match
- a single contains match resolves successfully
- multiple matches return an ambiguity result
- zero matches return a not-found result
- duplicate `chat_id` values are deduplicated

Use a minimal fixture like:

```js
const items = [
  { chat_id: 'oc_1', name: 'YY专用机器人群', chat_status: 'normal' },
  { chat_id: 'oc_2', name: 'YY专用机器人群-备份', chat_status: 'normal' },
];
```

**Step 2: Run test to verify it fails**

Run: `node --test /Users/procmeans/Documents/SunCodexClaw/test/feishu_chat_target.test.js`
Expected: FAIL because `tools/lib/feishu_chat_target.js` does not exist yet.

**Step 3: Write minimal implementation**

Implement:
- `normalizeChatTargetName(name)`
- `pickBestChatMatches(query, items)`
- `resolveTargetChatByName(client, query)`

`resolveTargetChatByName` should call `client.im.v1.chat.search({ params: { query, page_size: 20 } })` and return a normalized result object like:

```js
{ status: 'resolved', chatId: 'oc_xxx', chatName: 'YY专用机器人群' }
```

or

```js
{ status: 'not_found', chatName: 'YY专用机器人群' }
```

or

```js
{ status: 'ambiguous', chatName: 'YY专用机器人群', candidates: [...] }
```

**Step 4: Run the focused test**

Run: `node --test /Users/procmeans/Documents/SunCodexClaw/test/feishu_chat_target.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git -C /Users/procmeans/Documents/SunCodexClaw add tools/lib/feishu_chat_target.js test/feishu_chat_target.test.js
git -C /Users/procmeans/Documents/SunCodexClaw commit -m "feat: resolve Feishu target chats by name"
```

### Task 3: Wire target-chat routing into the reply pipeline

**Files:**
- Modify: `tools/feishu_ws_bot.js`
- Test: `test/feishu_reply_directives.test.js`
- Test: `test/feishu_chat_target.test.js`

**Step 1: Update prompt instructions**

Extend both prompt builders in `tools/feishu_ws_bot.js` so the model knows:
- when the user wants the final result sent to another Feishu group, output one line like `[[FEISHU_SEND_CHAT:群名]]`
- only the plain-text final result should be routed
- do not output `chat_id`

**Step 2: Integrate directive parsing**

Replace the current attachment-only parsing call with `extractFeishuReplyDirectives(codexRawReply)`.

Handle directive errors first:
- multiple target groups
- empty target group name

**Step 3: Route plain-text replies**

If `targetChatName` exists:
- resolve it through `resolveTargetChatByName`
- on `resolved`, send `userReplyText` to the target `chat_id`
- send `已完成，已发送到 <chatName>` back to the source chat
- do not echo the full reply in the source chat

If `targetChatName` does not exist:
- preserve current behavior

If result is `not_found`:
- source chat replies `未找到群：<chatName>`

If result is `ambiguous`:
- source chat lists the candidates and asks for a more specific name

**Step 4: Run targeted tests**

Run:
- `node --test /Users/procmeans/Documents/SunCodexClaw/test/feishu_reply_directives.test.js`
- `node --test /Users/procmeans/Documents/SunCodexClaw/test/feishu_chat_target.test.js`
- `node --test /Users/procmeans/Documents/SunCodexClaw/test/message_actionability.test.js`
- `node --test /Users/procmeans/Documents/SunCodexClaw/test/mention_carry.test.js`

Expected: PASS

**Step 5: Commit**

```bash
git -C /Users/procmeans/Documents/SunCodexClaw add tools/feishu_ws_bot.js test/feishu_reply_directives.test.js test/feishu_chat_target.test.js
git -C /Users/procmeans/Documents/SunCodexClaw commit -m "feat: route Feishu replies by group name"
```

### Task 4: Add reply-flow coverage for source-chat and target-chat outcomes

**Files:**
- Create: `test/feishu_chat_routing_flow.test.js`
- Modify: `tools/feishu_ws_bot.js`

**Step 1: Write the failing test**

Cover:
- a resolved target chat sends the final text to the target group and only a completion notice to the source group
- an ambiguous target chat sends only the ambiguity prompt to the source group
- a missing target chat sends only the not-found prompt to the source group

Keep the test narrow by stubbing:
- chat resolver result
- `sendTextReply`
- `sendCodexReplyPassthrough`

**Step 2: Run test to verify it fails**

Run: `node --test /Users/procmeans/Documents/SunCodexClaw/test/feishu_chat_routing_flow.test.js`
Expected: FAIL because the routing behavior does not exist yet.

**Step 3: Write minimal implementation**

Extract a small helper if needed, for example:

```js
async function deliverFeishuReply({ client, sourceChatId, targetChatResolution, text })
```

Keep it focused on:
- deciding destination chat
- sending source completion text
- returning a log-friendly summary

**Step 4: Run the focused test**

Run: `node --test /Users/procmeans/Documents/SunCodexClaw/test/feishu_chat_routing_flow.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git -C /Users/procmeans/Documents/SunCodexClaw add test/feishu_chat_routing_flow.test.js tools/feishu_ws_bot.js
git -C /Users/procmeans/Documents/SunCodexClaw commit -m "test: cover Feishu cross-group text routing"
```

### Task 5: Document the new behavior and run final verification

**Files:**
- Modify: `README.md`

**Step 1: Document how to use the feature**

Add a short section that explains:
- user can say “把结果发到 XX 群”
- only plain-text final results are routed in v1
- no match returns `未找到群`
- multiple matches return candidate groups

**Step 2: Run final verification**

Run:
- `node --test /Users/procmeans/Documents/SunCodexClaw/test/feishu_reply_directives.test.js`
- `node --test /Users/procmeans/Documents/SunCodexClaw/test/feishu_chat_target.test.js`
- `node --test /Users/procmeans/Documents/SunCodexClaw/test/feishu_chat_routing_flow.test.js`
- `node --test /Users/procmeans/Documents/SunCodexClaw/test/message_actionability.test.js`
- `node --test /Users/procmeans/Documents/SunCodexClaw/test/mention_carry.test.js`
- `node /Users/procmeans/Documents/SunCodexClaw/tools/feishu_ws_bot.js --account default --dry-run`

Expected:
- all targeted tests pass
- existing regressions stay green
- bot dry-run still succeeds

**Step 3: Commit**

```bash
git -C /Users/procmeans/Documents/SunCodexClaw add README.md
git -C /Users/procmeans/Documents/SunCodexClaw commit -m "docs: explain Feishu group-name routing"
```
