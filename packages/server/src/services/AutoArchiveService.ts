import type { Services } from './index.js';

/**
 * AutoArchiveService — periodic cleanup that archives stale session channels.
 *
 * Session channels inactive for 72+ hours are auto-archived (system-initiated,
 * so TeamInboxWatcher can auto-restore them if needed).
 *
 * Runs every hour. First run 5 seconds after start.
 */
export class AutoArchiveService {
  private interval: ReturnType<typeof setInterval> | null = null;
  private initialTimeout: ReturnType<typeof setTimeout> | null = null;
  private started = false;

  constructor(private services: Services) {}

  /**
   * Start the periodic auto-archive timer.
   * First run after 5 seconds, then every hour.
   */
  start(): void {
    if (this.started) return;
    this.started = true;

    // Initial run with small delay to let other services initialize
    this.initialTimeout = setTimeout(() => {
      this.runCleanup().catch(err => {
        console.error(JSON.stringify({ event: 'auto_archive_error', error: String(err) }));
      });
    }, 5000);

    // Periodic run every hour
    this.interval = setInterval(() => {
      this.runCleanup().catch(err => {
        console.error(JSON.stringify({ event: 'auto_archive_error', error: String(err) }));
      });
    }, 3600000); // 1 hour
  }

  /**
   * Stop the periodic timer.
   */
  stop(): void {
    this.started = false;
    if (this.initialTimeout) {
      clearTimeout(this.initialTimeout);
      this.initialTimeout = null;
    }
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  /**
   * Run one cleanup cycle: find and archive stale session channels.
   * Can also be called directly for testing.
   */
  async runCleanup(): Promise<number> {
    const staleChannels = this.services.channels.getStaleSessionChannelsForArchival();

    let archivedCount = 0;
    for (const { id, tenantId } of staleChannels) {
      try {
        const success = await this.services.channels.archive(tenantId, id, false);
        if (success) {
          archivedCount++;
        }
      } catch (err) {
        console.error(JSON.stringify({
          event: 'auto_archive_channel_error',
          channelId: id,
          tenantId,
          error: String(err),
        }));
      }
    }

    if (archivedCount > 0) {
      console.log(JSON.stringify({
        event: 'auto_archive_run',
        found: staleChannels.length,
        archived: archivedCount,
      }));
    }

    return archivedCount;
  }
}
