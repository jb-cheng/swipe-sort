export type FileType =
  | 'image'
  | 'pdf'
  | 'video'
  | 'audio'
  | 'doc'
  | 'spreadsheet'
  | 'archive'
  | 'code'
  | 'unknown';

export type SwipeDirection = 'left' | 'right' | 'up' | 'down' | 'none';

export interface FileItem {
  id: string;
  name: string;
  extension: string;
  type: FileType;
  size: string;
  date: string;
  uri?: string;
  /**
   * Client-side preview asset for tutorial demo files (a require()'d image).
   * Never sent to or used by the server; when present, previews render from
   * this asset instead of hitting the preview API.
   */
  previewAsset?: number;
  /**
   * Inline preview text for tutorial demo files (documents shown without a
   * server). Rendered like a text preview when previewAsset is not present.
   */
  previewText?: string;
}

export interface SortAction {
  id: string;
  label: string;
  key: string;
  direction: SwipeDirection;
  color: string;
}

export interface HistoryRecord {
  id: string;
  file: FileItem;
  action: SortAction;
  timestamp: number;
}

/** Records a single sort operation so it can be undone. */
export interface UndoRecord {
  id: string;
  file: FileItem;
  action: SortAction;
  sourcePath: string;
  destPath: string;
  timestamp: number;
}

/** Mobile (LAN) remote-control status reported by the app server. */
export interface MobileAccessInfo {
  enabled: boolean;
  port: number | null;
  lanIp: string | null;
  /** Full pairing URL including the token query param (?t=...), or null. */
  url: string | null;
  /** Pairing token; only present on the desktop (loopback) client. */
  token?: string;
}
