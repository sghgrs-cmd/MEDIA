// MEDIA DL Web App Client Logic

const state = {
  mode: 'audio', // 'audio', 'video', 'playlist'
  resolution: '1080',
  bitrate: '320',
  playlistFormat: 'mp3',
  server: localStorage.getItem('media_server') || 'auto',
  customUrl: localStorage.getItem('media_custom_url') || '',
  history: JSON.parse(localStorage.getItem('media_history') || '[]'),
};

// Check if running directly on local yt-dlp backend or custom server
function getServerBase() {
  const isDirectServer = window.location.hostname !== 'sghgrs-cmd.github.io' && 
    (window.location.port === '5000' || window.location.hostname.includes('trycloudflare.com') || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  if (isDirectServer) return window.location.origin;
  if (state.server === 'custom' && state.customUrl) return state.customUrl.trim().replace(/\/$/, '');
  return null;
}

// Known public endpoints with fallback
const API_ENDPOINTS = [
  'https://cobalt.tools/api/json',
  'https://api.cobalt.tools/',
  'https://cobalt-api.kwiatekm.tokyo/api/json',
  'https://dl.khann.me/api/json'
];

const INVIDIOUS_INSTANCES = [
  'https://inv.nadeko.net',
  'https://invidious.jing.rocks',
  'https://yt.artemislena.eu',
  'https://invidious.drgns.space'
];

// DOM elements
const urlInput = document.getElementById('urlInput');
const pasteBtn = document.getElementById('pasteBtn');
const startBtn = document.getElementById('startBtn');
const startBtnText = document.getElementById('startBtnText');
const statusBox = document.getElementById('statusBox');
const statusText = document.getElementById('statusText');

// Result Cards
const resultCard = document.getElementById('resultCard');
const resultTitle = document.getElementById('resultTitle');
const resultMeta = document.getElementById('resultMeta');
const resultThumb = document.getElementById('resultThumb');
const resultBadge = document.getElementById('resultBadge');
const platformTag = document.getElementById('platformTag');
const directDownloadLink = document.getElementById('directDownloadLink');

// Playlist Card
const playlistCard = document.getElementById('playlistCard');
const playlistTitle = document.getElementById('playlistTitle');
const playlistCountBadge = document.getElementById('playlistCountBadge');
const playlistItemsList = document.getElementById('playlistItemsList');
const batchDownloadBtn = document.getElementById('batchDownloadBtn');

// Options Groups
const videoQualityGroup = document.getElementById('videoQualityGroup');
const audioQualityGroup = document.getElementById('audioQualityGroup');
const playlistOptionsGroup = document.getElementById('playlistOptionsGroup');

// History
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

// Tabs (Audio / Video / Playlist)
function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.mode = btn.dataset.mode;
      updateModeUI();
    });
  });
}

function updateModeUI() {
  videoQualityGroup.style.display = 'none';
  audioQualityGroup.style.display = 'none';
  playlistOptionsGroup.style.display = 'none';

  if (state.mode === 'video') {
    videoQualityGroup.style.display = 'flex';
    startBtnText.textContent = 'Скачать видео (MP4)';
  } else if (state.mode === 'playlist') {
    playlistOptionsGroup.style.display = 'flex';
    startBtnText.textContent = 'Загрузить плейлист';
  } else {
    audioQualityGroup.style.display = 'flex';
    startBtnText.textContent = 'Скачать музыку (MP3)';
  }
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

  document.querySelectorAll('#playlistFormatSelector .pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('#playlistFormatSelector .pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      state.playlistFormat = pill.dataset.plformat;
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
          detectPlatformAndType(text.trim());
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
    detectPlatformAndType(urlInput.value.trim());
  });
}

