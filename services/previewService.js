/**
 * Preview generation service — 3-tier fallback system.
 *
 * Tier 1 — Instant fallback (generic icons). Rendered client-side via FileIcon.
 * Tier 2 — OS native icons (Electron only). Handled via IPC → app.getFileIcon().
 * Tier 3 — Rich content previews. Generated asynchronously and cached to disk.
 *
 * This module handles Tier 3 generation + disk caching.
 * Uses an internal concurrency-limited queue for background operations.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ── Simple concurrency-limited queue (replaces p-queue, which is ESM-only) ─

class ConcurrencyQueue {
  constructor(concurrency) {
    this.concurrency = concurrency;
    this._active = 0;
    this._queue = [];
  }

  add(fn) {
    return new Promise((resolve, reject) => {
      const run = async () => {
        this._active++;
        try {
          const result = await fn();
          resolve(result);
        } catch (err) {
          reject(err);
        } finally {
          this._active--;
          this._next();
        }
      };
      this._queue.push(run);
      this._next();
    });
  }

  _next() {
    while (this._active < this.concurrency && this._queue.length > 0) {
      const task = this._queue.shift();
      task();
    }
  }

  get size() {
    return this._queue.length;
  }

  get pending() {
    return this._queue.length;
  }
}

// ── Optional native dependencies (graceful fallback) ──────────────
let sharp = null;
let musicMetadata = null;
let createCanvas = null;
let mammoth = null;
let pdfjsLib = null;
try { sharp = require('sharp'); } catch { /* sharp unavailable — skip image resize */ }
try { musicMetadata = require('music-metadata'); } catch { /* music-metadata unavailable — skip audio art */ }
try { ({ createCanvas } = require('canvas')); } catch { /* canvas unavailable — skip PDF rendering */ }
try { mammoth = require('mammoth'); } catch { /* mammoth unavailable — skip DOCX preview */ }
try { pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js'); } catch { /* pdfjs unavailable — skip PDF rendering */ }

const CACHE_DIR = 'preview-cache';

// Thumbnail dimensions
const THUMB_MAX_WIDTH = 320;
const THUMB_MAX_HEIGHT = 320;

// Text preview character limit
const PREVIEW_CHAR_LIMIT = 800;

// PDF/DOCX rendering limits
const PDF_RENDER_MAX_SIZE = 50 * 1024 * 1024;
const PDF_RENDER_TIMEOUT = 10000;
const PDF_RENDER_MAX_HEIGHT = 480;
const DOCX_RENDER_MAX_SIZE = 50 * 1024 * 1024;

// Image extensions that can be handled without sharp (raw read)
const RAW_IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'];

// Image extensions that benefit from sharp resize
const SHARP_IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'avif', 'heic', 'heif'];

// Audio extensions that music-metadata can parse for cover art
const AUDIO_EXTS = ['mp3', 'flac', 'm4a', 'ogg', 'wav', 'aac', 'wma'];

// Text extensions for plain-text preview
const TEXT_EXTS = ['txt', 'md', 'csv', 'json', 'js', 'ts', 'jsx', 'tsx', 'html', 'css', 'py', 'xml', 'yaml', 'yml', 'log', 'ini', 'cfg', 'env', 'conf', 'sh', 'bat', 'ps1'];

// File type labels for metadata preview
const FILE_TYPE_LABELS = {
  mp4: 'Video (MP4)', mov: 'Video (MOV)', avi: 'Video (AVI)', mkv: 'Video (MKV)', webm: 'Video (WebM)',
  doc: 'Word Document', docx: 'Word Document',
  ppt: 'PowerPoint', pptx: 'PowerPoint',
  xls: 'Excel Spreadsheet', xlsx: 'Excel Spreadsheet',
  odt: 'OpenDocument Text', ods: 'OpenDocument Spreadsheet',
  zip: 'ZIP Archive', rar: 'RAR Archive', '7z': '7z Archive', tar: 'TAR Archive', gz: 'GZip Archive',
  dmg: 'Disk Image', exe: 'Windows Executable', msi: 'Windows Installer',
  apk: 'Android Package', ipa: 'iOS App',
  iso: 'Disc Image', img: 'Disk Image',
  sqlite: 'SQLite Database', db: 'Database',
  svg: 'SVG Image', heic: 'HEIC Image', tiff: 'TIFF Image', bmp: 'BMP Image',
  psd: 'Photoshop Document', ai: 'Illustrator File',
  ttf: 'Font', otf: 'Font', woff: 'Web Font', woff2: 'Web Font',
  epub: 'eBook', mobi: 'eBook', cbz: 'Comic Archive', cbr: 'Comic Archive',
};

