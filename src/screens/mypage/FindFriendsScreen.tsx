import { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Image,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '../../lib/icons';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import type { MyPageStackParamList } from '../../types/navigation';
import type { UserSearchByCodeResult } from '../../types/api';
import { userService } from '../../services/userService';
import { useAuthStore } from '../../stores/authStore';
import { useTheme } from '../../hooks/useTheme';
import BlurredBackground from '../../components/common/BlurredBackground';
import ScreenHeader from '../../components/common/ScreenHeader';
import { FONT_SIZES, SPACING, BORDER_RADIUS } from '../../utils/constants';
import type { ThemeColors } from '../../utils/constants';

type Nav = NativeStackNavigationProp<MyPageStackParamList>;

export default function FindFriendsScreen() {
  const navigation = useNavigation<Nav>();
  const { t } = useTranslation();
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // User code search state
  const [codeInput, setCodeInput] = useState('');
  const [codeResult, setCodeResult] = useState<UserSearchByCodeResult | null>(null);
  const [isCodeSearching, setIsCodeSearching] = useState(false);
  const [codeSearched, setCodeSearched] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const myUserCode = useAuthStore((s) => s.user?.user_code ?? '');

  // Follow state (optimistic)
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set());

  const handleCodeSearch = useCallback(async () => {
    const code = codeInput.trim();
    if (!code) return;

    setIsCodeSearching(true);
    setCodeSearched(false);
    try {
      const result = await userService.searchByCode(code);
      setCodeResult(result);
      setCodeSearched(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      Alert.alert(t('common.errorTitle'), t('findFriends.codeSearchFailed'));
    } finally {
      setIsCodeSearching(false);
    }
  }, [codeInput, t]);

  const handleCopyCode = useCallback(async () => {
    if (!myUserCode) return;
    await Clipboard.setStringAsync(myUserCode);
    setCodeCopied(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => setCodeCopied(false), 2000);
  }, [myUserCode]);

  const handleCodeFollow = useCallback(async () => {
    if (!codeResult) return;
    setFollowedIds((prev) => new Set(prev).add(codeResult.id));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      await userService.followByCode(codeResult.user_code);
      setCodeResult({ ...codeResult, is_following: true });
    } catch {
      setFollowedIds((prev) => {
        const next = new Set(prev);
        next.delete(codeResult.id);
        return next;
      });
    }
  }, [codeResult]);

  const handleViewProfile = useCallback((userId: string) => {
    navigation.navigate('UserProfile', { userId });
  }, [navigation]);

  return (
    <BlurredBackground>
      <SafeAreaView style={styles.container}>
        <ScreenHeader
          title={t('findFriends.title')}
          onBack={() => navigation.goBack()}
        />
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* My Code Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('findFriends.myCode')}</Text>
            <TouchableOpacity
              style={styles.card}
              onPress={handleCopyCode}
              activeOpacity={0.7}
            >
              <View style={styles.myCodeRow}>
                <View style={[styles.iconCircle, { backgroundColor: `${colors.primary}20` }]}>
                  <Ionicons name="finger-print-outline" size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.registeredLabel}>{myUserCode}</Text>
                  <Text style={styles.registeredDesc}>
                    {codeCopied ? t('findFriends.copied') : t('findFriends.tapToCopy')}
                  </Text>
                </View>
                <Ionicons
                  name={codeCopied ? 'checkmark-circle' : 'copy-outline'}
                  size={20}
                  color={codeCopied ? colors.success : colors.textTertiary}
                />
              </View>
            </TouchableOpacity>
          </View>

          {/* Search by Code Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('findFriends.searchByCode')}</Text>
            <View style={styles.card}>
              <View style={styles.codeSearchSection}>
                <View style={styles.codeInputRow}>
                  <Ionicons name="search" size={18} color={colors.textTertiary} />
                  <TextInput
                    style={styles.codeInput}
                    placeholder={t('findFriends.codePlaceholder')}
                    placeholderTextColor={colors.textTertiary}
                    value={codeInput}
                    onChangeText={setCodeInput}
                    maxLength={20}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="search"
                    onSubmitEditing={handleCodeSearch}
                  />
                  <TouchableOpacity
                    style={[
                      styles.codeSearchBtn,
                      !codeInput.trim() && styles.registerButtonDisabled,
                    ]}
                    onPress={handleCodeSearch}
                    disabled={!codeInput.trim() || isCodeSearching}
                    activeOpacity={0.7}
                  >
                    {isCodeSearching ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.codeSearchBtnText}>{t('findFriends.search')}</Text>
                    )}
                  </TouchableOpacity>
                </View>

                {/* Code search result */}
                {codeSearched && (
                  codeResult ? (
                    <TouchableOpacity
                      style={styles.codeResultRow}
                      onPress={() => handleViewProfile(codeResult.id)}
                      activeOpacity={0.7}
                    >
                      {codeResult.avatar_url ? (
                        <Image source={{ uri: codeResult.avatar_url }} style={styles.avatar} />
                      ) : (
                        <View style={[styles.avatar, styles.avatarPlaceholder]}>
                          <Text style={styles.avatarInitial}>
                            {codeResult.nickname ? codeResult.nickname.charAt(0).toUpperCase() : '?'}
                          </Text>
                        </View>
                      )}
                      <View style={styles.matchInfo}>
                        <Text style={styles.matchNickname} numberOfLines={1}>
                          {codeResult.nickname ?? t('findFriends.defaultNickname')}
                        </Text>
                        <Text style={styles.matchStats} numberOfLines={1}>
                          {(codeResult.total_distance_meters / 1000).toFixed(0)}km · {t('findFriends.runCount', { count: codeResult.total_runs })}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={[
                          styles.followButton,
                          (codeResult.is_following || followedIds.has(codeResult.id)) && styles.followButtonDone,
                        ]}
                        onPress={() => !(codeResult.is_following || followedIds.has(codeResult.id)) && handleCodeFollow()}
                        activeOpacity={(codeResult.is_following || followedIds.has(codeResult.id)) ? 1 : 0.7}
                      >
                        {(codeResult.is_following || followedIds.has(codeResult.id)) ? (
                          <Ionicons name="checkmark" size={16} color={colors.textTertiary} />
                        ) : (
                          <Text style={styles.followButtonText}>{t('findFriends.follow')}</Text>
                        )}
                      </TouchableOpacity>
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.codeNoResult}>
                      <Ionicons name="person-outline" size={24} color={colors.textTertiary} />
                      <Text style={styles.codeNoResultText}>{t('findFriends.codeNotFound')}</Text>
                    </View>
                  )
                )}
              </View>
            </View>
          </View>

          {/* Privacy Info */}
          <View style={styles.section}>
            <View style={styles.infoBox}>
              <Ionicons name="shield-checkmark-outline" size={16} color={colors.textTertiary} />
              <Text style={styles.infoText}>
                {t('findFriends.privacyInfo')}
              </Text>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </BlurredBackground>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    scrollView: {
      flex: 1,
    },
    content: {
      paddingBottom: SPACING.xxxl + SPACING.xl,
      gap: SPACING.xl,
    },

    // Section
    section: {
      paddingHorizontal: SPACING.xxl,
      gap: SPACING.md,
    },
    sectionTitle: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '700',
      color: c.textTertiary,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      paddingLeft: SPACING.xs,
    },

    // Card
    card: {
      backgroundColor: c.card,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: c.border,
      overflow: 'hidden',
    },

    // My code
    myCodeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: SPACING.xl,
      gap: SPACING.lg,
    },

    // Code search
    codeSearchSection: {
      padding: SPACING.xl,
      gap: SPACING.lg,
    },
    codeInputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.surface,
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 1,
      borderColor: c.border,
      paddingLeft: SPACING.lg,
      gap: SPACING.sm,
    },
    codeInput: {
      flex: 1,
      fontSize: FONT_SIZES.md,
      color: c.text,
      paddingVertical: SPACING.md,
    },
    codeSearchBtn: {
      backgroundColor: c.primary,
      borderRadius: BORDER_RADIUS.md,
      paddingHorizontal: SPACING.xl,
      paddingVertical: SPACING.md,
      marginRight: 4,
    },
    codeSearchBtnText: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    codeResultRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.lg,
      paddingTop: SPACING.sm,
    },
    codeNoResult: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.sm,
      paddingVertical: SPACING.md,
    },
    codeNoResultText: {
      fontSize: FONT_SIZES.sm,
      color: c.textTertiary,
    },

    iconCircle: {
      width: 36,
      height: 36,
      borderRadius: 18,
      justifyContent: 'center',
      alignItems: 'center',
    },
    registeredLabel: {
      fontSize: FONT_SIZES.md,
      fontWeight: '700',
      color: c.text,
    },
    registeredDesc: {
      fontSize: FONT_SIZES.xs,
      color: c.textTertiary,
      marginTop: 2,
    },
    registerButtonDisabled: {
      opacity: 0.4,
    },
    avatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
    },
    avatarPlaceholder: {
      backgroundColor: c.surface,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: c.border,
    },
    avatarInitial: {
      fontSize: FONT_SIZES.lg,
      fontWeight: '700',
      color: c.textSecondary,
    },
    matchInfo: {
      flex: 1,
      gap: 2,
    },
    matchNickname: {
      fontSize: FONT_SIZES.md,
      fontWeight: '700',
      color: c.text,
    },
    matchStats: {
      fontSize: FONT_SIZES.xs,
      color: c.textTertiary,
    },
    followButton: {
      backgroundColor: c.primary,
      borderRadius: BORDER_RADIUS.full,
      paddingHorizontal: SPACING.xl,
      paddingVertical: SPACING.sm + 2,
    },
    followButtonDone: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    followButtonText: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '700',
      color: '#FFFFFF',
    },

    // Info box
    infoBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: SPACING.sm,
      paddingHorizontal: SPACING.xs,
    },
    infoText: {
      flex: 1,
      fontSize: FONT_SIZES.xs,
      color: c.textTertiary,
      lineHeight: 18,
    },
  });
