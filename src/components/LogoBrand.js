import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { fontFamily } from '../utils/theme';

export default function LogoBrand({ size = 24, color, leafColor, white = false }) {
  const textColor = white ? '#FFFFFF' : (color || '#004d47');
  const accentColor = leafColor || '#e3b842';

  return (
    <View style={styles.container}>
      <Text style={[styles.text, { fontSize: size, color: textColor, fontFamily: fontFamily.extraBold }]}>
        Precifica
      </Text>
      <Text style={[styles.text, { fontSize: size, color: accentColor, fontFamily: fontFamily.extraBold }]}>
        í
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  text: {
    letterSpacing: -0.3,
    includeFontPadding: false,
  },
});
