export type ComposeIconVariant = 'ai' | 'human';

export const chatIcons = {
  keyboard: require('../../assets/chat/icon-keyboard.png'),
  voiceHuman: require('../../assets/chat/icon-dictation-human.png'),
  voiceAi: require('../../assets/chat/icon-dictation-ai.png'),
  voiceAiAlt: require('../../assets/chat/icon-voice-ai.png'),
  voiceHumanAlt: require('../../assets/chat/icon-voice-human.png'),
  plusAi: require('../../assets/chat/icon-plus-ai.png'),
  pickImage: require('../../assets/chat/icon-pick-image.png'),
} as const;

/** 人对话模式：灰橙人聊图标；传图用自定义相册图标 */
export function composeBarIcons(variant: ComposeIconVariant = 'human') {
  const human = variant === 'human';
  return {
    voice: human ? chatIcons.voiceHuman : chatIcons.voiceAi,
    keyboard: chatIcons.keyboard,
    plus: chatIcons.pickImage,
  };
}
