const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { execFile, exec } = require('child_process');
const axios = require('axios');
const NodeID3 = require('node-id3');
const archiver = require('archiver');

const app = express();
const PORT = process.env.PORT || 3000;
const TEMP_DIR = path.join(__dirname, 'temp');

if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/downloads', express.static(TEMP_DIR));

// Auto-cleanup temp files older than 30 minutes
setInterval(() => {
  fs.readdir(TEMP_DIR, (err, files) => {
    if (err) return;
    const now = Date.now();
    files.forEach(file => {
      const filePath = path.join(TEMP_DIR, file);
      fs.stat(filePath, (err, stats) => {
        if (!err && now - stats.mtimeMs > 30 * 60 * 1000) {
          fs.unlink(filePath, () => {});
        }
      });
    });
  });
}, 10 * 60 * 1000);

// Helper: Run yt-dlp to extract JSON metadata
function getYtDlpJson(targetUrl) {
  return new Promise((resolve, reject) => {
    const args = [
      '--dump-single-json',
      '--flat-playlist',
      '--js-runtimes', 'node',
      '--extractor-args', 'youtube:player_client=android,mweb,web',
      targetUrl
    ];
    execFile('yt-dlp', args, { maxBuffer: 1024 * 1024 * 50 }, (error, stdout, stderr) => {
      if (error) {
        return reject(error.message || stderr);
      }
      try {
        const json = JSON.parse(stdout);
        resolve(json);
      } catch (e) {
        reject('Erro ao interpretar dados do YouTube: ' + e.message);
      }
    });
  });
}

// API: Fetch Metadata (Single Video or Playlist)
app.get('/api/info', async (req, res) => {
  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'URL do YouTube é obrigatória' });
  }

  try {
    const data = await getYtDlpJson(url);
    const isPlaylist = data._type === 'playlist' || (Array.isArray(data.entries) && data.entries.length > 0);

    if (isPlaylist) {
      const entries = (data.entries || []).map((item, idx) => {
        const itemUrl = item.url || (item.id ? `https://www.youtube.com/watch?v=${item.id}` : null);
        const titleParts = (item.title || 'Música ' + (idx + 1)).split(' - ');
        let artist = item.uploader || item.channel || data.uploader || 'Artista Desconhecido';
        let title = item.title;

        if (titleParts.length > 1) {
          artist = titleParts[0].trim();
          title = titleParts.slice(1).join(' - ').trim();
        }

        return {
          id: item.id || 'track_' + idx,
          url: itemUrl,
          title: title,
          artist: artist,
          duration: item.duration || 0,
          thumbnail: item.thumbnails?.[0]?.url || `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`,
          index: idx + 1
        };
      });

      return res.json({
        isPlaylist: true,
        title: data.title || 'Playlist do YouTube',
        uploader: data.uploader || data.channel || 'Vários Artistas',
        totalTracks: entries.length,
        thumbnail: entries[0]?.thumbnail || '',
        entries: entries
      });
    } else {
      const titleParts = (data.title || 'Música').split(' - ');
      let artist = data.uploader || data.channel || 'Artista Desconhecido';
      let title = data.title;

      if (titleParts.length > 1) {
        artist = titleParts[0].trim();
        title = titleParts.slice(1).join(' - ').trim();
      }

      const releaseYear = data.upload_date ? data.upload_date.substring(0, 4) : new Date().getFullYear().toString();
      const bestThumbnail = data.thumbnail || `https://i.ytimg.com/vi/${data.id}/hqdefault.jpg`;

      return res.json({
        isPlaylist: false,
        id: data.id,
        url: data.webpage_url || url,
        title: title,
        artist: artist,
        album: data.album || 'YouTube MP3',
        year: releaseYear,
        genre: 'Music',
        duration: data.duration || 0,
        thumbnail: bestThumbnail
      });
    }
  } catch (err) {
    console.error('Info Error:', err);
    res.status(500).json({ error: 'Falha ao obter informações do vídeo/playlist: ' + err });
  }
});

// Helper: Download or Parse Cover Image Buffer
async function fetchImageBuffer(imageUrl) {
  try {
    if (imageUrl.startsWith('data:image')) {
      const base64Data = imageUrl.replace(/^data:image\/\w+;base64,/, '');
      return Buffer.from(base64Data, 'base64');
    }
    const response = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 10000 });
    return Buffer.from(response.data);
  } catch (e) {
    console.warn('Erro ao obter capa:', e.message);
    return null;
  }
}

