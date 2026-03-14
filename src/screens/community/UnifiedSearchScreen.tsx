import { useState, useCallback, useRef, memo } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Image,
  Platform,
  StatusBar,
} from 'react-native';
import { Ionicons } from '../../lib/icons';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import BlurredBackground from '../../components/common/BlurredBackground';
import type { CommunityStackParamList } from '../../types/navigation';
import type { CrewItem, UserSearchItem } from '../../types/api';
import { crewService } from '../../services/crewService';
import { userService } from '../../services/userService';
import { useTheme } from '../../hooks/useTheme';
import type { ThemeColors } from '../../utils/constants';
import { FONT_SIZES, SPACING, BORDER_RADIUS } from '../../utils/constants';

type Nav = NativeStackNavigationProp<CommunityStackParamList, 'UnifiedSearch'>;

// ---- Memoized Result Components ----

interface CrewResultProps {
  item: CrewItem;
  onPress: () => void;
  colors: ThemeColors;
}

const CrewResult = memo(function CrewResult({ item, onPress, colors }: CrewResultProps) {
  const styles = createStyles(colors);
  return (
    <TouchableOpacity style={styles.resultRow} onPress={onPress} activeOpacity={0.7}>
      {item.logo_url ? (
        <Image source={{ uri: item.logo_url }} style={styles.crewLogo} />
      ) : (
        <View style={[styles.crewLogo, { backgroundColor: item.badge_color || colors.primary }]}>
          <Ionicons
            name={(item.badge_icon as keyof typeof Ionicons.glyphMap) || 'people'}
            size={18}
            color="#FFF"
          />
        </View>
      )}
      <View style={styles.resultInfo}>
        <Text style={styles.resultName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.resultSub} numberOfLines={1}>
          {item.member_count}명{item.region ? ` · ${item.region}` : ''}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
    </TouchableOpacity>
  );
});

interface UserResultProps {
  item: UserSearchItem;
  onPress: () => void;
  colors: ThemeColors;
}

