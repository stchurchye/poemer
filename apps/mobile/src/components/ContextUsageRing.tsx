import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { colors } from '../theme/colors';
import { useLayout } from '../theme/layout';

const STROKE_RATIO = 2.5 / 24;
const START_OFFSET = -90;

type Props = {
  ratio: number;
  loading?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  accessibilityLabel: string;
};

function circleWedge(
  size: number,
  stroke: number,
  colors: { top: string; right?: string; left?: string },
): ViewStyle {
  return {
    width: size,
    height: size,
    borderRadius: size / 2,
    borderWidth: stroke,
    borderTopColor: colors.top,
    borderRightColor: colors.right ?? 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: colors.left ?? 'transparent',
  };
}

function RingGraphic({
  ratio,
  loading,
  size,
  stroke,
}: {
  ratio: number;
  loading?: boolean;
  size: number;
  stroke: number;
}) {
  const clamped = Math.min(1, Math.max(0, ratio));
  const percent = Math.round(clamped * 100);
  const arcColor =
    percent >= 85 ? colors.error : percent >= 70 ? colors.primary : colors.textMuted;
  const fillColor = loading ? colors.border : arcColor;

  const angle = clamped * 360;
  const rightRotate = START_OFFSET + Math.min(angle, 180);
  const showLeft = angle > 180;
  const leftRotate = START_OFFSET + Math.max(angle - 180, 0);

  return (
    <View style={{ width: size, height: size, overflow: 'hidden' }} pointerEvents="none">
      <View
        style={{
          ...StyleSheet.absoluteFillObject,
          borderRadius: size / 2,
          borderWidth: stroke,
          borderColor: colors.border,
        }}
      />
      {clamped > 0.001 && !loading ? (
        <>
          <View
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              width: size / 2,
              height: size,
              overflow: 'hidden',
            }}
          >
            <View
              style={[
                circleWedge(size, stroke, { top: fillColor, right: fillColor }),
                {
                  position: 'absolute',
                  top: 0,
                  left: -size / 2,
                  transform: [{ rotate: `${rightRotate}deg` }],
                },
              ]}
            />
          </View>
          {showLeft ? (
            <View
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: size / 2,
                height: size,
                overflow: 'hidden',
              }}
            >
              <View
                style={[
                  circleWedge(size, stroke, { top: fillColor, left: fillColor }),
                  {
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    transform: [{ rotate: `${leftRotate}deg` }],
                  },
                ]}
              />
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

export function ContextUsageRing({
  ratio,
  loading,
  onPress,
  onLongPress,
  accessibilityLabel,
}: Props) {
  const { isTablet } = useLayout();
  const size = isTablet ? 36 : 32;
  const stroke = Math.max(2.5, size * STROKE_RATIO);
  const displayRatio = loading ? 0 : ratio;

  const ring = (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <RingGraphic ratio={displayRatio} loading={loading} size={size} stroke={stroke} />
    </View>
  );

  if (!onPress && !onLongPress) return ring;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
    >
      {ring}
    </Pressable>
  );
}
