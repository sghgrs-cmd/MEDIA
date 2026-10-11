// MEDIA DL Web App Client Logic

const state = {
  mode: 'audio', // 'audio' or 'video'
  resolution: '1080',
  bitrate: '320',
  server: localStorage.getItem('media_server') || 'auto',
  customUrl: localStorage.getItem('media_custom_url') || '',
  history: JSON.parse(localStorage.getItem('media_history') || '[]'),
};

// Known public endpoints with fallback
const API_ENDPOINTS = [
  'https://cobalt.tools/api/json',
  'https://api.cobalt.tools/',
  'https://cobalt-api.kwiatekm.tokyo/api/json',
  'https://dl.khann.me/api/json'
];

// DOM elements
const urlInput = document.getElementById('urlInput');
const pasteBtn = document.getElementById('pasteBtn');
const startBtn = document.getElementById('startBtn');
const statusBox = document.getElementById('statusBox');
const statusText = document.getElementById('statusText');
const resultCard = document.getElementById('resultCard');
const resultTitle = document.getElementById('resultTitle');
const resultMeta = document.getElementById('resultMeta');
const resultThumb = document.getElementById('resultThumb');
const resultBadge = document.getElementById('resultBadge');
const platformTag = document.getElementById('platformTag');
const directDownloadLink = document.getElementById('directDownloadLink');
const videoQualityGroup = document.getElementById('videoQualityGroup');
const audioQualityGroup = document.getElementById('audioQualityGroup');
const historySection = document.getElementById('historySection');
const historyList = document.getElementById('historyList');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');

// Modals
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const serverSelect = document.getElementById('serverSelect');
const customServerGroup = document.getElementById('customServerGroup');
const customServerUrl = document.getElementById('customServerUrl');

// Init UI
function init() {
  setupTabs();
  setupPills();
  setupPaste();
  setupSettings();
  renderHistory();
  registerSW();
}

// Tabs (Audio / Video)
function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.mode = btn.dataset.mode;

      if (state.mode === 'video') {
        videoQualityGroup.style.display = 'flex';
        audioQualityGroup.style.display = 'none';
      } else {
        videoQualityGroup.style.display = 'none';
        audioQualityGroup.style.display = 'flex';
      }
    });
  });
}

// Pills Selection
function setupPills() {
  document.querySelectorAll('#resSelector .pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('#resSelector .pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      state.resolution = pill.dataset.res;
    });
  });

  document.querySelectorAll('#audioBitrateSelector .pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('#audioBitrateSelector .pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      state.bitrate = pill.dataset.bitrate;
    });
  });
}

// Paste from Clipboard
function setupPaste() {
  pasteBtn.addEventListener('click', async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text) {
          urlInput.value = text.trim();
          urlInput.focus();
          detectPlatform(text.trim());
          setStatus('Ссылка вставлена', 'active');
        }
      } else {
        urlInput.focus();
      }
    } catch (e) {
      urlInput.focus();
    }
  });

  urlInput.addEventListener('input', () => {
    detectPlatform(urlInput.value.trim());
  });
}

// Detect Platform
function detectPlatform(url) {
  if (!url) return;
  const lower = url.toLowerCase();
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) {
    setStatus('Обнаружен YouTube', 'active');
  } else if (lower.includes('vk.com') || lower.includes('vkvideo.ru')) {
    setStatus('Обнаружено VK Видео', 'active');
  } else if (lower.includes('rutube.ru')) {
    setStatus('Обнаружен Rutube', 'active');
  } else if (lower.includes('tiktok.com')) {
    setStatus('Обнаружен TikTok', 'active');
  } else if (lower.includes('dzen.ru')) {
    setStatus('Обнаружен Дзен', 'active');
  }
}

// Status Display
function setStatus(text, type = '') {
  statusText.textContent = text;
  statusBox.className = 'status-box';
  if (type) statusBox.classList.add(type);
}

// Main Download Flow
startBtn.addEventListener('click', async () => {
  const url = urlInput.value.trim();
  if (!url) {
    setStatus('Пожалуйста, вставьте ссылку!', 'error');
    urlInput.focus();
    return;
  }

  startBtn.classList.add('loading');
  setStatus('Подключение к серверу и обработка медиа...', 'active');
  resultCard.style.display = 'none';

  try {
    const data = await requestDownload(url);
    if (data && data.url) {
      showResult(data, url);
      setStatus('Готово! Файл готов к загрузке', 'success');
      addToHistory(data.title || 'Медиа файл', url, state.mode);
    } else {
      throw new Error(data.text || 'Не удалось получить прямую ссылку');
    }
  } catch (err) {
    console.error(err);
    setStatus('Ошибка: ' + (err.message || 'Не удалось обработать ссылку'), 'error');
    // Fallback: provide external web helper for mobile
    provideFallbackDownload(url);
  } finally {
    startBtn.classList.remove('loading');
  }
});

