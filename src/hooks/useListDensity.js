import usePersistedState from './usePersistedState';

/**
 * useListDensity — preferência global de densidade das linhas das listas.
 *
 * Lê/escreve em AsyncStorage (`@pref:listDensity`). Valores: 'comfortable'|'compact'.
 *
 * Retorna estilos prontos para spread nos rowItem/gridCard:
 *   - rowOverride: { paddingVertical } | null
 *   - nameOverride: { fontSize } | null
 *   - avatarSize: number (px)
 *
 * Uso:
 *   const { isCompact, rowOverride, nameOverride, setDensity, density } = useListDensity();
 *   <View style={[styles.row, rowOverride]}>
 *     <Text style={[styles.rowNome, nameOverride]}>{item.nome}</Text>
 */
export default function useListDensity() {
  const [density, setDensity] = usePersistedState('listDensity', 'comfortable');
  const isCompact = density === 'compact';
  return {
    density,
    setDensity,
    isCompact,
    rowOverride: isCompact ? { paddingVertical: 8 } : null,
    nameOverride: isCompact ? { fontSize: 13 } : null,
    avatarSize: isCompact ? 32 : 40,
  };
}
