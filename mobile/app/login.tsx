import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
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

import { useTranslation } from "react-i18next";
import { I18nManager } from "react-native";
import { useToast } from "../components/ToastContext";

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
      const response = await api.post("/auth/login", { username, password });

      if (response.data.success && response.data.accessToken) {
        await setAuthToken(response.data.accessToken);
        // Assuming response.data.user contains user details like { id, username, fullName, role }
        // If not, we might need to decode the token or fetch profile
        if (response.data.user) {
            await setUserInfo(response.data.user);
            await signIn(response.data.accessToken, response.data.user);
            
            // Role-based redirection is now handled inside AuthContext or we can do it here.
            // But let's keep it here for now to ensure proper navigation
            const roles = response.data.user.roles || [];
            if (roles.includes('PHARMACIST')) {
                router.replace("/pharmacy");
            } else {
                router.replace("/rounds");
            }
        } else {
             await signIn(response.data.accessToken, {} as any);
             router.replace("/rounds"); 
        }
      } else {
        const msg = response.data.message || "Invalid credentials";
        showToast(msg, 'error');
      }
    } catch (error: any) {
      console.error(error);
      showToast(error.message || "Connection failed", 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <View style={styles.iconContainer}>
           <Ionicons name="person" size={50} color={theme.colors.primary} />
        </View>
        <Text style={styles.title}>Welcome Back</Text>
        <Text style={styles.subtitle}>Sign in to continue</Text>
      </View>

      <View style={styles.form}>
        <View style={styles.inputContainer}>
          <Ionicons name="person-outline" size={20} color={theme.colors.textLight} style={styles.inputIcon} />
          <TextInput
            style={[styles.input, {textAlign: I18nManager.isRTL ? 'right' : 'left'}]}
            placeholder={t('login.email')}
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            placeholderTextColor={theme.colors.textMuted}
          />
        </View>

        <View style={styles.inputContainer}>
          <Ionicons name="lock-closed-outline" size={20} color={theme.colors.textLight} style={styles.inputIcon} />
          <TextInput
            style={[styles.input, {textAlign: I18nManager.isRTL ? 'right' : 'left'}]}
            placeholder={t('login.password')}
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
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.loginButtonText}>{t('login.submit')}</Text>
          )}
        </TouchableOpacity>
        
        <View style={styles.footer}>
           <Text style={styles.footerText}>Need help? Contact IT Support</Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    justifyContent: "center",
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#e0f2fe',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 4,
    borderColor: theme.colors.surface,
    ...theme.shadows.small,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: theme.colors.text,
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 16,
    color: theme.colors.textLight,
  },
  form: {
    paddingHorizontal: 30,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    marginBottom: theme.sizes.md,
    paddingHorizontal: theme.sizes.md,
    height: 56,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: theme.colors.text,
  },
  loginButton: {
    backgroundColor: theme.colors.primary,
    height: 56,
    borderRadius: theme.borderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
    ...theme.shadows.medium,
  },
  loginButtonText: {
    color: theme.colors.surface,
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  footer: {
    marginTop: 30,
    alignItems: 'center',
  },
  footerText: {
    color: theme.colors.textMuted,
    fontSize: 14,
  },
});
