const fs = require('fs');
const path = require('path');
const https = require('https');

const albumsToFetch = [
  {
    id: 'rick_astley',
    searchTerm: 'Rick Astley Whenever You Need Somebody',
    expectedArtist: 'Rick Astley',
    fallbackTitle: 'Whenever You Need Somebody'
  },
  {
    id: 'joao_gomes',
    searchTerm: 'Joao Gomes Digo Ou Nao Digo',
    expectedArtist: 'João Gomes',
    fallbackTitle: 'Digo Ou Não Digo'
  },
  {
    id: 'rita_lee',
    searchTerm: 'Rita Lee 1979',
    expectedArtist: 'Rita Lee',
    fallbackTitle: 'Rita Lee (1979)'
  },
  {
    id: 'matanza',
    searchTerm: 'Matanza Musica para Beber e Brigar',
    expectedArtist: 'Matanza',
    fallbackTitle: 'Música para Beber e Brigar'
  },
  {
    id: 'beatles_revolver',
    searchTerm: 'The Beatles Revolver',
    expectedArtist: 'The Beatles',
    fallbackTitle: 'Revolver'
  },
  {
    id: 'queen_opera',
    searchTerm: 'Queen A Night at the Opera',
    expectedArtist: 'Queen',
    fallbackTitle: 'A Night at the Opera'
  }
];

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (err) {
          reject(err);
        }
      });
    }).on('error', reject);
  });
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadFile(res.headers.location, destPath).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to download ${url}: status ${res.statusCode}`));
      }
      res.pipe(file);
      file.on('finish', () => {
        file.close(() => resolve(destPath));
      });
    }).on('error', (err) => {
      fs.unlink(destPath, () => reject(err));
    });
  });
}

async function run() {
  const imagesDir = path.join(__dirname, 'images');
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
  }

  console.log('🔍 Buscando capas oficiais em alta resolução no iTunes API...');

  for (const item of albumsToFetch) {
    const searchUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(item.searchTerm)}&entity=album&limit=5`;
    try {
      const data = await fetchJson(searchUrl);
      if (data.results && data.results.length > 0) {
        // Pick best matching result
        const match = data.results[0];
        let rawArt = match.artworkUrl100 || match.artworkUrl60;
        // Replace with 600x600bb.jpg for crisp high-res quality
        let highResArt = rawArt.replace('100x100bb', '600x600bb').replace('60x60bb', '600x600bb');
        
        const targetPath = path.join(imagesDir, `${item.id}.jpg`);
        await downloadFile(highResArt, targetPath);
        const stats = fs.statSync(targetPath);
        console.log(`✅ Capa baixada com sucesso: ${item.id}.jpg (${stats.size} bytes) -> ${match.collectionName} por ${match.artistName}`);
      } else {
        console.warn(`⚠️ Nenhum resultado encontrado para: ${item.searchTerm}`);
      }
    } catch (err) {
      console.error(`❌ Erro ao baixar ${item.id}:`, err.message);
    }
  }
}

run();
