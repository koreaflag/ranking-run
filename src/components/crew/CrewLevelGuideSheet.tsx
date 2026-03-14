import { useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Modal,
  Platform,
  ScrollView,
  PanResponder,
  Dimensions,
} from 'react-native';
import { Ionicons } from '../../lib/icons';
import { useTheme } from '../../hooks/useTheme';
import { useTranslation } from 'react-i18next';
import type { ThemeColors } from '../../utils/constants';
import { FONT_SIZES, SPACING, BORDER_RADIUS, SHADOWS } from '../../utils/constants';
import CrewLevelBadge, { getTier } from './CrewLevelBadge';
import {
  LEVEL_UNLOCKS,
  CREW_MAX_MEMBERS,
  getXpProgress,
  formatXpDistance,
  CREW_LEVEL_THRESHOLDS,
} from '../../utils/crewLevelConfig';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const DISMISS_THRESHOLD = 120;

interface CrewLevelGuideSheetProps {
  visible: boolean;
  onClose: () => void;
  currentLevel: number;
  totalXp: number;
}

export default function CrewLevelGuideSheet({
  visible,
  onClose,
  currentLevel,
  totalXp,
}: CrewLevelGuideSheetProps) {
  const colors = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const dragOffset = useRef(new Animated.Value(0)).current;
  const modalVisible = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  const cardPositions = useRef<Record<number, number>>({});

  useEffect(() => {
    if (visible) {
      modalVisible.current = true;
      dragOffset.setValue(0);
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          damping: 22,
          stiffness: 180,
          useNativeDriver: true,
        }),
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start(() => {
        // Auto-scroll to current level
        const y = cardPositions.current[currentLevel];
        if (y != null && scrollRef.current) {
          setTimeout(() => {
            scrollRef.current?.scrollTo({ y: Math.max(0, y - 60), animated: true });
          }, 200);
        }
      });
    } else if (modalVisible.current) {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: SCREEN_HEIGHT,
          duration: 280,
          useNativeDriver: true,
        }),
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start(() => {
        modalVisible.current = false;
      });
    }
  }, [visible, slideAnim, overlayOpacity, dragOffset, currentLevel]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, g) => g.dy > 8,
        onPanResponderMove: (_, g) => {
          if (g.dy > 0) {
            dragOffset.setValue(g.dy);
            const progress = Math.min(g.dy / 300, 1);
            overlayOpacity.setValue(1 - progress * 0.6);
          }
        },
        onPanResponderRelease: (_, g) => {
          if (g.dy > DISMISS_THRESHOLD || g.vy > 0.5) {
            onClose();
          } else {
            Animated.parallel([
              Animated.spring(dragOffset, {
                toValue: 0,
                damping: 20,
                stiffness: 200,
                useNativeDriver: true,
              }),
              Animated.timing(overlayOpacity, {
                toValue: 1,
                duration: 150,
                useNativeDriver: true,
              }),
            ]).start();
          }
        },
      }),
    [dragOffset, overlayOpacity, onClose],
  );

  const xp = getXpProgress(currentLevel, totalXp);
  const combinedTranslateY = Animated.add(slideAnim, dragOffset);

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
      <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onClose}
        />
      </Animated.View>

      <Animated.View
        style={[styles.sheet, { transform: [{ translateY: combinedTranslateY }] }]}
        {...panResponder.panHandlers}
      >
        <View style={styles.handleBar} />

        <Text style={styles.title}>{t('crewLevel.guideTitle')}</Text>

        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          bounces={false}
        >
          {LEVEL_UNLOCKS.map(({ level, features }) => {
            const tier = getTier(level);
            const isUnlocked = currentLevel >= level;
            const isCurrent = currentLevel === level;
            const maxMem = CREW_MAX_MEMBERS[level];

            return (
              <View
                key={level}
                onLayout={(e) => {
                  cardPositions.current[level] = e.nativeEvent.layout.y;
                }}
                style={[
                  styles.levelCard,
                  { borderColor: isCurrent ? tier.border : colors.border },
                  isCurrent && {
                    borderWidth: 2,
                    backgroundColor: tier.bg + '15',
                  },
                  !isUnlocked && { opacity: 0.6 },
                ]}
              >
                {/* Header */}
                <View style={styles.levelHeader}>
                  <CrewLevelBadge level={level} size="sm" />
                  <Text style={[styles.tierLabel, { color: isCurrent ? tier.text : colors.text }]}>
                    {tier.label}
                  </Text>
                  {isCurrent && (
                    <View style={[styles.currentBadge, { backgroundColor: tier.border }]}>
                      <Text style={styles.currentBadgeText}>{t('crewLevel.current')}</Text>
                    </View>
                  )}
                </View>

                {/* Max members */}
                <View style={styles.memberCapRow}>
                  <Ionicons name="people-outline" size={14} color={colors.textSecondary} />
                  <Text style={styles.memberCapText}>
                    {maxMem
                      ? t('crewLevel.maxMembers', { count: maxMem })
                      : t('crewLevel.unlimited')}
                  </Text>
                </View>

                {/* Features */}
                {features.map((f) => {
                  const unlocked = currentLevel >= f.requiredLevel;
                  return (
                    <View key={f.i18nKey} style={styles.featureRow}>
                      <Ionicons
                        name={unlocked ? 'lock-open' : 'lock-closed'}
                        size={16}
                        color={unlocked ? colors.success : colors.textTertiary}
                      />
                      <Text
                        style={[
                          styles.featureText,
                          !unlocked && { color: colors.textTertiary },
                        ]}
                      >
                        {t(f.i18nKey)}
                      </Text>
                      {f.comingSoon && (
                        <View style={styles.comingSoonTag}>
                          <Text style={styles.comingSoonText}>Coming Soon</Text>
                        </View>
                      )}
                    </View>
                  );
                })}

                {/* XP progress for current level */}
                {isCurrent && !xp.isMax && (
                  <View style={[styles.xpSection, { backgroundColor: tier.bg }]}>
                    <View style={[styles.xpBarTrack, { backgroundColor: tier.border + '20' }]}>
                      <View
                        style={[
                          styles.xpBarFill,
                          {
                            width: `${Math.round(xp.ratio * 100)}%`,
                            backgroundColor: tier.border,
                          },
                        ]}
                      />
                    </View>
                    <Text style={[styles.xpText, { color: tier.text }]}>
                      {formatXpDistance(totalXp)} / {formatXpDistance(CREW_LEVEL_THRESHOLDS[currentLevel] ?? 0)}
                    </Text>
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    overlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0, 0, 0, 0.45)',
    },
    sheet: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      maxHeight: '80%',
      backgroundColor: c.card,
      borderTopLeftRadius: BORDER_RADIUS.xl,
      borderTopRightRadius: BORDER_RADIUS.xl,
      paddingBottom: Platform.OS === 'ios' ? 40 : SPACING.xxl,
      ...SHADOWS.lg,
    },
    handleBar: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.surfaceLight,
      alignSelf: 'center',
      marginTop: SPACING.md,
      marginBottom: SPACING.sm,
    },
    title: {
      fontSize: FONT_SIZES.lg,
      fontWeight: '800',
      color: c.text,
      textAlign: 'center',
      marginBottom: SPACING.md,
    },
    scrollContent: {
      paddingHorizontal: SPACING.xl,
      paddingBottom: SPACING.xxl,
      gap: SPACING.md,
    },

    // Level card
    levelCard: {
      backgroundColor: c.card,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: c.border,
      padding: SPACING.lg,
      gap: SPACING.sm,
    },
    levelHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    tierLabel: {
      flex: 1,
      fontSize: FONT_SIZES.md,
      fontWeight: '700',
    },
    currentBadge: {
      paddingHorizontal: SPACING.sm,
      paddingVertical: 2,
      borderRadius: BORDER_RADIUS.xs,
    },
    currentBadgeText: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '800',
      color: '#FFFFFF',
    },

    // Member cap
    memberCapRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
    },
    memberCapText: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '500',
      color: c.textSecondary,
    },

    // Features
    featureRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      paddingLeft: SPACING.xs,
    },
    featureText: {
      flex: 1,
      fontSize: FONT_SIZES.sm,
      fontWeight: '600',
      color: c.text,
    },
    comingSoonTag: {
      backgroundColor: c.surfaceLight,
      paddingHorizontal: SPACING.sm,
      paddingVertical: 2,
      borderRadius: BORDER_RADIUS.xs,
    },
    comingSoonText: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '600',
      color: c.textTertiary,
    },

    // XP inside current level
    xpSection: {
      marginTop: SPACING.xs,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      borderRadius: BORDER_RADIUS.md,
      gap: SPACING.xs,
    },
    xpBarTrack: {
      height: 10,
      borderRadius: 5,
      overflow: 'hidden',
    },
    xpBarFill: {
      height: '100%',
      borderRadius: 5,
      minWidth: 4,
    },
    xpText: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '700',
      textAlign: 'center',
    },
  });
