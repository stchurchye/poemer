/** 串行执行保存任务：单次失败对调用方可见，但不会毒死后续队列。 */
export class SerializedTaskQueue {
  private tail: Promise<void> = Promise.resolve();

  enqueue(task: () => Promise<void>): Promise<void> {
    const result = this.tail.then(task);
    this.tail = result.catch(() => undefined);
    return result;
  }
}

/** 替换任务排队期间跳过普通保存，避免旧快照写到最后一次替换之后。 */
export class ReplacementAwareTaskQueue {
  private readonly queue = new SerializedTaskQueue();
  private pendingReplacements = 0;

  get replacing(): boolean {
    return this.pendingReplacements > 0;
  }

  enqueueSave(task: () => Promise<void>): Promise<boolean> {
    if (this.replacing) return Promise.resolve(false);
    return this.queue.enqueue(task).then(() => true);
  }

  enqueueReplacement(task: () => Promise<void>): Promise<void> {
    this.pendingReplacements += 1;
    return this.queue.enqueue(task).finally(() => {
      this.pendingReplacements -= 1;
    });
  }
}
