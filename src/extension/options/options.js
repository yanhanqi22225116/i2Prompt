let state = null;
let editingId = null;
let lastModelsKey = '';

const $ = (id) => document.getElementById(id);

document.addEventListener('DOMContentLoaded', async () => {
  $('providerSelect').innerHTML = I2P.providerOptionsHtml('modelscope');
  bindEvents();
  await loadState();
});

function bindEvents() {
  $('providerSelect').addEventListener('change', () => applyProviderPreset(true));
  $('btnSaveAll').addEventListener('click', saveAll);
  $('btnNew').addEventListener('click', newConfig);
  $('btnDelete').addEventListener('click', deleteCurrent);
  $('btnPromptZh').addEventListener('click', () => switchPromptTab('zh'));
  $('btnPromptEn').addEventListener('click', () => switchPromptTab('en'));
  $('btnFetchModels').addEventListener('click', () => fetchModels(true));
  $('modelName').addEventListener('focus', () => fetchModels(false));
  $('modelName').addEventListener('click', () => fetchModels(false));
  $('modelList').addEventListener('change', () => {
    if ($('modelList').value) $('modelName').value = $('modelList').value;
  });
}

async function loadState() {
  state = await chrome.runtime.sendMessage({ type: 'I2P_GET_STATE', includeSecrets: true });
  editingId = state.activeConfigId;
  renderConfigList();
  fillForm(getActiveConfig());
  fillSettings();
}

function getActiveConfig() {
  return state.configs.find((config) => config.id === editingId) || state.configs[0] || I2P.makeDefaultConfig();
}

function renderConfigList() {
  const list = $('configList');
  list.innerHTML = '';
  state.configs.forEach((config) => {
    const provider = I2P.PROVIDERS[config.provider] || I2P.PROVIDERS.openai_compatible;
    const button = document.createElement('button');
    button.className = `config-item${config.id === editingId ? ' active' : ''}`;
    button.innerHTML = `
      <div class="config-name">${I2P.escapeHtml(config.name || provider.label)}</div>
      <div class="config-meta">${I2P.escapeHtml(provider.label)} · ${I2P.escapeHtml(config.model || '')}</div>
    `;
    button.addEventListener('click', () => {
      editingId = config.id;
      renderConfigList();
      fillForm(config);
    });
    list.appendChild(button);
  });
}

function fillForm(config) {
  const provider = I2P.PROVIDERS[config.provider] || I2P.PROVIDERS.modelscope;
  $('formTitle').textContent = config.name || provider.label;
  $('configName').value = config.name || '';
  $('providerSelect').value = provider.id;
  $('apiBase').value = config.apiBase || provider.apiBase;
  $('apiKey').value = config.apiKey || '';
  $('modelName').value = config.model || provider.model;
  $('imageMode').value = config.imageMode || provider.imageMode || 'auto';
  $('detail').value = config.detail || 'high';
  $('maxTokens').value = config.maxTokens || 2048;
  fillModelPresets(provider);
  fillModelList(provider.modelPresets || []);
}

function fillSettings() {
  const settings = state.settings || I2P.DEFAULT_SETTINGS;
  $('defaultLanguage').value = settings.defaultLanguage || 'zh';
  $('copyMode').value = settings.copyMode || 'text';
  $('historyLimit').value = settings.historyLimit || 50;
  $('autoCopy').checked = settings.autoCopy !== false;
  $('showQuota').checked = settings.showQuota !== false;
  $('screenshotEnabled').checked = false;
  $('promptZh').value = settings.promptZh || I2P.PROMPTS.zh;
  $('promptEn').value = settings.promptEn || I2P.PROMPTS.en;
  switchPromptTab(settings.defaultLanguage === 'en' ? 'en' : 'zh');
}

function applyProviderPreset(shouldFillValues) {
  const provider = I2P.PROVIDERS[$('providerSelect').value] || I2P.PROVIDERS.openai_compatible;
  fillModelPresets(provider);
  fillModelList(provider.modelPresets || []);
  lastModelsKey = '';
  if (!shouldFillValues) return;
  $('apiBase').value = provider.apiBase;
  $('modelName').value = provider.model;
  $('imageMode').value = provider.imageMode || 'auto';
  $('configName').value = provider.label;
}

function fillModelPresets(provider) {
  const datalist = $('modelPresets');
  datalist.innerHTML = '';
  (provider.modelPresets || []).forEach((model) => {
    const option = document.createElement('option');
    option.value = model;
    datalist.appendChild(option);
  });
}

function fillModelList(models) {
  const list = $('modelList');
  list.innerHTML = '';
  const current = $('modelName').value.trim();
  const unique = [];
  const seen = new Set();
  for (const model of [current, ...models]) {
    const value = String(model || '').trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    unique.push(value);
  }
  unique.forEach((model) => {
    const option = document.createElement('option');
    option.value = model;
    option.textContent = model;
    list.appendChild(option);
  });
  list.hidden = unique.length === 0;
  if (current) list.value = current;
}

