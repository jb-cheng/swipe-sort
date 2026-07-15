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
