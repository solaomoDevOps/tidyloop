/**
 * backgroundScan.ts — periodic pre-warming of the scan cache, not a full
 * autonomous clean.
 *
 * iOS background execution (BGProcessingTask, via expo-background-task) is
 * opportunistic and short: the OS decides when to run it, and the process
 * can be suspended after roughly tens of seconds to a couple of minutes.
 * A full exhaustive scanPhotoLibrary() on a large library can take much
 * longer than that, so this does NOT try to run one to completion. Instead
 * it runs the same scan with a wall-clock deadline, relying on the fact
 * that scanPhotoLibrary() already skips re-hashing anything unchanged
 * since the last scan (see db.ts's getCachedAssetsMap) and persists each
 * page as it goes — so a partial background run just narrows the amount
 * of NEW/changed work left for the next run, in the background or the
 * next time the user opens the app. Nothing here deletes anything.
 *
 * defineTask() must run at module load on every launch (not inside a
 * component), so this module is imported once, at the top of App.tsx.
 */

import * as TaskManager from "expo-task-manager";
import * as BackgroundTask from "expo-background-task";
import { scanPhotoLibrary } from "./photoScanner";
import { getProStatus, getBackgroundScanEnabled } from "../storage/db";

const TASK_NAME = "tidyloop-background-scan";
const RUN_BUDGET_MS = 25_000; // conservative — leaves headroom before iOS's own suspension

TaskManager.defineTask(TASK_NAME, async () => {
  try {
    if (!getProStatus() || !getBackgroundScanEnabled()) {
      // Preference changed since the task was scheduled — nothing to do.
      // (Unregistering happens on toggle-off too; this is just a safety net.)
      return BackgroundTask.BackgroundTaskResult.Success;
    }
    await scanPhotoLibrary(undefined, { deadlineAt: Date.now() + RUN_BUDGET_MS });
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (err) {
    console.warn("Background scan task failed:", err);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function registerBackgroundScan(): Promise<void> {
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status === BackgroundTask.BackgroundTaskStatus.Restricted) {
      console.warn("Background tasks are restricted on this device (Low Power Mode, parental controls, etc.) — skipping registration.");
      return;
    }
    await BackgroundTask.registerTaskAsync(TASK_NAME, { minimumInterval: 12 * 60 });
  } catch (err) {
    console.warn("registerBackgroundScan failed:", err);
  }
}

export async function unregisterBackgroundScan(): Promise<void> {
  try {
    const registered = await TaskManager.isTaskRegisteredAsync(TASK_NAME);
    if (registered) {
      await BackgroundTask.unregisterTaskAsync(TASK_NAME);
    }
  } catch (err) {
    console.warn("unregisterBackgroundScan failed:", err);
  }
}

/** Dev-only escape hatch — iOS won't reliably schedule the real task on
 * demand, so there's no other way to exercise this logic without waiting. */
export async function triggerBackgroundScanForTesting(): Promise<void> {
  if (!__DEV__) return;
  await BackgroundTask.triggerTaskWorkerForTestingAsync();
}
