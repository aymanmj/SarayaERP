import { Stack } from 'expo-router';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import NetInfo from '@react-native-community/netinfo';
import SyncService from '../services/SyncService';

export default function Layout() {
  const { expoPushToken } = usePushNotifications();
  const [isSyncing, setIsSyncing] = useState(false);
  
  useEffect(() => {
    if(expoPushToken) {
       console.log("Push Token Active:", expoPushToken);
    }
  }, [expoPushToken]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      if (state.isConnected && state.isInternetReachable) {
        handleSync();
      }
    });

    return () => unsubscribe();
  }, []);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await SyncService.sync();
    } catch (e) {
      console.error("Sync failed:", e);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="rounds/index" options={{ title: 'Doctor Rounds', headerShown: true }} />
        <Stack.Screen name="rounds/[id]" options={{ title: 'Patient Details', headerShown: true }} />
        <Stack.Screen name="profile" options={{ headerShown: false }} />
      </Stack>
      
      {isSyncing && (
        <SafeAreaView style={styles.syncContainer}>
           <View style={styles.syncBadge}>
              <ActivityIndicator size="small" color="#fff" />
              <Text style={styles.syncText}>Syncing data...</Text>
           </View>
        </SafeAreaView>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  syncContainer: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 9999,
  },
  syncBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(2, 132, 199, 0.9)', // Sky 600 with opacity
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 8,
  },
  syncText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
});
