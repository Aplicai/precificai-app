import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * useUndoableDelete — esconde uma linha imediatamente, oferece undo,
 * e só executa o DELETE no banco depois de N segundos (audit P1-11).
 *
 * Não exige schema change (não precisa de coluna deleted_at).
 *
 * Retorno:
 *  - hiddenIds: Set<id>  → use para filtrar a lista no render
 *  - pending: { id, message, commit } | null  → passe ao UndoToast
 *  - requestDelete({ id, message, commit, durationMs? })
 *      • `id` aceita primitivo (single delete) ou array (bulk delete P1-21).
 *  - undo()  → cancela o pending atual e re-exibe a(s) linha(s)
 *  - flush() → executa pending imediatamente (use no unmount, p.ex.)
 *
 * Comportamento:
 *  - Se já existe um pending e outro `requestDelete` é chamado,
 *    o anterior é flush()-ado (commit imediato) antes do novo começar —
 *    evita acumular toasts.
 */
function toIdArray(id) {
  if (Array.isArray(id)) return id;
  return [id];
}
export default function useUndoableDelete() {
  const [hiddenIds, setHiddenIds] = useState(new Set());
  const [pending, setPending] = useState(null);
  const pendingRef = useRef(null);

  // mantém ref sincronizada para acesso em closures
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  const clearPending = useCallback((id) => {
    const ids = toIdArray(id);
    setHiddenIds((prev) => {
      const next = new Set(prev);
      let changed = false;
      ids.forEach((x) => {
        if (next.delete(x)) changed = true;
      });
      return changed ? next : prev;
    });
    setPending(null);
  }, []);

  const undo = useCallback(() => {
    const cur = pendingRef.current;
    if (!cur) return;
    clearPending(cur.id);
  }, [clearPending]);

  const commitNow = useCallback(async () => {
    const cur = pendingRef.current;
    if (!cur) return;
    try {
      await cur.commit();
    } catch (e) {
      // se o commit falhou, re-exibimos a linha — usuário pode tentar de novo
      console.warn('[useUndoableDelete] commit failed:', e);
    } finally {
      clearPending(cur.id);
      if (cur.onCommitted) cur.onCommitted();
    }
  }, [clearPending]);

  const flush = useCallback(async () => {
    if (!pendingRef.current) return;
    await commitNow();
  }, [commitNow]);

  const requestDelete = useCallback(async ({ id, message, commit, onCommitted }) => {
    if (id == null) return;
    const ids = toIdArray(id);
    if (ids.length === 0) return;
    // Se já existe um pending diferente, efetiva-o antes do novo
    if (pendingRef.current && pendingRef.current.id !== id) {
      await commitNow();
    }
    setHiddenIds((prev) => {
      const next = new Set(prev);
      ids.forEach((x) => next.add(x));
      return next;
    });
    setPending({ id, message, commit, onCommitted });
  }, [commitNow]);

  return {
    hiddenIds,
    pending,
    requestDelete,
    undo,
    flush,
    onTimeout: commitNow, // alias semântico para o UndoToast
  };
}
