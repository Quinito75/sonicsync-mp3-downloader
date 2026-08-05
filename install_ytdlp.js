const fs = require('fs');
const path = require('path');
const https = require('https');

const isWin = process.platform === 'win32';
const binaryName = isWin ? 'yt-dlp.exe' : 'yt-dlp';
const targetPath = path.join(__dirname, binaryName);

if (fs.existsSync(targetPath)) {
  console.log(`✅ yt-dlp já instalado em ${targetPath}`);
  process.exit(0);
}

console.log(`📥 Baixando executável do yt-dlp para a plataforma (${process.platform})...`);

const downloadUrl = isWin
  ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
  : 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';

function downloadBinary(url) {
  https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      return downloadBinary(res.headers.location);
    }
    if (res.statusCode !== 200) {
      console.error(`❌ Falha ao baixar yt-dlp: status ${res.statusCode}`);
      process.exit(1);
    }

    const fileStream = fs.createWriteStream(targetPath);
    res.pipe(fileStream);

    fileStream.on('finish', () => {
      fileStream.close();
      if (!isWin) {
        try {
          fs.chmodSync(targetPath, '755');
        } catch (e) {
          console.warn('Aviso: Não foi possível aplicar chmod 755:', e.message);
        }
      }
      console.log(`🎉 yt-dlp instalado com sucesso em: ${targetPath}`);
    });
  }).on('error', (err) => {
    console.error('❌ Erro no download do yt-dlp:', err.message);
  });
}

downloadBinary(downloadUrl);
