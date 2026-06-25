importScripts('shared/i2prompt-shared.js');

const MENU_REVERSE_IMAGE = 'i2prompt-reverse-image';

chrome.runtime.onInstalled.addListener(async () => {
  await ensureInitialState();
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_REVERSE_IMAGE,
      title: 'i2Prompt 反推图片',
      contexts: ['image']
    });
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_REVERSE_IMAGE || !info.srcUrl || !tab?.id) return;

  const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const state = await getState();
  const config = getActiveConfig(state);
  const provider = I2P.providerOf(config);

  await sendToTab(tab.id, {
    type: 'I2P_SHOW_LOADING',
    requestId,
    imageUrl: info.srcUrl,
    providerLabel: provider.label,
    model: config.model
  });

  const entry = await reverseImage(info.srcUrl, config, state.settings);
  await sendToTab(tab.id, {
    type: 'I2P_SHOW_RESULT',
    requestId,
    entry,
    autoCopy: state.settings.autoCopy,
    copyMode: state.settings.copyMode
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    switch (message?.type) {
      case 'I2P_GET_STATE':
        sendResponse(await getPublicState(message.includeSecrets === true));
        break;
      case 'I2P_SAVE_CONFIG':
        sendResponse(await saveConfig(message.config));
        break;
      case 'I2P_DELETE_CONFIG':
        sendResponse(await deleteConfig(message.id));
        break;
      case 'I2P_SET_ACTIVE_CONFIG':
        sendResponse(await setActiveConfig(message.id));
        break;
      case 'I2P_SAVE_SETTINGS':
        sendResponse(await saveSettings(message.settings));
        break;
      case 'I2P_GET_HISTORY':
        sendResponse(await getHistory());
        break;
      case 'I2P_FETCH_MODELS':
        sendResponse(await fetchModels(message.config));
        break;
      case 'I2P_CLEAR_HISTORY':
        await chrome.storage.local.set({ history: [] });
        sendResponse({ ok: true });
        break;
      case 'I2P_OPEN_OPTIONS':
        chrome.runtime.openOptionsPage();
        sendResponse({ ok: true });
        break;
      default:
        sendResponse({ ok: false, error: '未知消息类型' });
    }
  })().catch((error) => {
    sendResponse({ ok: false, error: error.message || String(error) });
  });
  return true;
});

async function reverseImage(srcUrl, config, settings) {
  try {
    const image = await prepareImage(srcUrl, config);
    const language = settings.defaultLanguage || 'zh';
    const requestConfig = {
      ...config,
      systemPrompt: getPromptFromSettings(settings, language) || config.systemPrompt
    };
    const request = I2P.buildApiRequest(requestConfig, image, language);

    const startedAt = Date.now();
    const response = await fetch(request.url, {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify(request.body)
    });

    const responseText = await response.text();
    let responseData;
    try {
      responseData = responseText ? JSON.parse(responseText) : {};
    } catch (_) {
      responseData = { text: responseText };
    }

    if (!response.ok) {
      const message = responseData?.error?.message || responseData?.message || `${response.status} ${response.statusText}`;
      throw new Error(`API 请求失败：${message}`);
    }

    const parsed = I2P.parseApiResponse(responseData, request.parser);
    if (!parsed.text_prompt && !parsed.json_prompt) {
      const detail = responseData?.error?.message || responseData?.message || '模型没有返回有效内容，请确认模型支持图片推理。';
      throw new Error(detail);
    }
    const provider = I2P.providerOf(config);
    const quota = settings.showQuota === false ? null : readQuota(response.headers, provider);
    const entry = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      timestamp: new Date().toISOString(),
      provider: config.provider,
      providerLabel: provider.label,
      model: config.model,
      imageUrl: I2P.isHttpUrl(srcUrl) ? srcUrl : '',
      textPrompt: parsed.text_prompt || '',
      jsonPrompt: parsed.json_prompt || '',
      rawText: parsed.raw || '',
      quota,
      elapsedMs: Date.now() - startedAt,
      isError: false
    };

    await saveHistoryEntry(entry, settings.historyLimit);
    return entry;
  } catch (error) {
    const provider = I2P.providerOf(config);
    const entry = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      timestamp: new Date().toISOString(),
      provider: config.provider,
      providerLabel: provider.label,
      model: config.model,
      imageUrl: I2P.isHttpUrl(srcUrl) ? srcUrl : '',
      textPrompt: `[错误] ${error.message || String(error)}`,
      jsonPrompt: '',
      rawText: '',
      quota: null,
      elapsedMs: 0,
      isError: true
    };
    await saveHistoryEntry(entry, settings.historyLimit);
    return entry;
  }
}

