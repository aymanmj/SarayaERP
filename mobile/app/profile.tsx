import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, StatusBar } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getUserInfo, removeAuthToken, removeUserInfo } from '../services/api';

import i18n, { LANGUAGE_KEY } from '../i18n';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Updates from 'expo-updates';
import { I18nManager } from 'react-native';

export default function ProfileScreen() {
  const router = useRouter();
  const [userInfo, setUserInfoState] = useState<any>(null);

  // Trigger re-render on language change
  const [, setTick] = useState(0);

  useEffect(() => {
    loadUserInfo();
  }, []);

  const loadUserInfo = async () => {
    const info = await getUserInfo();
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
                      } catch (e) {
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
      "Confirm Logout",
      "Are you sure you want to log out?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Logout", 
          style: "destructive",
          onPress: async () => {
            await removeAuthToken();
            await removeUserInfo();
            router.replace("/");
          } 
        }
      ]
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
           <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile & Settings</Text>
        <View style={{width: 24}} /> 
      </View>

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
               <View style={[styles.iconBox, {backgroundColor: '#e0f2fe'}]}>
                 <Ionicons name="notifications-outline" size={20} color="#0284c7" />
               </View>
               <Text style={styles.settingLabel}>Push Notifications</Text>
             </View>
             {/* Toggle switch would go here */}
             <Text style={styles.settingValue}>Enabled</Text>
          </View>

          <View style={styles.settingRow}>
             <View style={styles.settingLeft}>
               <View style={[styles.iconBox, {backgroundColor: '#f3e8ff'}]}>
                 <Ionicons name="moon-outline" size={20} color="#9333ea" />
               </View>
               <Text style={styles.settingLabel}>Dark Mode</Text>
             </View>
             <Text style={styles.settingValue}>System</Text>
          </View>

             <View style={styles.settingRow}>
                <View style={styles.settingLeft}>
                  <View style={[styles.iconBox, {backgroundColor: '#dcfce7'}]}>
                    <Ionicons name="language-outline" size={20} color="#16a34a" />
                  </View>
                  <Text style={styles.settingLabel}>{i18n.t('common.language') || 'Language'}</Text>
                </View>
                <TouchableOpacity onPress={toggleLanguage}>
                    <Text style={[styles.settingValue, { color: '#0284c7', fontWeight: 'bold' }]}>
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
               <View style={[styles.iconBox, {backgroundColor: '#fee2e2'}]}>
                 <Ionicons name="help-buoy-outline" size={20} color="#dc2626" />
               </View>
               <Text style={styles.settingLabel}>Help Center</Text>
             </View>
             <Ionicons name="chevron-forward" size={20} color="#cbd5e1" />
           </TouchableOpacity>
        </View>

        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
           <Ionicons name="log-out-outline" size={20} color="#ef4444" />
           <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>

        <Text style={styles.versionText}>Version 1.0.0 (Build 2024.1)</Text>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: {
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 20,
    backgroundColor: '#0284c7',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backButton: { },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
  content: { padding: 20 },
  
  userCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  avatar: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: '#e0f2fe',
    justifyContent: 'center', alignItems: 'center', marginBottom: 12
  },
  avatarText: { fontSize: 32, fontWeight: '700', color: '#0284c7' },
  userName: { fontSize: 20, fontWeight: '700', color: '#1e293b', marginBottom: 4 },
  userRole: { fontSize: 14, color: '#64748b', fontWeight: '600', textTransform: 'uppercase', marginBottom: 4 },
  userFullName: { fontSize: 16, color: '#475569' },

  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#94a3b8', marginBottom: 12, marginLeft: 4, textTransform: 'uppercase' },
  
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#f1f5f9'
  },
  settingLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBox: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  settingLabel: { fontSize: 16, color: '#334155', fontWeight: '500' },
  settingValue: { fontSize: 14, color: '#64748b' },

  logoutButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    padding: 16,
    borderRadius: 16,
    gap: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#fee2e2'
  },
  logoutText: { fontSize: 16, fontWeight: '700', color: '#ef4444' },

  versionText: { textAlign: 'center', marginTop: 24, color: '#94a3b8', fontSize: 12 },
});
