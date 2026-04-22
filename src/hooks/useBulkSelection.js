import { useState, useCallback, useMemo } from 'react';

/**
 * useBulkSelection — gerencia modo de seleção múltipla em listas (audit P1-21).
 *
 * Uso:
 *   const bulk = useBulkSelection();
 *   bulk.enter(id)          → entra em modo seleção e seleciona um id
 *   bulk.toggle(id)         → adiciona/remove id da seleção
 *   bulk.clear()            → sai do modo seleção
 *   bulk.isSelected(id)     → true/false
 *   bulk.selectedIds        → Set<id>
 *   bulk.count              → tamanho da seleção
 *   bulk.active             → true se há seleção ou modo está ativo
 *   bulk.selectAll(ids[])   → seleciona uma lista de ids (ex.: visíveis)
 *
 * Padrões de UX:
 *  - Long-press numa row → enter(id)
 *  - Tap em row enquanto active → toggle(id)
 *  - Tap em row fora do modo → navega normalmente
 */
export default function useBulkSelection() {
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [active, setActive] = useState(false);

  const enter = useCallback((id) => {
    setActive(true);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const toggle = useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setActive(true);
  }, []);

  const clear = useCallback(() => {
    setSelectedIds(new Set());
    setActive(false);
  }, []);

  const selectAll = useCallback((ids) => {
    const next = new Set(ids || []);
    setSelectedIds(next);
    setActive(next.size > 0);
  }, []);

  const isSelected = useCallback((id) => selectedIds.has(id), [selectedIds]);

  const count = selectedIds.size;

  // Auto-deactivate when last item is unselected
  // (caller decides whether to call clear() explicitly)

  return useMemo(
    () => ({
      selectedIds,
      active: active || count > 0,
      count,
      enter,
      toggle,
      clear,
      selectAll,
      isSelected,
    }),
    [selectedIds, active, count, enter, toggle, clear, selectAll, isSelected]
  );
}
