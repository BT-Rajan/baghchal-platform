/** Hand the player their data export as a file: a download on the web, the share sheet in apps. */
import { Platform, Share } from 'react-native';

import type { DataExport } from '@/api/endpoints';

export function exportFileName(data: DataExport): string {
  return `clawplay-${data.account.username}.json`;
}

export async function saveExport(data: DataExport, os: string = Platform.OS): Promise<void> {
  const json = JSON.stringify(data, null, 2);
  if (os === 'web') {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    try {
      const link = document.createElement('a');
      link.href = url;
      link.download = exportFileName(data);
      link.click();
    } finally {
      URL.revokeObjectURL(url);
    }
    return;
  }
  // Apps: the share sheet saves it to Files, mails it, or opens it in another app.
  await Share.share({ title: exportFileName(data), message: json });
}
