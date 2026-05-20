import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { ContextUsage } from '@shiren/shared';
import { ContextUsageDetailModal } from './ContextUsageDetailModal';
import { ContextUsageRing } from './ContextUsageRing';
import { useLayout } from '../theme/layout';
import { zh } from '../locales/zh-CN';

type Props = {
  usage: ContextUsage | null;
  loading?: boolean;
  reserveSlot?: boolean;
  onOpenDetail?: (usage: ContextUsage) => void;
  onRingLongPress?: () => void;
  onCompact?: () => void;
};

export function ContextUsageControl({
  usage,
  loading,
  reserveSlot,
  onOpenDetail,
  onRingLongPress,
}: Props) {
  const { isTablet } = useLayout();
  const slotW = isTablet ? 52 : 48;
  const slotH = isTablet ? 58 : 52;
  const [detailOpen, setDetailOpen] = useState(false);

  if (!usage && !loading && !reserveSlot) return null;

  if (!usage && !loading) {
    return <View style={{ width: slotW, height: slotH }} pointerEvents="none" />;
  }

  const ratio = usage?.ratio ?? 0;
  const accessibilityLabel = loading
    ? zh.context.usageLoading
    : zh.context.ringAccessibility;

  const openDetail = () => {
    if (!usage) return;
    if (onOpenDetail) {
      onOpenDetail(usage);
    } else {
      setDetailOpen(true);
    }
  };

  return (
    <>
      <View
        style={{ width: slotW, height: slotH, alignItems: 'center', justifyContent: 'center' }}
        pointerEvents="box-none"
      >
        <ContextUsageRing
          ratio={ratio}
          loading={loading}
          onPress={openDetail}
          onLongPress={onRingLongPress}
          accessibilityLabel={
            onRingLongPress ? zh.context.ringLongPressAccessibility : accessibilityLabel
          }
        />
      </View>
      {!onOpenDetail && detailOpen && usage ? (
        <ContextUsageDetailModal visible usage={usage} onClose={() => setDetailOpen(false)} />
      ) : null}
    </>
  );
}
