import { FileItem } from './types';

// Bundled example files shown during the tutorial. The demo queue is
// local-only (never sent to the server), so previews come from these
// bundled assets instead of the preview API.
const vacationPhoto = require('../assets/demo/vacation-photo.png');
const quarterlyReportPage = require('../assets/demo/quarterly-report-page.png');

export const DEMO_FILES: FileItem[] = [
  {
    id: 'demo-1',
    name: 'vacation-photo',
    extension: 'png',
    type: 'image',
    size: '2.4 MB',
    date: 'Jul 12, 2026',
    previewAsset: vacationPhoto,
  },
  {
    id: 'demo-2',
    name: 'quarterly-report',
    extension: 'pdf',
    type: 'pdf',
    size: '840 KB',
    date: 'Jul 8, 2026',
    previewAsset: quarterlyReportPage,
  },
  {
    id: 'demo-3',
    name: 'meeting-notes',
    extension: 'txt',
    type: 'doc',
    size: '2 KB',
    date: 'Jul 24, 2026',
    previewText:
      'Team Sync - Meeting Notes\nDate: Jul 24, 2026\n\nAttendees: Alex, Priya, Sam, Jordan\n\nAgenda\n1. Q3 roadmap review\n2. Launch checklist for the desktop release\n3. Open bugs and triage owners\n\nDecisions\n- Ship the pairing flow update behind a feature flag.\n- Move the weekly sync to Thursdays.',
  },
  {
    id: 'demo-4',
    name: 'budget-2026',
    extension: 'xlsx',
    type: 'spreadsheet',
    size: '156 KB',
    date: 'Jun 30, 2026',
  },
];
