const QUESTION_HINT_RE = /[?？]|(什么|怎么|为什么|为何|为啥|是否|有没有|有无|能不能|可以吗|行吗|哪(里|个|些)?|多少|啥|什么意思|怎么回事|who|what|why|how|when|where|which|can you|could you|is there)/iu;
const TASK_REQUEST_RE = /(帮我|请帮|生成|整理|收集|做成|导出|输出|发送|发到|转发|下载|上传|读取|读一下|分析|总结|扩展|翻译|创建|新建|修改|更新|修复|部署|运行|执行|搜索|搜一下|搜集|写(个|一|一份|一个)?|脚本|代码|pdf|doc|文档|表格|图片|文件|语音|音频|抓取|爬取)/iu;

function isSimpleQuestionInteraction({
  messageType = '',
  text = '',
  imageCount = 0,
  fileCount = 0,
  hasAudio = false,
} = {}) {
  if (String(messageType || '').trim().toLowerCase() !== 'text') return false;
  if (Number(imageCount || 0) > 0 || Number(fileCount || 0) > 0 || Boolean(hasAudio)) return false;

  const raw = String(text || '').replace(/\r/g, '').trim();
  if (!raw) return false;
  if (raw.length > 160) return false;
  if (raw.split('\n').length > 3) return false;
  if (TASK_REQUEST_RE.test(raw)) return false;
  return QUESTION_HINT_RE.test(raw);
}

function createDelayedWaitNotice({
  delayMs = 8000,
  updateIntervalMs = 15000,
  message = '还在思考中，请稍等…',
  sendNotice = async () => '',
  updateNotice = async () => false,
  recallNotice = async () => false,
  schedule = (callback, ms) => setTimeout(callback, ms),
  cancel = (handle) => clearTimeout(handle),
  now = () => Date.now(),
} = {}) {
  const noticeMessage = String(message || '').trim() || '还在思考中，请稍等…';
  let started = false;
  let closed = false;
  let timerHandle = null;
  let messageId = '';
  const startedAt = Number(now()) || Date.now();
  let queue = Promise.resolve();

  function runSerial(task) {
    const next = queue.catch(() => {}).then(task);
    queue = next.catch(() => {});
    return next;
  }

  async function sendIfNeeded() {
    if (closed || messageId) return '';
    const createdId = String(await sendNotice(noticeMessage) || '').trim();
    if (!createdId) return '';
    if (closed) {
      await recallNotice(createdId);
      return '';
    }
    messageId = createdId;
    scheduleNextUpdate();
    return createdId;
  }

  function renderElapsedMessage() {
    const elapsedSec = Math.max(0, Math.floor(((Number(now()) || Date.now()) - startedAt) / 1000));
    return `还在思考中，已等待 ${elapsedSec} 秒…`;
  }

  async function updateIfNeeded() {
    if (closed || !messageId) return false;
    await updateNotice(messageId, renderElapsedMessage());
    if (!closed) scheduleNextUpdate();
    return true;
  }

  function scheduleNextUpdate() {
    if (closed || !messageId) return;
    timerHandle = schedule(() => {
      timerHandle = null;
      return runSerial(updateIfNeeded);
    }, Math.max(1000, Number(updateIntervalMs) || 15000));
  }

  return {
    async start() {
      if (started || closed) return false;
      started = true;
      timerHandle = schedule(() => {
        timerHandle = null;
        return runSerial(sendIfNeeded);
      }, Math.max(0, Number(delayMs) || 0));
      return true;
    },
    async dismiss() {
      if (closed) return false;
      closed = true;
      if (timerHandle) {
        cancel(timerHandle);
        timerHandle = null;
      }
      await queue.catch(() => {});
      if (!messageId) return false;
      const target = messageId;
      messageId = '';
      return recallNotice(target);
    },
  };
}

module.exports = {
  createDelayedWaitNotice,
  isSimpleQuestionInteraction,
};
