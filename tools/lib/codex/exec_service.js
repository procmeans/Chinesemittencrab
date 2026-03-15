const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const {
  bootstrapCodexHomeAuth,
} = require('./codex_home');
const {
  buildCodexPrompt,
  buildCodexResumePrompt,
} = require('./prompt_builder');

function compactText(raw, maxLength = 2000) {
  const text = String(raw || '').replace(/\r/g, '').trim();
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}\n...(已截断)`;
}

function shouldBypassCodexSandbox(sandbox, approvalPolicy) {
  return String(sandbox || '').trim() === 'danger-full-access'
    && String(approvalPolicy || '').trim() === 'never';
}

function runCodexExec({
  bin,
  model,
  reasoningEffort,
  profile,
  cwd,
  addDirs = [],
  sandbox,
  approvalPolicy,
  apiKey = '',
  codexHome = '',
  prompt,
  imagePaths = [],
  resumeSessionId = '',
  onSpawn = null,
  onEvent = null,
}) {
  return new Promise((resolve, reject) => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'feishu-codex-'));
    const outputFile = path.join(tempDir, 'last-message.txt');

    const resumeId = String(resumeSessionId || '').trim();
    const bypassSandbox = shouldBypassCodexSandbox(sandbox, approvalPolicy);
    const args = resumeId
      ? ['exec', 'resume', '--skip-git-repo-check', '--json']
      : ['exec', '--skip-git-repo-check', '--json'];

    if (bypassSandbox) args.push('--dangerously-bypass-approvals-and-sandbox');
    if (model) args.push('-m', model);
    if (reasoningEffort) args.push('-c', `model_reasoning_effort=\"${reasoningEffort}\"`);
    if (!resumeId && profile) args.push('-p', profile);
    if (!resumeId && cwd) args.push('-C', cwd);
    if (!resumeId) {
      for (const dir of addDirs || []) {
        if (!String(dir || '').trim()) continue;
        args.push('--add-dir', dir);
      }
    }
    if (!resumeId && sandbox && !bypassSandbox) args.push('-s', sandbox);
    if (approvalPolicy && !bypassSandbox) args.push('-c', `approval_policy=\"${approvalPolicy}\"`);
    for (const imagePath of imagePaths || []) {
      if (!String(imagePath || '').trim()) continue;
      args.push('-i', imagePath);
    }
    args.push('--output-last-message', outputFile);
    if (resumeId) args.push(resumeId);
    args.push('-');

    const childEnv = { ...process.env };
    const resolvedApiKey = String(apiKey || '').trim();
    if (resolvedApiKey) {
      childEnv.OPENAI_API_KEY = resolvedApiKey;
      childEnv.CODEX_API_KEY = resolvedApiKey;
    }
    const resolvedCodexHome = String(codexHome || '').trim();
    if (resolvedCodexHome) {
      fs.mkdirSync(resolvedCodexHome, { recursive: true });
      bootstrapCodexHomeAuth({ codexHome: resolvedCodexHome });
      childEnv.CODEX_HOME = resolvedCodexHome;
    }

    const child = spawn(bin, args, {
      cwd: cwd || process.cwd(),
      env: childEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (typeof onSpawn === 'function') {
      try {
        onSpawn(child);
      } catch (_) {
        // ignore spawn hook errors
      }
    }

    let stderr = '';
    let stdout = '';
    let stdoutJsonBuffer = '';
    let observedThreadId = resumeId;

    function emitEvent(evt) {
      if (!onEvent) return;
      try {
        onEvent(evt);
      } catch (_) {
        // ignore progress callback errors
      }
    }

    function flushJsonLine(line) {
      const trimmed = String(line || '').trim();
      if (!trimmed) return;
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed?.type === 'thread.started' && parsed?.thread_id) {
          observedThreadId = String(parsed.thread_id || '').trim() || observedThreadId;
        }
        emitEvent(parsed);
      } catch (_) {
        emitEvent({ type: 'raw', text: trimmed });
      }
    }

    child.stdout.on('data', (buf) => {
      const chunk = String(buf || '');
      if (!chunk) return;
      stdout = `${stdout}${chunk}`;
      if (stdout.length > 4000) stdout = stdout.slice(-4000);
      stdoutJsonBuffer = `${stdoutJsonBuffer}${chunk}`;
      let idx = stdoutJsonBuffer.indexOf('\n');
      while (idx >= 0) {
        const line = stdoutJsonBuffer.slice(0, idx);
        stdoutJsonBuffer = stdoutJsonBuffer.slice(idx + 1);
        flushJsonLine(line);
        idx = stdoutJsonBuffer.indexOf('\n');
      }
    });

    child.stderr.on('data', (buf) => {
      const chunk = String(buf || '');
      if (!chunk) return;
      stderr = `${stderr}${chunk}`;
      if (stderr.length > 4000) stderr = stderr.slice(-4000);
    });

    child.on('error', (err) => {
      fs.rmSync(tempDir, { recursive: true, force: true });
      reject(new Error(`codex spawn failed: ${err.message}`));
    });

    child.on('close', (code, signal) => {
      if (stdoutJsonBuffer.trim()) flushJsonLine(stdoutJsonBuffer.trim());

      if (code !== 0) {
        const details = compactText(stderr || stdout || `exit=${code}, signal=${signal || ''}`, 1200);
        fs.rmSync(tempDir, { recursive: true, force: true });
        reject(new Error(`codex exec failed: ${details}`));
        return;
      }

      try {
        const reply = fs.readFileSync(outputFile, 'utf8');
        fs.rmSync(tempDir, { recursive: true, force: true });
        resolve({
          reply,
          threadId: observedThreadId,
        });
      } catch (err) {
        fs.rmSync(tempDir, { recursive: true, force: true });
        reject(new Error(`read codex output failed: ${err.message}`));
      }
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });
}

