import { useCallback, useEffect, useRef, useState } from 'react';
import type { TextInput } from 'react-native';

const REQUIRED_TAPS = 3;
const TAP_WINDOW_MS = 1600;

/** 正文需连续点击若干次后才允许弹出软键盘；失焦后重置。 */
export function useTripleTapKeyboardUnlock(inputRef: React.RefObject<TextInput | null>) {
  const [keyboardUnlocked, setKeyboardUnlocked] = useState(false);
  const tapCountRef = useRef(0);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unlockingRef = useRef(false);

  const clearTapCount = useCallback(() => {
    tapCountRef.current = 0;
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
  }, []);

  /** 返回 false 表示 programmatic unlock blur，调用方应跳过其它 onBlur 副作用。 */
  const onBodyBlur = useCallback((): boolean => {
    if (unlockingRef.current) return false;
    clearTapCount();
    setKeyboardUnlocked(false);
    return true;
  }, [clearTapCount]);

  const onBodyPressIn = useCallback(() => {
    if (keyboardUnlocked) return;

    tapCountRef.current += 1;
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(clearTapCount, TAP_WINDOW_MS);

    if (tapCountRef.current >= REQUIRED_TAPS) {
      clearTapCount();
      setKeyboardUnlocked(true);
    }
  }, [keyboardUnlocked, clearTapCount]);

  useEffect(() => {
    if (!keyboardUnlocked) return;

    unlockingRef.current = true;
    inputRef.current?.blur();

    const frameId = requestAnimationFrame(() => {
      inputRef.current?.focus();
      unlockingRef.current = false;
    });

    return () => {
      cancelAnimationFrame(frameId);
      unlockingRef.current = false;
    };
  }, [keyboardUnlocked, inputRef]);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, []);

  return {
    keyboardUnlocked,
    onBodyPressIn,
    onBodyBlur,
  };
}
