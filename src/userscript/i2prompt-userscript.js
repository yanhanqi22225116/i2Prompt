(function () {
  'use strict';

  const STORE_CONFIG = 'i2prompt.config';
  const STORE_SETTINGS = 'i2prompt.settings';
  const STORE_HISTORY = 'i2prompt.history';

  let menuEl = null;
  let targetImage = null;
  let rootHost = null;
  let shadow = null;

  init();

  function init() {
    GM_registerMenuCommand('i2Prompt 设置', showSettings);
    GM_registerMenuCommand('i2Prompt 清空历史', () => gmSet(STORE_HISTORY, []));

    document.addEventListener('contextmenu', (event) => {
      const img = event.target?.closest?.('img');
      if (!img?.src) return;
      targetImage = img;
      event.preventDefault();
      showMenu(event.clientX, event.clientY);
    }, true);

    document.addEventListener('click', () => closeMenu(), true);
  }

  function getConfig() {
    return {
      ...I2P.makeDefaultConfig(),
      ...gmGet(STORE_CONFIG, {})
    };
  }

  function getSettings() {
    return {
      ...I2P.DEFAULT_SETTINGS,
      ...gmGet(STORE_SETTINGS, {})
    };
  }

  function showMenu(x, y) {
    closeMenu();
    menuEl = document.createElement('div');
    menuEl.textContent = 'i2Prompt 反推图片';
    menuEl.style.cssText = [
      'position:fixed',
      `left:${x}px`,
      `top:${y}px`,
      'z-index:2147483647',
      'background:#101820',
      'color:#fff',
      'border:1px solid rgba(255,255,255,.18)',
      'border-radius:8px',
      'padding:10px 14px',
      'font:700 13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      'box-shadow:0 18px 54px rgba(0,0,0,.24)',
      'cursor:pointer'
    ].join(';');
    menuEl.addEventListener('click', (event) => {
      event.stopPropagation();
      const src = targetImage?.currentSrc || targetImage?.src;
      closeMenu();
      if (src) reverseImage(src);
    });
    document.documentElement.appendChild(menuEl);
  }

  function closeMenu() {
    menuEl?.remove();
    menuEl = null;
  }

  async function reverseImage(srcUrl) {
    const config = getConfig();
    const settings = getSettings();
    const provider = I2P.providerOf(config);
    showLoading(provider, config);

    try {
      const image = await prepareImage(srcUrl, config);
      const language = settings.defaultLanguage || 'zh';
      const req = I2P.buildApiRequest({
        ...config,
        systemPrompt: getPromptFromSettings(settings, language) || config.systemPrompt
      }, image, language);
      const response = await gmRequest(req);
      if (response.status < 200 || response.status >= 300) {
        const err = response.data?.error?.message || response.data?.message || response.responseText || response.statusText;
        throw new Error(`API 请求失败：${err}`);
      }
      const parsed = I2P.parseApiResponse(response.data, req.parser);
      if (!parsed.text_prompt && !parsed.json_prompt) {
        throw new Error(response.data?.error?.message || response.data?.message || '模型没有返回有效内容，请确认模型支持图片推理。');
      }
      const quota = settings.showQuota === false || !provider.quotaHeader ? null : readQuota(response.headers, provider.quotaHeader);
      const entry = {
        id: String(Date.now()),
        timestamp: new Date().toISOString(),
        provider: config.provider,
        providerLabel: provider.label,
        model: config.model,
        imageUrl: I2P.isHttpUrl(srcUrl) ? srcUrl : '',
        textPrompt: parsed.text_prompt,
        jsonPrompt: parsed.json_prompt,
        rawText: parsed.raw,
        quota,
        isError: false
      };
      saveHistory(entry, settings.historyLimit);
      showResult(entry, settings);
    } catch (error) {
      const entry = {
        id: String(Date.now()),
        timestamp: new Date().toISOString(),
        provider: config.provider,
        providerLabel: provider.label,
        model: config.model,
        imageUrl: I2P.isHttpUrl(srcUrl) ? srcUrl : '',
        textPrompt: `[错误] ${error.message || String(error)}`,
        jsonPrompt: '',
        rawText: '',
        quota: null,
        isError: true
      };
      saveHistory(entry, settings.historyLimit);
      showResult(entry, settings);
    }
  }

  function getPromptFromSettings(settings, language) {
    if (language === 'en') return String(settings.promptEn || '').trim();
    return String(settings.promptZh || '').trim();
  }

  async function prepareImage(srcUrl, config) {
    const provider = I2P.providerOf(config);
    if (provider.id === 'modelscope') {
      if (!I2P.isHttpUrl(srcUrl)) throw new Error('ModelScope 当前仅支持公网图片 URL');
      return { url: srcUrl };
    }
    if (I2P.isDataUrl(srcUrl)) return { dataUrl: srcUrl };
    if (provider.endpointMode === 'gemini' || config.imageMode === 'base64' || !provider.supportsUrl) {
      return { dataUrl: await imageUrlToDataUrl(srcUrl) };
    }
    return { url: srcUrl };
  }

  function gmRequest(req) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'POST',
        url: req.url,
        headers: req.headers,
        data: JSON.stringify(req.body),
        responseType: 'json',
        onload: (res) => {
          let data = res.response;
          if (!data && res.responseText) {
            try { data = JSON.parse(res.responseText); } catch (_) { data = { text: res.responseText }; }
          }
          resolve({
            status: res.status,
            statusText: res.statusText,
            responseText: res.responseText,
            data,
            headers: parseResponseHeaders(res.responseHeaders || '')
          });
        },
        onerror: () => reject(new Error('网络请求失败'))
      });
    });
  }

  function imageUrlToDataUrl(srcUrl) {
    if (I2P.isDataUrl(srcUrl)) return Promise.resolve(srcUrl);
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: srcUrl,
        responseType: 'blob',
        onload: (res) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error('图片读取失败'));
          reader.readAsDataURL(res.response);
        },
        onerror: () => reject(new Error('图片读取失败'))
      });
    });
  }

  function parseResponseHeaders(raw) {
    const headers = {};
    String(raw || '').split(/\r?\n/).forEach((line) => {
      const idx = line.indexOf(':');
      if (idx <= 0) return;
      headers[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim();
    });
    return headers;
  }

  function readQuota(headers, name) {
    const value = headers[String(name).toLowerCase()];
    return value ? { modelRemaining: value, label: `本模型剩余 ${value} 次` } : null;
  }

  function saveHistory(entry, limit) {
    const history = gmGet(STORE_HISTORY, []);
    history.unshift(entry);
    history.length = Math.min(history.length, Number(limit || 50));
    gmSet(STORE_HISTORY, history);
  }

  function ensureShadow() {
    if (shadow && rootHost?.isConnected) return shadow;
    rootHost = document.createElement('div');
    rootHost.id = 'i2prompt-userscript-root';
    rootHost.style.position = 'fixed';
    rootHost.style.zIndex = '2147483647';
    document.documentElement.appendChild(rootHost);
    shadow = rootHost.attachShadow({ mode: 'open' });
    return shadow;
  }

  function showLoading(provider, config) {
    const s = ensureShadow();
    s.innerHTML = `<style>${modalCss()}</style><div class="back"></div><section class="panel small"><header><b>i2Prompt</b><button data-close>×</button></header><div class="loading"><span></span><div><strong>正在反推图片</strong><p>${I2P.escapeHtml(provider.label)} · ${I2P.escapeHtml(config.model)}</p></div></div></section>`;
    bindClose();
  }

  function showResult(entry, settings) {
    const s = ensureShadow();
    s.innerHTML = `<style>${modalCss()}</style><div class="back"></div><section class="panel"><header><div><b>i2Prompt</b><p>${I2P.escapeHtml(entry.providerLabel)} · ${I2P.escapeHtml(entry.model)}</p></div><button data-close>×</button></header><div class="quota">${entry.quota?.label ? I2P.escapeHtml(entry.quota.label) : ''}</div><pre></pre><footer><button data-copy="text">复制文字</button><button data-copy="all">复制全部</button></footer></section>`;
    s.querySelector('pre').textContent = entry.textPrompt || '(无结果)';
    bindClose();
    s.querySelectorAll('[data-copy]').forEach((button) => {
      button.addEventListener('click', () => copy(I2P.formatCopyPayload(entry, button.dataset.copy)));
    });
    if (!entry.isError && settings.autoCopy) copy(I2P.formatCopyPayload(entry, settings.copyMode || 'text'));
  }

  function showSettings() {
    const config = getConfig();
    const settings = getSettings();
    const s = ensureShadow();
    s.innerHTML = `<style>${modalCss()}</style><div class="back"></div><section class="panel settings"><header><b>i2Prompt 设置</b><button data-close>×</button></header><label>供应商<select id="p">${I2P.providerOptionsHtml(config.provider)}</select></label><label>API Base<input id="base" value="${I2P.escapeHtml(config.apiBase || '')}"></label><label>API Key<input id="key" type="password" value="${I2P.escapeHtml(config.apiKey || '')}"></label><label>模型<input id="model" value="${I2P.escapeHtml(config.model || '')}"></label><label>默认语言<select id="lang"><option value="zh">中文</option><option value="en">English</option></select></label><label class="check"><input id="auto" type="checkbox"> 自动复制</label><footer><button id="save" class="primary">保存</button></footer></section>`;
    s.getElementById('lang').value = settings.defaultLanguage || 'zh';
    s.getElementById('auto').checked = settings.autoCopy !== false;
    s.getElementById('p').addEventListener('change', () => {
      const provider = I2P.PROVIDERS[s.getElementById('p').value];
      s.getElementById('base').value = provider.apiBase;
      s.getElementById('model').value = provider.model;
    });
    s.getElementById('save').addEventListener('click', () => {
      const provider = I2P.PROVIDERS[s.getElementById('p').value] || I2P.PROVIDERS.modelscope;
      gmSet(STORE_CONFIG, {
        ...config,
        provider: provider.id,
        apiBase: s.getElementById('base').value.trim(),
        apiKey: s.getElementById('key').value.trim(),
        model: s.getElementById('model').value.trim(),
        imageMode: provider.imageMode,
        detail: 'high'
      });
      gmSet(STORE_SETTINGS, {
        ...settings,
        defaultLanguage: s.getElementById('lang').value,
        autoCopy: s.getElementById('auto').checked,
        screenshotEnabled: false
      });
      closeModal();
    });
    bindClose();
  }

  function bindClose() {
    shadow.querySelectorAll('[data-close], .back').forEach((node) => node.addEventListener('click', closeModal));
  }

  function closeModal() {
    rootHost?.remove();
    rootHost = null;
    shadow = null;
  }

  function copy(text) {
    if (typeof GM_setClipboard === 'function') GM_setClipboard(text);
    else navigator.clipboard?.writeText(text);
  }

  function gmGet(key, fallback) {
    try {
      return GM_getValue(key, fallback);
    } catch (_) {
      return fallback;
    }
  }

  function gmSet(key, value) {
    GM_setValue(key, value);
  }

  function modalCss() {
    return `
      *{box-sizing:border-box} .back{position:fixed;inset:0;background:rgba(10,16,24,.34);z-index:2147483646}
      .panel{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:2147483647;width:min(92vw,640px);max-height:82vh;display:flex;flex-direction:column;background:#f8faf9;color:#101820;border:1px solid rgba(16,24,32,.14);border-radius:8px;box-shadow:0 28px 90px rgba(4,8,20,.28);font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;overflow:hidden}
      .panel.small{width:min(92vw,460px)} header{display:flex;align-items:center;justify-content:space-between;background:#101820;color:#fff;padding:16px 18px} header p{margin:3px 0 0;color:#a7b5c5;font-size:12px} header button{width:30px;height:30px;border:1px solid rgba(255,255,255,.2);border-radius:6px;background:rgba(255,255,255,.08);color:#fff;font-size:20px;cursor:pointer}
      .loading{display:flex;align-items:center;gap:14px;padding:24px}.loading span{width:34px;height:34px;border-radius:99px;border:3px solid #d8ede9;border-top-color:#16a085;animation:spin .8s linear infinite}.loading p{margin:4px 0 0;color:#667085}
      .quota{padding:12px 18px 0;color:#047857;font-weight:800} pre{margin:14px 18px;border:1px solid #d9e0e7;border-radius:8px;background:#fff;padding:16px;overflow:auto;white-space:pre-wrap;word-break:break-word;min-height:240px;font:13px/1.7 inherit} footer{display:flex;gap:10px;padding:0 18px 18px} footer button{height:36px;border:1px solid #d0d7de;border-radius:7px;background:#fff;color:#101820;font-weight:800;padding:0 12px;cursor:pointer}.primary,footer button.primary{margin-left:auto;background:#16a085;color:#fff;border-color:#16a085}
      .settings{gap:12px;padding-bottom:18px}.settings label{display:grid;gap:6px;margin:0 18px;color:#344054;font-weight:800}.settings input,.settings select{height:38px;border:1px solid #d9e0e7;border-radius:7px;padding:0 10px;font:inherit}.settings .check{display:flex;align-items:center;gap:8px}.settings .check input{width:16px;height:16px}@keyframes spin{to{transform:rotate(360deg)}}
    `;
  }
})();
