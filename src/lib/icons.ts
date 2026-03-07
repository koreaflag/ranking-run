/**
 * Platform-aware Ionicons export.
 * - iOS: uses original @expo/vector-icons (works with expo-font)
 * - Android: bypasses expo-font, reads from native assets/fonts/ directly
 */
import { Platform } from 'react-native';
import { Ionicons as ExpoIonicons } from '@expo/vector-icons';
// @ts-ignore — vendored JS module without type declarations
import createIconSet from '@expo/vector-icons/build/vendor/react-native-vector-icons/lib/create-icon-set';
// @ts-ignore
import glyphMap from '@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json';

let Ionicons: typeof ExpoIonicons;

if (Platform.OS === 'android') {
  const AndroidIonicons = createIconSet(glyphMap, 'Ionicons', 'Ionicons.ttf') as any;
  AndroidIonicons.glyphMap = glyphMap;
  AndroidIonicons.font = { Ionicons: require('@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf') };
  Ionicons = AndroidIonicons;
} else {
  Ionicons = ExpoIonicons as any;
}

export { Ionicons };
export default Ionicons;
