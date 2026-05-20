import { useEffect, useState } from 'react';

/** 从 active 变为 true 起正向计秒，active 为 false 时归零 */
export function useElapsedSeconds(active: boolean): number {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!active) {
      setElapsed(0);
      return;
    }
    setElapsed(0);
    const started = Date.now();
    const tick = () => setElapsed(Math.floor((Date.now() - started) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [active]);

  return elapsed;
}
