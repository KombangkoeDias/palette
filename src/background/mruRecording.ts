import { recordUrl } from './mruService';
import { scheduleSnapshotBroadcast } from './snapshotBroadcast';

/** Records a genuine tab visit and notifies open palettes of the new MRU order. */
export async function recordGenuineVisit(url: string): Promise<void> {
  await recordUrl(url);
  scheduleSnapshotBroadcast();
}
