import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, StatusBar, I18nManager } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getUserInfo, removeAuthToken, removeUserInfo } from '../services/api';
import { theme } from '../constants/theme';
import { UserProfile } from '../types';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../context/AuthContext';

import i18n, { LANGUAGE_KEY } from '../i18n';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Updates from 'expo-updates';
import { useTranslation } from 'react-i18next';

export default function ProfileScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const [userInfo, setUserInfoState] = useState<UserProfile | null>(null);
  const { t } = useTranslation();

  // Trigger re-render on language change
  const [, setTick] = useState<number>(0);

  useEffect(() => {
    loadUserInfo();
  }, []);

  const loadUserInfo = async () => {
    const info = await getUserInfo() as UserProfile | null;
    setUserInfoState(info);
  };

  const toggleLanguage = async () => {
      const currentLang = i18n.language;
      const newLang = currentLang === 'en' ? 'ar' : 'en';
      const isRTL = newLang === 'ar';

      await AsyncStorage.setItem(LANGUAGE_KEY, newLang);
      await i18n.changeLanguage(newLang);
      
      I18nManager.allowRTL(isRTL);
      I18nManager.forceRTL(isRTL);

      Alert.alert(
          newLang === 'ar' ? "تغيير اللغة" : "Change Language",
          newLang === 'ar' ? "سيتم إعادة تشغيل التطبيق لتطبيق اللغة العربية" : "The app will restart to apply English language",
          [
              {
                  text: "OK",
                  onPress: async () => {
                      try {
                        await Updates.reloadAsync();
                      } catch (e: unknown) {
                          // Fallback for Expo Go or dev mode if reloadAsync fails/is not supported properly
                         Alert.alert("Note", "Please manually restart the app for RTL layout changes to take full effect.");
                         setTick(t => t + 1); // Force re-render at least
                      }
                  }
              }
          ]
      );
  };

  const handleLogout = async () => {
    Alert.alert(
      t('common.logoutConfirmTitle'),
      t('common.logoutConfirmMessage'),
      [
        { text: t('common.cancel'), style: "cancel" },
        { 
          text: t('common.logout'), 
          style: "destructive",
          onPress: async () => {
            await signOut();
          } 
        }
      ]
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* Premium Header with Gradient */}
      <LinearGradient
        colors={[theme.colors.darkSurface, theme.colors.darkBackground]}
        style={styles.header}
      >
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
           <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile & Settings</Text>
        <View style={{width: 24}} /> 
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.content}>
        {/* User Card */}
        <View style={styles.userCard}>
          <View style={styles.avatar}>
             <Text style={styles.avatarText}>
                {userInfo?.fullName ? userInfo.fullName.charAt(0).toUpperCase() : 'U'}
             </Text>
          </View>
          <Text style={styles.userName}>{userInfo?.username || 'User'}</Text>
          <Text style={styles.userRole}>{userInfo?.roles?.join(', ') || 'Staff'}</Text>
          {userInfo?.fullName && <Text style={styles.userFullName}>{userInfo.fullName}</Text>}
        </View>

        {/* Settings Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>App Settings</Text>
          
          <View style={styles.settingRow}>
             <View style={styles.settingLeft}>
                <View style={[styles.iconBox, {backgroundColor: 'rgba(13, 148, 136, 0.1)'}]}>
                  <Ionicons name="notifications-outline" size={20} color={theme.colors.primary} />
                </View>
                <Text style={styles.settingLabel}>Push Notifications</Text>
             </View>
             <Text style={styles.settingValue}>Enabled</Text>
          </View>

          <View style={styles.settingRow}>
             <View style={styles.settingLeft}>
                <View style={[styles.iconBox, {backgroundColor: 'rgba(79, 70, 229, 0.1)'}]}>
                  <Ionicons name="moon-outline" size={20} color={theme.colors.secondary} />
                </View>
                <Text style={styles.settingLabel}>Dark Mode</Text>
             </View>
             <Text style={styles.settingValue}>System</Text>
          </View>

          <View style={styles.settingRow}>
             <View style={styles.settingLeft}>
               <View style={[styles.iconBox, {backgroundColor: 'rgba(16, 185, 129, 0.1)'}]}>
                 <Ionicons name="language-outline" size={20} color={theme.colors.success} />
               </View>
               <Text style={styles.settingLabel}>{t('common.language') || 'Language'}</Text>
             </View>
             <TouchableOpacity onPress={toggleLanguage}>
                 <Text style={[styles.settingValue, { color: theme.colors.primary, fontWeight: 'bold' }]}>
                     {i18n.language === 'ar' ? 'العربية' : 'English'}
                 </Text>
             </TouchableOpacity>
          </View>
        </View>

        {/* Support Section */}
        <View style={styles.section}>
           <Text style={styles.sectionTitle}>Support</Text>
           <TouchableOpacity style={styles.settingRow}>
             <View style={styles.settingLeft}>
               <View style={[styles.iconBox, {backgroundColor: 'rgba(225, 29, 72, 0.1)'}]}>
                 <Ionicons name="help-buoy-outline" size={20} color={theme.colors.error} />
               </View>
               <Text style={styles.settingLabel}>Help Center</Text>
             </View>
             <Ionicons name="chevron-forward" size={20} color={theme.colors.border} />
           </TouchableOpacity>
        </View>

        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
           <Ionicons name="log-out-outline" size={20} color={theme.colors.error} />
           <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>

        <Text style={styles.versionText}>Version 1.0.0 (Build 2026.1)</Text>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomLeftRadius: theme.borderRadius.lg,
    borderBottomRightRadius: theme.borderRadius.lg,
  },
  backButton: { },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
  content: { padding: 20 },
  
  userCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadows.small,
  },
  avatar: {
    width: 80, 
    height: 80, 
    borderRadius: 40, 
    backgroundColor: 'rgba(13, 148, 136, 0.1)',
    justifyContent: 'center', 
    alignItems: 'center', 
    marginBottom: 12,
    borderWidth: 2,
    borderColor: theme.colors.primary,
  },
  avatarText: { fontSize: 32, fontWeight: '700', color: theme.colors.primary },
  userName: { fontSize: 20, fontWeight: '700', color: theme.colors.text, marginBottom: 4 },
  userRole: { fontSize: 14, color: theme.colors.textLight, fontWeight: '600', textTransform: 'uppercase', marginBottom: 4 },
  userFullName: { fontSize: 16, color: theme.colors.textLight },

  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: theme.colors.textMuted, marginBottom: 12, marginLeft: 4, textTransform: 'uppercase' },
  
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    padding: 16,
    borderRadius: theme.borderRadius.lg,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: theme.colors.border
  },
  settingLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBox: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  settingLabel: { fontSize: 16, color: theme.colors.text, fontWeight: '500' },
  settingValue: { fontSize: 14, color: theme.colors.textLight },

  logoutButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(225, 29, 72, 0.05)',
    padding: 16,
    borderRadius: theme.borderRadius.lg,
    gap: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: 'rgba(225, 29, 72, 0.2)'
  },
  logoutText: { fontSize: 16, fontWeight: '700', color: theme.colors.error },

  versionText: { textAlign: 'center', marginTop: 24, color: theme.colors.textMuted, fontSize: 12 },
});
