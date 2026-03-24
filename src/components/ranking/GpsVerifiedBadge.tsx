import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '../../lib/icons';
import { COLORS } from '../../utils/constants';

interface Props {
  size?: number;
}

export default function GpsVerifiedBadge({ size = 12 }: Props) {
  return (
    <View style={styles.container}>
      <Ionicons name="shield-checkmark" size={size} color={COLORS.success} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginLeft: 4,
  },
});
