import { useCallback, useRef } from 'react';
import type { FlatList, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

const BOTTOM_THRESHOLD = 80;

export function useListAutoScroll() {
  const listRef = useRef<FlatList>(null);
  const followBottomRef = useRef(true);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const maxOffset = Math.max(0, contentSize.height - layoutMeasurement.height);
    const distance = maxOffset - contentOffset.y;
    followBottomRef.current = distance <= BOTTOM_THRESHOLD;
  }, []);

  const scrollToEnd = useCallback((animated = true) => {
    followBottomRef.current = true;
    const run = () => listRef.current?.scrollToEnd({ animated });
    run();
    setTimeout(run, 120);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 360);
  }, []);

  const scrollToEndIfFollowing = useCallback(() => {
    if (!followBottomRef.current) return;
    listRef.current?.scrollToEnd({ animated: false });
  }, []);

  return { listRef, onScroll, scrollToEnd, scrollToEndIfFollowing };
};