async function fetchModels(formConfig) {
  const state = await getState();
  const active = getActiveConfig(state);
  const provider = I2P.providerOf(formConfig || active);
  const config = {
    ...active,
    ...(formConfig || {}),
    provider: formConfig?.provider || active.provider || provider.id,
    apiBase: formConfig?.apiBase || active.apiBase || provider.apiBase,
    apiKey: formConfig?.apiKey || active.apiKey || '',
    model: formConfig?.model || active.model || provider.model
  };
  const request = I2P.buildModelsRequest(config);
  const response = await fetch(request.url, {
    method: 'GET',
    headers: request.headers
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (_) {
    data = { text };
  }
  if (!response.ok) {
    const message = data?.error?.message || data?.message || `${response.status} ${response.statusText}`;
    throw new Error(`模型列表获取失败：${message}`);
  }
  return {
    ok: true,
    models: I2P.parseModelsResponse(data, request.parser, config)
  };
}

function getPromptFromSettings(settings, language) {
  if (language === 'en') return String(settings.promptEn || '').trim();
  return String(settings.promptZh || '').trim();
}

async function prepareImage(srcUrl, config) {
  const provider = I2P.providerOf(config);
  const mode = config.imageMode || provider.imageMode || 'auto';

  if (provider.id === 'modelscope') {
    if (!I2P.isHttpUrl(srcUrl)) {
      throw new Error('ModelScope 当前仅支持公网图片 URL。请换用 OpenAI、Claude、Gemini、硅基流动或 OpenAI 兼容配置处理本地图片。');
    }
    return { url: srcUrl };
  }

  if (I2P.isDataUrl(srcUrl)) return { dataUrl: srcUrl };

  if (mode === 'base64' || provider.endpointMode === 'gemini' || !provider.supportsUrl) {
    return { dataUrl: await fetchImageAsDataUrl(srcUrl) };
  }

  if (I2P.isHttpUrl(srcUrl) && provider.supportsUrl) {
    return { url: srcUrl };
  }

  if (provider.supportsBase64) {
    return { dataUrl: await fetchImageAsDataUrl(srcUrl) };
  }

  throw new Error('当前模型配置不支持这类图片地址');
}

async function fetchImageAsDataUrl(srcUrl) {
  if (I2P.isDataUrl(srcUrl)) return srcUrl;
  if (!I2P.isHttpUrl(srcUrl)) throw new Error('无法读取非公网图片地址');

  const response = await fetch(srcUrl, { credentials: 'include' });
  if (!response.ok) throw new Error(`图片读取失败：${response.status}`);
  const blob = await response.blob();
  const mimeType = blob.type || 'image/jpeg';
  const buffer = await blob.arrayBuffer();
  const base64 = arrayBufferToBase64(buffer);
  return `data:${mimeType};base64,${base64}`;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function readQuota(headers, provider) {
  if (!provider.quotaHeader) return null;
  const remaining = headers.get(provider.quotaHeader);
  if (remaining === null || remaining === undefined || remaining === '') return null;
  return {
    modelRemaining: remaining,
    label: `本模型剩余 ${remaining} 次`
  };
}

async function ensureInitialState() {
  const current = await chrome.storage.local.get(['settings', 'configs', 'activeConfigId']);
  const updates = {};
  if (!current.settings) updates.settings = { ...I2P.DEFAULT_SETTINGS };
  if (!Array.isArray(current.configs) || current.configs.length === 0) {
    const cfg = I2P.makeDefaultConfig();
    updates.configs = [cfg];
    updates.activeConfigId = cfg.id;
  } else if (!current.activeConfigId) {
    updates.activeConfigId = current.configs[0].id;
  }
  if (Object.keys(updates).length > 0) await chrome.storage.local.set(updates);
}

async function getState() {
  await ensureInitialState();
  const state = await chrome.storage.local.get(['settings', 'configs', 'activeConfigId']);
  return {
    settings: { ...I2P.DEFAULT_SETTINGS, ...(state.settings || {}) },
    configs: Array.isArray(state.configs) ? state.configs : [I2P.makeDefaultConfig()],
    activeConfigId: state.activeConfigId || I2P.DEFAULT_SETTINGS.activeConfigId
  };
}

async function getPublicState(includeSecrets) {
  const state = await getState();
  return {
    ...state,
    configs: state.configs.map((config) => includeSecrets ? config : maskConfig(config))
  };
}

function maskConfig(config) {
  const { apiKey, ...safe } = config;
  return {
    ...safe,
    hasApiKey: Boolean(apiKey)
  };
}

function getActiveConfig(state) {
  return state.configs.find((config) => config.id === state.activeConfigId) || state.configs[0] || I2P.makeDefaultConfig();
}

async function saveConfig(nextConfig) {
  if (!nextConfig) throw new Error('配置为空');
  const state = await getState();
  const provider = I2P.providerOf(nextConfig);
  const existing = state.configs.find((config) => config.id === nextConfig.id);
  const config = {
    ...(existing || {}),
    id: nextConfig.id || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())),
    name: nextConfig.name || provider.label,
    provider: nextConfig.provider || provider.id,
    apiBase: nextConfig.apiBase || provider.apiBase,
    apiKey: nextConfig.apiKey || existing?.apiKey || '',
    model: nextConfig.model || provider.model,
    imageMode: nextConfig.imageMode || provider.imageMode,
    detail: nextConfig.detail || 'high',
    maxTokens: Number(nextConfig.maxTokens || 2048),
    temperature: Number(nextConfig.temperature ?? 0.2),
    enableThinking: nextConfig.enableThinking === true,
    createdAt: existing?.createdAt || Date.now(),
    updatedAt: Date.now()
  };

  const configs = state.configs.filter((item) => item.id !== config.id);
  configs.unshift(config);
  await chrome.storage.local.set({ configs, activeConfigId: config.id });
  return { ok: true, config: maskConfig(config) };
}

async function deleteConfig(id) {
  const state = await getState();
  const configs = state.configs.filter((config) => config.id !== id);
  if (configs.length === 0) configs.push(I2P.makeDefaultConfig());
  const activeConfigId = state.activeConfigId === id ? configs[0].id : state.activeConfigId;
  await chrome.storage.local.set({ configs, activeConfigId });
  return { ok: true };
}

async function setActiveConfig(id) {
  await chrome.storage.local.set({ activeConfigId: id });
  return { ok: true };
}

async function saveSettings(settings) {
  const state = await getState();
  const next = {
    ...state.settings,
    ...settings,
    screenshotEnabled: false,
    historyLimit: clamp(Number(settings.historyLimit || state.settings.historyLimit || 50), 5, 100)
  };
  await chrome.storage.local.set({ settings: next });
  return { ok: true, settings: next };
}

async function getHistory() {
  const { history } = await chrome.storage.local.get('history');
  return Array.isArray(history) ? history : [];
}

async function saveHistoryEntry(entry, limit) {
  const history = await getHistory();
  history.unshift(entry);
  const max = clamp(Number(limit || 50), 5, 100);
  if (history.length > max) history.length = max;
  await chrome.storage.local.set({ history, pendingResult: entry });
}

async function sendToTab(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (_) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['shared/i2prompt-shared.js', 'content.js']
      });
      return await chrome.tabs.sendMessage(tabId, message);
    } catch (error) {
      console.warn('[i2Prompt] content script 不可用:', error);
      return null;
    }
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
