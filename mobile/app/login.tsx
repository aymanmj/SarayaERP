import { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  Image,
} from "react-native";
import { useRouter } from "expo-router";
import api, { setAuthToken, setUserInfo, getApiUrl, setApiUrl } from "../services/api";
import { HOSPITALS } from "../constants/hospitals";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../constants/theme";
import { useAuth } from "../context/AuthContext";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import { I18nManager } from "react-native";
import { useToast } from "../components/ToastContext";
import { AuthResponse, UserProfile } from "../types";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function LoginScreen() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { signIn } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // Server Settings States
  const [showSettings, setShowSettings] = useState(false);
  const [apiMode, setApiMode] = useState<'list' | 'url'>('list');
  const [selectedHospitalId, setSelectedHospitalId] = useState<string | null>(null);
  const [customUrl, setCustomUrl] = useState("");
  const [testingConnection, setTestingConnection] = useState(false);

  // Dynamic Directory States
  const [hospitalList, setHospitalList] = useState<any[]>(HOSPITALS);
  const [loadingHospitals, setLoadingHospitals] = useState(false);

  // Fetch dynamic list from central directory
  const fetchLatestHospitals = async (silent = false) => {
    if (!silent) setLoadingHospitals(true);
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 5000);
      const response = await fetch("https://gist.githubusercontent.com/aymanmj/6b14a6a9e6430b9dcfeb8fc1b79b5f7f/raw/hospitals.json", { signal: controller.signal });
      clearTimeout(id);
      
      if (response.status === 200) {
        const data = await response.json();
        if (Array.isArray(data) && data.length > 0) {
          setHospitalList(data);
          // Cache locally in AsyncStorage
          await AsyncStorage.setItem("cached_hospitals", JSON.stringify(data));
          if (!silent) showToast("تم تحديث قائمة المستشفيات بنجاح!", 'success');
        }
      }
    } catch (e) {
      console.warn("Failed to fetch dynamic hospital list, using local cache/defaults", e);
      if (!silent) {
        showToast("تعذر الاتصال بخادم الدليل، تم استخدام القائمة المخزنة مؤقتاً.", 'warning');
      }
    } finally {
      if (!silent) setLoadingHospitals(false);
    }
  };

  useEffect(() => {
    const loadApiSettings = async () => {
      const url = await getApiUrl();
      
      // Load from cache first if exists
      let currentList = HOSPITALS;
      try {
        const cached = await AsyncStorage.getItem("cached_hospitals");
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setHospitalList(parsed);
            currentList = parsed;
          }
        }
      } catch (e) {
        // Ignore
      }

      const matchedHospital = currentList.find(h => h.url.toLowerCase() === url.toLowerCase());
      if (matchedHospital) {
        setSelectedHospitalId(matchedHospital.id);
        setApiMode('list');
      } else {
        setCustomUrl(url);
        setApiMode('url');
        setSelectedHospitalId(null);
      }

      // Try silently fetching the latest updates from the internet
      fetchLatestHospitals(true);
    };
    loadApiSettings();
  }, []);

  const handleSaveSettings = async () => {
    let finalUrl = "";
    if (apiMode === 'list') {
      const selected = hospitalList.find(h => h.id === selectedHospitalId);
      if (!selected) {
        showToast("يرجى اختيار المستشفى أو المركز الطبي", 'warning');
        return;
      }
      finalUrl = selected.url;
    } else {
      if (!customUrl) {
        showToast("يرجى إدخال عنوان السيرفر", 'warning');
        return;
      }
      finalUrl = customUrl.trim();
    }

    setTestingConnection(true);
    let connected = false;
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 4000);
      const response = await fetch(`${finalUrl}/health`, { signal: controller.signal });
      clearTimeout(id);
      if (response.status === 200) {
        connected = true;
      }
    } catch (e) {
      // Ignore error
    } finally {
      setTestingConnection(false);
    }

    await setApiUrl(finalUrl);
    if (connected) {
      showToast("تم الاتصال وحفظ الإعدادات بنجاح!", 'success');
      setShowSettings(false);
    } else {
      showToast("تم حفظ الإعدادات، ولكن تعذر التحقق من الاتصال بالخادم حالياً.", 'warning');
      setShowSettings(false);
    }
  };

  const handleLogin = async () => {
    if (!username || !password) {
      showToast(t('login.validationError') || "Please enter username and password", 'warning');
      return;
    }

    setLoading(true);
    try {
      const response = await api.post<AuthResponse>("/auth/login", { username, password });
      const authData = response.data;

      if (authData.success && authData.accessToken) {
        await setAuthToken(authData.accessToken);
        if (authData.user) {
          await setUserInfo(authData.user);
          await signIn(authData.accessToken, authData.user);
          
          const roles = authData.user.roles || [];
          if (roles.includes('PHARMACIST')) {
            router.replace("/pharmacy");
          } else {
            router.replace("/rounds");
          }
        } else {
          const fallbackUser: UserProfile = {
            id: 0,
            username: "unknown",
            fullName: "Unknown User",
            roles: []
          };
          await signIn(authData.accessToken, fallbackUser);
          router.replace("/rounds"); 
        }
      } else {
        const msg = authData.message || "Invalid credentials";
        showToast(msg, 'error');
      }
    } catch (error: unknown) {
      console.error(error);
      const errMessage = error instanceof Error ? error.message : "Connection failed";
      showToast(errMessage, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient
      colors={[theme.colors.darkBackground, "#111827", "#1f2937"]}
      style={styles.container}
    >
      <StatusBar barStyle="light-content" />
      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
      >
        <View style={styles.glassCard}>
          <TouchableOpacity 
            style={styles.settingsButton} 
            onPress={() => setShowSettings(!showSettings)}
            activeOpacity={0.7}
          >
            <Ionicons 
              name={showSettings ? "close-outline" : "settings-outline"} 
              size={24} 
              color={theme.colors.primaryLight} 
            />
          </TouchableOpacity>

          <View style={styles.header}>
            <Image source={require('../assets/icon.png')} style={styles.logoImage} resizeMode="contain" />
            <Text style={styles.title}>Saraya ERP</Text>
            <Text style={styles.subtitle}>Clinical & Pharmacy Portal</Text>
          </View>

          {showSettings ? (
            <View style={styles.form}>
              <Text style={styles.settingsTitle}>إعدادات خادم الاتصال</Text>
              
              <View style={styles.tabContainer}>
                <TouchableOpacity 
                  style={[styles.tabButton, apiMode === 'list' && styles.activeTabButton]}
                  onPress={() => setApiMode('list')}
                >
                  <Text style={[styles.tabButtonText, apiMode === 'list' && styles.activeTabButtonText]}>اختر المستشفى</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={[styles.tabButton, apiMode === 'url' && styles.activeTabButton]}
                  onPress={() => setApiMode('url')}
                >
                  <Text style={[styles.tabButtonText, apiMode === 'url' && styles.activeTabButtonText]}>سيرفر مخصص</Text>
                </TouchableOpacity>
              </View>

              {apiMode === 'list' ? (
                <View style={styles.listContainer}>
                  <View style={styles.listHeader}>
                    <Text style={styles.listHeaderTitle}>العيادات والمستشفيات:</Text>
                    <TouchableOpacity 
                      onPress={() => fetchLatestHospitals(false)} 
                      disabled={loadingHospitals}
                      style={styles.refreshButton}
                      activeOpacity={0.7}
                    >
                      {loadingHospitals ? (
                        <ActivityIndicator size="small" color={theme.colors.primaryLight} />
                      ) : (
                        <View style={styles.refreshButtonContent}>
                          <Ionicons name="refresh" size={14} color={theme.colors.primaryLight} />
                          <Text style={styles.refreshButtonText}>تحديث القائمة</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  </View>
                  
                  {hospitalList.map((hospital) => (
                    <TouchableOpacity
                      key={hospital.id}
                      style={[
                        styles.hospitalItem,
                        selectedHospitalId === hospital.id && styles.activeHospitalItem
                      ]}
                      onPress={() => setSelectedHospitalId(hospital.id)}
                    >
                      <Text style={[
                        styles.hospitalItemText,
                        selectedHospitalId === hospital.id && styles.activeHospitalItemText
                      ]}>
                        {hospital.name}
                      </Text>
                      {selectedHospitalId === hospital.id && (
                        <Ionicons name="checkmark-circle" size={20} color="#ffffff" />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                <View style={styles.inputContainer}>
                  <Ionicons name="link-outline" size={20} color={theme.colors.textMuted} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, { textAlign: 'left' }]}
                    placeholder="https://example.com/api"
                    value={customUrl}
                    onChangeText={setCustomUrl}
                    autoCapitalize="none"
                    keyboardType="url"
                    placeholderTextColor={theme.colors.textMuted}
                  />
                </View>
              )}

              <TouchableOpacity 
                style={styles.loginButtonContainer} 
                onPress={handleSaveSettings}
                disabled={testingConnection}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={[theme.colors.primary, theme.colors.primaryLight]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.loginButton}
                >
                  {testingConnection ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.loginButtonText}>حفظ واختبار الاتصال</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.form}>
              <View style={styles.inputContainer}>
                <Ionicons name="person-outline" size={20} color={theme.colors.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { textAlign: I18nManager.isRTL ? 'right' : 'left' }]}
                  placeholder={t('login.email') || "Username or Email"}
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                  placeholderTextColor={theme.colors.textMuted}
                />
              </View>

              <View style={styles.inputContainer}>
                <Ionicons name="lock-closed-outline" size={20} color={theme.colors.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { textAlign: I18nManager.isRTL ? 'right' : 'left' }]}
                  placeholder={t('login.password') || "Password"}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  placeholderTextColor={theme.colors.textMuted}
                />
              </View>

              <TouchableOpacity 
                style={styles.loginButtonContainer} 
                onPress={handleLogin}
                disabled={loading}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={[theme.colors.primary, theme.colors.primaryLight]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.loginButton}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.loginButtonText}>{t('login.submit') || "Sign In"}</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>
              
              <View style={styles.footer}>
                <Text style={styles.footerText}>Authorized clinical personnel only.</Text>
              </View>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
    justifyContent: "center",
  },
  glassCard: {
    backgroundColor: "rgba(21, 31, 50, 0.75)",
    borderRadius: theme.borderRadius.xl,
    padding: theme.sizes.lg,
    marginHorizontal: 20,
    borderWidth: 1,
    borderColor: "rgba(13, 148, 136, 0.2)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 5,
  },
  header: {
    alignItems: 'center',
    marginBottom: 30,
  },
  logoImage: {
    width: 100,
    height: 100,
    marginBottom: 16,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: "#ffffff",
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 14,
    color: theme.colors.primaryLight,
    fontWeight: "500",
  },
  form: {
    width: "100%",
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    borderWidth: 1,
    borderColor: "rgba(226, 232, 240, 0.1)",
    borderRadius: theme.borderRadius.lg,
    marginBottom: theme.sizes.md,
    paddingHorizontal: theme.sizes.md,
    height: 56,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: "#ffffff",
  },
  loginButtonContainer: {
    width: '100%',
    marginTop: 16,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 3,
  },
  loginButton: {
    height: 56,
    borderRadius: theme.borderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  loginButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  footer: {
    marginTop: 24,
    alignItems: 'center',
  },
  footerText: {
    color: theme.colors.textMuted,
    fontSize: 13,
  },
  settingsButton: {
    position: 'absolute',
    top: 15,
    right: 15,
    zIndex: 10,
    padding: 8,
  },
  settingsTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#ffffff",
    marginBottom: 16,
    textAlign: 'center',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: "rgba(15, 23, 42, 0.4)",
    borderRadius: theme.borderRadius.md,
    padding: 4,
    marginBottom: 20,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: theme.borderRadius.sm,
  },
  activeTabButton: {
    backgroundColor: theme.colors.primary,
  },
  tabButtonText: {
    fontSize: 14,
    color: theme.colors.textMuted,
    fontWeight: '600',
  },
  activeTabButtonText: {
    color: '#ffffff',
  },
  listContainer: {
    marginBottom: 16,
    maxHeight: 250,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  listHeaderTitle: {
    fontSize: 13,
    color: theme.colors.textMuted,
    fontWeight: '600',
  },
  refreshButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  refreshButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  refreshButtonText: {
    fontSize: 12,
    color: theme.colors.primaryLight,
    marginLeft: 4,
    fontWeight: '600',
  },
  hospitalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: "rgba(15, 23, 42, 0.4)",
    borderWidth: 1,
    borderColor: "rgba(226, 232, 240, 0.05)",
    borderRadius: theme.borderRadius.md,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  activeHospitalItem: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primaryLight,
  },
  hospitalItemText: {
    fontSize: 14,
    color: "#ffffff",
    fontWeight: '500',
  },
  activeHospitalItemText: {
    fontWeight: '700',
  },
});
