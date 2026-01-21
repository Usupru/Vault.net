const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const session = require('express-session');

const archiver = require('archiver');
const { execSync } = require('child_process');

const app = express();


// Configuracion de express-session

app.use(session({

  secret: 'mi_secreto',

  resave: false,

  saveUninitialized: true

}));




// Middleware para leer los datos de la solicitud
app.use(express.urlencoded({ extended: true }));

// Configuraci�n de multer para manejar las subidas de archivos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, 'uploads');

    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }

    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 25 * 1024 * 1024 }
});

const escapeHtml = (value) => (
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
);

const formatBytes = (bytes) => {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, index);
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
};

const getDiskFreeSpace = () => {
  try {
    if (process.platform === 'win32') {
      const driveRoot = path.parse(__dirname).root || 'C:\\';
      const driveLetter = `${driveRoot[0]}:`;
      const output = execSync(
        `wmic logicaldisk where "DeviceID='${driveLetter}'" get FreeSpace,Size /value`,
        { encoding: 'utf8' }
      );
      const lines = output.split(/\r?\n/);
      const freeLine = lines.find((line) => line.startsWith('FreeSpace='));
      if (!freeLine) {
        return null;
      }
      const free = Number.parseInt(freeLine.split('=')[1], 10);
      return Number.isNaN(free) ? null : free;
    }

    const dfOutput = execSync(`df -k "${__dirname}"`, { encoding: 'utf8' });
    const dfLines = dfOutput.trim().split(/\r?\n/);
    if (dfLines.length < 2) {
      return null;
    }
    const parts = dfLines[1].trim().split(/\s+/);
    const freeKb = Number.parseInt(parts[3], 10);
    return Number.isNaN(freeKb) ? null : freeKb * 1024;
  } catch (error) {
    return null;
  }
};

const getUploadedFileCount = () => {
  const uploadsFolder = path.join(__dirname, 'uploads');
  if (!fs.existsSync(uploadsFolder)) {
    return 0;
  }

  return fs.readdirSync(uploadsFolder).reduce((count, entry) => {
    if (entry === 'metadata') {
      return count;
    }

    const entryPath = path.join(uploadsFolder, entry);
    try {
      return fs.statSync(entryPath).isFile() ? count + 1 : count;
    } catch (error) {
      return count;
    }
  }, 0);
};

const renderIndex = (res) => {
  const indexTemplate = path.join(__dirname, 'public', 'index.html');
  const freeSpace = getDiskFreeSpace();
  const fileCount = getUploadedFileCount();

  fs.readFile(indexTemplate, 'utf8', (err, html) => {
    if (err) {
      return res.status(500).send('<h1>Error al cargar la p�gina</h1>');
    }

    const updatedHtml = html
      .replace('{{FREE_SPACE}}', freeSpace === null ? 'N/D' : formatBytes(freeSpace))
      .replace('{{FILE_COUNT}}', `${fileCount}`);

    res.send(updatedHtml);
  });
};

const removeEntry = (id) => {
  const metadataFile = path.join(__dirname, 'uploads', 'metadata', `${id}.json`);
  if (!fs.existsSync(metadataFile)) {
    return false;
  }

  let metadata;
  try {
    metadata = JSON.parse(fs.readFileSync(metadataFile, 'utf8'));
  } catch (error) {
    return false;
  }

  const files = Array.isArray(metadata.files) ? metadata.files : [];
  files.forEach((file) => {
    if (!file?.path) {
      return;
    }
    const filePath = path.join(__dirname, 'uploads', file.path);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      // Ignore delete errors to continue processing others.
    }
  });

  try {
    fs.unlinkSync(metadataFile);
  } catch (error) {
    return false;
  }

  return true;
};

// Rutas para las p�ginas est�ticas
app.get('/', (req, res) => {
  renderIndex(res);
});

app.get('/index.html', (req, res) => {
  renderIndex(res);
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'subdomains', 'login.html'));
});

app.get('/error', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'subdomains', 'error.html'));
});

app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'subdomains', 'register.html'));
});

app.get('/recover', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'subdomains', 'recover.html'));
});