// Request download with fallback endpoints
async function requestDownload(url) {
  // Payload for modern media API
  const payload = {
    url: url,
    downloadMode: state.mode === 'audio' ? 'audio' : 'auto',
    audioFormat: 'mp3',
    audioBitrate: state.bitrate,
    videoQuality: state.resolution === 'max' ? 'max' : state.resolution,
    filenameStyle: 'pretty'
  };

  // If user set custom backend
  if (state.server === 'custom' && state.customUrl) {
    const res = await fetch(`${state.customUrl}/api/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return await res.json();
  }

  // Iterate endpoints
  let lastErr = null;
  for (const endpoint of API_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const data = await res.json();
        if (data.url || data.status === 'stream' || data.status === 'redirect') {
          return {
            url: data.url || data.stream,
            title: data.filename || 'Медиа файл',
            thumb: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&q=80'
          };
        }
      }
    } catch (e) {
      lastErr = e;
    }
  }

  throw lastErr || new Error('Сервера временно недоступны. Используйте резервный способ ниже.');
}

// Fallback Helper for Web/Mobile
function provideFallbackDownload(url) {
  resultCard.style.display = 'block';
  resultTitle.textContent = 'Резервная загрузка';
  resultMeta.textContent = 'Нажмите кнопку ниже для скачивания через мобильный шлюз:';
  resultBadge.textContent = state.mode === 'audio' ? 'MP3' : 'MP4';
  platformTag.textContent = 'Резерв';
  resultThumb.src = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=300&q=80';

  // Reliable mobile redirect services
  let directUrl = '';
  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    directUrl = `https://cobalt.tools/#${encodeURIComponent(url)}`;
  } else {
    directUrl = `https://savefrom.net/#url=${encodeURIComponent(url)}`;
  }

  directDownloadLink.href = directUrl;
  directDownloadLink.textContent = 'Открыть загрузку в один клик';
}

// Show Result
function showResult(data, sourceUrl) {
  resultCard.style.display = 'block';
  resultTitle.textContent = data.title || 'Скачанный файл';
  resultMeta.textContent = state.mode === 'audio' 
    ? `Аудио MP3 • ${state.bitrate} kbps` 
    : `Видео MP4 • ${state.resolution}p`;
  resultBadge.textContent = state.mode === 'audio' ? 'MP3' : 'MP4';
  
  const lower = sourceUrl.toLowerCase();
  let tag = 'Видео';
  if (lower.includes('youtube')) tag = 'YouTube';
  else if (lower.includes('vk')) tag = 'VK Видео';
  else if (lower.includes('rutube')) tag = 'Rutube';
  else if (lower.includes('tiktok')) tag = 'TikTok';
  platformTag.textContent = tag;

  if (data.thumb) {
    resultThumb.src = data.thumb;
  } else {
    resultThumb.src = 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&q=80';
  }

  directDownloadLink.href = data.url;
  directDownloadLink.textContent = 'Сохранить на телефон / ПК';
  resultCard.scrollIntoView({ behavior: 'smooth' });
}

// History in localStorage
function addToHistory(title, url, mode) {
  const item = { title, url, mode, date: new Date().toLocaleDateString('ru-RU') };
  state.history.unshift(item);
  if (state.history.length > 8) state.history.pop();
  localStorage.setItem('media_history', JSON.stringify(state.history));
  renderHistory();
}

function renderHistory() {
  if (!state.history || state.history.length === 0) {
    historySection.style.display = 'none';
    return;
  }
  historySection.style.display = 'block';
  historyList.innerHTML = '';
  state.history.forEach(item => {
    const div = document.createElement('div');
    div.className = 'history-item';
    div.innerHTML = `
      <span class="history-title">${item.title}</span>
      <span class="history-badge">${item.mode === 'audio' ? 'MP3' : 'MP4'}</span>
    `;
    div.addEventListener('click', () => {
      urlInput.value = item.url;
      urlInput.focus();
    });
    historyList.appendChild(div);
  });
}

clearHistoryBtn.addEventListener('click', () => {
  state.history = [];
  localStorage.removeItem('media_history');
  renderHistory();
});

// Settings Modal
function setupSettings() {
  settingsBtn.addEventListener('click', () => {
    serverSelect.value = state.server;
    customServerUrl.value = state.customUrl;
    customServerGroup.style.display = state.server === 'custom' ? 'flex' : 'none';
    settingsModal.classList.add('open');
  });

  closeModalBtn.addEventListener('click', () => {
    settingsModal.classList.remove('open');
  });

  serverSelect.addEventListener('change', () => {
    customServerGroup.style.display = serverSelect.value === 'custom' ? 'flex' : 'none';
  });

  saveSettingsBtn.addEventListener('click', () => {
    state.server = serverSelect.value;
    state.customUrl = customServerUrl.value.trim();
    localStorage.setItem('media_server', state.server);
    localStorage.setItem('media_custom_url', state.customUrl);
    settingsModal.classList.remove('open');
    setStatus('Настройки сохранены', 'success');
  });
}

// Service Worker for PWA
function registerSW() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(err => {
        console.log('SW registration failed:', err);
      });
    });
  }
}

// Run
init();
