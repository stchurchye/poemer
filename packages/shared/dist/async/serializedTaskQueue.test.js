import assert from 'node:assert/strict';
import test from 'node:test';
import { ReplacementAwareTaskQueue, SerializedTaskQueue, } from './serializedTaskQueue.js';
test('SerializedTaskQueue propagates a save failure but keeps later saves runnable', async () => {
    const queue = new SerializedTaskQueue();
    const calls = [];
    const failed = queue.enqueue(async () => {
        calls.push('failed');
        throw new Error('disk full');
    });
    await assert.rejects(failed, /disk full/);
    await queue.enqueue(async () => {
        calls.push('recovered');
    });
    assert.deepEqual(calls, ['failed', 'recovered']);
});
test('SerializedTaskQueue does not start a later task before the active task completes', async () => {
    const queue = new SerializedTaskQueue();
    const calls = [];
    let releaseFirst;
    const firstGate = new Promise((resolve) => {
        releaseFirst = resolve;
    });
    const first = queue.enqueue(async () => {
        calls.push('first:start');
        await firstGate;
        calls.push('first:end');
    });
    const second = queue.enqueue(async () => {
        calls.push('second:start');
    });
    await Promise.resolve();
    assert.deepEqual(calls, ['first:start']);
    releaseFirst();
    await Promise.all([first, second]);
    assert.deepEqual(calls, ['first:start', 'first:end', 'second:start']);
});
test('ReplacementAwareTaskQueue blocks saves until every queued replacement completes', async () => {
    const queue = new ReplacementAwareTaskQueue();
    const calls = [];
    let releaseFirst;
    let releaseSecond;
    const firstGate = new Promise((resolve) => {
        releaseFirst = resolve;
    });
    const secondGate = new Promise((resolve) => {
        releaseSecond = resolve;
    });
    const first = queue.enqueueReplacement(async () => {
        calls.push('replace:first');
        await firstGate;
    });
    const second = queue.enqueueReplacement(async () => {
        calls.push('replace:second');
        await secondGate;
    });
    assert.equal(queue.replacing, true);
    assert.equal(await queue.enqueueSave(async () => {
        calls.push('save:during');
    }), false);
    releaseFirst();
    await first;
    assert.equal(queue.replacing, true, '第二个替换完成前不能提前放开保存门闩');
    assert.deepEqual(calls, ['replace:first', 'replace:second']);
    releaseSecond();
    await second;
    assert.equal(queue.replacing, false);
    assert.equal(await queue.enqueueSave(async () => {
        calls.push('save:after');
    }), true);
    assert.deepEqual(calls, ['replace:first', 'replace:second', 'save:after']);
});
//# sourceMappingURL=serializedTaskQueue.test.js.map