app.get('/explore', (req, res) => {
  const exploreTemplate = path.join(__dirname, 'public', 'subdomains', 'explore.html');
  const metadataFolder = path.join(__dirname, 'uploads', 'metadata');
  let cardsHtml = '';

  if (fs.existsSync(metadataFolder)) {
    const files = fs.readdirSync(metadataFolder).filter((file) => file.endsWith('.json'));
    const sorted = files.sort((a, b) => {
      const aId = Number.parseInt(path.basename(a, '.json'), 10);
      const bId = Number.parseInt(path.basename(b, '.json'), 10);
      return (Number.isNaN(bId) ? 0 : bId) - (Number.isNaN(aId) ? 0 : aId);
    });

    cardsHtml = sorted.map((file) => {
      const metadataPath = path.join(metadataFolder, file);
      let metadata;
      try {
        metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
      } catch (error) {
        return '';
      }

      const title = escapeHtml(metadata?.title || 'Sin t�tulo');
      const description = escapeHtml(metadata?.description || '');
      const category = escapeHtml(metadata?.category || 'otros');
      const id = escapeHtml(metadata?.id || path.basename(file, '.json'));
      const createdAtRaw = metadata?.createdAt || metadata?.id || path.basename(file, '.json');
      const createdAt = escapeHtml(createdAtRaw);

      return `
            <div class="note-card" data-description="${description}" data-title="${title}" data-category="${category}" data-created="${createdAt}">
                <label class="select-card">
                    <input type="checkbox" class="note-select" value="${id}">
                    <span class="select-indicator"></span>
                </label>
                <a href="/explore/${id}" class="note-title">${title}</a>

                <p class="description">${description}</p>
            </div>
      `.trim();
    }).filter(Boolean).join('\n');
  }

  if (!cardsHtml) {
    cardsHtml = `
            <div class="note-card" data-description="No hay subidos a?n." data-title="" data-category="otros" data-created="0">
                <a href="#" class="note-title">No hay archivos subidos</a>

                <p class="description">Sube el primero desde la pagina de subida.</p>
            </div>
    `.trim();
  }

  fs.readFile(exploreTemplate, 'utf8', (err, html) => {
    if (err) {
      return res.status(500).send('<h1>Error al cargar la p�gina</h1>');
    }

    const modifiedHtml = html.replace('<!-- NOTES_PLACEHOLDER -->', cardsHtml);
    res.send(modifiedHtml);
  });
});

app.get('/upload', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'subdomains', 'upload.html'));
});

// Ruta para borrar un archivo completo
app.post('/delete/:id', (req, res) => {
  const deleted = removeEntry(req.params.id);
  if (!deleted) {
    return res.status(404).send('<h1>Archivo no encontrado</h1>');
  }

  res.redirect('/explore');
});

// Ruta para borrar m�ltiples archivos
app.post('/delete-batch', (req, res) => {
  const idsRaw = req.body?.ids || '';
  const ids = idsRaw
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

  ids.forEach((id) => {
    removeEntry(id);
  });

  res.redirect('/explore');
});

// Ruta para procesar la subida de archivos
app.post('/upload', (req, res) => {
  upload.array('files', 15)(req, res, (err) => {
    if (err) {
      return res
        .status(400)
        .send(`<h1>Error al subir archivos</h1><p>${escapeHtml(err.message)}</p>`);
    }

    if (!req.files || req.files.length === 0) {
      return res
        .status(400)
        .send('<h1>Hubo un error</h1><p>No se subieron archivos. Por favor, intent� de nuevo.</p>');
    }

    // Generar un ID �nico para la carga usando Date.now()
    const uniqueId = Date.now().toString();

    // Guardar la informaci�n de los archivos y metadatos
    const metadata = {
      id: uniqueId,
      createdAt: new Date().toISOString(),
      title: req.body.title || 'Sin t�tulo',
      description: req.body.description || '',
      category: (req.body.category || 'otros').toLowerCase(),
      files: req.files.map((file) => ({
        path: file.filename,
        filename: file.originalname
      }))
    };

    // Crear una carpeta para los metadatos si no existe
    const metadataFolder = path.join(__dirname, 'uploads', 'metadata');
    if (!fs.existsSync(metadataFolder)) {
      fs.mkdirSync(metadataFolder, { recursive: true });
    }

    // Guardar el archivo JSON con los metadatos
    const metadataFile = path.join(metadataFolder, `${uniqueId}.json`);
    fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2));

    // Redirigir a la p�gina de publicaci�n
    res.redirect(`/explore/${uniqueId}`);
  });
});

// Ruta para mostrar los archivos p�blicos de un ID �nico
app.get('/explore/:id', (req, res) => {
  const metadataFile = path.join(
    __dirname,
    'uploads',
    'metadata',
    `${req.params.id}.json`
  );

  // Verificar si el archivo JSON de metadatos existe
  if (!fs.existsSync(metadataFile)) {
    return res.status(404).send('<h1>Archivo no encontrado</h1>');
  }

  const metadata = JSON.parse(fs.readFileSync(metadataFile, 'utf8'));

  const htmlTemplatePath = path.join(
    __dirname,
    'public',
    'plantillas',
    'resumenGratis',
    'plantillaResumenG.html'
  );

  fs.readFile(htmlTemplatePath, 'utf8', (err, html) => {
    if (err) {
      return res.status(500).send('<h1>Error al cargar la plantilla</h1>');
    }

    const safeTitle = escapeHtml(metadata.title || 'Sin t�tulo');
    const safeDescription = escapeHtml(metadata.description || '');

    // Modificar din�micamente la plantilla HTML
    let modifiedHtml = html
      .replace(/<title>.*<\/title>/, `<title>${safeTitle}</title>`)
      .replace(/<h2>.*<\/h2>/, `<h2>${safeTitle}</h2>`)
      .replace(
        /<p class="description">.*<\/p>/,
        `<p class="description">${safeDescription}</p>`
      )
      .replace(
        /<button[^>]*class="download-btn">Descargar<\/button>/,
        `<button onclick="window.location.href='/download/${req.params.id}'" class="download-btn">Descargar todo</button>`
      )
      .replace(/\/delete\/ID/g, `/delete/${req.params.id}`);

    const files = Array.isArray(metadata.files) ? metadata.files : [];
    const fileListHtml = files.map((file, index) => {
      const filePath = path.join(__dirname, 'uploads', file.path);
      let fileSize = '';
      try {
        const stats = fs.statSync(filePath);
        fileSize = formatBytes(stats.size);
      } catch (error) {
        fileSize = '';
      }

      return `
            <li class="file-item">
                <div>
                    <span class="file-name">${escapeHtml(file.filename)}</span>
                    ${fileSize ? `<span class="file-size">${fileSize}</span>` : ''}
                </div>
                <a href="/download/${req.params.id}/${index}" class="file-download">Descargar</a>
            </li>
      `.trim();
    }).join('\n');

    const renderedList = fileListHtml || '<li class="file-item empty">No hay archivos disponibles.</li>';
    modifiedHtml = modifiedHtml.replace('<!-- FILE_LIST_PLACEHOLDER -->', renderedList);

    // Enviar el HTML modificado al cliente
    res.send(modifiedHtml);
  });
});

