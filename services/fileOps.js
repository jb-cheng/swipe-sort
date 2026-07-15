/**
 * Core filesystem operations — no Express dependency.
 * Used by both Electron IPC handlers and the standalone server.
 */
const fs = require('fs');
const path = require('path');

// ── Helpers ───────────────────────────────────────────────────────

function getFileTypeFromExtension(ext) {
  const e = ext.toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(e)) return 'image';
  if (['pdf'].includes(e)) return 'pdf';
  if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(e)) return 'video';
  if (['mp3', 'wav', 'aac', 'flac', 'ogg'].includes(e)) return 'audio';
  if (['doc', 'docx', 'txt', 'md', 'pptx'].includes(e)) return 'doc';
  if (['xls', 'xlsx', 'csv'].includes(e)) return 'spreadsheet';
  if (['zip', 'rar', 'tar', 'gz', 'tar.gz', '7z'].includes(e)) return 'archive';
  if (['js', 'ts', 'jsx', 'tsx', 'json', 'html', 'css', 'py'].includes(e)) return 'code';
  return 'unknown';
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
}

// ── Filesystem operations ─────────────────────────────────────────

/**
 * Scan a directory and return shuffled FileItem array.
 */
function scanFolder(folderPath) {
  const entries = fs.readdirSync(folderPath, { withFileTypes: true });
  const files = entries
    .filter((e) => e.isFile())
    .map((e, index) => {
      const fullName = e.name;
      const extIndex = fullName.lastIndexOf('.');
      const ext = extIndex > 0 ? fullName.slice(extIndex + 1).toLowerCase() : '';
      const name = extIndex > 0 ? fullName.slice(0, extIndex) : fullName;
      const stat = fs.statSync(path.join(folderPath, fullName));
      return {
        id: `file-${index}-${Date.now()}`,
        name,
        extension: ext,
        type: getFileTypeFromExtension(ext),
        size: formatBytes(stat.size),
        date: stat.mtime.toISOString().split('T')[0],
        uri: path.join(folderPath, fullName),
      };
    });

  // Fisher-Yates shuffle
  for (let i = files.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [files[i], files[j]] = [files[j], files[i]];
  }

  return files;
}

/**
 * Move a file into an action-named subfolder.
 * Creates the subfolder if it doesn't exist.
 * Returns an undo record that can be passed to undoSort().
 */
function sortFile(file, action) {
  const sourcePath = file.uri;
  const parentDir = path.dirname(sourcePath);
  const destDir = path.join(parentDir, action.label);
  const destPath = path.join(destDir, file.name + '.' + file.extension);

  fs.mkdirSync(destDir, { recursive: true });
  fs.renameSync(sourcePath, destPath);

  return {
    sourcePath,
    destPath,
  };
}

/**
 * Reverse a sort operation — move the file back to its original location.
 */
function undoSort(undoRecord) {
  const { sourcePath, destPath } = undoRecord;

  if (!fs.existsSync(destPath)) {
    throw new Error(`Cannot undo: file no longer exists at ${destPath}`);
  }

  const parentDir = path.dirname(sourcePath);
  fs.mkdirSync(parentDir, { recursive: true });
  fs.renameSync(destPath, sourcePath);
}

/**
 * Read a file's content for preview.
 * Returns { contentType, data } where data is a Buffer for images or a string for text.
 * Returns null for unsupported file types.
 */
function readFilePreview(filePath, ext) {
  const lowerExt = ext.toLowerCase();
  const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'];
  const textExts = ['txt', 'md', 'csv', 'json', 'js', 'ts', 'jsx', 'tsx', 'html', 'css', 'py', 'xml', 'yaml', 'yml', 'log', 'ini', 'cfg', 'env'];

  if (imageExts.includes(lowerExt)) {
    const mime = getImageMime(lowerExt);
    const data = fs.readFileSync(filePath);
    return { contentType: mime, data, type: 'image' };
  }

  if (textExts.includes(lowerExt)) {
    const full = fs.readFileSync(filePath, 'utf-8');
    const preview = full.slice(0, 800);
    return { contentType: 'text/plain; charset=utf-8', data: preview, type: 'text' };
  }

  // PDF: extract readable text strings from the binary content
  if (lowerExt === 'pdf') {
    return readPdfPreview(filePath);
  }

  return null;
}

/**
 * Extract readable text from a PDF file (no external deps).
 * Finds PDF text rendering operators (Tj, TJ) and extracts the
 * rendered text content. Falls back to a filtered strings approach.
 */
function readPdfPreview(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const result = [];

    // Find all (content) Tj patterns
    const tjRegex = /\(([^)]*)\)\s*Tj/g;
    let match;
    while ((match = tjRegex.exec(raw)) !== null) {
      const text = match[1].replace(/\\\(/g, '(').replace(/\\\)/g, ')');
      if (text.trim().length > 1) result.push(text);
    }

    // Also find TJ arrays: [(content) num (content)] TJ
    const tjArrayRegex = /\[([^\]]+)\]\s*TJ/g;
    while ((match = tjArrayRegex.exec(raw)) !== null) {
      const parts = match[1].match(/\(([^)]*)\)/g);
      if (parts) {
        const text = parts.map((p) => p.slice(1, -1).replace(/\\\(/g, '(').replace(/\\\)/g, ')')).join('');
        if (text.trim().length > 1) result.push(text);
      }
    }

    if (result.length > 0) {
      const preview = result.join(' ').slice(0, 800).trim();
      if (preview.length > 0) {
        return { contentType: 'text/plain; charset=utf-8', data: preview, type: 'text' };
      }
    }
  } catch {
    // ignore encoding errors
  }

  // Fallback: filtered strings approach
  try {
    const raw = fs.readFileSync(filePath);
    let result = '';
    let current = '';
    for (let i = 0; i < raw.length && result.length < 2000; i++) {
      const byte = raw[i];
      if (byte >= 32 && byte <= 126) {
        current += String.fromCharCode(byte);
      } else {
        if (current.length >= 5) {
          if (!/^[\d<>\/%\[\]{}|]+$/.test(current) && current.length < 80) {
            result += current + ' ';
          }
        }
        current = '';
      }
    }
    if (current.length >= 5 && !/^[\d<>\/%\[\]{}|]+$/.test(current) && current.length < 80) {
      result += current;
    }
    const preview = result.slice(0, 800).trim();
    if (preview.length > 0) {
      return { contentType: 'text/plain; charset=utf-8', data: preview, type: 'text' };
    }
  } catch {
    // ignore
  }

  return null;
}

function getImageMime(ext) {
  const map = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
    svg: 'image/svg+xml',
  };
  return map[ext] || 'application/octet-stream';
}

module.exports = {
  getFileTypeFromExtension,
  formatBytes,
  scanFolder,
  sortFile,
  undoSort,
  readFilePreview,
};