// Helper: Convert single video to MP3 and inject ID3 metadata
function convertAndTagTrack({ videoUrl, fileId, title, artist, album, year, genre, trackNumber, totalTracks, customCoverUrl, bitrate = '320k' }) {
  return new Promise((resolve, reject) => {
    const rawOutName = `raw_${fileId}_${Date.now()}`;
    const mp3Name = `track_${fileId}_${Date.now()}.mp3`;
    const mp3Path = path.join(TEMP_DIR, mp3Name);
    const outTemplate = path.join(TEMP_DIR, `${rawOutName}.%(ext)s`);

    // Quality mapping
    let audioQuality = '0'; // 0 = best VBR / 320k
    if (bitrate === '256k') audioQuality = '1';
    if (bitrate === '192k') audioQuality = '2';
    if (bitrate === '128k') audioQuality = '4';

    const args = [
      '-x',
      '--audio-format', 'mp3',
      '--audio-quality', audioQuality,
      '--no-playlist',
      '--js-runtimes', 'node',
      '--extractor-args', 'youtube:player_client=android,mweb,web',
      '-o', outTemplate,
      videoUrl
    ];

    execFile('yt-dlp', args, async (error, stdout, stderr) => {
      if (error) {
        return reject('Erro na conversão do áudio: ' + (stderr || error.message));
      }

      // Find converted file
      const expectedPath = path.join(TEMP_DIR, `${rawOutName}.mp3`);
      let actualMp3Path = expectedPath;
      if (!fs.existsSync(expectedPath)) {
        // Fallback search
        const files = fs.readdirSync(TEMP_DIR);
        const match = files.find(f => f.startsWith(rawOutName));
        if (match) actualMp3Path = path.join(TEMP_DIR, match);
        else return reject('Arquivo MP3 de saída não encontrado');
      }

      // Rename to final path
      fs.renameSync(actualMp3Path, mp3Path);

      // Fetch cover art
      let imageBuffer = null;
      if (customCoverUrl) {
        imageBuffer = await fetchImageBuffer(customCoverUrl);
      }

      // Inject ID3 v2.3 Tags for Android compatibility
      const tags = {
        title: title || 'Música sem título',
        artist: artist || 'Artista Desconhecido',
        album: album || 'YouTube MP3',
        year: String(year || new Date().getFullYear()),
        genre: genre || 'Music',
        trackNumber: totalTracks ? `${trackNumber}/${totalTracks}` : String(trackNumber || '1')
      };

      if (imageBuffer) {
        tags.image = {
          mime: 'image/jpeg',
          type: { id: 3, name: 'front cover' },
          description: 'Cover Art',
          imageBuffer: imageBuffer
        };
      }

      NodeID3.write(tags, mp3Path);

      const stats = fs.statSync(mp3Path);
      resolve({
        filename: mp3Name,
        filePath: mp3Path,
        downloadUrl: `/downloads/${mp3Name}`,
        size: stats.size
      });
    });
  });
}

// API: Single Conversion
app.post('/api/convert', async (req, res) => {
  const { url, title, artist, album, year, genre, trackNumber, totalTracks, customCoverUrl, bitrate } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'URL do vídeo é obrigatória' });
  }

  const fileId = Math.random().toString(36).substring(2, 9);
  try {
    const result = await convertAndTagTrack({
      videoUrl: url,
      fileId,
      title,
      artist,
      album,
      year,
      genre,
      trackNumber,
      totalTracks,
      customCoverUrl,
      bitrate
    });

    res.json({
      success: true,
      title: title || 'Faixa Convertida',
      filename: result.filename,
      downloadUrl: result.downloadUrl,
      size: result.size
    });
  } catch (err) {
    console.error('Convert Error:', err);
    res.status(500).json({ error: String(err) });
  }
});

// API: Batch Playlist Conversion (Returns ZIP archive)
app.post('/api/convert-playlist', async (req, res) => {
  const { playlistTitle, tracks, bitrate } = req.body;
  if (!tracks || !Array.isArray(tracks) || tracks.length === 0) {
    return res.status(400).json({ error: 'Lista de faixas vazia' });
  }

  const zipName = `playlist_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.zip`;
  const zipPath = path.join(TEMP_DIR, zipName);
  const output = fs.createWriteStream(zipPath);
  const archive = archiver('zip', { zlib: { level: 9 } });

  archive.pipe(output);

  const convertedFiles = [];
  try {
    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];
      const fileId = `pl_${i}_${Math.random().toString(36).substring(2, 7)}`;
      try {
        const result = await convertAndTagTrack({
          videoUrl: track.url,
          fileId,
          title: track.title,
          artist: track.artist,
          album: playlistTitle || track.album || 'YouTube Playlist',
          year: track.year || new Date().getFullYear().toString(),
          genre: 'Music',
          trackNumber: i + 1,
          totalTracks: tracks.length,
          customCoverUrl: track.thumbnail,
          bitrate
        });

        // Clean filename inside ZIP
        const safeTrackNum = String(i + 1).padStart(2, '0');
        const safeTitle = (track.title || 'Faixa').replace(/[/\\?%*:|"<>]/g, '_');
        const safeArtist = (track.artist || 'Artista').replace(/[/\\?%*:|"<>]/g, '_');
        const zipItemName = `${safeTrackNum}. ${safeArtist} - ${safeTitle}.mp3`;

        archive.file(result.filePath, { name: zipItemName });
        convertedFiles.push(result.filePath);
      } catch (trackErr) {
        console.error(`Erro ao converter faixa ${i + 1}:`, trackErr);
      }
    }

    await archive.finalize();

    // Clean individual MP3s after archiving
    convertedFiles.forEach(fp => {
      fs.unlink(fp, () => {});
    });

    const stats = fs.statSync(zipPath);
    res.json({
      success: true,
      playlistTitle: playlistTitle || 'Playlist',
      filename: zipName,
      downloadUrl: `/downloads/${zipName}`,
      size: stats.size,
      trackCount: convertedFiles.length
    });
  } catch (err) {
    console.error('Playlist Conversion Error:', err);
    res.status(500).json({ error: 'Erro ao gerar arquivo ZIP da playlist: ' + err });
  }
});

app.listen(PORT, () => {
  console.log(`🎵 Server YouTube MP3 rodando em http://localhost:${PORT}`);
});
