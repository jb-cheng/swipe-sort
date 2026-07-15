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
