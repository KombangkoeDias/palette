/** Timestamp of the most recent MRU write — used to order deferred tab loads. */
let lastMruRecordAt = 0;

export function markMruRecorded(): void {
  lastMruRecordAt = Date.now();
}

export function getLastMruRecordAt(): number {
  return lastMruRecordAt;
}
