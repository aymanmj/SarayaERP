import { Stack } from 'expo-router';

export default function Layout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Home' }} />
      <Stack.Screen name="rounds/index" options={{ title: 'Doctor Rounds' }} />
      <Stack.Screen name="rounds/[id]" options={{ title: 'Patient Details' }} />
    </Stack>
  );
}
