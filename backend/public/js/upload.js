// Validación de archivos en la página de subida
const uploadForm = document.getElementById('upload-form');
const fileInput = document.getElementById('file-input');
const uploadArea = document.getElementById('upload-area');
const errorMessage = document.getElementById('error-message');
const previewList = document.getElementById('preview-list');
const uploadPrompt = document.getElementById('upload-prompt');
const titleInput = document.getElementById('title');
let titleTouched = false;

const renderList = (files) => {
    previewList.innerHTML = '';

    if (!files || files.length === 0) {
        uploadArea.classList.remove('has-files');
        return;
    }

    uploadArea.classList.add('has-files');

    Array.from(files).forEach((file) => {
        const item = document.createElement('li');
        item.className = 'preview-item';
        item.textContent = `${file.name} (${formatBytes(file.size)})`;
        previewList.appendChild(item);
    });
};

const formatBytes = (bytes) => {
    if (!Number.isFinite(bytes) || bytes <= 0) {
        return '0 B';
    }

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / Math.pow(1024, index);
    return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
};

const updateTitleFromFiles = (files) => {
    if (!titleInput || titleTouched) {
        return;
    }

    if (!files || files.length === 0) {
        return;
    }

    const first = files[0];
    if (!first || !first.name) {
        return;
    }

    const baseName = first.name.replace(/\.[^/.]+$/, '');
    titleInput.value = baseName || 'Sin título';
};

if (uploadForm && fileInput && uploadArea && errorMessage && previewList && uploadPrompt) {
    uploadForm.addEventListener('submit', function(e) {
        e.preventDefault();

        const files = fileInput.files;
        errorMessage.textContent = '';

        // Verificar que hay archivos seleccionados
        if (files.length === 0) {
            errorMessage.textContent = 'Por favor, seleccioná al menos un archivo.';
            return;
        }

        // Verificar que no se excedan los 15 archivos
        if (files.length > 15) {
            errorMessage.textContent = 'Solo podés subir un máximo de 15 archivos.';
            return;
        }

        // Si todo es correcto, se puede enviar el formulario
        uploadForm.submit();
    });

    if (titleInput) {
        titleInput.addEventListener('input', () => {
            titleTouched = titleInput.value.trim().length > 0;
        });
    }

    fileInput.addEventListener('change', () => {
        renderList(fileInput.files);
        updateTitleFromFiles(fileInput.files);
    });

    // Agregar funcionalidad de arrastrar y soltar
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.style.backgroundColor = 'rgba(12, 18, 28, 0.95)';
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.style.backgroundColor = '';
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.style.backgroundColor = '';

        const files = e.dataTransfer.files;
        fileInput.files = files;
        renderList(files);
        updateTitleFromFiles(files);
    });
}
