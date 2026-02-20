import { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar, ImageBackground, Dimensions, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '../constants/theme';
import { useAuth } from '../context/AuthContext';

const { width } = Dimensions.get('window');

export default function HomeScreen() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && user) {
        const roles = user.roles || [];
        if (roles.includes('PHARMACIST')) {
            router.replace("/pharmacy");
        } else {
            router.replace("/rounds");
        }
    }
  }, [user, isLoading]);

  if (isLoading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* Background Gradient */}
      <LinearGradient
        colors={[theme.colors.darkBackground, theme.colors.darkSurface, theme.colors.primaryDark]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.background}
      />

      {/* Decorative Circles */}
      <View style={styles.circle1} />
      <View style={styles.circle2} />

      <View style={styles.contentContainer}>
        <View style={styles.logoSection}>
          <View style={styles.iconContainer}>
            <LinearGradient
              colors={[theme.colors.primaryLight, theme.colors.primary]}
              style={styles.iconGradient}
            >
              <Ionicons name="fitness" size={64} color={theme.colors.surface} />
            </LinearGradient>
          </View>
          
          <Text style={styles.appName}>Saraya<Text style={styles.appNameHighlight}>ERP</Text></Text>
          <Text style={styles.tagline}>Advanced Healthcare Management</Text>
        </View>

        <View style={styles.bottomSection}>
          <TouchableOpacity 
            style={styles.button}
            onPress={() => router.push('/login')}
            activeOpacity={0.9}
          >
            <LinearGradient
              colors={[theme.colors.secondary, theme.colors.primary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.buttonGradient}
            >
              <Text style={styles.buttonText}>Get Started</Text>
              <Ionicons name="arrow-forward" size={20} color={theme.colors.surface} />
            </LinearGradient>
          </TouchableOpacity>
          
          <Text style={styles.versionText}>v1.0.0 • Secure & Encrypted</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.darkBackground,
  },
  background: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  circle1: {
    position: 'absolute',
    top: -50,
    left: -50,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    zIndex: 0,
  },
  circle2: {
    position: 'absolute',
    bottom: 100,
    right: -20,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(56, 189, 248, 0.05)',
    zIndex: 0,
  },
  contentContainer: {
    flex: 1,
    padding: 30,
    justifyContent: 'space-between',
    zIndex: 1,
  },
  logoSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 60,
  },
  iconContainer: {
    marginBottom: 24,
    shadowColor: '#38bdf8',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  iconGradient: {
    width: 120,
    height: 120,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    transform: [{ rotate: '-10deg' }],
  },
  appName: {
    fontSize: 48,
    fontWeight: '800',
    color: theme.colors.surface,
    letterSpacing: -1,
    marginBottom: 8,
  },
  appNameHighlight: {
    color: theme.colors.primaryLight,
  },
  tagline: {
    fontSize: 16,
    color: theme.colors.textMuted,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  bottomSection: {
    paddingBottom: 40,
    alignItems: 'center',
  },
  button: {
    width: '100%',
    shadowColor: '#0ea5e9',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
    marginBottom: 24,
  },
  buttonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    borderRadius: 16,
    gap: 12,
  },
  buttonText: {
    color: theme.colors.surface,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  versionText: {
    color: theme.colors.textLight,
    fontSize: 12,
  },
});
