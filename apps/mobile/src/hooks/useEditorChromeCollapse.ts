import { useCallback, useEffect, useState } from 'react';
import { Keyboard, LayoutAnimation, Platform, UIManager } from 'react-native';
import { useKeyboardVisible } from './useKeyboardVisible';

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/** 正文类输入聚焦且键盘弹起时收起顶栏；失焦且键盘关闭后恢复 */
export function useEditorChromeCollapse() {
  const keyboardVisible = useKeyboardVisible();
  const [inputFocused, setInputFocused] = useState(false);
  const collapsed = inputFocused && keyboardVisible;

  useEffect(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  }, [collapsed]);

  const onInputFocus = useCallback(() => setInputFocused(true), []);
  const onInputBlur = useCallback(() => setInputFocused(false), []);

  const expandChrome = useCallback(() => {
    Keyboard.dismiss();
    setInputFocused(false);
  }, []);

  return {
    collapsed,
    onInputFocus,
    onInputBlur,
    expandChrome,
  };
}

/** 多输入源（如看一看：建议正文 + 再改一版）任一为真且键盘弹起时收起 */
export function useMultiInputChromeCollapse() {
  const keyboardVisible = useKeyboardVisible();
  const [editFocused, setEditFocused] = useState(false);
  const [retryFocused, setRetryFocused] = useState(false);
  const collapsed = keyboardVisible && (editFocused || retryFocused);

  useEffect(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  }, [collapsed]);

  const expandChrome = useCallback(() => {
    Keyboard.dismiss();
    setEditFocused(false);
    setRetryFocused(false);
  }, []);

  return {
    collapsed,
    onEditFocus: useCallback(() => setEditFocused(true), []),
    onEditBlur: useCallback(() => setEditFocused(false), []),
    onRetryFocus: useCallback(() => setRetryFocused(true), []),
    onRetryBlur: useCallback(() => setRetryFocused(false), []),
    expandChrome,
  };
}
