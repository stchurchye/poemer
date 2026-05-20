import { Alert, Platform } from 'react-native';

export type AppAlertButtonStyle = 'default' | 'cancel' | 'destructive';

export type AppAlertButton = {
  text: string;
  style?: AppAlertButtonStyle;
  onPress?: () => void;
};

export type AppAlertOptions = {
  title: string;
  message?: string;
  buttons?: AppAlertButton[];
};

type ShowFn = (options: AppAlertOptions) => void;

let showImpl: ShowFn | null = null;

export function registerAppAlert(fn: ShowFn | null) {
  showImpl = fn;
}

/** 大号字体的应用内提示框（替代系统 Alert） */
export function appAlert(
  title: string,
  message?: string,
  buttons?: AppAlertButton[],
) {
  if (showImpl) {
    showImpl({ title, message, buttons });
    return;
  }
  Alert.alert(title, message, buttons);
}

/** 在 RN Modal（如写作小助手浮层）之上显示；避免被浮层挡住 */
export function appAlertOverModal(
  title: string,
  message?: string,
  buttons?: AppAlertButton[],
) {
  if (Platform.OS === 'web') {
    appAlert(title, message, buttons);
    return;
  }
  const list = buttons?.length ? buttons : [{ text: '确定' }];
  Alert.alert(
    title,
    message,
    list.map((btn) => ({
      text: btn.text,
      style:
        btn.style === 'destructive'
          ? 'destructive'
          : btn.style === 'cancel'
            ? 'cancel'
            : 'default',
      onPress: btn.onPress,
    })),
  );
}
