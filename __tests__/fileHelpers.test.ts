/**
 * Tests for lib/fileHelpers.ts
 */
import { getFileTypeFromExtension, sortedDestinationPath } from '../lib/fileHelpers';

describe('getFileTypeFromExtension', () => {
  it('identifies image types', () => {
    expect(getFileTypeFromExtension('jpg')).toBe('image');
    expect(getFileTypeFromExtension('jpeg')).toBe('image');
    expect(getFileTypeFromExtension('png')).toBe('image');
    expect(getFileTypeFromExtension('gif')).toBe('image');
    expect(getFileTypeFromExtension('webp')).toBe('image');
    expect(getFileTypeFromExtension('bmp')).toBe('image');
    expect(getFileTypeFromExtension('svg')).toBe('image');
  });

  it('identifies pdf', () => {
    expect(getFileTypeFromExtension('pdf')).toBe('pdf');
  });

  it('identifies video types', () => {
    expect(getFileTypeFromExtension('mp4')).toBe('video');
    expect(getFileTypeFromExtension('mov')).toBe('video');
    expect(getFileTypeFromExtension('avi')).toBe('video');
    expect(getFileTypeFromExtension('mkv')).toBe('video');
    expect(getFileTypeFromExtension('webm')).toBe('video');
  });

  it('identifies audio types', () => {
    expect(getFileTypeFromExtension('mp3')).toBe('audio');
    expect(getFileTypeFromExtension('wav')).toBe('audio');
    expect(getFileTypeFromExtension('aac')).toBe('audio');
    expect(getFileTypeFromExtension('flac')).toBe('audio');
    expect(getFileTypeFromExtension('ogg')).toBe('audio');
  });

  it('identifies document types', () => {
    expect(getFileTypeFromExtension('doc')).toBe('doc');
    expect(getFileTypeFromExtension('docx')).toBe('doc');
    expect(getFileTypeFromExtension('txt')).toBe('doc');
    expect(getFileTypeFromExtension('md')).toBe('doc');
    expect(getFileTypeFromExtension('pptx')).toBe('doc');
  });

  it('identifies spreadsheet types', () => {
    expect(getFileTypeFromExtension('xls')).toBe('spreadsheet');
    expect(getFileTypeFromExtension('xlsx')).toBe('spreadsheet');
    expect(getFileTypeFromExtension('csv')).toBe('spreadsheet');
  });

  it('identifies archive types', () => {
    expect(getFileTypeFromExtension('zip')).toBe('archive');
    expect(getFileTypeFromExtension('rar')).toBe('archive');
    expect(getFileTypeFromExtension('tar')).toBe('archive');
    expect(getFileTypeFromExtension('gz')).toBe('archive');
    expect(getFileTypeFromExtension('7z')).toBe('archive');
  });

  it('identifies code types', () => {
    expect(getFileTypeFromExtension('js')).toBe('code');
    expect(getFileTypeFromExtension('ts')).toBe('code');
    expect(getFileTypeFromExtension('jsx')).toBe('code');
    expect(getFileTypeFromExtension('tsx')).toBe('code');
    expect(getFileTypeFromExtension('json')).toBe('code');
    expect(getFileTypeFromExtension('html')).toBe('code');
    expect(getFileTypeFromExtension('css')).toBe('code');
    expect(getFileTypeFromExtension('py')).toBe('code');
  });

  it('returns unknown for unrecognized extensions', () => {
    expect(getFileTypeFromExtension('xyz')).toBe('unknown');
    expect(getFileTypeFromExtension('')).toBe('unknown');
  });

  it('is case-insensitive', () => {
    expect(getFileTypeFromExtension('JPG')).toBe('image');
    expect(getFileTypeFromExtension('PDF')).toBe('pdf');
    expect(getFileTypeFromExtension('Mp4')).toBe('video');
    expect(getFileTypeFromExtension('TXT')).toBe('doc');
  });
});

describe('sortedDestinationPath', () => {
  it('builds the destination from a Windows source path', () => {
    expect(
      sortedDestinationPath('C:\\Users\\me\\Downloads\\photo.jpg', 'Keep', 'photo', 'jpg'),
    ).toBe('C:\\Users\\me\\Downloads\\Keep\\photo.jpg');
  });

  it('builds the destination from a posix source path', () => {
    expect(sortedDestinationPath('/home/me/files/report.pdf', 'Review', 'report', 'pdf')).toBe(
      '/home/me/files/Review/report.pdf',
    );
  });

  it('is idempotent for paths already inside the action subfolder', () => {
    expect(
      sortedDestinationPath('C:\\Users\\me\\Downloads\\Keep\\photo.jpg', 'Keep', 'photo', 'jpg'),
    ).toBe('C:\\Users\\me\\Downloads\\Keep\\photo.jpg');
    expect(sortedDestinationPath('/home/me/files/Review/report.pdf', 'Review', 'report', 'pdf')).toBe(
      '/home/me/files/Review/report.pdf',
    );
  });

  it('returns null when the uri is missing or has no separator', () => {
    expect(sortedDestinationPath(undefined, 'Keep', 'photo', 'jpg')).toBeNull();
    expect(sortedDestinationPath('', 'Keep', 'photo', 'jpg')).toBeNull();
    expect(sortedDestinationPath('photo.jpg', 'Keep', 'photo', 'jpg')).toBeNull();
  });
});
