/**
 * Local in-browser LLM chat, powered by WebLLM (vendored) + Qwen small models.
 *
 * Nothing here loads up-front: the 6 MB runtime is dynamic-import'ed and the
 * model weights (hundreds of MB, from huggingface.co) are fetched only after
 * the visitor explicitly runs /load. WebLLM stores the weights in the browser
 * Cache API, so the download happens once per machine. Inference needs WebGPU;
 * without it the panel degrades to an explanatory message and the rest of the
 * page is untouched.
 */

/** f16 halves the download but needs the adapter's shader-f16 feature; on
 *  GPUs without it (e.g. software rasterizers) we fall back to f32 weights. */
const MODELS = [
  {
    f16: 'Qwen3-0.6B-q4f16_1-MLC',
    f32: 'Qwen3-0.6B-q4f32_1-MLC',
    label: 'qwen3-0.6b',
    dl: '约 350 MB',
    vram: '约 1.4 GB',
    note: '默认 · 最小最快',
  },
  {
    f16: 'Qwen3.5-0.8B-q4f16_1-MLC',
    f32: 'Qwen3.5-0.8B-q4f32_1-MLC',
    label: 'qwen3.5-0.8b',
    dl: '约 450 MB',
    vram: '约 1.6 GB',
    note: '更新一代 · 多轮上下文受限',
  },
];

const SYSTEM_PROMPT =
  '你是 idevlab 个人主页内置的本地小助手，基于千问（Qwen）小尺寸模型，完全在访客的浏览器里运行。' +
  '用简体中文简洁回答。你不了解 idevlab 的私人信息，答不了的问题就直说。';

/** Keep at most this many turns; the prebuilt configs cap context at 4k. */
const MAX_HISTORY = 16;

const HELP_LINES = [
  '/load        下载并启动模型（权重仅首次下载，之后走缓存）',
  '/model [n]   查看或切换模型',
  '/clear       清屏并重置对话',
  '/exit        关闭窗口（Esc 同效）',
];

