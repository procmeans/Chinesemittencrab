# Feishu Quoted Context Design

## Goal

When a user sends a quoted reply in a Feishu group, the bot should receive the quoted message body as part of the prompt context so follow-ups like "继续" and "扩展这个" stay grounded.

## Current Root Cause

`im.message.receive_v1` only feeds the current message body into the prompt. In real quoted replies, Feishu sends the new text in `message.content` and keeps the referenced message relationship in `parent_id` and `root_id`. Because the bot never resolves the referenced message, it loses the quoted content.

## Recommended Approach

Resolve at most one referenced message per incoming event.

1. Read `parent_id` first, then fall back to `root_id`.
2. Fetch that referenced message with `client.im.v1.message.get`.
3. Parse the referenced message body into plain text for `text` and `post` messages, with lightweight placeholders for other message types.
4. Prepend the resolved content to the Codex input as:
   - `引用消息：...`
   - `当前消息：...`
5. Mirror the same compact summary into conversation history so later turns stay coherent.

## Why One Layer First

One layer matches what the user visually replied to, keeps the change small, and avoids ballooning prompts with long reply chains. If this still proves too shallow, we can extend the helper to walk multiple ancestors later.

## Error Handling

- If the referenced message cannot be fetched, continue with the current message only.
- If the referenced message is empty or unsupported, do not block the reply.
- Log whether quoted context was attached so runtime verification is visible in bot logs.

## Testing

- Add unit tests for resolving the referenced message id, fetching and parsing referenced text, and composing the final prompt text.
- Run the focused unit test first to watch it fail.
- Run the focused unit test again after implementation.
- Run existing related regression tests and a bot `--dry-run`.
