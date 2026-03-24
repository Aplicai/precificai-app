import React from 'react';
import { View, Text } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import AppNavigator from './src/navigation/AppNavigator';
import { AuthProvider } from './src/contexts/AuthContext';
import { colors } from './src/utils/theme';

export default function App() {
  const [fontsLoaded] = useFonts({
    'DMSans-Regular': require('./assets/fonts/DMSans-Regular.ttf'),
    'DMSans-Medium': require('./assets/fonts/DMSans-Medium.ttf'),
    'DMSans-SemiBold': require('./assets/fonts/DMSans-SemiBold.ttf'),
    'DMSans-Bold': require('./assets/fonts/DMSans-Bold.ttf'),
    'DMSans-ExtraBold': require('./assets/fonts/DMSans-ExtraBold.ttf'),
  });

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ fontSize: 16, color: colors.textSecondary }}>Carregando...</Text>
      </View>
    );
  }

  return (
    <AuthProvider>
      <View style={{ flex: 1 }}>
        <StatusBar style="light" />
        <AppNavigator />
      </View>
    </AuthProvider>
  );
}
