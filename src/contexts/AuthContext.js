import React, { createContext, useState, useEffect, useContext, useRef, useCallback } from 'react';
import { AppState, Platform } from 'react-native';
import { supabase } from '../config/supabase';
import { resetDatabase } from '../database/database';
import { captureException, addBreadcrumb, setUser as reportSetUser } from '../utils/errorReporter';

const AuthContext = createContext({});

// Timeout de inatividade — configurável pelo usuário via checkbox
// "Lembrar de mim" no LoginScreen (M-2):
//  - Default (checkbox desmarcado, mais seguro p/ máquinas compartilhadas): 2 horas
//  - "Lembrar de mim" marcado (dispositivo pessoal): 7 dias
//
// A escolha é persistida em AsyncStorage chave `auth_remember_me` ('true' | 'false').
// `getEffectiveTimeout()` lê o valor dinamicamente — o heartbeat e o handler de
// AppState consultam a cada checagem, então mudanças entram em vigor imediatamente.
const TIMEOUT_REMEMBER = 7 * 24 * 60 * 60 * 1000; // 7 dias
const TIMEOUT_DEFAULT = 2 * 60 * 60 * 1000; // 2 horas
const REMEMBER_ME_KEY = 'auth_remember_me';

async function getEffectiveTimeout() {
  try {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    const raw = await AsyncStorage.getItem(REMEMBER_ME_KEY);
    return raw === 'true' ? TIMEOUT_REMEMBER : TIMEOUT_DEFAULT;
  } catch {
    return TIMEOUT_DEFAULT;
  }
}

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
  // Sessão 28.56 — flag pra distinguir SIGNED_OUT intencional (user clicou em
  // sair) de espúrio (sessão expirou em background). Só aceitamos o intencional.
  const intentionalSignOutRef = useRef(false);

  const handleInactivityLogout = useCallback(async () => {
    if (user) {
      // Sessão 28.56 — sinaliza SIGNED_OUT como intencional
      intentionalSignOutRef.current = true;
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
      const handleAppStateChange = async (nextState) => {
        if (nextState === 'active') {
          const elapsed = Date.now() - lastActiveRef.current;
          const timeout = await getEffectiveTimeout();
          if (elapsed >= timeout && user) {
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
    const checkInactivity = async () => {
      if (!user) return;
      const elapsed = Date.now() - lastActiveRef.current;
      const timeout = await getEffectiveTimeout();
      if (elapsed >= timeout) {
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
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, s) => {
      addBreadcrumb({ category: 'auth', message: `auth event: ${_event}` });
      if (typeof console !== 'undefined' && console.log) {
        console.log('[AuthContext] event:', _event, 'hasSession:', !!s);
      }
      // Sessão 28.54 — TOKEN_REFRESHED sem session: ignora pra evitar logout espúrio
      if (_event === 'TOKEN_REFRESHED' && !s) {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[AuthContext] TOKEN_REFRESHED sem session — ignorando');
        }
        return;
      }
      // Sessão 28.57 — SIGNED_OUT espontâneo: 3 camadas de defesa antes de aceitar.
      // (1) tenta refreshSession → se recupera, mantém user.
      // (2) tenta getSession → se ainda há sessão no storage, mantém user.
      // (3) último recurso: limpa user. Só limpa se as 3 falharem.
      // Bypassa toda essa lógica se foi intencional (intentionalSignOutRef).
      if (_event === 'SIGNED_OUT' && !intentionalSignOutRef.current) {
        // Camada 1 — refreshSession
        try {
          const { data: { session: refreshed } } = await supabase.auth.refreshSession();
          if (refreshed) {
            if (typeof console !== 'undefined' && console.warn) {
              console.warn('[AuthContext] SIGNED_OUT espúrio recuperado via refreshSession');
            }
            setSession(refreshed);
            setUser(refreshed.user ?? null);
            reportSetUser(refreshed.user ?? null);
            setLoading(false);
            return;
          }
        } catch (e) {
          if (typeof console !== 'undefined' && console.warn) {
            console.warn('[AuthContext] refreshSession falhou:', e?.message);
          }
        }
        // Camada 2 — getSession (storage ainda tem token válido?)
        try {
          const { data: { session: current } } = await supabase.auth.getSession();
          if (current) {
            if (typeof console !== 'undefined' && console.warn) {
              console.warn('[AuthContext] SIGNED_OUT espúrio — getSession ainda válido');
            }
            setSession(current);
            setUser(current.user ?? null);
            reportSetUser(current.user ?? null);
            setLoading(false);
            return;
          }
        } catch (e) {
          if (typeof console !== 'undefined' && console.warn) {
            console.warn('[AuthContext] getSession falhou:', e?.message);
          }
        }
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[AuthContext] SIGNED_OUT confirmado após 3 camadas — deslogando');
        }
      }
      setSession(s);
      setUser(s?.user ?? null);
      reportSetUser(s?.user ?? null);
      // Sessão 28.9 — APP-01: detecta quando user voltou do email de reset de senha.
      if (_event === 'PASSWORD_RECOVERY') {
        setPasswordRecovery(true);
      }
      // Reset flag se foi um signOut intencional concluído
      if (_event === 'SIGNED_OUT') intentionalSignOutRef.current = false;
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

  // Login com Google via Supabase OAuth.
  //
  // CONFIGURAÇÃO NECESSÁRIA (faça uma vez no painel/console):
  //
  // 1) Supabase Dashboard → Authentication → Providers → Google
  //    - Habilite o provider
  //    - Cole o Client ID e Client Secret obtidos do Google Cloud Console
  //
  // 2) Google Cloud Console → APIs & Services → Credentials
  //    - Crie um OAuth 2.0 Client ID (tipo "Web application")
  //    - Authorized JavaScript origins:
  //        https://app.precificaiapp.com
  //        http://localhost:8081   (dev)
  //    - Authorized redirect URIs:
  //        https://<seu-projeto>.supabase.co/auth/v1/callback
  //
  // 3) Supabase Dashboard → Authentication → URL Configuration
  //    - Site URL: https://app.precificaiapp.com
  //    - Additional Redirect URLs: http://localhost:8081
  //
  // TODO (nativo iOS/Android): para builds nativos é preciso implementar via
  // expo-auth-session (deep link com esquema custom). Por enquanto a feature
  // está restrita ao web — a app é instalada via PWA.
  const signInWithGoogle = async () => {
    addBreadcrumb({ category: 'auth', message: 'signInWithGoogle attempt' });
    try {
      if (Platform.OS !== 'web') {
        // TODO: implementar via expo-auth-session quando for buildar app nativo
        throw new Error('Login com Google só disponível no navegador web por enquanto.');
      }
      const redirectTo = (typeof window !== 'undefined' && window.location)
        ? `${window.location.origin}` // volta pro site após auth
        : 'https://app.precificaiapp.com';
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });
      if (error) throw error;
      return data;
    } catch (err) {
      captureException(err, { screen: 'Login', action: 'signInWithGoogle' });
      throw err;
    }
  };

  const signOut = async () => {
    addBreadcrumb({ category: 'auth', message: 'signOut' });
    // Sessão 28.56 — sinaliza que o SIGNED_OUT que vai chegar é INTENCIONAL
    // (o listener vai aceitar; caso contrário tentaria recuperar a sessão).
    intentionalSignOutRef.current = true;
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

  // M-2: persiste a preferência "Lembrar de mim" do LoginScreen.
  // O valor é consultado por getEffectiveTimeout() a cada checagem de inatividade.
  const setRememberMe = useCallback(async (value) => {
    try {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      await AsyncStorage.setItem(REMEMBER_ME_KEY, value ? 'true' : 'false');
    } catch (e) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[AuthContext.setRememberMe] falhou:', e?.message);
      }
    }
  }, []);

  return (
    <AuthContext.Provider value={{
      user, session, loading,
      signIn, signUp, signOut, resetPassword,
      signInWithGoogle,
      passwordRecovery, clearPasswordRecovery,
      setRememberMe,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
