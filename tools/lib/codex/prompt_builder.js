const {
  FEISHU_SEND_CHAT_DIRECTIVE_PREFIX,
  FEISHU_SEND_FILE_DIRECTIVE_PREFIX,
  FEISHU_SEND_IMAGE_DIRECTIVE_PREFIX,
} = require('../feishu_reply_directives');

function compactText(raw, maxLength = 2000) {
  const text = String(raw || '').replace(/\r/g, '').trim();
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}\n...(已截断)`;
}

function formatBytes(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = value;
  let idx = 0;
  while (size >= 1024 && idx < units.length - 1) {
    size /= 1024;
    idx += 1;
  }
  const digits = idx === 0 || size >= 10 ? 0 : 1;
  return `${size.toFixed(digits)} ${units[idx]}`;
}

function buildCodexPrompt({
  systemPrompt = '',
  defaultSystemPrompt = '',
  history,
  userText,
  imageCount = 0,
  cwd = '',
  addDirs = [],
  threadTitle = '',
  imageUploadLimitBytes = 10 * 1024 * 1024,
  fileUploadLimitBytes = 30 * 1024 * 1024,
}) {
  const lines = [];
  const title = String(threadTitle || '').trim();
  if (title) {
    lines.push(title);
    lines.push('');
  }
  lines.push(systemPrompt || defaultSystemPrompt);
  lines.push('');
  lines.push(`当前工作目录：${cwd || process.cwd()}`);
  if (Array.isArray(addDirs) && addDirs.length > 0) {
    lines.push('额外可访问工作目录：');
    for (const dir of addDirs) {
      lines.push(`- ${dir}`);
    }
  }
  lines.push('');
  lines.push('对话上下文（按时间顺序，可能为空）：');
  if (!history || history.length === 0) {
    lines.push('(无)');
  } else {
    for (const item of history) {
      const roleLabel = item.role === 'assistant' ? '助手' : '用户';
      lines.push(`[${roleLabel}] ${compactText(item.text, 1200)}`);
    }
  }
  lines.push('');
  lines.push('用户最新消息：');
  lines.push(compactText(userText, 2000));
  if (imageCount > 0) {
    lines.push(`附加图片：${imageCount} 张（请结合图片内容回答）。`);
  }
  lines.push('');
  lines.push('请直接输出给用户的最终回复正文，不要加“好的/收到”等空话，不要复述用户原文。');
  lines.push('禁止输出“稍后回复/几分钟后回复/晚点再回复”这类承诺。无法完成就直接说明卡点和下一步。');
  lines.push('如果 SSH、curl、nc 或其他网络命令失败，不要直接归因于“当前会话不能联网”或“网络策略拦截”。先报告原始报错，再用更小的连通性探测复核后再下结论。');
  lines.push(`如果你需要机器人把本机图片直接发给用户，请在回复中单独占行输出：${FEISHU_SEND_IMAGE_DIRECTIVE_PREFIX}/绝对或相对路径]]`);
  lines.push(`如果你需要机器人把本机文件直接发给用户，请在回复中单独占行输出：${FEISHU_SEND_FILE_DIRECTIVE_PREFIX}/绝对或相对路径]]`);
  lines.push(`如果用户明确要求把最终普通文本结果发送到另一个飞书群，请在回复中单独占行输出：${FEISHU_SEND_CHAT_DIRECTIVE_PREFIX}群名]]`);
  lines.push('使用该指令时只写群名，不要写 chat_id；第一版仅用于最终普通文本，不要和附件或图片指令混用。');
  lines.push('可以输出多行，每行一个附件。除这些指令外，其他文字都会作为正常回复发送给用户。');
  lines.push(`发送图片前请确认文件真实存在、格式受支持，且大小不超过 ${formatBytes(imageUploadLimitBytes)}。`);
  lines.push(`发送文件前请确认文件真实存在、不是目录，且大小不超过 ${formatBytes(fileUploadLimitBytes)}。`);
  lines.push('如果用户发送了文件，消息正文里会给出本地临时文件路径；需要时请直接读取该文件。');
  return lines.join('\n');
}

function buildCodexResumePrompt({ userText, imageCount = 0 }) {
  const lines = [];
  lines.push('继续当前线程。下面是用户最新消息，请直接回复用户。');
  lines.push('');
  lines.push('用户最新消息：');
  lines.push(compactText(userText, 2000));
  if (imageCount > 0) {
    lines.push(`附加图片：${imageCount} 张（请结合图片内容回答）。`);
  }
  lines.push('');
  lines.push('请直接输出给用户的最终回复正文，不要加“好的/收到”等空话，不要复述用户原文。');
  lines.push('禁止输出“稍后回复/几分钟后回复/晚点再回复”这类承诺。无法完成就直接说明卡点和下一步。');
  lines.push('如果 SSH、curl、nc 或其他网络命令失败，不要直接归因于“当前会话不能联网”或“网络策略拦截”。先报告原始报错，再用更小的连通性探测复核后再下结论。');
  lines.push(`如果你需要机器人把本机图片直接发给用户，请在回复中单独占行输出：${FEISHU_SEND_IMAGE_DIRECTIVE_PREFIX}/绝对或相对路径]]`);
  lines.push(`如果你需要机器人把本机文件直接发给用户，请在回复中单独占行输出：${FEISHU_SEND_FILE_DIRECTIVE_PREFIX}/绝对或相对路径]]`);
  lines.push(`如果用户明确要求把最终普通文本结果发送到另一个飞书群，请在回复中单独占行输出：${FEISHU_SEND_CHAT_DIRECTIVE_PREFIX}群名]]`);
  lines.push('使用该指令时只写群名，不要写 chat_id；第一版仅用于最终普通文本，不要和附件或图片指令混用。');
  lines.push('可以输出多行，每行一个附件。除这些指令外，其他文字都会作为正常回复发送给用户。');
  return lines.join('\n');
}

module.exports = {
  buildCodexPrompt,
  buildCodexResumePrompt,
};
