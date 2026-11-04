import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../services/api';

export type UserRole = 'user' | 'admin';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatarInitials: string;
  monthlyIncome: number;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password?: string) => Promise<{ success: boolean; error?: string; user?: User }>;
  register: (email: string, password: string, displayName: string, monthlyIncome?: number) => Promise<{ success: boolean; error?: string; user?: User }>;
  logout: () => Promise<void>;
  switchRole: (role: UserRole) => void;
  updateProfile: (updated: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Restore authenticated session on application mount via GET /api/auth/me
  useEffect(() => {
    let isMounted = true;

    const restoreSession = async () => {
      try {
        const session = await api.getCurrentUser();
        if (isMounted) {
          if (session.authenticated && session.user) {
            setUser({
              id: session.user.id,
              name: session.user.name,
              email: session.user.email,
              role: session.user.role,
              avatarInitials: session.user.avatarInitials,
              monthlyIncome: session.user.monthlyIncome,
            });
          } else {
            setUser(null);
          }
        }
      } catch (err) {
        if (isMounted) {
          console.error('[Session Restoration Error]:', err);
          setUser(null);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    restoreSession();

    return () => {
      isMounted = false;
    };
  }, []);

  const login = async (email: string, password: string = 'password123'): Promise<{ success: boolean; error?: string; user?: User }> => {
    try {
      const res = await api.login(email, password);
      if (res.success && res.user) {
        const verifiedUser: User = {
          id: res.user.id,
          name: res.user.name,
          email: res.user.email,
          role: res.user.role,
          avatarInitials: res.user.avatarInitials,
          monthlyIncome: res.user.monthlyIncome,
        };
        setUser(verifiedUser);
        return { success: true, user: verifiedUser };
      }
      return { success: false, error: res.error || 'Invalid email or password.' };
    } catch {
      return { success: false, error: 'Authentication service unreachable.' };
    }
  };

  const register = async (
    email: string,
    password: string,
    displayName: string,
    monthlyIncome?: number
  ): Promise<{ success: boolean; error?: string; user?: User }> => {
    try {
      const res = await api.register(email, password, displayName, monthlyIncome);
      if (res.success && res.user) {
        const verifiedUser: User = {
          id: res.user.id,
          name: res.user.name,
          email: res.user.email,
          role: res.user.role,
          avatarInitials: res.user.avatarInitials,
          monthlyIncome: res.user.monthlyIncome,
        };
        setUser(verifiedUser);
        return { success: true, user: verifiedUser };
      }
      return { success: false, error: res.error || 'Registration failed.' };
    } catch {
      return { success: false, error: 'Authentication service unreachable.' };
    }
  };

  const logout = async (): Promise<void> => {
    try {
      await api.logout();
    } catch (err) {
      console.error('[Logout Error]:', err);
    } finally {
      setUser(null);
      // NOTE: Intentionally preserve financial records in localStorage as requested.
    }
  };

  const switchRole = (role: UserRole) => {
    if (!user) return;
    setUser({ ...user, role });
  };

  const updateProfile = (updated: Partial<User>) => {
    if (!user) return;
    setUser({ ...user, ...updated });
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        register,
        logout,
        switchRole,
        updateProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