async function fetchModels(force) {
  const provider = I2P.PROVIDERS[$('providerSelect').value] || I2P.PROVIDERS.openai_compatible;
  const apiKey = $('apiKey').value.trim();
  const apiBase = $('apiBase').value.trim() || provider.apiBase;
  const key = `${provider.id}|${apiBase}|${apiKey ? 'key' : 'nokey'}`;
  if (!force && lastModelsKey === key && !$('modelList').hidden) return;
  if (!apiKey) {
    if (force) showStatus('先填写 API Key，再获取模型列表', true);
    return;
  }

  const button = $('btnFetchModels');
  button.classList.add('loading');
  button.textContent = '获取中';
  button.disabled = true;
  try {
    const result = await chrome.runtime.sendMessage({
      type: 'I2P_FETCH_MODELS',
      config: {
        provider: provider.id,
        apiBase,
        apiKey,
        model: $('modelName').value.trim() || provider.model
      }
    });
    if (!result?.ok) throw new Error(result?.error || '模型列表获取失败');
    fillModelList(result.models || []);
    lastModelsKey = key;
    showStatus(`已获取 ${result.models?.length || 0} 个模型`);
  } catch (error) {
    showStatus(error.message || String(error), true);
  } finally {
    button.classList.remove('loading');
    button.textContent = '刷新模型';
    button.disabled = false;
  }
}

function newConfig() {
  const provider = I2P.PROVIDERS.modelscope;
  editingId = null;
  renderConfigList();
  fillForm({
    id: '',
    name: provider.label,
    provider: provider.id,
    apiBase: provider.apiBase,
    apiKey: '',
    model: provider.model,
    imageMode: provider.imageMode,
    detail: 'high',
    maxTokens: 2048
  });
}

async function saveAll() {
  setSaveButton('saving');
  const provider = I2P.PROVIDERS[$('providerSelect').value] || I2P.PROVIDERS.openai_compatible;
  const apiKey = $('apiKey').value.trim();
  if (!apiKey && !editingId) {
    showStatus('请填写 API Key', true);
    setSaveButton('idle');
    return;
  }
  if (!$('modelName').value.trim()) {
    showStatus('请填写模型名', true);
    setSaveButton('idle');
    return;
  }

  const config = {
    id: editingId || undefined,
    name: $('configName').value.trim() || provider.label,
    provider: provider.id,
    apiBase: $('apiBase').value.trim() || provider.apiBase,
    apiKey,
    model: $('modelName').value.trim(),
    imageMode: $('imageMode').value,
    detail: $('detail').value,
    maxTokens: Number($('maxTokens').value || 2048)
  };

  const saved = await chrome.runtime.sendMessage({ type: 'I2P_SAVE_CONFIG', config });
  if (!saved?.ok) {
    showStatus(saved?.error || '保存失败', true);
    setSaveButton('idle');
    return;
  }

  const settings = {
    defaultLanguage: $('defaultLanguage').value,
    copyMode: $('copyMode').value,
    historyLimit: Number($('historyLimit').value || 50),
    autoCopy: $('autoCopy').checked,
    showQuota: $('showQuota').checked,
    screenshotEnabled: false,
    promptZh: $('promptZh').value.trim() || I2P.PROMPTS.zh,
    promptEn: $('promptEn').value.trim() || I2P.PROMPTS.en
  };
  const settingsResult = await chrome.runtime.sendMessage({ type: 'I2P_SAVE_SETTINGS', settings });
  if (!settingsResult?.ok) {
    showStatus(settingsResult?.error || '设置保存失败', true);
    setSaveButton('idle');
    return;
  }

  await loadState();
  showStatus('已保存');
  setSaveButton('saved');
  flashCard();
}

async function deleteCurrent() {
  if (!editingId) return;
  const ok = confirm('删除当前配置？');
  if (!ok) return;
  const result = await chrome.runtime.sendMessage({ type: 'I2P_DELETE_CONFIG', id: editingId });
  if (!result?.ok) {
    showStatus(result?.error || '删除失败', true);
    return;
  }
  await loadState();
  showStatus('已删除');
}

function showStatus(text, isError) {
  const el = $('statusText');
  el.textContent = text;
  el.classList.toggle('error', Boolean(isError));
  clearTimeout(showStatus.timer);
  showStatus.timer = setTimeout(() => {
    el.textContent = '';
    el.classList.remove('error');
  }, 2600);
}

function switchPromptTab(lang) {
  const isEn = lang === 'en';
  $('btnPromptZh').classList.toggle('active', !isEn);
  $('btnPromptEn').classList.toggle('active', isEn);
  $('promptZh').hidden = isEn;
  $('promptEn').hidden = !isEn;
}

function setSaveButton(stateName) {
  const button = $('btnSaveAll');
  button.classList.toggle('saving', stateName === 'saving');
  button.classList.toggle('saved', stateName === 'saved');
  if (stateName === 'saving') {
    button.textContent = '保存中...';
    button.disabled = true;
  } else if (stateName === 'saved') {
    button.textContent = '已保存';
    button.disabled = false;
    clearTimeout(setSaveButton.timer);
    setSaveButton.timer = setTimeout(() => setSaveButton('idle'), 1200);
  } else {
    button.textContent = '保存';
    button.disabled = false;
  }
}

function flashCard() {
  const card = document.querySelector('.card');
  card.classList.remove('saved-flash');
  void card.offsetWidth;
  card.classList.add('saved-flash');
  setTimeout(() => card.classList.remove('saved-flash'), 900);
}
