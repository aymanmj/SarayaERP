import { Stack } from 'expo-router';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { useEffect } from 'react';

export default function Layout() {
  const { expoPushToken } = usePushNotifications();
  
  useEffect(() => {
    if(expoPushToken) {
       console.log("Push Token Active:", expoPushToken);
    }
  }, [expoPushToken]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="login" />
      <Stack.Screen name="rounds/index" options={{ title: 'Doctor Rounds', headerShown: true }} />
      <Stack.Screen name="rounds/[id]" options={{ title: 'Patient Details', headerShown: true }} />
    </Stack>
  );
}
