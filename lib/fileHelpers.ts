import { FileType } from './types';

export const FILE_META: Record<
  FileType,
  { icon: string; family: 'Ionicons' | 'FontAwesome' | 'MaterialIcons'; gradient: [string, string] }
> = {
  image: { icon: 'image', family: 'Ionicons', gradient: ['#FF9A9E', '#FECFEF'] },
  pdf: { icon: 'file-pdf-o', family: 'FontAwesome', gradient: ['#FF416C', '#FF4B2B'] },
  video: { icon: 'videocam', family: 'Ionicons', gradient: ['#00C9FF', '#92FE9D'] },
  audio: { icon: 'musical-notes', family: 'Ionicons', gradient: ['#F2994A', '#F2C94C'] },
  doc: { icon: 'document-text', family: 'Ionicons', gradient: ['#56CCF2', '#2F80ED'] },
  spreadsheet: { icon: 'table', family: 'FontAwesome', gradient: ['#11998E', '#38EF7D'] },
  archive: { icon: 'cube', family: 'FontAwesome', gradient: ['#8E2DE2', '#4A00E0'] },
  code: { icon: 'code-slash', family: 'Ionicons', gradient: ['#FC466B', '#3F5EFB'] },
  unknown: { icon: 'help-circle', family: 'Ionicons', gradient: ['#BDBDBD', '#828282'] },
};

export function getFileTypeFromExtension(ext: string): FileType {
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

/**
 * Compute where a file lives after being sorted into an action subfolder.
 * Mirrors the server-side move in services/fileOps.js: the file is placed at
 * <parent dir>/<action label>/<name>.<extension>. Uses the same path
 * separator as the original uri. Idempotent: if the uri already points into
 * the action subfolder (server history stores post-sort paths), it is
 * returned unchanged. Returns null when the uri is missing.
 */
export function sortedDestinationPath(
  uri: string | undefined,
  actionLabel: string,
  name: string,
  extension: string,
): string | null {
  if (!uri) return null;
  const sepIndex = Math.max(uri.lastIndexOf('/'), uri.lastIndexOf('\\'));
  if (sepIndex === -1) return null;
  const sep = uri[sepIndex];
  const parent = uri.slice(0, sepIndex);
  if (parent === actionLabel || parent.endsWith(`${sep}${actionLabel}`)) {
    return uri;
  }
  return `${parent}${sep}${actionLabel}${sep}${name}.${extension}`;
}