// Ruta para descargar un archivo individual
app.get('/download/:id/:index', (req, res) => {
  const metadataFile = path.join(
    __dirname,
    'uploads',
    'metadata',
    `${req.params.id}.json`
  );

  if (!fs.existsSync(metadataFile)) {
    return res.status(404).send('<h1>Archivo no encontrado</h1>');
  }

  const metadata = JSON.parse(fs.readFileSync(metadataFile, 'utf8'));
  const files = Array.isArray(metadata.files) ? metadata.files : [];
  const index = Number.parseInt(req.params.index, 10);
  const fileEntry = files[index];

  if (!fileEntry || !fileEntry.path) {
    return res.status(404).send('<h1>Archivo no encontrado</h1>');
  }

  const filePath = path.join(__dirname, 'uploads', fileEntry.path);
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('<h1>Archivo no encontrado</h1>');
  }

  res.download(filePath, fileEntry.filename || path.basename(fileEntry.path));
});

// Ruta para descargar el archivo completo
app.get('/download/:id', (req, res) => {
  const metadataFile = path.join(
    __dirname,
    'uploads',
    'metadata',
    `${req.params.id}.json`
  );

  if (!fs.existsSync(metadataFile)) {
    return res.status(404).send('<h1>Archivo no encontrado</h1>');
  }

  const metadata = JSON.parse(fs.readFileSync(metadataFile, 'utf8'));
  const files = Array.isArray(metadata.files) ? metadata.files : [];
  const existingFiles = files.filter((file) => (
    file?.path && fs.existsSync(path.join(__dirname, 'uploads', file.path))
  ));

  if (existingFiles.length === 0) {
    return res.status(404).send('<h1>No hay archivos para descargar</h1>');
  }

  const zipFilename = `archivo_${req.params.id}.zip`;
  const zipPath = path.join(__dirname, 'temp', zipFilename);

  if (!fs.existsSync(path.join(__dirname, 'temp'))) {
    fs.mkdirSync(path.join(__dirname, 'temp'), { recursive: true });
  }

  // Crear el flujo de salida del archivo ZIP
  const output = fs.createWriteStream(zipPath);
  const archive = archiver('zip', {
    zlib: { level: 9 }
  });

  // Manejo de eventos
  output.on('close', () => {
    console.log(`Archivo ZIP generado: ${zipPath}`);
    console.log(`Tama�o total: ${archive.pointer()} bytes`);

    // Enviar el archivo ZIP al cliente
    res.download(zipPath, zipFilename, (err) => {
      if (err) {
        console.error('Error al enviar el archivo:', err);
        res.status(500).send('<h1>Error al descargar el archivo</h1>');
      }

      // Eliminar el archivo ZIP temporal despu�s de enviarlo
      try {
        fs.unlinkSync(zipPath);
      } catch (unlinkError) {
        console.error('Error al eliminar el archivo temporal:', unlinkError);
      }
    });
  });

  archive.on('warning', (err) => {
    if (err.code === 'ENOENT') {
      console.warn('Advertencia:', err);
    } else {
      throw err;
    }
  });

  archive.on('error', (err) => {
    throw err;
  });

  // Enlazar la salida al archivo ZIP
  archive.pipe(output);

  // Agregar archivos al ZIP
  existingFiles.forEach((file, index) => {
    const originalName = file.filename || file.path;
    const safeName = `${index + 1}_${path.basename(originalName)}`;
    archive.file(
      path.join(__dirname, 'uploads', file.path),
      { name: safeName }
    );
  });

  // Finalizar el archivo ZIP
  archive.finalize();
});

app.use(express.static(path.join(__dirname, 'public'), { index: false }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Inicia el servidor en el puerto 3000
app.listen(3000, () => {
  console.log('Servidor corriendo en http://localhost:3000');
});