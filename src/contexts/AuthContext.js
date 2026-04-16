import React, { createContext, useState, useEffect, useContext, useRef, useCallback } from 'react';
import { AppState, Platform } from 'react-native';
import { supabase } from '../config/supabase';
import { resetDatabase } from '../database/database';

const AuthContext = createContext({});

const INACTIVITY_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const lastActiveRef = useRef(Date.now());
  const timeoutRef = useRef(null);

  const handleInactivityLogout = useCallback(async () => {
    if (user) {
      resetDatabase();
      await supabase.auth.signOut();
    }
  }, [user]);

  // Track app state for inactivity timeout (native only — web uses Supabase's built-in session persistence)
  useEffect(() => {
    if (Platform.OS === 'web') return; // Supabase handles web session via autoRefreshToken + persistSession

    const handleAppStateChange = (nextState) => {
      if (nextState === 'active') {
        const elapsed = Date.now() - lastActiveRef.current;
        if (elapsed >= INACTIVITY_TIMEOUT_MS && user) {
          handleInactivityLogout();
        }
        lastActiveRef.current = Date.now();
      } else if (nextState === 'background') {
        lastActiveRef.current = Date.now();
      }
    };

    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
  }, [user, handleInactivityLogout]);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  };

  const signUp = async (email, password) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    return data;
  };

  const signOut = async () => {
    resetDatabase(); // Clear cached data to prevent cross-user leakage
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const resetPassword = async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) throw error;
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signIn, signUp, signOut, resetPassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
