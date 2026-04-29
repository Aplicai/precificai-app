import React, { createContext, useState, useEffect, useContext, useRef, useCallback } from 'react';
import { AppState, Platform } from 'react-native';
import { supabase } from '../config/supabase';
import { resetDatabase } from '../database/database';
import { captureException, addBreadcrumb, setUser as reportSetUser } from '../utils/errorReporter';

const AuthContext = createContext({});

const INACTIVITY_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  // Sessão 28.9 — APP-01: flag que indica que o user clicou no link de reset
  // de senha. Quando true, AppNavigator força a tela ResetPassword mesmo que
  // a sessão de recovery do Supabase pareça "logada".
  const [passwordRecovery, setPasswordRecovery] = useState(false);
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
      reportSetUser(s?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      reportSetUser(s?.user ?? null);
      addBreadcrumb({ category: 'auth', message: `auth event: ${_event}` });
      // Sessão 28.9 — APP-01: detecta quando user voltou do email de reset de senha.
      // Sinaliza pro AppNavigator forçar a tela ResetPassword.
      if (_event === 'PASSWORD_RECOVERY') {
        setPasswordRecovery(true);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email, password) => {
    addBreadcrumb({ category: 'auth', message: 'signIn attempt' });
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return data;
    } catch (err) {
      captureException(err, { screen: 'Login', action: 'signIn' });
      throw err;
    }
  };

  const signUp = async (email, password) => {
    addBreadcrumb({ category: 'auth', message: 'signUp attempt' });
    try {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      return data;
    } catch (err) {
      captureException(err, { screen: 'Register', action: 'signUp' });
      throw err;
    }
  };

  const signOut = async () => {
    addBreadcrumb({ category: 'auth', message: 'signOut' });
    resetDatabase(); // Clear cached data to prevent cross-user leakage
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      reportSetUser(null);
    } catch (err) {
      captureException(err, { action: 'signOut' });
      throw err;
    }
  };

  const resetPassword = async (email) => {
    addBreadcrumb({ category: 'auth', message: 'resetPassword attempt' });
    try {
      // Sessão 28.9 — APP-01: passa redirectTo explícito.
      // Sem isso, Supabase usa o "Site URL" do dashboard, que pode não estar
      // alinhado com o domínio do app. Resultado: email gerado tem link
      // quebrado E em alguns casos o envio falha silenciosamente.
      const redirectTo = (typeof window !== 'undefined' && window.location)
        ? `${window.location.origin}/reset-password`
        : 'https://app.precificaiapp.com/reset-password';
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw error;
    } catch (err) {
      captureException(err, { screen: 'ForgotPassword', action: 'resetPassword' });
      throw err;
    }
  };

  // Sessão 28.9 — APP-01: helper pra o ResetPasswordScreen sinalizar que terminou
  // o fluxo de recovery (depois de redefinir senha + signOut).
  const clearPasswordRecovery = useCallback(() => setPasswordRecovery(false), []);

  return (
    <AuthContext.Provider value={{
      user, session, loading,
      signIn, signUp, signOut, resetPassword,
      passwordRecovery, clearPasswordRecovery,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
