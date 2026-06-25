// ==UserScript==
// @name         i2Prompt
// @namespace    https://local.i2prompt
// @version      0.1.1
// @description  网页图片右键反推 AI 绘画提示词，并自动复制结果。
// @match        http://*/*
// @match        https://*/*
// @run-at       document-end
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_setClipboard
// @grant        GM_registerMenuCommand
// @connect      *
// ==/UserScript==

(function (global) {
  'use strict';

  const VERSION = '0.1.1';

  const PROMPTS = {
    zh: [
      '请用中文回答。你是一名专业的 AI 绘画提示词分析师，请分析这张图片并只返回 JSON 对象，不要输出 Markdown、解释或额外文字。',
      '',
      'JSON 顶层必须包含两个字段：',
      '1. text_prompt：一段可直接用于 AI 绘画模型的完整中文提示词，包含主体、场景、风格、构图、色彩、光线、情绪和必要技术细节。',
      '2. json_prompt：结构化对象，必须包含 subject、scene、style、composition、color_tone、lighting、mood、technical、tags。',
      '',
      '要求：',
      '- 所有内容必须使用中文。',
      '- tags 是字符串数组。',
      '- 不要编造图片中不存在的品牌、水印或文字。',
      '- 如果图片信息不足，用合理但保守的视觉描述补全。',
      '',
      '返回格式示例：',
      '{"text_prompt":"...","json_prompt":{"subject":"...","scene":"...","style":"...","composition":"...","color_tone":"...","lighting":"...","mood":"...","technical":"...","tags":["..."]}}'
    ].join('\n'),
    en: [
      'Answer in English. You are a professional AI art prompt analyst. Analyze this image and return JSON only. Do not output Markdown, explanations, or extra text.',
      '',
      'The JSON object must contain two top-level fields:',
      '1. text_prompt: a complete English prompt that can be used directly in an AI image generation model, covering subject, scene, style, composition, color, lighting, mood, and useful technical details.',
      '2. json_prompt: a structured object with subject, scene, style, composition, color_tone, lighting, mood, technical, tags.',
      '',
      'Requirements:',
      '- All content must be in English.',
      '- tags must be an array of strings.',
      '- Do not invent brands, watermarks, or text that are not visible.',
      '- If visual information is limited, complete the description conservatively.',
      '',
      'Return example:',
      '{"text_prompt":"...","json_prompt":{"subject":"...","scene":"...","style":"...","composition":"...","color_tone":"...","lighting":"...","mood":"...","technical":"...","tags":["..."]}}'
    ].join('\n')
  };

  const PROVIDERS = {
    modelscope: {
      id: 'modelscope',
      label: 'ModelScope',
      apiBase: 'https://api-inference.modelscope.cn/v1',
      model: 'Qwen/Qwen3.5-397B-A17B',
      endpointMode: 'openai-chat',
      imageMode: 'url-first',
      supportsUrl: true,
      supportsBase64: false,
      quotaHeader: 'Modelscope-Ratelimit-Model-Requests-Remaining',
      modelsEndpointMode: 'openai-models',
      modelPresets: [
        'Qwen/Qwen3.5-397B-A17B',
        'MiniMax/MiniMax-M2.5',
        'moonshotai/Kimi-K2.5',
        'ZhipuAI/GLM-5',
        'MusePublic/Qwen-Image-Edit'
      ]
    },
    openai_chat: {
      id: 'openai_chat',
      label: 'OpenAI Chat',
      apiBase: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      endpointMode: 'openai-chat',
      modelsEndpointMode: 'openai-models',
      imageMode: 'auto',
      supportsUrl: true,
      supportsBase64: true,
      modelPresets: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini']
    },
    openai_responses: {
      id: 'openai_responses',
      label: 'OpenAI Responses',
      apiBase: 'https://api.openai.com/v1',
      model: 'gpt-4.1',
      endpointMode: 'openai-responses',
      modelsEndpointMode: 'openai-models',
      imageMode: 'auto',
      supportsUrl: true,
      supportsBase64: true,
      modelPresets: ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4o']
    },
    anthropic: {
      id: 'anthropic',
      label: 'Anthropic Claude',
      apiBase: 'https://api.anthropic.com/v1',
      model: 'claude-3-5-sonnet-latest',
      endpointMode: 'anthropic',
      modelsEndpointMode: 'openai-models',
      imageMode: 'auto',
      supportsUrl: true,
      supportsBase64: true,
      modelPresets: ['claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest', 'claude-3-opus-latest']
    },
    google_gemini: {
      id: 'google_gemini',
      label: 'Google Gemini',
      apiBase: 'https://generativelanguage.googleapis.com/v1beta',
      model: 'gemini-2.5-flash',
      endpointMode: 'gemini',
      modelsEndpointMode: 'gemini-models',
      imageMode: 'base64',
      supportsUrl: false,
      supportsBase64: true,
      modelPresets: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash']
    },
    siliconflow: {
      id: 'siliconflow',
      label: '硅基流动',
      apiBase: 'https://api.siliconflow.cn/v1',
      model: 'Qwen/Qwen2.5-VL-72B-Instruct',
      endpointMode: 'openai-chat',
      modelsEndpointMode: 'openai-models',
      imageMode: 'auto',
      supportsUrl: true,
      supportsBase64: true,
      modelPresets: ['Qwen/Qwen2.5-VL-72B-Instruct', 'Qwen/Qwen2-VL-72B-Instruct', 'Pro/Qwen/Qwen2.5-VL-72B-Instruct']
    },
    openai_compatible: {
      id: 'openai_compatible',
      label: 'OpenAI 兼容',
      apiBase: 'https://api.example.com/v1',
      model: 'your-vision-model',
      endpointMode: 'openai-chat',
      modelsEndpointMode: 'openai-models',
      imageMode: 'auto',
      supportsUrl: true,
      supportsBase64: true,
      modelPresets: []
    }
  };

  const DEFAULT_SETTINGS = {
    activeConfigId: 'default-modelscope',
    defaultLanguage: 'zh',
    autoCopy: true,
    copyMode: 'text',
    historyLimit: 50,
    showQuota: true,
    screenshotEnabled: false,
    detail: 'high'
  };

  function makeDefaultConfig() {
    const provider = PROVIDERS.modelscope;
    return {
      id: 'default-modelscope',
      name: 'ModelScope Qwen',
      provider: provider.id,
      apiBase: provider.apiBase,
      apiKey: '',
      model: provider.model,
      imageMode: provider.imageMode,
      detail: 'high',
      maxTokens: 2048,
      temperature: 0.2,
      enableThinking: false,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }

  function providerOf(config) {
    return PROVIDERS[config?.provider] || PROVIDERS.openai_compatible;
  }

  function normalizeApiBase(base) {
    return String(base || '').trim().replace(/\/+$/, '');
  }

  function joinUrl(base, path) {
    return normalizeApiBase(base) + '/' + String(path || '').replace(/^\/+/, '');
  }

  function promptFor(language) {
    return PROMPTS[language] || PROMPTS.zh;
  }

  function isHttpUrl(value) {
    return /^https?:\/\//i.test(String(value || ''));
  }

  function isDataUrl(value) {
    return /^data:/i.test(String(value || ''));
  }

  function parseDataUrl(dataUrl) {
    const match = String(dataUrl || '').match(/^data:([^;,]+)(;base64)?,(.*)$/);
    if (!match) return null;
    return {
      mimeType: match[1] || 'image/jpeg',
      base64: match[3] || '',
      dataUrl
    };
  }

  function imagePartForOpenAI(image, detail) {
    return {
      type: 'image_url',
      image_url: {
        url: image.dataUrl || image.url,
        detail: detail || 'high'
      }
    };
  }

  function imagePartForResponses(image, detail) {
    return {
      type: 'input_image',
      image_url: image.dataUrl || image.url,
      detail: detail || 'high'
    };
  }

  function imagePartForAnthropic(image) {
    if (image.dataUrl) {
      const parsed = parseDataUrl(image.dataUrl);
      if (!parsed) throw new Error('图片 base64 数据格式无效');
      return {
        type: 'image',
        source: {
          type: 'base64',
          media_type: parsed.mimeType,
          data: parsed.base64
        }
      };
    }
    return {
      type: 'image',
      source: {
        type: 'url',
        url: image.url
      }
    };
  }

  function imagePartForGemini(image) {
    const parsed = parseDataUrl(image.dataUrl);
    if (!parsed) throw new Error('Gemini 需要 base64 图片数据');
    return {
      inline_data: {
        mime_type: parsed.mimeType,
        data: parsed.base64
      }
    };
  }

  function buildApiRequest(config, image, language) {
    const provider = providerOf(config);
    const apiBase = normalizeApiBase(config.apiBase || provider.apiBase);
    const model = config.model || provider.model;
    const prompt = config.systemPrompt || promptFor(language);
    const maxTokens = Number(config.maxTokens || 2048);
    const temperature = Number.isFinite(Number(config.temperature)) ? Number(config.temperature) : 0.2;
    const detail = config.detail || 'high';
    const apiKey = String(config.apiKey || '').trim();

    if (!apiKey) throw new Error('请先在设置页填写 API Key');

    if (provider.endpointMode === 'gemini') {
      return {
        url: joinUrl(apiBase, `models/${encodeURIComponent(model)}:generateContent`),
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: {
          contents: [
            {
              role: 'user',
              parts: [
                imagePartForGemini(image),
                { text: prompt }
              ]
            }
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            maxOutputTokens: maxTokens,
            temperature
          }
        },
        parser: 'gemini'
      };
    }

    if (provider.endpointMode === 'anthropic') {
      return {
        url: joinUrl(apiBase, 'messages'),
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: {
          model,
          max_tokens: maxTokens,
          temperature,
          messages: [
            {
              role: 'user',
              content: [
                imagePartForAnthropic(image),
                { type: 'text', text: prompt }
              ]
            }
          ]
        },
        parser: 'anthropic'
      };
    }

    if (provider.endpointMode === 'openai-responses') {
      return {
        url: joinUrl(apiBase, 'responses'),
        headers: {
          'Content-Type': 'application/json',
          Authorization: bearer(apiKey)
        },
        body: {
          model,
          input: [
            {
              role: 'user',
              content: [
                { type: 'input_text', text: prompt },
                imagePartForResponses(image, detail)
              ]
            }
          ],
          max_output_tokens: maxTokens,
          temperature
        },
        parser: 'openai-responses'
      };
    }

    const body = {
      model,
      messages: [
        {
          role: 'user',
          content: [
            imagePartForOpenAI(image, detail),
            { type: 'text', text: prompt }
          ]
        }
      ],
      max_tokens: maxTokens,
      temperature
    };

    if (provider.id === 'modelscope') {
      body.enable_thinking = config.enableThinking === true;
    }

    return {
      url: joinUrl(apiBase, 'chat/completions'),
      headers: {
        'Content-Type': 'application/json',
        Authorization: bearer(apiKey)
      },
      body,
      parser: 'openai-chat'
    };
  }

  function buildModelsRequest(config) {
    const provider = providerOf(config);
    const apiBase = normalizeApiBase(config.apiBase || provider.apiBase);
    const apiKey = String(config.apiKey || '').trim();
    if (!apiKey) throw new Error('请先填写 API Key 后再获取模型列表');

    if (provider.modelsEndpointMode === 'gemini-models') {
      return {
        url: joinUrl(apiBase, 'models'),
        headers: {
          'x-goog-api-key': apiKey
        },
        parser: 'gemini-models'
      };
    }

    return {
      url: joinUrl(apiBase, 'models'),
      headers: {
        Authorization: bearer(apiKey)
      },
      parser: 'openai-models'
    };
  }

  function bearer(apiKey) {
    return /^bearer\s+/i.test(apiKey) ? apiKey : `Bearer ${apiKey}`;
  }

  function parseApiResponse(data, parser) {
    let text = '';
    if (parser === 'gemini') {
      text = (data?.candidates?.[0]?.content?.parts || [])
        .map((part) => part.text || '')
        .join('\n')
        .trim();
    } else if (parser === 'anthropic') {
      text = (data?.content || [])
        .map((part) => part.text || '')
        .join('\n')
        .trim();
    } else if (parser === 'openai-responses') {
      text = data?.output_text || collectResponsesText(data);
    } else {
      text = data?.choices?.[0]?.message?.content || data?.message?.content || data?.text || '';
    }
    return normalizeModelText(text);
  }

  function parseModelsResponse(data, parser, config) {
    const provider = providerOf(config);
    let models = [];
    if (parser === 'gemini-models') {
      models = (data?.models || [])
        .map((item) => item.name || item.id || '')
        .map((name) => name.replace(/^models\//, ''));
    } else {
      const list = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
      models = list.map((item) => {
        if (typeof item === 'string') return item;
        return item.id || item.name || item.model_id || item.modelId || '';
      });
    }

    const unique = [];
    const seen = new Set();
    for (const model of [...(provider.modelPresets || []), ...models]) {
      const value = String(model || '').trim();
      if (!value || seen.has(value)) continue;
      seen.add(value);
      unique.push(value);
    }

    return unique.sort((a, b) => modelPriority(a, provider, config) - modelPriority(b, provider, config) || a.localeCompare(b));
  }

  function modelPriority(model, provider, config) {
    const lower = String(model || '').toLowerCase();
    if (provider.id === 'modelscope' && model === PROVIDERS.modelscope.model) return -50;
    if (config?.model && model === config.model) return -40;
    if (lower.includes('qwen3.5')) return -30;
    if (lower.includes('vl') || lower.includes('vision')) return -20;
    if (lower.includes('qwen')) return -10;
    return 0;
  }

  function collectResponsesText(data) {
    const out = [];
    for (const item of data?.output || []) {
      for (const content of item?.content || []) {
        if (content.text) out.push(content.text);
      }
    }
    return out.join('\n').trim();
  }

  function normalizeModelText(rawText) {
    const content = String(rawText || '').trim();
    if (!content) {
      return {
        text_prompt: '',
        json_prompt: '',
        raw: ''
      };
    }
    const jsonText = extractJsonText(content);
    if (jsonText) {
      try {
        const parsed = JSON.parse(jsonText);
        const textPrompt = String(parsed.text_prompt || parsed.prompt || content || '').trim();
        const jsonPrompt = parsed.json_prompt === undefined
          ? ''
          : (typeof parsed.json_prompt === 'string' ? parsed.json_prompt : JSON.stringify(parsed.json_prompt, null, 2));
        return {
          text_prompt: textPrompt,
          json_prompt: jsonPrompt,
          raw: content
        };
      } catch (_) {
        // 解析失败时返回原文，避免丢结果。
      }
    }
    return {
      text_prompt: content,
      json_prompt: '',
      raw: content
    };
  }

  function extractJsonText(text) {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenced) return fenced[1].trim();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) return text.slice(start, end + 1).trim();
    return '';
  }

  function formatCopyPayload(entry, mode) {
    if (mode === 'all') {
      return [
        '【文字提示词】',
        entry.textPrompt || '',
        '',
        '【JSON 提示词】',
        entry.jsonPrompt || ''
      ].join('\n');
    }
    if (mode === 'json') return entry.jsonPrompt || entry.textPrompt || '';
    return entry.textPrompt || '';
  }

  function providerOptionsHtml(selected) {
    return Object.values(PROVIDERS).map((provider) => {
      const isSelected = provider.id === selected ? ' selected' : '';
      return `<option value="${escapeHtml(provider.id)}"${isSelected}>${escapeHtml(provider.label)}</option>`;
    }).join('');
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[ch]));
  }

  function formatTime(iso) {
    try {
      return new Intl.DateTimeFormat('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }).format(new Date(iso));
    } catch (_) {
      return '';
    }
  }

  global.I2P = {
    VERSION,
    PROMPTS,
    PROVIDERS,
    DEFAULT_SETTINGS,
    makeDefaultConfig,
    providerOf,
    promptFor,
    buildApiRequest,
    buildModelsRequest,
    parseApiResponse,
    parseModelsResponse,
    formatCopyPayload,
    providerOptionsHtml,
    escapeHtml,
    formatTime,
    isHttpUrl,
    isDataUrl,
    parseDataUrl
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);


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

