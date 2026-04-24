/**
 * Sprint 5 S15 — Mobile parity para exportação (backup + PDF).
 *
 * MOTIVAÇÃO (audit CF2, AN1):
 * Hoje o backup só funciona em web (Blob + URL.createObjectURL). No mobile,
 * ConfiguracoesScreen mostra "Exportação disponível apenas na versão web".
 * ExportPDF também depende de window.print — inviável no mobile.
 *
 * ESTRATÉGIA:
 * Criamos uma camada única `backupService` com duas funções:
 *   - exportarBackupJSON(backup)   → salva e abre share sheet
 *   - exportarPDF({ html, filename, title }) → gera PDF via Print API
 *
 * No WEB: usa Blob + anchor download (impl atual), igual antes.
 * No MOBILE: tenta importar `expo-file-system` + `expo-sharing` dinamicamente.
 *   Se presentes → escreve em cache e abre share sheet nativo.
 *   Se ausentes  → mensagem explicativa com link para instalação.
 *
 * IMPORTANTE: as deps `expo-print`, `expo-file-system`, `expo-sharing` ainda
 * NÃO estão no package.json. Para ativar mobile, rode:
 *
 *   npx expo install expo-print expo-file-system expo-sharing
 *
 * Enquanto não instaladas, as funções caem no fallback (aviso + link).
 * Isso evita quebrar o build atual e deixa o código pronto.
 */

import { Platform } from 'react-native';

// Carregamento lazy — se deps não instaladas, não quebra o bundle em web.
function tryRequire(modName) {
  try {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    return require(modName);
  } catch (_) {
    return null;
  }
}

function nowSuffix() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

/**
 * Exporta backup JSON.
 *
 * @param {object} backup — objeto serializável
 * @param {{ filename?: string, mimeType?: string }} [opts]
 * @returns {Promise<{ ok: true, path?: string, method: 'web-download'|'mobile-share'|'unsupported' }>}
 */
export async function exportarBackupJSON(backup, opts = {}) {
  const content = JSON.stringify(backup, null, 2);
  const filename = opts.filename || `precificai-backup-${nowSuffix()}.json`;
  const mimeType = opts.mimeType || 'application/json';

  if (Platform.OS === 'web') {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 100);
    }
    return { ok: true, method: 'web-download' };
  }

  // Mobile path — requer expo-file-system + expo-sharing
  const FS = tryRequire('expo-file-system');
  const Sharing = tryRequire('expo-sharing');
  if (!FS || !Sharing) {
    const err = new Error(
      'Exportação mobile indisponível: instale "expo-file-system" e "expo-sharing". ' +
      'Rode: npx expo install expo-file-system expo-sharing'
    );
    err.code = 'DEPS_NOT_INSTALLED';
    throw err;
  }

  const dir = FS.cacheDirectory || FS.documentDirectory;
  const path = `${dir}${filename}`;
  await FS.writeAsStringAsync(path, content, { encoding: FS.EncodingType?.UTF8 || 'utf8' });

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    return { ok: true, path, method: 'mobile-share' };
  }
  await Sharing.shareAsync(path, { mimeType, dialogTitle: 'Salvar backup' });
  return { ok: true, path, method: 'mobile-share' };
}

/**
 * Exporta um PDF a partir de HTML arbitrário.
 *
 * @param {{ html: string, filename?: string, title?: string }} args
 * @returns {Promise<{ ok: true, path?: string, method: 'web-print'|'mobile-share'|'unsupported' }>}
 */
export async function exportarPDF({ html, filename, title }) {
  if (!html || typeof html !== 'string') {
    throw new Error('html é obrigatório');
  }
  const fname = filename || `precificai-${nowSuffix()}.pdf`;

  if (Platform.OS === 'web') {
    // Abre janela e dispara window.print — comportamento existente.
    const win = window.open('', '_blank');
    if (!win) {
      const err = new Error('Popup bloqueado. Permita popups para imprimir.');
      err.code = 'POPUP_BLOCKED';
      throw err;
    }
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title || 'PrecificaApp'}</title></head><body>${html}</body></html>`);
    win.document.close();
    setTimeout(() => {
      try { win.print(); } catch (_) {}
    }, 500);
    return { ok: true, method: 'web-print' };
  }

  // Mobile — expo-print gera o PDF; expo-sharing abre o share sheet.
  const Print = tryRequire('expo-print');
  const Sharing = tryRequire('expo-sharing');
  if (!Print || !Sharing) {
    const err = new Error(
      'PDF mobile indisponível: instale "expo-print" e "expo-sharing". ' +
      'Rode: npx expo install expo-print expo-sharing'
    );
    err.code = 'DEPS_NOT_INSTALLED';
    throw err;
  }

  const { uri } = await Print.printToFileAsync({ html, base64: false });
  // Opcional: renomear antes de compartilhar (expo-file-system)
  let finalUri = uri;
  const FS = tryRequire('expo-file-system');
  if (FS && fname && !uri.endsWith(fname)) {
    const dir = FS.cacheDirectory || FS.documentDirectory;
    const target = `${dir}${fname}`;
    try {
      await FS.moveAsync({ from: uri, to: target });
      finalUri = target;
    } catch (_) {
      // se falhar, mantém uri original
    }
  }

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(finalUri, { mimeType: 'application/pdf', dialogTitle: title || 'Exportar PDF' });
  }
  return { ok: true, path: finalUri, method: 'mobile-share' };
}

/**
 * Utilitário: true se mobile já tem as libs necessárias.
 */
export function isMobileExportReady() {
  if (Platform.OS === 'web') return true;
  return !!tryRequire('expo-file-system') && !!tryRequire('expo-sharing');
}

export function isMobilePDFReady() {
  if (Platform.OS === 'web') return true;
  return !!tryRequire('expo-print') && !!tryRequire('expo-sharing');
}

export default {
  exportarBackupJSON,
  exportarPDF,
  isMobileExportReady,
  isMobilePDFReady,
};