class PreviewService {
  /**
   * @param {string} dataDir  Directory for cache storage (e.g. app.getPath('userData')).
   * @param {object} [options]
   * @param {(html: string) => Promise<Buffer|null>} [options.docxRenderer]  Renders DOCX HTML to PNG (Electron capturePage).
   */
  constructor(dataDir, options = {}) {
    this.cacheDir = path.join(dataDir, CACHE_DIR);
    this._ensureDir(this.cacheDir);
    this._docxRenderer = options.docxRenderer || null;

    // Generation queue — limit concurrent heavy operations
    this.queue = new ConcurrencyQueue(3);

    // Track recently-requested files for pre-generation
    this._previewCache = new Map(); // filePath -> cached result
  }

  // ── Cache helpers ────────────────────────────────────────────────

  /**
   * Generate a cache key from file path + mtime for cache invalidation.
   */
  _cacheKey(filePath) {
    try {
      const stat = fs.statSync(filePath);
      const hash = crypto
        .createHash('md5')
        .update(filePath + stat.mtimeMs.toString())
        .digest('hex');
      return hash;
    } catch {
      // If file is gone, still generate a stable key
      return crypto.createHash('md5').update(filePath).digest('hex');
    }
  }

  /**
   * Resolve the full path for a cached thumbnail.
   * @param {string} filePath
   * @param {string} [ext='.jpg']  File extension for the cached version.
   * @returns {string}
   */
  _cachePath(filePath, ext = '.jpg') {
    return path.join(this.cacheDir, this._cacheKey(filePath) + ext);
  }

  /**
   * Check if a valid cached preview exists for this file.
   * @returns {{ type: 'image', contentType: string, data: Buffer } | null}
   */
  _getCached(filePath) {
    // First check in-memory cache
    if (this._previewCache.has(filePath)) {
      return this._previewCache.get(filePath);
    }

    // Check disk cache: try .jpg first, then other extensions
    const key = this._cacheKey(filePath);
    const dirContents = fs.readdirSync(this.cacheDir).filter((f) => f.startsWith(key));
    if (dirContents.length > 0) {
      const cachedFile = path.join(this.cacheDir, dirContents[0]);
      try {
        const ext = path.extname(cachedFile).toLowerCase();
        const mimeMap = {
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.png': 'image/png',
          '.gif': 'image/gif',
          '.webp': 'image/webp',
        };
        const data = fs.readFileSync(cachedFile);
        const result = {
          type: 'image',
          contentType: mimeMap[ext] || 'image/jpeg',
          data,
        };
        this._previewCache.set(filePath, result);
        return result;
      } catch {
        // Corrupted cache — remove and regenerate
        try { fs.unlinkSync(cachedFile); } catch {}
      }
    }
    return null;
  }

