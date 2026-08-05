document.addEventListener('DOMContentLoaded', () => {
  const urlInput = document.getElementById('youtube-url');
  const pasteBtn = document.getElementById('paste-btn');
  const analyzeBtn = document.getElementById('analyze-btn');
  const loader = document.getElementById('loader');
  const loaderText = document.getElementById('loader-text');
  const errorAlert = document.getElementById('error-alert');
  const errorMessage = document.getElementById('error-message');
  const resultContainer = document.getElementById('result-container');

  // Single View Elements
  const singleView = document.getElementById('single-video-view');
  const coverPreview = document.getElementById('cover-preview');
  const coverDropzone = document.getElementById('cover-dropzone');
  const coverFileInput = document.getElementById('cover-file-input');
  const metaTitle = document.getElementById('meta-title');
  const metaArtist = document.getElementById('meta-artist');
  const metaAlbum = document.getElementById('meta-album');
  const metaYear = document.getElementById('meta-year');
  const metaTrack = document.getElementById('meta-track');
  const metaBitrate = document.getElementById('meta-bitrate');
  const cleanTitleBtn = document.getElementById('clean-title-btn');
  const convertSingleBtn = document.getElementById('convert-single-btn');
  const singleProgressBox = document.getElementById('single-progress-box');
  const singleProgressFill = document.getElementById('single-progress-fill');
  const singleStatusText = document.getElementById('single-status-text');
  const singleStatusPercent = document.getElementById('single-status-percent');
  const singleDownloadResult = document.getElementById('single-download-result');
  const audioPreview = document.getElementById('audio-preview');
  const audioVisualizer = document.getElementById('audio-visualizer');
  const singleDownloadLink = document.getElementById('single-download-link');

  // Playlist View Elements
  const playlistView = document.getElementById('playlist-view');
  const playlistTitleDisplay = document.getElementById('playlist-title-display');
  const playlistMetaDisplay = document.getElementById('playlist-meta-display');
  const convertPlaylistBtn = document.getElementById('convert-playlist-btn');
  const selectAllCheckbox = document.getElementById('select-all-checkbox');
  const selectedCountBadge = document.getElementById('selected-count-badge');
  const tracksList = document.getElementById('playlist-tracks-list');
  const playlistProgressBox = document.getElementById('playlist-progress-box');
  const playlistProgressFill = document.getElementById('playlist-progress-fill');
  const playlistStatusText = document.getElementById('playlist-status-text');
  const playlistStatusPercent = document.getElementById('playlist-status-percent');
  const playlistDownloadResult = document.getElementById('playlist-download-result');
  const playlistDownloadLink = document.getElementById('playlist-download-link');

  let currentData = null;
  let customCoverDataUrl = null;

  // Discography Gallery & See All interactions (Refinamento.txt Specification)
  const albumTiles = document.querySelectorAll('.album-tile, .album-card');
  const bannerSeeAllBtn = document.getElementById('banner-see-all-btn');

  albumTiles.forEach(tile => {
    tile.addEventListener('click', () => {
      const url = tile.dataset.url;
      const title = tile.dataset.track || tile.dataset.title;
      const artist = tile.dataset.artist;
      const album = tile.dataset.title;
      const year = tile.dataset.year;

      if (url) {
        urlInput.value = url;
        
        // Auto-fill pre-selected metadata and cover art if clicked from mural
        if (title) metaTitle.value = title;
        if (artist) metaArtist.value = artist;
        if (album) metaAlbum.value = album;
        if (year) metaYear.value = year;

        const tileImg = tile.querySelector('img');
        if (tileImg && tileImg.src) {
          coverPreview.src = tileImg.src;
          customCoverDataUrl = tileImg.src;
        }

        const mainCard = document.querySelector('.main-card');
        if (mainCard) {
          mainCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        setTimeout(() => analyzeBtn.click(), 350);
      }
    });
  });

  if (bannerSeeAllBtn) {
    bannerSeeAllBtn.addEventListener('click', () => {
      const gallerySection = document.querySelector('.full-width-gallery-section');
      if (gallerySection) {
        gallerySection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }

  // 2. Custom Cover Art Upload & Drag-and-Drop
  coverDropzone.addEventListener('click', () => coverFileInput.click());

  coverFileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleCoverFile(e.target.files[0]);
    }
  });

  ['dragenter', 'dragover'].forEach(eventName => {
    coverDropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      coverDropzone.classList.add('drag-over');
    });
  });

  ['dragleave', 'drop'].forEach(eventName => {
    coverDropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      coverDropzone.classList.remove('drag-over');
    });
  });

  coverDropzone.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (files && files[0] && files[0].type.startsWith('image/')) {
      handleCoverFile(files[0]);
    }
  });

  function handleCoverFile(file) {
    const reader = new FileReader();
    reader.onload = (evt) => {
      customCoverDataUrl = evt.target.result;
      coverPreview.src = customCoverDataUrl;
    };
    reader.readAsDataURL(file);
  }

  // 3. Clean Title Button (Smart Metadata Utils)
  cleanTitleBtn.addEventListener('click', () => {
    let title = metaTitle.value;
    if (!title) return;

    // Clean common YouTube clutter
    title = title
      .replace(/[\(\[\{]\s*(official\s*(video|music\s*video|audio|lyric\s*video|lyrics)?|4k|hd|remastered|remaster|visualizer|amv|prod\.[^)]*)\s*[\)\]\}]/gi, '')
      .replace(/\b(official\s*video|official\s*audio|hd\s*remaster|4k)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    metaTitle.value = title;
  });

  // 4. Web Audio API Canvas Visualizer
  let audioCtx = null;
  let analyser = null;
  let sourceNode = null;
  let visualizerAnimId = null;

  function initAudioVisualizer() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      sourceNode = audioCtx.createMediaElementSource(audioPreview);
      sourceNode.connect(analyser);
      analyser.connect(audioCtx.destination);
    }
  }

  audioPreview.addEventListener('play', () => {
    initAudioVisualizer();
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    drawVisualizer();
  });

  audioPreview.addEventListener('pause', () => {
    if (visualizerAnimId) cancelAnimationFrame(visualizerAnimId);
  });

  function drawVisualizer() {
    if (!analyser) return;
    const canvas = audioVisualizer;
    const ctx = canvas.getContext('2d');
    const width = canvas.width = canvas.clientWidth;
    const height = canvas.height = canvas.clientHeight;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    function renderFrame() {
      visualizerAnimId = requestAnimationFrame(renderFrame);
      analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, width, height);

      const barWidth = (width / bufferLength) * 1.5;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * height;

        // Dynamic neon gradient
        const gradient = ctx.createLinearGradient(0, height, 0, 0);
        gradient.addColorStop(0, '#6366f1');
        gradient.addColorStop(0.5, '#a855f7');
        gradient.addColorStop(1, '#ec4899');

        ctx.fillStyle = gradient;
        ctx.fillRect(x, height - barHeight, barWidth - 2, barHeight);

        x += barWidth + 1;
      }
    }
    renderFrame();
  }

  // Paste from clipboard
  pasteBtn.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        urlInput.value = text.trim();
        analyzeUrl();
      }
    } catch (err) {
      showError('Permissão para colar da área de transferência negada. Cole manualmente.');
    }
  });

  // Trigger Analyze on Enter
  urlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') analyzeUrl();
  });

  analyzeBtn.addEventListener('click', analyzeUrl);

  function showError(msg) {
    errorMessage.textContent = msg;
    errorAlert.classList.remove('hidden');
    loader.classList.add('hidden');
  }

  function hideError() {
    errorAlert.classList.add('hidden');
  }

  // Analyze YouTube URL
  async function analyzeUrl() {
    const url = urlInput.value.trim();
    if (!url) {
      showError('Por favor, cole um link válido do YouTube.');
      return;
    }

    hideError();
    customCoverDataUrl = null;
    resultContainer.classList.add('hidden');
    singleView.classList.add('hidden');
    playlistView.classList.add('hidden');
    singleDownloadResult.classList.add('hidden');
    playlistDownloadResult.classList.add('hidden');
    singleProgressBox.classList.add('hidden');
    playlistProgressBox.classList.add('hidden');
    loaderText.textContent = 'Analisando link e extraindo metadados...';
    loader.classList.remove('hidden');

    try {
      const res = await fetch(`/api/info?url=${encodeURIComponent(url)}`);
      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || 'Falha ao analisar URL');
      }

      currentData = data;
      loader.classList.add('hidden');
      resultContainer.classList.remove('hidden');

      if (data.isPlaylist) {
        renderPlaylistView(data);
      } else {
        renderSingleView(data);
      }
    } catch (err) {
      showError(err.message);
    }
  }

  // Render Single Video Form
  function renderSingleView(data) {
    singleView.classList.remove('hidden');
    coverPreview.src = data.thumbnail || 'https://via.placeholder.com/300x300?text=Sem+Capa';
    metaTitle.value = data.title || '';
    metaArtist.value = data.artist || '';
    metaAlbum.value = data.album || 'YouTube MP3';
    metaYear.value = data.year || new Date().getFullYear().toString();
    metaTrack.value = '1/1';
  }

  // Render Playlist View
  function renderPlaylistView(data) {
    playlistView.classList.remove('hidden');
    playlistTitleDisplay.textContent = data.title || 'Playlist do YouTube';
    playlistMetaDisplay.innerHTML = `<i class="fa-solid fa-layer-group"></i> ${data.totalTracks} Faixas · Canal: ${data.uploader || 'Vários Artistas'}`;

    tracksList.innerHTML = '';
    data.entries.forEach((track, i) => {
      const card = document.createElement('div');
      card.className = 'track-card';
      card.dataset.index = i;

      const formatDuration = (sec) => {
        if (!sec) return '';
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m}:${s < 10 ? '0' : ''}${s}`;
      };

      card.innerHTML = `
        <input type="checkbox" class="track-select-checkbox" checked data-index="${i}">
        <img src="${track.thumbnail}" alt="Thumb" class="track-thumb">
        <div class="track-inputs">
          <input type="text" class="track-title-input" value="${escapeHtml(track.title)}" placeholder="Título">
          <input type="text" class="track-artist-input" value="${escapeHtml(track.artist)}" placeholder="Artista">
        </div>
        <span class="track-duration">${formatDuration(track.duration)}</span>
      `;
      tracksList.appendChild(card);
    });

    updateSelectedCount();

    // Checkbox events
    tracksList.querySelectorAll('.track-select-checkbox').forEach(cb => {
      cb.addEventListener('change', updateSelectedCount);
    });
  }

  selectAllCheckbox.addEventListener('change', (e) => {
    const isChecked = e.target.checked;
    tracksList.querySelectorAll('.track-select-checkbox').forEach(cb => {
      cb.checked = isChecked;
    });
    updateSelectedCount();
  });

  function updateSelectedCount() {
    const checked = tracksList.querySelectorAll('.track-select-checkbox:checked').length;
    selectedCountBadge.textContent = `${checked} faixas selecionadas`;
  }

  function escapeHtml(str) {
    return (str || '').replace(/"/g, '&quot;');
  }

  // Convert Single Video
  convertSingleBtn.addEventListener('click', async () => {
    if (!currentData) return;

    hideError();
    singleProgressBox.classList.remove('hidden');
    singleDownloadResult.classList.add('hidden');
    convertSingleBtn.disabled = true;

    let progress = 10;
    singleProgressFill.style.width = '10%';
    singleStatusPercent.textContent = '10%';
    singleStatusText.textContent = 'Baixando áudio do YouTube...';

    const interval = setInterval(() => {
      if (progress < 85) {
        progress += Math.floor(Math.random() * 8) + 2;
        singleProgressFill.style.width = `${progress}%`;
        singleStatusPercent.textContent = `${progress}%`;
        if (progress > 50) singleStatusText.textContent = 'Convertendo e injetando tags ID3v2.3 para Android...';
      }
    }, 400);

    const payload = {
      url: currentData.url,
      title: metaTitle.value.trim(),
      artist: metaArtist.value.trim(),
      album: metaAlbum.value.trim(),
      year: metaYear.value.trim(),
      genre: 'Music',
      trackNumber: metaTrack.value.trim(),
      customCoverUrl: customCoverDataUrl || currentData.thumbnail,
      bitrate: metaBitrate.value
    };

    try {
      const res = await fetch('/api/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      clearInterval(interval);

      if (!res.ok || data.error) {
        throw new Error(data.error || 'Erro durante a conversão.');
      }

      singleProgressFill.style.width = '100%';
      singleStatusPercent.textContent = '100%';
      singleStatusText.textContent = 'Conversão concluída!';

      setTimeout(() => {
        singleProgressBox.classList.add('hidden');
        singleDownloadResult.classList.remove('hidden');
        audioPreview.src = data.downloadUrl;
        singleDownloadLink.href = data.downloadUrl;
        singleDownloadLink.setAttribute('download', `${data.title}.mp3`);
        convertSingleBtn.disabled = false;
      }, 500);

    } catch (err) {
      clearInterval(interval);
      singleProgressBox.classList.add('hidden');
      convertSingleBtn.disabled = false;
      showError(err.message);
    }
  });

  // Convert Playlist Batch
  convertPlaylistBtn.addEventListener('click', async () => {
    if (!currentData || !currentData.entries) return;

    const checkedBoxes = tracksList.querySelectorAll('.track-select-checkbox:checked');
    if (checkedBoxes.length === 0) {
      showError('Selecione pelo menos uma faixa da playlist para converter.');
      return;
    }

    hideError();
    playlistProgressBox.classList.remove('hidden');
    playlistDownloadResult.classList.add('hidden');
    convertPlaylistBtn.disabled = true;

    const selectedTracks = [];
    checkedBoxes.forEach(cb => {
      const idx = parseInt(cb.dataset.index);
      const card = tracksList.children[idx];
      const trackObj = currentData.entries[idx];
      const titleInput = card.querySelector('.track-title-input').value.trim();
      const artistInput = card.querySelector('.track-artist-input').value.trim();

      selectedTracks.push({
        url: trackObj.url,
        title: titleInput || trackObj.title,
        artist: artistInput || trackObj.artist,
        thumbnail: trackObj.thumbnail
      });
    });

    let progress = 5;
    playlistProgressFill.style.width = '5%';
    playlistStatusPercent.textContent = '5%';
    playlistStatusText.textContent = `Processando ${selectedTracks.length} faixas em lote...`;

    const interval = setInterval(() => {
      if (progress < 90) {
        progress += Math.floor(Math.random() * 5) + 1;
        playlistProgressFill.style.width = `${progress}%`;
        playlistStatusPercent.textContent = `${progress}%`;
        playlistStatusText.textContent = `Convertendo faixas e gravando tags ID3 (${Math.round((progress/100)*selectedTracks.length)}/${selectedTracks.length})...`;
      }
    }, 600);

    try {
      const res = await fetch('/api/convert-playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playlistTitle: currentData.title,
          tracks: selectedTracks,
          bitrate: '320k'
        })
      });

      const data = await res.json();
      clearInterval(interval);

      if (!res.ok || data.error) {
        throw new Error(data.error || 'Erro na conversão do pacote.');
      }

      playlistProgressFill.style.width = '100%';
      playlistStatusPercent.textContent = '100%';
      playlistStatusText.textContent = 'Pacote ZIP gerado com sucesso!';

      setTimeout(() => {
        playlistProgressBox.classList.add('hidden');
        playlistDownloadResult.classList.remove('hidden');
        playlistDownloadLink.href = data.downloadUrl;
        playlistDownloadLink.setAttribute('download', `${data.playlistTitle}.zip`);
        convertPlaylistBtn.disabled = false;
      }, 600);

    } catch (err) {
      clearInterval(interval);
      playlistProgressBox.classList.add('hidden');
      convertPlaylistBtn.disabled = false;
      showError(err.message);
    }
  });
});
