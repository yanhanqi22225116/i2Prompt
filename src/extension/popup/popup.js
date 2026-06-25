let currentEntry = null;
let state = null;
let allHistory = [];
let activeResultTab = 'text';

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('btnOptions').addEventListener('click', (event) => {
    pulseButton(event.currentTarget, '打开中');
    chrome.runtime.sendMessage({ type: 'I2P_OPEN_OPTIONS' });
  });
  document.getElementById('btnClear').addEventListener('click', clearHistory);
  document.getElementById('btnCopy').addEventListener('click', copyCurrent);
  document.getElementById('btnCopyAll').addEventListener('click', copyAll);
  document.getElementById('tabText').addEventListener('click', () => switchResultTab('text'));
  document.getElementById('tabJson').addEventListener('click', () => switchResultTab('json'));
  document.getElementById('searchInput').addEventListener('input', () => renderHistory(allHistory));
  await load();
});

async function load() {
  state = await chrome.runtime.sendMessage({ type: 'I2P_GET_STATE' });
  const history = await chrome.runtime.sendMessage({ type: 'I2P_GET_HISTORY' });
  allHistory = Array.isArray(history) ? history : [];
  renderActiveInfo();
  renderHistory(allHistory);
  if (allHistory[0]) showResult(allHistory[0]);
}

function renderActiveInfo() {
  const config = state.configs.find((item) => item.id === state.activeConfigId) || state.configs[0];
  const provider = I2P.PROVIDERS[config?.provider] || I2P.PROVIDERS.openai_compatible;
  const keyState = config?.hasApiKey ? '已配置' : '未填 Key';
  document.getElementById('activeInfo').textContent = `${provider.label} · ${config?.model || ''} · ${keyState}`;
}

function renderHistory(history) {
  const list = document.getElementById('historyList');
  const keyword = document.getElementById('searchInput').value.trim();
  const filtered = keyword
    ? history.filter((entry) => String(entry.textPrompt || '').toLowerCase().includes(keyword.toLowerCase()))
    : history;
  list.innerHTML = '';
  if (filtered.length === 0) {
    list.innerHTML = `<div class="empty">${keyword ? '没有匹配结果' : '暂无历史记录'}</div>`;
    document.getElementById('resultPanel').classList.add('hidden');
    return;
  }

  filtered.forEach((entry) => {
    const button = document.createElement('button');
    button.className = 'item';
    button.innerHTML = `
      <div class="item-title">${highlightText(entry.textPrompt || '(空)', keyword)}</div>
      <div class="item-meta">${I2P.escapeHtml(entry.providerLabel || '')} · ${I2P.escapeHtml(entry.model || '')} · ${I2P.formatTime(entry.timestamp)}</div>
    `;
    button.addEventListener('click', () => showResult(entry));
    button.classList.toggle('active', currentEntry?.id === entry.id);
    list.appendChild(button);
  });
}

function highlightText(text, keyword) {
  const safe = I2P.escapeHtml(text);
  if (!keyword) return safe;
  const escapedKeyword = I2P.escapeHtml(keyword).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return safe.replace(new RegExp(escapedKeyword, 'ig'), (match) => `<mark>${match}</mark>`);
}

function showResult(entry) {
  currentEntry = entry;
  document.getElementById('resultPanel').classList.remove('hidden');
  const quota = entry.quota?.label ? ` · ${entry.quota.label}` : '';
  document.getElementById('resultMeta').textContent = `${entry.providerLabel || ''}${quota}`;
  switchResultTab(activeResultTab);
  renderHistory(allHistory);
}

function switchResultTab(tab) {
  activeResultTab = tab;
  document.getElementById('tabText').classList.toggle('active', tab === 'text');
  document.getElementById('tabJson').classList.toggle('active', tab === 'json');
  const text = tab === 'json'
    ? (currentEntry?.jsonPrompt || '(无 JSON 数据)')
    : (currentEntry?.textPrompt || '(无结果)');
  document.getElementById('resultText').textContent = text;
}

async function copyCurrent(event) {
  if (!currentEntry) return;
  const text = I2P.formatCopyPayload(currentEntry, activeResultTab === 'json' ? 'json' : 'text');
  await navigator.clipboard.writeText(text);
  pulseButton(event?.currentTarget || document.getElementById('btnCopy'), '已复制');
}

async function copyAll(event) {
  if (!currentEntry) return;
  await navigator.clipboard.writeText(I2P.formatCopyPayload(currentEntry, 'all'));
  pulseButton(event?.currentTarget || document.getElementById('btnCopyAll'), '已复制');
}

async function clearHistory(event) {
  await chrome.runtime.sendMessage({ type: 'I2P_CLEAR_HISTORY' });
  currentEntry = null;
  pulseButton(event?.currentTarget || document.getElementById('btnClear'), '已清空');
  await load();
}

function pulseButton(button, label) {
  if (!button) return;
  const original = button.textContent;
  button.classList.add('done');
  button.textContent = label;
  clearTimeout(button._i2pTimer);
  button._i2pTimer = setTimeout(() => {
    button.classList.remove('done');
    button.textContent = original;
  }, 900);
}
