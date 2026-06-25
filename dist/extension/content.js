(function () {
  'use strict';

  if (window.__I2PROMPT_CONTENT__) return;
  window.__I2PROMPT_CONTENT__ = true;

  let rootHost = null;
  let shadow = null;
  let activeTab = 'text';

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'I2P_SHOW_LOADING') {
      showLoading(message);
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === 'I2P_SHOW_RESULT') {
      showResult(message.entry, message);
      sendResponse({ ok: true });
    }
  });

  function ensureShadow() {
    if (shadow && rootHost?.isConnected) return shadow;
    rootHost = document.createElement('div');
    rootHost.id = 'i2prompt-root';
    rootHost.style.position = 'fixed';
    rootHost.style.zIndex = '2147483647';
    document.documentElement.appendChild(rootHost);
    shadow = rootHost.attachShadow({ mode: 'open' });
    return shadow;
  }

  function showLoading(meta) {
    const s = ensureShadow();
    activeTab = 'text';
    s.innerHTML = `
      <style>${baseCss()}</style>
      <div class="i2p-backdrop"></div>
      <section class="i2p-panel i2p-loading" role="dialog" aria-label="i2Prompt 正在反推">
        <header class="i2p-head">
          <div>
            <div class="i2p-brand">i2Prompt</div>
            <div class="i2p-sub">${I2P.escapeHtml(meta.providerLabel || '')} · ${I2P.escapeHtml(meta.model || '')}</div>
          </div>
          <button class="i2p-icon-btn" data-close title="关闭">×</button>
        </header>
        <div class="i2p-progress">
          <div class="i2p-ring"></div>
          <div>
            <div class="i2p-title">正在反推图片</div>
            <div class="i2p-muted" data-timer>已等待 0 秒</div>
          </div>
        </div>
        <div class="i2p-preview-row">
          ${meta.imageUrl ? `<img class="i2p-thumb" src="${I2P.escapeHtml(meta.imageUrl)}" alt="">` : ''}
          <div class="i2p-hint">完成后会自动复制提示词，不需要额外操作。</div>
        </div>
      </section>
    `;
    bindClose();
    startTimer();
  }

  function showResult(entry, message) {
    const s = ensureShadow();
    const isError = entry?.isError === true;
    const quotaHtml = entry?.quota?.label ? `<span class="i2p-pill good">${I2P.escapeHtml(entry.quota.label)}</span>` : '';
    const statusHtml = isError
      ? '<span class="i2p-pill danger">请求失败</span>'
      : '<span class="i2p-pill">已完成</span>';

    s.innerHTML = `
      <style>${baseCss()}</style>
      <div class="i2p-backdrop"></div>
      <section class="i2p-panel" role="dialog" aria-label="i2Prompt 结果">
        <header class="i2p-head">
          <div>
            <div class="i2p-brand">i2Prompt</div>
            <div class="i2p-sub">${I2P.escapeHtml(entry?.providerLabel || '')} · ${I2P.escapeHtml(entry?.model || '')}</div>
          </div>
          <button class="i2p-icon-btn" data-close title="关闭">×</button>
        </header>
        <div class="i2p-meta">
          ${statusHtml}
          ${quotaHtml}
          ${entry?.elapsedMs ? `<span class="i2p-pill">${Math.round(entry.elapsedMs / 1000)}s</span>` : ''}
          <span class="i2p-copy-state" data-copy-state></span>
        </div>
        <nav class="i2p-tabs">
          <button class="active" data-tab="text">文字</button>
          <button data-tab="json">JSON</button>
        </nav>
        <main class="i2p-body">
          <pre data-view="text"></pre>
          <pre data-view="json" hidden></pre>
        </main>
        <footer class="i2p-foot">
          <button class="i2p-btn ghost" data-copy="text">复制文字</button>
          <button class="i2p-btn ghost" data-copy="json">复制 JSON</button>
          <button class="i2p-btn primary" data-copy="all">复制全部</button>
        </footer>
      </section>
    `;

    s.querySelector('[data-view="text"]').textContent = entry?.textPrompt || '(无结果)';
    s.querySelector('[data-view="json"]').textContent = entry?.jsonPrompt || '(无 JSON 数据)';

    bindClose();
    bindTabs();
    bindCopy(entry);

    if (!isError && message?.autoCopy) {
      copyText(I2P.formatCopyPayload(entry, message.copyMode || 'text')).then((ok) => {
        setCopyState(ok ? '已自动复制' : '自动复制失败');
        showToast(ok ? '已自动复制提示词' : '自动复制失败，请手动复制');
      });
    }
  }

  function bindClose() {
    shadow.querySelectorAll('[data-close], .i2p-backdrop').forEach((node) => {
      node.addEventListener('click', closeOverlay);
    });
  }

  function bindTabs() {
    shadow.querySelectorAll('[data-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        activeTab = button.dataset.tab;
        shadow.querySelectorAll('[data-tab]').forEach((item) => item.classList.toggle('active', item === button));
        shadow.querySelector('[data-view="text"]').hidden = activeTab !== 'text';
        shadow.querySelector('[data-view="json"]').hidden = activeTab !== 'json';
      });
    });
  }

  function bindCopy(entry) {
    shadow.querySelectorAll('[data-copy]').forEach((button) => {
      button.addEventListener('click', async () => {
        const ok = await copyText(I2P.formatCopyPayload(entry, button.dataset.copy));
        setCopyState(ok ? '已复制' : '复制失败');
        showToast(ok ? '已复制' : '复制失败，请手动选择文本');
      });
    });
  }

  function setCopyState(text) {
    const el = shadow?.querySelector('[data-copy-state]');
    if (el) el.textContent = text;
  }

  function startTimer() {
    const timer = shadow.querySelector('[data-timer]');
    const start = Date.now();
    const id = setInterval(() => {
      if (!rootHost?.isConnected || !timer?.isConnected) {
        clearInterval(id);
        return;
      }
      const seconds = Math.floor((Date.now() - start) / 1000);
      timer.textContent = seconds < 20
        ? `已等待 ${seconds} 秒`
        : `模型仍在处理，已等待 ${seconds} 秒`;
    }, 1000);
  }

  function closeOverlay() {
    rootHost?.remove();
    rootHost = null;
    shadow = null;
  }

  async function copyText(text) {
    if (!text) return false;
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        textarea.style.top = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        const ok = document.execCommand('copy');
        textarea.remove();
        return ok;
      } catch (error) {
        return false;
      }
    }
  }

  function showToast(message) {
    const s = ensureShadow();
    const toast = document.createElement('div');
    toast.className = 'i2p-toast';
    toast.textContent = message;
    s.appendChild(toast);
    setTimeout(() => toast.remove(), 2200);
  }

  function baseCss() {
    return `
      :host{all:initial}
      *{box-sizing:border-box}
      .i2p-backdrop{position:fixed;inset:0;background:rgba(10,16,24,.34);backdrop-filter:blur(2px);z-index:2147483646}
      .i2p-panel{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:2147483647;width:min(92vw,680px);max-height:min(86vh,760px);display:flex;flex-direction:column;background:#f8faf9;color:#111827;border:1px solid rgba(17,24,39,.14);border-radius:8px;box-shadow:0 28px 90px rgba(4,8,20,.28);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;overflow:hidden}
      .i2p-loading{width:min(92vw,520px)}
      .i2p-head{display:flex;align-items:center;justify-content:space-between;padding:18px 20px;background:#101820;color:#fff;border-bottom:1px solid rgba(255,255,255,.08)}
      .i2p-brand{font-size:17px;font-weight:800;letter-spacing:0}
      .i2p-sub{margin-top:4px;font-size:12px;color:#a7b5c5}
      .i2p-icon-btn{width:30px;height:30px;border:1px solid rgba(255,255,255,.2);border-radius:6px;background:rgba(255,255,255,.06);color:#dbe6f0;font-size:20px;line-height:24px;cursor:pointer}
      .i2p-icon-btn:hover{background:#ef476f;color:#fff;border-color:#ef476f}
      .i2p-progress{display:flex;align-items:center;gap:16px;padding:22px 22px 12px}
      .i2p-ring{width:38px;height:38px;border-radius:999px;border:3px solid #d8ede9;border-top-color:#16a085;animation:i2p-spin .8s linear infinite}
      .i2p-title{font-size:16px;font-weight:750}
      .i2p-muted,.i2p-hint{font-size:12px;color:#667085;line-height:1.6}
      .i2p-preview-row{display:flex;gap:14px;align-items:center;padding:0 22px 22px}
      .i2p-thumb{width:82px;height:62px;object-fit:cover;border-radius:7px;border:1px solid #d6dde5;background:#fff}
      .i2p-meta{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:14px 18px 0}
      .i2p-pill{display:inline-flex;align-items:center;height:24px;padding:0 9px;border-radius:999px;background:#e8eef5;color:#3b4655;font-size:12px;font-weight:650}
      .i2p-pill.good{background:#def7ec;color:#047857}
      .i2p-pill.danger{background:#ffe4e6;color:#be123c}
      .i2p-copy-state{font-size:12px;color:#16a085;font-weight:700}
      .i2p-tabs{display:flex;gap:18px;padding:12px 18px 0;border-bottom:1px solid #d9e0e7}
      .i2p-tabs button{appearance:none;border:0;background:transparent;color:#667085;font:700 13px inherit;padding:0 0 10px;cursor:pointer;border-bottom:2px solid transparent}
      .i2p-tabs button.active{color:#101820;border-bottom-color:#16a085}
      .i2p-body{margin:14px 18px 0;border:1px solid #d9e0e7;border-radius:8px;background:#fff;min-height:260px;max-height:430px;overflow:auto}
      .i2p-body pre{margin:0;padding:16px 18px;white-space:pre-wrap;word-break:break-word;font:13px/1.75 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;color:#253041}
      .i2p-body pre[data-view=json]{font-family:"SF Mono",Consolas,Menlo,monospace;color:#475467}
      .i2p-foot{display:flex;gap:10px;padding:14px 18px 18px}
      .i2p-btn{height:38px;border-radius:7px;padding:0 14px;font:750 13px inherit;cursor:pointer}
      .i2p-btn.ghost{background:#fff;color:#344054;border:1px solid #d0d7de}
      .i2p-btn.ghost:hover{border-color:#16a085;color:#0f766e}
      .i2p-btn.primary{margin-left:auto;background:#101820;color:#fff;border:1px solid #101820}
      .i2p-btn.primary:hover{background:#16a085;border-color:#16a085}
      .i2p-toast{position:fixed;left:50%;top:22px;transform:translateX(-50%);z-index:2147483647;background:#101820;color:#fff;border-radius:8px;padding:10px 16px;font:700 13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;box-shadow:0 14px 44px rgba(4,8,20,.24)}
      @keyframes i2p-spin{to{transform:rotate(360deg)}}
    `;
  }
})();
