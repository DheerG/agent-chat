/**
 * WriteQueue — serializes writes to better-sqlite3's synchronous API.
 *
 * better-sqlite3 is synchronous. This queue wraps sync operations and exposes
 * them as Promises, serializing concurrent async callers so only one write
 * executes at a time. WAL mode handles concurrent reads separately (reads
 * bypass the queue entirely — better-sqlite3 is safe for concurrent reads).
 */
export class WriteQueue {
  private queue: Array<() => void> = [];
  private running = false;

  /**
   * Enqueue a synchronous write operation.
   * Returns a Promise that resolves/rejects with the operation result.
   */
  async enqueue<T>(fn: () => T): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push(() => {
        try {
          resolve(fn());
        } catch (err) {
          reject(err);
        } finally {
          this.next();
        }
      });

      if (!this.running) {
        this.next();
      }
    });
  }

  private next(): void {
    const task = this.queue.shift();
    if (!task) {
      this.running = false;
      return;
    }
    this.running = true;
    // queueMicrotask yields to the event loop between operations,
    // allowing other async work to interleave while maintaining serial order.
    queueMicrotask(task);
  }

  get pendingCount(): number {
    return this.queue.length;
  }
}
