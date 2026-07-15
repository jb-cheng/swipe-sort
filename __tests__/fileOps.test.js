/**
 * Tests for services/fileOps.js
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { scanFolder, sortFile, undoSort, getFileTypeFromExtension, formatBytes } = require('../services/fileOps');

describe('getFileTypeFromExtension', () => {
  test('identifies image types', () => {
    expect(getFileTypeFromExtension('jpg')).toBe('image');
    expect(getFileTypeFromExtension('jpeg')).toBe('image');
    expect(getFileTypeFromExtension('png')).toBe('image');
    expect(getFileTypeFromExtension('gif')).toBe('image');
    expect(getFileTypeFromExtension('webp')).toBe('image');
    expect(getFileTypeFromExtension('svg')).toBe('image');
  });

  test('identifies pdf', () => {
    expect(getFileTypeFromExtension('pdf')).toBe('pdf');
  });

  test('identifies video types', () => {
    expect(getFileTypeFromExtension('mp4')).toBe('video');
    expect(getFileTypeFromExtension('mov')).toBe('video');
    expect(getFileTypeFromExtension('mkv')).toBe('video');
  });

  test('identifies audio types', () => {
    expect(getFileTypeFromExtension('mp3')).toBe('audio');
    expect(getFileTypeFromExtension('wav')).toBe('audio');
    expect(getFileTypeFromExtension('flac')).toBe('audio');
  });

  test('identifies document types', () => {
    expect(getFileTypeFromExtension('doc')).toBe('doc');
    expect(getFileTypeFromExtension('docx')).toBe('doc');
    expect(getFileTypeFromExtension('txt')).toBe('doc');
    expect(getFileTypeFromExtension('md')).toBe('doc');
  });

  test('identifies spreadsheet types', () => {
    expect(getFileTypeFromExtension('xls')).toBe('spreadsheet');
    expect(getFileTypeFromExtension('xlsx')).toBe('spreadsheet');
    expect(getFileTypeFromExtension('csv')).toBe('spreadsheet');
  });

  test('identifies archive types', () => {
    expect(getFileTypeFromExtension('zip')).toBe('archive');
    expect(getFileTypeFromExtension('rar')).toBe('archive');
    expect(getFileTypeFromExtension('7z')).toBe('archive');
  });

  test('identifies code types', () => {
    expect(getFileTypeFromExtension('js')).toBe('code');
    expect(getFileTypeFromExtension('ts')).toBe('code');
    expect(getFileTypeFromExtension('json')).toBe('code');
    expect(getFileTypeFromExtension('py')).toBe('code');
  });

  test('returns unknown for unrecognized extensions', () => {
    expect(getFileTypeFromExtension('xyz')).toBe('unknown');
    expect(getFileTypeFromExtension('')).toBe('unknown');
  });

  test('is case-insensitive', () => {
    expect(getFileTypeFromExtension('JPG')).toBe('image');
    expect(getFileTypeFromExtension('Pdf')).toBe('pdf');
  });
});

describe('formatBytes', () => {
  test('formats 0 bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  test('formats bytes', () => {
    expect(formatBytes(500)).toBe('500 B');
  });

  test('formats kilobytes', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
  });

  test('formats megabytes', () => {
    expect(formatBytes(1048576)).toBe('1.0 MB');
    expect(formatBytes(2097152)).toBe('2.0 MB');
  });

  test('formats gigabytes', () => {
    expect(formatBytes(1073741824)).toBe('1.0 GB');
  });
});

describe('scanFolder', () => {
  let tmpdir;
  beforeEach(() => {
    tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-scan-'));
    fs.writeFileSync(path.join(tmpdir, 'photo.jpg'), 'image-data');
    fs.writeFileSync(path.join(tmpdir, 'notes.txt'), 'text-data');
    fs.writeFileSync(path.join(tmpdir, 'script.js'), 'code-data');
    // A subdirectory (should be ignored)
    fs.mkdirSync(path.join(tmpdir, 'subdir'));
  });

  afterEach(() => {
    fs.rmSync(tmpdir, { recursive: true, force: true });
  });

  test('returns files in directory', () => {
    const files = scanFolder(tmpdir);
    expect(files.length).toBe(3);
    const names = files.map(f => f.name + '.' + f.extension);
    expect(names).toContain('photo.jpg');
    expect(names).toContain('notes.txt');
    expect(names).toContain('script.js');
  });

  test('each file has required properties', () => {
    const files = scanFolder(tmpdir);
    files.forEach(f => {
      expect(f).toHaveProperty('id');
      expect(f).toHaveProperty('name');
      expect(f).toHaveProperty('extension');
      expect(f).toHaveProperty('type');
      expect(f).toHaveProperty('size');
      expect(f).toHaveProperty('date');
      expect(f).toHaveProperty('uri');
      expect(f.uri).toContain(tmpdir);
    });
  });

  test('shuffles files (random order has changed)', () => {
    // Run multiple times — at least one should differ from sorted order
    const runs = Array.from({ length: 5 }, () => scanFolder(tmpdir).map(f => f.name));
    const allSame = runs.every(r => JSON.stringify(r) === JSON.stringify(runs[0]));
    expect(allSame).toBe(false);
  });

  test('identifies file types correctly', () => {
    const files = scanFolder(tmpdir);
    const photo = files.find(f => f.extension === 'jpg');
    expect(photo.type).toBe('image');
    const txt = files.find(f => f.extension === 'txt');
    expect(txt.type).toBe('doc');
    const js = files.find(f => f.extension === 'js');
    expect(js.type).toBe('code');
  });

  test('throws for non-existent directory', () => {
    expect(() => scanFolder('/nonexistent/path')).toThrow();
  });
});

describe('sortFile and undoSort', () => {
  let tmpdir;

  beforeEach(() => {
    tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-sort-'));
    fs.writeFileSync(path.join(tmpdir, 'test.txt'), 'hello world');
  });

  afterEach(() => {
    fs.rmSync(tmpdir, { recursive: true, force: true });
  });

  test('sortFile moves file to action subfolder', () => {
    const file = {
      id: 'f1',
      name: 'test',
      extension: 'txt',
      uri: path.join(tmpdir, 'test.txt'),
    };
    const action = { id: 'keep', label: 'Keep' };

    const paths = sortFile(file, action);
    expect(paths.sourcePath).toBe(path.join(tmpdir, 'test.txt'));
    expect(paths.destPath).toBe(path.join(tmpdir, 'Keep', 'test.txt'));

    // File should be at destination
    expect(fs.existsSync(paths.destPath)).toBe(true);
    expect(fs.existsSync(paths.sourcePath)).toBe(false);
  });

  test('undoSort moves file back to original location', () => {
    const file = {
      id: 'f1',
      name: 'test',
      extension: 'txt',
      uri: path.join(tmpdir, 'test.txt'),
    };
    const action = { id: 'keep', label: 'Keep' };

    const paths = sortFile(file, action);

    // Undo
    undoSort(paths);
    expect(fs.existsSync(paths.sourcePath)).toBe(true);
    expect(fs.existsSync(paths.destPath)).toBe(false);
  });

  test('sortFile with existing subfolder still works', () => {
    // Pre-create the Keep folder
    fs.mkdirSync(path.join(tmpdir, 'Keep'));

    const file = {
      id: 'f1',
      name: 'test',
      extension: 'txt',
      uri: path.join(tmpdir, 'test.txt'),
    };
    const action = { id: 'keep', label: 'Keep' };

    const paths = sortFile(file, action);
    expect(fs.existsSync(paths.destPath)).toBe(true);
  });

  test('undoSort throws if destination file no longer exists', () => {
    expect(() => undoSort({ sourcePath: '/fake/source.txt', destPath: '/fake/dest.txt' })).toThrow();
  });
});
