import { useState } from "react";
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
} from "react-native";
import { useRouter } from "expo-router";
import api, { setAuthToken, setUserInfo } from "../services/api";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../constants/theme";
import { useAuth } from "../context/AuthContext";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import { I18nManager } from "react-native";
import { useToast } from "../components/ToastContext";
import { AuthResponse, UserProfile } from "../types";

export default function LoginScreen() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { signIn } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

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
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <Ionicons name="medical" size={44} color={theme.colors.primary} />
            </View>
            <Text style={styles.title}>Saraya ERP</Text>
            <Text style={styles.subtitle}>Clinical & Pharmacy Portal</Text>
          </View>

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
              style={styles.loginButton} 
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.loginButtonText}>{t('login.submit') || "Sign In"}</Text>
              )}
            </TouchableOpacity>
            
            <View style={styles.footer}>
              <Text style={styles.footerText}>Authorized clinical personnel only.</Text>
            </View>
          </View>
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
  iconContainer: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "rgba(13, 148, 136, 0.1)",
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(13, 148, 136, 0.3)",
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
  loginButton: {
    backgroundColor: theme.colors.primary,
    height: 56,
    borderRadius: theme.borderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 3,
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
});
