import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Sidebar from './Sidebar';
import WebHeader from './WebHeader';

export default function WebLayout({ children, notifCount, onNotifPress }) {
  const navigation = useNavigation();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <View style={styles.container}>
      <Sidebar
        navigation={navigation}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed(!collapsed)}
      />
      <View style={styles.main}>
        <WebHeader
          navigation={navigation}
          notifCount={notifCount}
          onNotifPress={onNotifPress}
        />
        <View style={styles.content}>
          {children}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
  },
  main: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
});