// Auto detect platform and if it is a playlist
function detectPlatformAndType(url) {
  if (!url) return;
  const lower = url.toLowerCase();

  // Auto switch tab if playlist detected
  if (lower.includes('list=') || lower.includes('/playlist') || lower.includes('album_')) {
    const plBtn = document.querySelector('.tab-btn[data-mode="playlist"]');
    if (plBtn && state.mode !== 'playlist') {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      plBtn.classList.add('active');
      state.mode = 'playlist';
      updateModeUI();
      setStatus('Обнаружен плейлист!', 'active');
      return;
    }
  }

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

// Main Action Button Click
startBtn.addEventListener('click', async () => {
  const url = urlInput.value.trim();
  if (!url) {
    setStatus('Пожалуйста, вставьте ссылку!', 'error');
    urlInput.focus();
    return;
  }

  startBtn.classList.add('loading');
  resultCard.style.display = 'none';
  playlistCard.style.display = 'none';

  if (state.mode === 'playlist' || url.includes('list=')) {
    // Playlist processing
    await handlePlaylistDownload(url);
  } else {
    // Single Track / Video processing
    await handleSingleDownload(url);
  }

  startBtn.classList.remove('loading');
});

// Single Download Logic
async function handleSingleDownload(url) {
  setStatus('Подключение к серверу и обработка медиа...', 'active');
  try {
    const data = await requestDownload(url, state.mode);
    if (data && data.url) {
      showResult(data, url);
      setStatus('Готово! Файл готов к сохранению', 'success');
      addToHistory(data.title || 'Медиа файл', url, state.mode);
    } else {
      throw new Error('Не удалось получить прямую ссылку');
    }
  } catch (err) {
    console.error(err);
    setStatus('Используется резервный шлюз загрузки', 'active');
    provideFallbackDownload(url);
  }
}

// Playlist Download Logic
async function handlePlaylistDownload(url) {
  setStatus('Получение списка треков из плейлиста...', 'active');
  
  // 1. Try local or custom yt-dlp server first if available
  const serverBase = getServerBase();
  if (serverBase) {
    try {
      const res = await fetch(`${serverBase}/api/playlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      if (res.ok) {
        const plData = await res.json();
        if (plData.videos && plData.videos.length > 0) {
          showPlaylist(plData);
          setStatus(`Плейлист загружен через yt-dlp! Найдено ${plData.videos.length} треков`, 'success');
          addToHistory(plData.title || 'Плейлист', url, 'playlist');
          return;
        }
      }
    } catch (e) {
      console.warn('Custom backend playlist error, trying public APIs:', e);
    }
  }

  // 2. Extract playlist ID for YouTube (public fallback)
  const plMatch = url.match(/[?&]list=([^#&?]+)/);
  const plId = plMatch ? plMatch[1] : null;

  if (plId) {
    let plData = null;
    for (const inst of INVIDIOUS_INSTANCES) {
      try {
        const res = await fetch(`${inst}/api/v1/playlists/${plId}`);
        if (res.ok) {
          plData = await res.json();
          break;
        }
      } catch (e) {}
    }

    if (plData && plData.videos && plData.videos.length > 0) {
      showPlaylist(plData);
      setStatus(`Плейлист загружен! Найдено ${plData.videos.length} треков`, 'success');
      addToHistory(plData.title || 'Плейлист', url, 'playlist');
      return;
    }
  }

  // Fallback for VK / Rutube / external playlists
  setStatus('Открываю плейлист через медиа-сервер...', 'active');
  provideFallbackDownload(url);
}

// Display Playlist Items
function showPlaylist(data) {
  playlistCard.style.display = 'block';
  playlistTitle.textContent = data.title || 'Плейлист';
  playlistCountBadge.textContent = `${data.videos.length} треков`;
  playlistItemsList.innerHTML = '';

  data.videos.forEach((video, index) => {
    const item = document.createElement('div');
    item.className = 'playlist-item';
    const videoUrl = `https://www.youtube.com/watch?v=${video.videoId}`;
    
    item.innerHTML = `
      <div class="playlist-item-left">
        <span class="playlist-item-index">${index + 1}</span>
        <span class="playlist-item-name" title="${video.title}">${video.title}</span>
      </div>
      <button class="playlist-item-dl-btn" data-url="${videoUrl}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="13" height="13" stroke-width="2.5">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
        Скачать
      </button>
    `;

    const dlBtn = item.querySelector('.playlist-item-dl-btn');
    dlBtn.addEventListener('click', async () => {
      dlBtn.textContent = '⏳ Загрузка...';
      try {
        const res = await requestDownload(videoUrl, state.playlistFormat === 'mp3' ? 'audio' : 'video');
        if (res && res.url) {
          window.open(res.url, '_blank');
          dlBtn.textContent = ' Сохранено';
        } else {
          window.open(`https://cobalt.tools/#${encodeURIComponent(videoUrl)}`, '_blank');
          dlBtn.textContent = ' Открыть';
        }
      } catch (e) {
        window.open(`https://cobalt.tools/#${encodeURIComponent(videoUrl)}`, '_blank');
        dlBtn.textContent = ' Открыть';
      }
    });

    playlistItemsList.appendChild(item);
  });

  // Batch download button
  batchDownloadBtn.onclick = () => {
    alert('Начинаю скачивание треков! Браузер откроет загрузку каждого файла по очереди.');
    const buttons = playlistItemsList.querySelectorAll('.playlist-item-dl-btn');
    buttons.forEach((btn, i) => {
      setTimeout(() => btn.click(), i * 2500); // interval to prevent browser popup block
    });
  };

  playlistCard.scrollIntoView({ behavior: 'smooth' });
}

// Request download from APIs
async function requestDownload(url, mode) {
  const payload = {
    url: url,
    downloadMode: mode === 'audio' ? 'audio' : 'auto',
    audioFormat: 'mp3',
    audioBitrate: state.bitrate,
    videoQuality: state.resolution === 'max' ? 'max' : state.resolution,
    filenameStyle: 'pretty'
  };

  const serverBase = getServerBase();
  if (serverBase) {
    try {
      const res = await fetch(`${serverBase}/api/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const data = await res.json();
        if (data.url) {
          const fullUrl = data.url.startsWith('http') ? data.url : `${serverBase}${data.url}`;
          return {
            url: fullUrl,
            title: data.title || data.filename || 'Медиа файл',
            thumb: data.thumb || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&q=80'
          };
        }
      }
    } catch (e) {
      console.warn('Backend server download failed, falling back to public APIs:', e);
    }
  }

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
        if (data.url || data.stream) {
          return {
            url: data.url || data.stream,
            title: data.filename || 'Медиа файл',
            thumb: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&q=80'
          };
        }
      }
    } catch (e) {}
  }

  throw new Error('Сервера временно недоступны');
}

// Fallback Helper
// Fallback Helper with Instant Mobile Download Gateways
function provideFallbackDownload(url) {
  resultCard.style.display = 'block';
  resultTitle.textContent = 'Готово к скачиванию на телефон';
  resultMeta.textContent = state.mode === 'audio' 
    ? `Формат: MP3 • ${state.bitrate} kbps` 
    : `Формат: MP4 • ${state.resolution}p`;
  resultBadge.textContent = state.mode === 'audio' ? 'MP3' : (state.mode === 'playlist' ? 'Плейлист' : 'MP4');
  
  const lower = url.toLowerCase();
  let tag = 'Медиа';
  if (lower.includes('youtube') || lower.includes('youtu.be')) tag = 'YouTube';
  else if (lower.includes('vk')) tag = 'VK Видео';
  else if (lower.includes('rutube')) tag = 'Rutube';
  platformTag.textContent = tag;

  resultThumb.src = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=300&q=80';

  let primaryUrl = '';
  let m1Url = '';
  let m2Url = '';

  if (lower.includes('youtube.com') || lower.includes('youtu.be')) {
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
    const vId = match ? match[1] : '';
    primaryUrl = `https://ssyoutube.com/watch?v=${vId || encodeURIComponent(url)}`;
    m1Url = `https://en.savefrom.net/1-youtube-video-downloader-392cu.html?url=${encodeURIComponent(url)}`;
    m2Url = `https://cobalt.tools/#${encodeURIComponent(url)}`;
  } else {
    primaryUrl = `https://savefrom.net/#url=${encodeURIComponent(url)}`;
    m1Url = `https://ru.savefrom.net/#url=${encodeURIComponent(url)}`;
    m2Url = `https://cobalt.tools/#${encodeURIComponent(url)}`;
  }

  const directDownloadText = document.getElementById('directDownloadText');
  const mirror1Link = document.getElementById('mirror1Link');
  const mirror2Link = document.getElementById('mirror2Link');
  const mirrorButtons = document.getElementById('mirrorButtons');

  directDownloadLink.href = primaryUrl;
  if (directDownloadText) {
    directDownloadText.textContent = state.mode === 'audio' ? '⬇️ Скачать MP3 прямо сейчас' : '⬇️ Скачать MP4 прямо сейчас';
  }
  if (mirror1Link) mirror1Link.href = m1Url;
  if (mirror2Link) mirror2Link.href = m2Url;
  if (mirrorButtons) mirrorButtons.style.display = 'flex';

  setStatus('Готово! Нажмите кнопку ниже для скачивания файла', 'success');
  resultCard.scrollIntoView({ behavior: 'smooth' });
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
  let tag = 'Медиа';
  if (lower.includes('youtube')) tag = 'YouTube';
  else if (lower.includes('vk')) tag = 'VK Видео';
  else if (lower.includes('rutube')) tag = 'Rutube';
  else if (lower.includes('tiktok')) tag = 'TikTok';
  platformTag.textContent = tag;

  if (data.thumb) resultThumb.src = data.thumb;
  directDownloadLink.href = data.url;
  const directDownloadText = document.getElementById('directDownloadText');
  if (directDownloadText) directDownloadText.textContent = 'Сохранить файл на телефон / ПК';

  const mirrorButtons = document.getElementById('mirrorButtons');
  if (mirrorButtons) mirrorButtons.style.display = 'none';

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
      <span class="history-badge">${item.mode.toUpperCase()}</span>
    `;
    div.addEventListener('click', () => {
      urlInput.value = item.url;
      urlInput.focus();
      detectPlatformAndType(item.url);
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
