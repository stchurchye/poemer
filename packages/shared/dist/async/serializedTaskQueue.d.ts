/** 串行执行保存任务：单次失败对调用方可见，但不会毒死后续队列。 */
export declare class SerializedTaskQueue {
    private tail;
    enqueue(task: () => Promise<void>): Promise<void>;
}
/** 替换任务排队期间跳过普通保存，避免旧快照写到最后一次替换之后。 */
export declare class ReplacementAwareTaskQueue {
    private readonly queue;
    private pendingReplacements;
    get replacing(): boolean;
    enqueueSave(task: () => Promise<void>): Promise<boolean>;
    enqueueReplacement(task: () => Promise<void>): Promise<void>;
}
//# sourceMappingURL=serializedTaskQueue.d.ts.map