export function initChat() {
  const panel = document.querySelector('#chat-panel');
  const log = document.querySelector('#chat-log');
  const form = document.querySelector('#chat-form');
  const input = document.querySelector('#chat-input');
  const status = document.querySelector('#chat-status');

  let engine = null;
  let worker = null;
  let engineModelId = null;
  let model = MODELS[0];
  let loading = false;
  let busy = false;
  let greeted = false;
  const history = [];

  const hasWebGPU = 'gpu' in navigator;

  /* ---------------------------------------------------------------- log -- */

  function line(cls, text) {
    const n = document.createElement('div');
    n.className = cls;
    n.textContent = text;
    log.append(n);
    log.scrollTop = log.scrollHeight;
    return n;
  }
  const sys = (t) => line('sys', t);
  const err = (t) => line('err', t);

  function setStatus(state, text) {
    status.dataset.state = state;
    status.textContent = text;
  }

  /* --------------------------------------------------------------- open -- */

  function open() {
    panel.hidden = false;
    input.focus();
    if (greeted) return;
    greeted = true;

    sys('webllm 0.2.84 · 模型完全在你的浏览器里运行，对话不会离开这台设备。');
    if (!hasWebGPU) {
      err('此浏览器不支持 WebGPU，本地模型跑不起来。桌面版 Chrome / Edge 113+ 可以；页面其它部分不受影响。');
      setStatus('error', 'no webgpu');
      return;
    }
    sys(`模型：${model.label}（下载 ${model.dl}，运行需 ${model.vram} 显存/内存）`);
    sys('输入 /load 下载并启动 · /model 换型号 · /help 全部命令');
  }

  function close() {
    panel.hidden = true;
  }

  /* --------------------------------------------------------------- load -- */

  /** "Fetching param cache[3/24]: 100MB fetched…" → something readable. */
  function phaseOf(text) {
    if (/param cache|fetch/i.test(text)) return '下载权重';
    if (/loading model from cache/i.test(text)) return '从缓存加载';
    if (/shader|gpu/i.test(text)) return '初始化 GPU';
    return text.slice(0, 40);
  }

  async function load() {
    if (loading) { sys('正在加载中…'); return; }
    loading = true;

    const prog = line('sys', '[--------------------] 0%');
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) throw new Error('WebGPU adapter 不可用（可能被系统或浏览器设置禁用）');
      const modelId = adapter.features.has('shader-f16') ? model.f16 : model.f32;
      if (engine && engineModelId === modelId) {
        prog.remove();
        sys('模型已就绪，直接输入内容对话。');
        return;
      }
      if (modelId === model.f32) sys('此 GPU 不支持 f16，改用 f32 权重（下载体积更大一些）。');

      const { CreateWebWorkerMLCEngine } = await import('../vendor/web-llm.module.js');
      if (engine) { await engine.unload().catch(() => {}); engine = null; engineModelId = null; }
      if (worker) { worker.terminate(); worker = null; }

      // The engine lives in a Worker so generation never freezes the page
      // (the WebGL hero keeps animating while the model thinks).
      worker = new Worker(new URL('./chat-worker.js', import.meta.url), { type: 'module' });
      engine = await CreateWebWorkerMLCEngine(worker, modelId, {
        initProgressCallback: (r) => {
          const p = Math.max(0, Math.min(1, r.progress || 0));
          const filled = Math.round(p * 20);
          prog.textContent =
            `[${'#'.repeat(filled)}${'-'.repeat(20 - filled)}] ${Math.round(p * 100)}% ${phaseOf(r.text || '')}`;
          setStatus('loading', `loading ${Math.round(p * 100)}%`);
          log.scrollTop = log.scrollHeight;
        },
      });
      engineModelId = modelId;
      history.length = 0;
      setStatus('ready', 'ready');
      sys(`模型就绪：${model.label}。权重已缓存，下次免下载。直接输入内容开始对话。`);
    } catch (e) {
      engine = null;
      engineModelId = null;
      setStatus('error', 'error');
      const msg = String(e?.message || e);
      err(`加载失败：${msg}`);
      if (/memory|oom/i.test(msg)) err('看起来是显存不够 — 关掉几个标签页再试，或换台机器。');
      else if (/fetch|network|Failed to/i.test(msg)) err('权重从 huggingface.co 下载，请检查网络后重试 /load。');
    } finally {
      loading = false;
    }
  }

  /* --------------------------------------------------------------- chat -- */

  async function generate(text) {
    busy = true;
    setStatus('busy', 'gen…');
    line('user', text);
    history.push({ role: 'user', content: text });

    const out = line('ai', '');
    const caret = document.createElement('span');
    caret.className = 'cursor';
    out.append(caret);

    try {
      const chunks = await engine.chat.completions.create({
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...history],
        stream: true,
        temperature: 0.7,
        top_p: 0.9,
        // Qwen3 defaults to "thinking" preambles — skip them so replies start
        // immediately; a 0.6B model's visible thoughts add latency, not depth.
        extra_body: { enable_thinking: false },
      });
      let reply = '';
      for await (const c of chunks) {
        const d = c.choices?.[0]?.delta?.content;
        if (!d) continue;
        reply += d;
        caret.before(document.createTextNode(d));
        log.scrollTop = log.scrollHeight;
      }
      history.push({ role: 'assistant', content: reply });
      // Trim old turns, keeping the window aligned to a user message so the
      // template never starts mid-exchange.
      if (history.length > MAX_HISTORY) {
        history.splice(0, history.length - MAX_HISTORY);
        while (history.length && history[0].role !== 'user') history.shift();
      }
      setStatus('ready', 'ready');
    } catch (e) {
      history.pop();
      setStatus('error', 'error');
      err(`生成失败：${String(e?.message || e)}`);
    } finally {
      caret.remove();
      busy = false;
    }
  }

  /* ----------------------------------------------------------- commands -- */

  function listModels() {
    MODELS.forEach((m, i) => {
      const cur = m === model ? ' ←当前' : '';
      sys(`${i + 1}. ${m.label} — 下载 ${m.dl} / 显存 ${m.vram} · ${m.note}${cur}`);
    });
    sys('用 /model 序号 切换，例如 /model 2');
  }

  function switchModel(arg) {
    const next = MODELS[Number(arg) - 1] || MODELS.find((m) => m.label === arg);
    if (!next) { err(`没有这个型号：${arg}`); listModels(); return; }
    model = next;
    const loaded = engineModelId === model.f16 || engineModelId === model.f32;
    sys(`已选择 ${model.label}。${loaded ? '模型已就绪，直接对话。' : engine ? '输入 /load 重新加载。' : '输入 /load 启动。'}`);
  }

  function command(text) {
    const [cmd, arg] = text.slice(1).split(/\s+/);
    switch (cmd) {
      case 'help': HELP_LINES.forEach(sys); break;
      case 'load':
        if (!hasWebGPU) err('此浏览器不支持 WebGPU，无法加载模型。');
        else load();
        break;
      case 'model': arg ? switchModel(arg) : listModels(); break;
      case 'clear':
        log.textContent = '';
        history.length = 0;
        sys(engine ? '已清屏，对话已重置。' : '已清屏。');
        break;
      case 'exit': close(); break;
      default: err(`未知命令：/${cmd} — /help 查看全部命令`);
    }
  }

  /* --------------------------------------------------------------- wire -- */

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    if (text.startsWith('/')) { command(text); return; }
    if (busy) { sys('还在生成上一条 — 稍等。'); return; }
    if (loading) { sys('模型加载中，好了会提示你。'); return; }
    if (!engine) { sys(`模型还没启动 — 先输入 /load（下载 ${model.dl}，只需一次）。`); return; }
    generate(text);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
  document.querySelector('#chat-close').addEventListener('click', close);

  return { open };
}
