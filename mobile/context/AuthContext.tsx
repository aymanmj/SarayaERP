import React, { createContext, useState, useEffect, useContext } from 'react';
import { getAuthToken, getUserInfo, removeAuthToken, removeUserInfo } from '../services/api';
import { useRouter, useSegments } from 'expo-router';

type UserData = {
  id: number;
  username: string;
  fullName?: string;
  roles?: string[];
  [key: string]: any;
};

type AuthContextType = {
  user: UserData | null;
  isLoading: boolean;
  signIn: (token: string, userData: UserData) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    // Check local storage for token and user on mount
    const bootstrapAsync = async () => {
      try {
        const token = await getAuthToken();
        const userInfo = await getUserInfo();

        if (token && userInfo) {
          setUser(userInfo);
        } else {
          setUser(null);
        }
      } catch (e) {
        console.error('Failed to restore auth state', e);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    bootstrapAsync();
  }, []);

  const signIn = async (token: string, userData: UserData) => {
    // The setAuthToken and setUserInfo are expected to be called before/inside here or externally.
    // For encapsulation, we can assume api.setAuthToken/setUserInfo is called before this signIn method,
    // OR we could call them here if we import them.
    setUser(userData);
  };

  const signOut = async () => {
    await removeAuthToken();
    await removeUserInfo();
    setUser(null);
    router.replace('/');
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