const UserResult = memo(function UserResult({ item, onPress, colors }: UserResultProps) {
  const styles = createStyles(colors);
  return (
    <TouchableOpacity style={styles.resultRow} onPress={onPress} activeOpacity={0.7}>
      {item.avatar_url ? (
        <Image source={{ uri: item.avatar_url }} style={styles.userAvatar} />
      ) : (
        <View style={[styles.userAvatar, { backgroundColor: colors.surface }]}>
          <Ionicons name="person" size={18} color={colors.textTertiary} />
        </View>
      )}
      <View style={styles.resultInfo}>
        <Text style={styles.resultName} numberOfLines={1}>{item.nickname ?? '?'}</Text>
        {item.crew_name ? (
          <Text style={styles.resultSub} numberOfLines={1}>{item.crew_name}</Text>
        ) : item.activity_region ? (
          <Text style={styles.resultSub} numberOfLines={1}>{item.activity_region}</Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
    </TouchableOpacity>
  );
});

// ---- Main ----

export default function UnifiedSearchScreen() {
  const navigation = useNavigation<Nav>();
  const colors = useTheme();
  const { t } = useTranslation();
  const styles = createStyles(colors);
  const inputRef = useRef<TextInput>(null);

  const [query, setQuery] = useState('');
  const [crewResults, setCrewResults] = useState<CrewItem[]>([]);
  const [userResults, setUserResults] = useState<UserSearchItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const handleSearch = useCallback((text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!text.trim()) {
      setCrewResults([]);
      setUserResults([]);
      setIsSearching(false);
      setHasSearched(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const [crewRes, userRes] = await Promise.all([
          crewService.listCrews({ search: text.trim(), per_page: 15 }),
          userService.searchUsers({ q: text.trim(), per_page: 15 }),
        ]);
        setCrewResults(crewRes.data);
        setUserResults(userRes.data);
        setHasSearched(true);
      } catch {
        // silent
      } finally {
        setIsSearching(false);
      }
    }, 400);
  }, []);

  return (
    <BlurredBackground>
      <SafeAreaView style={styles.container}>
        {/* Header with search bar */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backBtn}
            activeOpacity={0.6}
          >
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color={colors.textTertiary} />
            <TextInput
              ref={inputRef}
              style={styles.searchInput}
              placeholder={t('explore.searchPlaceholder')}
              placeholderTextColor={colors.textTertiary}
              value={query}
              onChangeText={handleSearch}
              autoCapitalize="none"
              autoFocus
              returnKeyType="search"
            />
            {query.length > 0 && (
              <TouchableOpacity
                onPress={() => handleSearch('')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Content */}
        {isSearching ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : !hasSearched ? (
          <View style={styles.hintContainer}>
            <Ionicons name="search-outline" size={48} color={colors.textTertiary} />
            <Text style={styles.hintText}>{t('explore.searchHint')}</Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Crew results */}
            {crewResults.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>{t('explore.crewSection')}</Text>
                {crewResults.map((crew) => (
                  <CrewResult
                    key={crew.id}
                    item={crew}
                    onPress={() => navigation.navigate('CrewDetail', { crewId: crew.id })}
                    colors={colors}
                  />
                ))}
              </>
            )}

            {/* User results */}
            {userResults.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>{t('explore.runnerSection')}</Text>
                {userResults.map((user) => (
                  <UserResult
                    key={user.id}
                    item={user}
                    onPress={() => navigation.navigate('UserProfile', { userId: user.id })}
                    colors={colors}
                  />
                ))}
              </>
            )}

            {/* No results */}
            {crewResults.length === 0 && userResults.length === 0 && (
              <View style={styles.emptyState}>
                <Ionicons name="search-outline" size={36} color={colors.textTertiary} />
                <Text style={styles.emptyText}>{t('explore.noResults')}</Text>
              </View>
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </BlurredBackground>
  );
}

// ---- Styles ----

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },

    // Header
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.sm,
      gap: SPACING.sm,
    },
    backBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      justifyContent: 'center',
      alignItems: 'center',
    },
    searchBar: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.surface,
      borderRadius: BORDER_RADIUS.md,
      paddingHorizontal: SPACING.md,
      gap: SPACING.sm,
    },
    searchInput: {
      flex: 1,
      fontSize: FONT_SIZES.md,
      fontWeight: '500',
      color: c.text,
      paddingVertical: SPACING.sm + 2,
    },

    // Content
    listContent: {
      paddingHorizontal: SPACING.xl,
      paddingBottom: SPACING.xxxl,
    },
    sectionTitle: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '800',
      color: c.textTertiary,
      marginTop: SPACING.lg,
      marginBottom: SPACING.sm,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },

    // Result row
    resultRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.card,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: c.border,
      padding: SPACING.md,
      marginBottom: SPACING.sm,
      gap: SPACING.md,
    },
    crewLogo: {
      width: 40,
      height: 40,
      borderRadius: 12,
      justifyContent: 'center',
      alignItems: 'center',
      overflow: 'hidden',
    },
    userAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      justifyContent: 'center',
      alignItems: 'center',
      overflow: 'hidden',
    },
    resultInfo: {
      flex: 1,
      gap: 2,
    },
    resultName: {
      fontSize: FONT_SIZES.md,
      fontWeight: '700',
      color: c.text,
    },
    resultSub: {
      fontSize: FONT_SIZES.xs,
      fontWeight: '500',
      color: c.textTertiary,
    },

    // Hint (before searching)
    hintContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      gap: SPACING.md,
      paddingBottom: SPACING.xxxl * 2,
    },
    hintText: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '500',
      color: c.textTertiary,
      textAlign: 'center',
    },

    // Empty
    emptyState: {
      alignItems: 'center',
      paddingVertical: SPACING.xxxl * 2,
      gap: SPACING.sm,
    },
    emptyText: {
      fontSize: FONT_SIZES.sm,
      fontWeight: '500',
      color: c.textTertiary,
    },
  });
