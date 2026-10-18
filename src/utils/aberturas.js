/**
 * Registro de aberturas do app (18/10/2026): mede instalações de verdade e o
 * retorno. Uma linha em `app_aberturas` por visita: ao entrar logado e quando
 * a aba volta para a tela depois de um tempo parada.
 * `instalado` = aberto pelo ícone (display-mode: standalone / iOS standalone).
 */
import { ehNavegadorInterno, ehIPhone } from './navegadorInterno';

export const INTERVALO_NOVA_VISITA_MS = 30 * 60 * 1000;
const CHAVE_ULTIMA = 'pcf_abertura_ultima';

/** Puro (testado em __tests__/aberturas.test.mjs). */
export function modoAbertura({ standalone, ua }) {
  const u = String(ua || '');
  const plataforma = ehIPhone(u) ? 'ios' : (/Android/i.test(u) ? 'android' : 'desktop');
  return { instalado: !!standalone, plataforma, navegador_interno: ehNavegadorInterno(u) };
}

/** Puro: é uma visita nova? (nunca registrou, ou parou mais de 30 min). */
export function ehNovaVisita(ultima, agora = Date.now()) {
  const n = Number(ultima);
  return !ultima || !Number.isFinite(n) || agora - n >= INTERVALO_NOVA_VISITA_MS;
}

function abertoComoApp() {
  try {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
      || window.navigator.standalone === true;
  } catch { return false; }
}

/**
 * Registra a visita (melhor esforço: falha não atrapalha o app).
 * @returns {Function} limpeza (remove o ouvinte de volta à tela)
 */
export function iniciarRegistroAberturas(supabase, userId, onInstalado) {
  if (typeof window === 'undefined' || !userId) return () => {};
  const registrar = async () => {
    let ultima = null;
    try { ultima = window.localStorage.getItem(`${CHAVE_ULTIMA}_${userId}`); } catch {}
    if (!ehNovaVisita(ultima)) return;
    try { window.localStorage.setItem(`${CHAVE_ULTIMA}_${userId}`, String(Date.now())); } catch {}
    const modo = modoAbertura({ standalone: abertoComoApp(), ua: window.navigator?.userAgent });
    try { await supabase.from('app_aberturas').insert(modo); } catch { /* medição */ }
    if (modo.instalado && typeof onInstalado === 'function') onInstalado(modo);
  };
  registrar();
  const aoVoltar = () => { if (document.visibilityState === 'visible') registrar(); };
  document.addEventListener('visibilitychange', aoVoltar);
  return () => document.removeEventListener('visibilitychange', aoVoltar);
}
