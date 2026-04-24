import { Alert, Platform } from 'react-native';

/**
 * Sprint 1 Q9 — Helper para Alert pós-sucesso confiável em todas as plataformas.
 *
 * Problema (já documentado em CLAUDE.md/techContext):
 *   Alert.alert no React Native Web não dispara `onPress` de forma confiável
 *   após mudanças de estado (ex.: setState/navigation.goBack). Em mobile funciona,
 *   no web silenciosamente ignora o callback — usuário fica preso na tela.
 *
 * Solução: usar `window.alert` síncrono no web (bloqueia até o usuário clicar OK),
 * Alert.alert nativo no iOS/Android com onPress correto.
 *
 * Uso:
 *   import { notifySuccess } from '../utils/notify';
 *   await saveData();
 *   notifySuccess('Salvo', 'Suas alterações foram salvas.', () => navigation.goBack());
 */
export function notifySuccess(title, message, onDismiss) {
  if (Platform.OS === 'web') {
    // window.alert é síncrono — bloqueia até o OK; após retornar, executa o callback.
    try { window.alert(`${title}\n\n${message}`); } catch {}
    if (typeof onDismiss === 'function') onDismiss();
    return;
  }
  Alert.alert(title, message, [
    { text: 'OK', onPress: typeof onDismiss === 'function' ? onDismiss : undefined },
  ]);
}

/**
 * Versão para erros — mesma garantia de execução do callback no web.
 */
export function notifyError(title, message, onDismiss) {
  if (Platform.OS === 'web') {
    try { window.alert(`${title}\n\n${message}`); } catch {}
    if (typeof onDismiss === 'function') onDismiss();
    return;
  }
  Alert.alert(title, message, [
    { text: 'OK', onPress: typeof onDismiss === 'function' ? onDismiss : undefined },
  ]);
}

/**
 * Confirmação binária (sim/não). No web usa window.confirm (também síncrono).
 * Use para fluxos destrutivos curtos. Para 3+ opções use Modal customizado.
 */
export function notifyConfirm(title, message, onConfirm, onCancel) {
  if (Platform.OS === 'web') {
    const ok = (() => { try { return window.confirm(`${title}\n\n${message}`); } catch { return false; } })();
    if (ok) {
      if (typeof onConfirm === 'function') onConfirm();
    } else if (typeof onCancel === 'function') {
      onCancel();
    }
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancelar', style: 'cancel', onPress: typeof onCancel === 'function' ? onCancel : undefined },
    { text: 'Confirmar', onPress: typeof onConfirm === 'function' ? onConfirm : undefined },
  ]);
}