async function generateCodexReply({
  codex,
  history,
  userText,
  imagePaths = [],
  sessionId = '',
  threadTitle = '',
  onSpawn = null,
  onProgressEvent = null,
  readThreadExecutionPolicy = () => null,
  runExec = null,
  logger = console,
}) {
  let resolvedSessionId = String(sessionId || '').trim();
  const imageCount = Array.isArray(imagePaths) ? imagePaths.length : 0;
  const runExecFn = typeof runExec === 'function'
    ? runExec
    : ({ prompt, resumeSessionId = '' }) => runCodexExec({
      bin: codex.bin,
      model: codex.model,
      reasoningEffort: codex.reasoningEffort,
      profile: codex.profile,
      cwd: codex.cwd,
      addDirs: codex.addDirs,
      apiKey: codex.apiKey,
      codexHome: codex.home,
      sandbox: codex.sandbox,
      approvalPolicy: codex.approvalPolicy,
      prompt,
      imagePaths,
      resumeSessionId,
      onSpawn,
      onEvent: onProgressEvent,
    });

  if (resolvedSessionId) {
    const existingPolicy = readThreadExecutionPolicy(resolvedSessionId);
    const expectedSandboxType = String(codex.sandbox || '').trim();
    const expectedApprovalMode = String(codex.approvalPolicy || '').trim();
    if (
      !existingPolicy
      || (expectedSandboxType && existingPolicy.sandboxType && existingPolicy.sandboxType !== expectedSandboxType)
      || (expectedApprovalMode && existingPolicy.approvalMode && existingPolicy.approvalMode !== expectedApprovalMode)
    ) {
      logger.log?.(`codex_resume_skip thread_id=${resolvedSessionId} reason=policy_mismatch existing_sandbox=${existingPolicy?.sandboxType || '(unknown)'} existing_approval=${existingPolicy?.approvalMode || '(unknown)'} expected_sandbox=${expectedSandboxType || '(none)'} expected_approval=${expectedApprovalMode || '(none)'}`);
      resolvedSessionId = '';
    }
  }

  if (resolvedSessionId) {
    try {
      const resumed = await runExecFn({
        prompt: buildCodexResumePrompt({ userText, imageCount }),
        resumeSessionId: resolvedSessionId,
      });
      return {
        reply: String(resumed?.reply || ''),
        threadId: String(resumed?.threadId || resolvedSessionId),
      };
    } catch (err) {
      logger.error?.(`codex_resume=error thread_id=${resolvedSessionId} message=${err.message}`);
    }
  }

  const fresh = await runExecFn({
    prompt: buildCodexPrompt({
      systemPrompt: codex.systemPrompt,
      history,
      userText,
      imageCount,
      cwd: codex.cwd,
      addDirs: codex.addDirs,
      threadTitle,
    }),
    resumeSessionId: '',
  });

  return {
    reply: String(fresh?.reply || ''),
    threadId: String(fresh?.threadId || ''),
  };
}

module.exports = {
  generateCodexReply,
  runCodexExec,
  shouldBypassCodexSandbox,
};