  /**
   * Write generated preview data to disk cache.
   */
  _cache(filePath, data, ext = '.jpg') {
    const dest = this._cachePath(filePath, ext);
    try {
      fs.writeFileSync(dest, data);
      const mimeMap = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
      };
      const result = {
        type: 'image',
        contentType: mimeMap[ext] || 'image/jpeg',
        data,
      };
      this._previewCache.set(filePath, result);
    } catch (err) {
      console.warn('[preview] Failed to write cache:', err.message);
    }
  }

  /**
   * Get the MIME type for an image extension.
   */
  _imageMime(ext) {
    const map = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      bmp: 'image/bmp',
      svg: 'image/svg+xml',
      tiff: 'image/tiff',
      avif: 'image/avif',
      heic: 'image/heic',
      heif: 'image/heif',
    };
    return map[ext.toLowerCase()] || 'image/jpeg';
  }

  /**
   * Extract readable text from a PDF file (no external deps).
   * Finds PDF text rendering operators (Tj, TJ) and extracts the
   * rendered text content, skipping PDF structural markup entirely.
   */
  _readPdfText(filePath) {
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const result = [];

      // Find all (content) Tj patterns — these are the actual rendered strings
      const tjRegex = /\(([^)]*)\)\s*Tj/g;
      let match;
      while ((match = tjRegex.exec(raw)) !== null) {
        const text = match[1]
          .replace(/\\\(/g, '(')
          .replace(/\\\)/g, ')')
          .replace(/\\n/g, '\n')
          .replace(/\\r/g, '\r')
          .replace(/\\t/g, '\t');
        if (text.trim().length > 1) {
          result.push(text);
        }
      }

      // Also find TJ arrays: [(content) num (content)] TJ
      const tjArrayRegex = /\[([^\]]+)\]\s*TJ/g;
      while ((match = tjArrayRegex.exec(raw)) !== null) {
        const parts = match[1].match(/\(([^)]*)\)/g);
        if (parts) {
          const text = parts
            .map((p) => p.slice(1, -1)
              .replace(/\\\(/g, '(')
              .replace(/\\\)/g, ')')
              .replace(/\\n/g, '\n')
            )
            .join('');
          if (text.trim().length > 1) {
            result.push(text);
          }
        }
      }

      if (result.length > 0) {
        const preview = result.join(' ').slice(0, PREVIEW_CHAR_LIMIT).trim();
        if (preview.length > 0) {
          return { contentType: 'text/plain; charset=utf-8', data: preview, type: 'text' };
        }
      }
    } catch {
      // ignore encoding errors (binary PDFs)
    }

    // Fallback: filtered strings approach for PDFs without standard operators
    return this._readPdfTextFallback(filePath);
  }

  /**
   * Fallback PDF text extraction using the Unix `strings` approach.
   * Used when the standard PDF operator parsing yields no results.
   */
  _readPdfTextFallback(filePath) {
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
            // Only keep runs that don't look like PDF structural noise
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
      const preview = result.slice(0, PREVIEW_CHAR_LIMIT).trim();
      if (preview.length > 0) {
        return { contentType: 'text/plain; charset=utf-8', data: preview, type: 'text' };
      }
    } catch {
      // ignore
    }
    return null;
  }

  /**
   * Parse first 5 rows of a CSV file for spreadsheet preview.
   */
  _readCsvPreview(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n').filter((l) => l.trim().length > 0).slice(0, 6);
      if (lines.length === 0) return null;

      // Parse as simple CSV (handles basic cases)
      const rows = lines.map((line) => {
        const cells = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"') {
            inQuotes = !inQuotes;
          } else if (ch === ',' && !inQuotes) {
            cells.push(current.trim());
            current = '';
          } else {
            current += ch;
          }
        }
        cells.push(current.trim());
        return cells;
      });

      // Format as a simple text table
      const maxCols = Math.max(...rows.map((r) => r.length));
      let preview = rows.map((row) => {
        while (row.length < maxCols) row.push('');
        return row.join('  |  ');
      }).join('\n');

      preview = preview.slice(0, PREVIEW_CHAR_LIMIT);
      return { contentType: 'text/plain; charset=utf-8', data: preview, type: 'text' };
    } catch {
      return null;
    }
  }

  // ── Tier 3 generation ────────────────────────────────────────────

  /**
   * Generate a resized JPEG thumbnail for an image using sharp.
   * Falls back to raw read if sharp is not available.
   */
  async _generateImagePreview(filePath, ext) {
    const lowerExt = ext.toLowerCase();

    if (sharp && SHARP_IMAGE_EXTS.includes(lowerExt)) {
      try {
        const buf = await sharp(filePath)
          .resize(THUMB_MAX_WIDTH, THUMB_MAX_HEIGHT, {
            fit: 'inside',
            withoutEnlargement: true,
          })
          .jpeg({ quality: 80, progressive: true })
          .toBuffer();
        this._cache(filePath, buf, '.jpg');
        return this._cachedResult(filePath);
      } catch (err) {
        console.warn('[preview] sharp resize failed, falling back to raw:', err.message);
      }
    }

    // Fallback: read raw image bytes (no resize)
    if (RAW_IMAGE_EXTS.includes(lowerExt)) {
      try {
        const data = fs.readFileSync(filePath);
        return {
          type: 'image',
          contentType: this._imageMime(lowerExt),
          data,
        };
      } catch {
        return null;
      }
    }

    return null;
  }

  /**
   * Extract embedded cover art from audio files using music-metadata.
   */
  async _generateAudioPreview(filePath) {
    if (!musicMetadata) return null;

    try {
      const metadata = await musicMetadata.parseFile(filePath, {
        duration: false,
        skipCovers: false,
      });

      if (metadata.common.picture && metadata.common.picture.length > 0) {
        const pic = metadata.common.picture[0];
        const picExt = path.extname(pic.format) || '.jpg';

        // Resize cover art if sharp is available
        if (sharp) {
          try {
            const resized = await sharp(pic.data)
              .resize(THUMB_MAX_WIDTH, THUMB_MAX_HEIGHT, {
                fit: 'inside',
                withoutEnlargement: true,
              })
              .jpeg({ quality: 75 })
              .toBuffer();
            this._cache(filePath, resized, '.jpg');
            return this._cachedResult(filePath);
          } catch {
            // fall through to raw
          }
        }

        // Store raw cover art
        const cacheExt = picExt.startsWith('.') ? picExt : '.' + picExt;
        this._cache(filePath, pic.data, cacheExt);
        return {
          type: 'image',
          contentType: pic.format || 'image/jpeg',
          data: pic.data,
        };
      }
    } catch (err) {
      console.warn('[preview] Audio metadata extraction failed:', err.message);
    }
    return null;
  }

  /**
   * Render page 1 of a PDF to a PNG thumbnail using pdfjs-dist + node-canvas.
   * Returns null if rendering deps are unavailable or the file is too large/corrupt.
   */
  async _generatePdfPreview(filePath) {
    if (!pdfjsLib || !createCanvas) return null;

    try {
      const stat = fs.statSync(filePath);
      if (stat.size > PDF_RENDER_MAX_SIZE) return null;
    } catch {
      return null;
    }

    let pdf = null;
    try {
      const data = new Uint8Array(fs.readFileSync(filePath));
      pdf = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise;

      if (pdf.numPages === 0) return null;

      const page = await pdf.getPage(1);
      const baseViewport = page.getViewport({ scale: 1 });
      let scale = THUMB_MAX_WIDTH / baseViewport.width;
      if (baseViewport.height * scale > PDF_RENDER_MAX_HEIGHT) {
        scale = PDF_RENDER_MAX_HEIGHT / baseViewport.height;
      }
      const viewport = page.getViewport({ scale });

      const canvas = createCanvas(Math.floor(viewport.width), Math.floor(viewport.height));
      const context = canvas.getContext('2d');

      const renderTask = page.render({ canvasContext: context, viewport });
      await Promise.race([
        renderTask.promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('PDF render timeout')), PDF_RENDER_TIMEOUT)),
      ]);

      let buffer = canvas.toBuffer('image/png');
      let cacheExt = '.png';

      if (buffer.length > 200 * 1024 && sharp) {
        buffer = await sharp(buffer).jpeg({ quality: 80 }).toBuffer();
        cacheExt = '.jpg';
      }

      this._cache(filePath, buffer, cacheExt);
      return this._cachedResult(filePath);
    } catch (err) {
      console.warn('[preview] PDF render failed:', err.message);
      return null;
    } finally {
      if (pdf) {
        try { pdf.destroy(); } catch {}
      }
    }
  }

  /**
   * Generate a DOCX preview: visual capture (Electron) or plain text (server).
   * Returns null if mammoth is unavailable or the file is too large/corrupt.
   */
  async _generateDocxPreview(filePath) {
    if (!mammoth) return null;

    try {
      const stat = fs.statSync(filePath);
      if (stat.size > DOCX_RENDER_MAX_SIZE) return null;
    } catch {
      return null;
    }

    try {
      const result = await mammoth.convertToHtml({ path: filePath });
      const html = result.value;
      if (!html || html.trim().length === 0) return null;

      if (this._docxRenderer) {
        const png = await this._docxRenderer(html);
        if (png && png.length > 0) {
          this._cache(filePath, png, '.png');
          return this._cachedResult(filePath);
        }
      }

      const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      if (text.length > 0) {
        return { contentType: 'text/plain; charset=utf-8', data: text.slice(0, PREVIEW_CHAR_LIMIT), type: 'text' };
      }
    } catch (err) {
      console.warn('[preview] DOCX conversion failed:', err.message);
    }
    return null;
  }

  _cachedResult(filePath) {
    return this._getCached(filePath);
  }

  _formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
  }

  // ── Public API ───────────────────────────────────────────────────

  _ensureDir(dir) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Get the best available preview for a file.
   * Checks cache first, then generates Tier 3 content.
   * Falls back gracefully if nothing is available.
   *
   * @param {string} filePath
   * @param {string} ext  File extension
   * @returns {Promise<{ type: 'image'|'text', contentType: string, data: Buffer|string } | null>}
   */
  async getPreview(filePath, ext) {
    const lowerExt = ext.toLowerCase();

    // 1. Check disk cache first
    const cached = this._getCached(filePath);
    if (cached) return cached;

    // 2. Tier 3 — Rich content previews (async, may use queue)
    // Images
    if (SHARP_IMAGE_EXTS.includes(lowerExt) || RAW_IMAGE_EXTS.includes(lowerExt)) {
      return await this.queue.add(() => this._generateImagePreview(filePath, ext));
    }

    // Audio cover art
    if (AUDIO_EXTS.includes(lowerExt)) {
      return await this.queue.add(() => this._generateAudioPreview(filePath));
    }

    // PDF: rendered page thumbnail (falls back to text extraction)
    if (lowerExt === 'pdf') {
      const rendered = await this.queue.add(() => this._generatePdfPreview(filePath));
      if (rendered) return rendered;
      const pdfText = this._readPdfText(filePath);
      if (pdfText) return pdfText;
    }

    // DOCX: visual preview (Electron) or formatted text (server)
    if (lowerExt === 'docx') {
      const docxPreview = await this.queue.add(() => this._generateDocxPreview(filePath));
      if (docxPreview) return docxPreview;
    }

    // CSV preview
    if (lowerExt === 'csv') {
      const csvPreview = this._readCsvPreview(filePath);
      if (csvPreview) return csvPreview;
    }

    // Plain text preview
    if (TEXT_EXTS.includes(lowerExt)) {
      try {
        const full = fs.readFileSync(filePath, 'utf-8');
        const preview = full.slice(0, PREVIEW_CHAR_LIMIT);
        if (preview.trim().length > 0) {
          return { contentType: 'text/plain; charset=utf-8', data: preview, type: 'text' };
        }
      } catch {
        // ignore
      }
    }

    // 3. Fallback: show file metadata for any unsupported type
    //    This ensures every file shows useful info instead of a generic icon.
    try {
      const stat = fs.statSync(filePath);
      const sizeStr = this._formatBytes(stat.size);
      const dateStr = stat.mtime.toISOString().split('T')[0];
      const label = FILE_TYPE_LABELS[lowerExt] || (lowerExt.toUpperCase() + ' File');
      const fileName = path.basename(filePath);
      const meta = `META:${label}\n${fileName}\n${sizeStr}\n${dateStr}`;
      return { contentType: 'text/plain; charset=utf-8', data: meta, type: 'text' };
    } catch {
      return null;
    }
  }

  /**
   * Pre-generate previews for a list of files (for lazy loading).
   * Operates in the background — resolves when all enqueued jobs finish.
   *
   * @param {Array<{ uri: string, extension: string }>} files
   */
  async pregeneratePreviews(files) {
    const jobs = files
      .filter((f) => !this._getCached(f.uri)) // only uncached
      .map((f) =>
        this.queue.add(async () => {
          const ext = f.extension.toLowerCase();
          try {
            if (SHARP_IMAGE_EXTS.includes(ext) || RAW_IMAGE_EXTS.includes(ext)) {
              await this._generateImagePreview(f.uri, f.extension);
            } else if (AUDIO_EXTS.includes(ext)) {
              await this._generateAudioPreview(f.uri);
            } else if (ext === 'pdf') {
              await this._generatePdfPreview(f.uri);
            } else if (ext === 'docx') {
              await this._generateDocxPreview(f.uri);
            }
          } catch {
            // silent — preview generation is best-effort
          }
        }),
      );
    await Promise.allSettled(jobs);
  }

  /**
   * Get the disk cache directory path.
   */
  getCacheDir() {
    return this.cacheDir;
  }

  /**
   * Clear the entire preview cache (disk + memory).
   */
  clearCache() {
    this._previewCache.clear();
    try {
      const entries = fs.readdirSync(this.cacheDir);
      for (const entry of entries) {
        fs.unlinkSync(path.join(this.cacheDir, entry));
      }
    } catch (err) {
      console.warn('[preview] Failed to clear cache:', err.message);
    }
  }
}

module.exports = { PreviewService };
