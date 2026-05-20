import type { AssistantGuideKey } from '@shiren/shared';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { appAlert, appAlertOverModal } from './appAlert';
import { zh } from '../locales/zh-CN';
import type { RootTabParamList, WritingStackParamList } from '../navigation/types';

type GuideCopy = {
  title: string;
  message: string;
  primaryButton: string;
};

function guideCopy(key: AssistantGuideKey): GuideCopy {
  return zh.guide[key] as GuideCopy;
}

export type AssistantGuideNav = {
  tabNav: BottomTabNavigationProp<RootTabParamList>;
  writingNav?: NativeStackNavigationProp<WritingStackParamList>;
  documentId?: string;
  documentTitle?: string;
  onRenameTitle?: () => void;
  onShareImage?: () => void;
  onCopyChapter?: () => void;
  openChatTools?: () => void;
};

export function runAssistantGuideAction(key: AssistantGuideKey, nav: AssistantGuideNav): void {
  switch (key) {
    case 'settings_font':
    case 'settings_voice':
    case 'settings_dialect':
      nav.tabNav.navigate('MeTab');
      return;
    case 'writing_new_doc':
    case 'writing_switch_doc':
      nav.tabNav.navigate('WritingTab', {
        screen: 'DocumentLibrary',
        params: { currentDocumentId: nav.documentId },
      });
      return;
    case 'writing_share':
      nav.tabNav.navigate('WritingTab', { screen: 'WritingMain' });
      nav.onShareImage?.();
      return;
    case 'writing_rename':
      nav.tabNav.navigate('WritingTab', { screen: 'WritingMain' });
      nav.onRenameTitle?.();
      return;
    case 'writing_history':
      if (nav.documentId && nav.writingNav) {
        nav.tabNav.navigate('WritingTab');
        nav.writingNav.navigate('RevisionHistory', {
          documentId: nav.documentId,
          title: nav.documentTitle?.trim() || zh.writing.docLibraryTitle,
        });
      } else {
        nav.tabNav.navigate('WritingTab', { screen: 'WritingMain' });
      }
      return;
    case 'chat_switch_topic':
      nav.openChatTools?.();
      return;
    default:
      return;
  }
}

export function showAssistantGuideAlert(
  key: AssistantGuideKey,
  nav: AssistantGuideNav,
  handlers: { onJustAsk: () => void; overModal?: boolean },
): void {
  const copy = guideCopy(key);
  const buttons = [
    {
      text: copy.primaryButton,
      onPress: () => runAssistantGuideAction(key, nav),
    },
    {
      text: zh.guide.justAsk,
      onPress: () => {
        // iOS 系统 Alert 关闭后再发起请求，避免 onPress 被吞或界面无反馈
        setTimeout(() => handlers.onJustAsk(), 300);
      },
    },
  ];
  if (handlers.overModal) {
    appAlertOverModal(copy.title, copy.message, buttons);
  } else {
    appAlert(copy.title, copy.message, buttons);
  }
}
