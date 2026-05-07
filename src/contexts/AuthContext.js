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

  // Track app state for inactivity timeout
  // Mobile: usa AppState (background/active)
  // Web: usa eventos de mouse/teclado/visibilidade (Sessão 28.44 — security H3)
  useEffect(() => {
    if (Platform.OS !== 'web') {
      // Native: AppState transitions
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
    }

    // Web: registra listeners de atividade + heartbeat de checagem.
    // Sem isso, máquinas compartilhadas (escritório, lan house) ficam logadas
    // indefinidamente até user fechar a aba.
    if (typeof document === 'undefined' || typeof window === 'undefined') return;

    const bumpActivity = () => { lastActiveRef.current = Date.now(); };
    const checkInactivity = () => {
      if (!user) return;
      const elapsed = Date.now() - lastActiveRef.current;
      if (elapsed >= INACTIVITY_TIMEOUT_MS) {
        handleInactivityLogout();
      }
    };

    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach(ev => document.addEventListener(ev, bumpActivity, { passive: true }));

    const onVisibility = () => {
      if (!document.hidden) checkInactivity();
      bumpActivity();
    };
    document.addEventListener('visibilitychange', onVisibility);

    // Heartbeat: checa a cada 60s (mais barato do que checar a cada evento)
    const heartbeat = setInterval(checkInactivity, 60 * 1000);

    return () => {
      events.forEach(ev => document.removeEventListener(ev, bumpActivity));
      document.removeEventListener('visibilitychange', onVisibility);
      clearInterval(heartbeat);
    };
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
      // Sessão 28.32: limpa "última tab visitada" pra login sempre cair em Painel Geral.
      try {
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        await AsyncStorage.removeItem('precificai_last_tab');
      } catch {}
      // Sessão 28.34: HARD RELOAD no web logo após login.
      // Motivos:
      //  1. Garante que o usuário sempre carregue a versão mais recente do bundle
      //     (deploys novos no Vercel). Sem isso, browsers com SW/cache podiam
      //     mostrar versão antiga durante minutos.
      //  2. Resolve race condition do redirect: às vezes a navegação pra MainTabs
      //     acontecia ANTES do removeItem(LAST_TAB_KEY) propagar → usuário caía
      //     em tab aleatória. Reload elimina toda a state stale.
      //  3. Limpa qualquer cache em memória (supabaseDb, contextos React) que
      //     pudessem reter dados do login anterior.
      //
      // Supabase persiste a sessão em localStorage SÍNCRONO antes do
      // signInWithPassword resolver, então o reload preserva a autenticação.
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.reload) {
        // Pequeno delay pra deixar o React render do state de loading do LoginScreen
        // antes de matar o frame.
        setTimeout(() => { try { window.location.reload(); } catch {} }, 80);
      }
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
    // Sessão 28.44 — security H2: invalida sessão Supabase ANTES do reset local.
    // Antes: resetDatabase rodava primeiro → se signOut falhasse (rede), token
    // ficava em storage e onAuthStateChange repopulava o user → estado zumbi.
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      reportSetUser(null);
      // Só limpa local APÓS Supabase confirmar o signOut.
      resetDatabase();
      // Limpa também o cache do wrapper supabaseDb pra próxima sessão começar limpa.
      try {
        const { clearQueryCache } = await import('../database/supabaseDb');
        clearQueryCache?.();
      } catch {}
    } catch (err) {
      captureException(err, { action: 'signOut' });
      // Mesmo com erro, força limpeza local pra não deixar dados de outro user visíveis.
      // O onAuthStateChange resolve a sessão depois.
      try { resetDatabase(); } catch {}
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
