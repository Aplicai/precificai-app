import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fonts, borderRadius } from '../utils/theme';
import { getFinanceiroStatus, textoPendenciaFinanceiro, assinarStatusFinanceiro } from '../utils/financeiroStatus';
import { getDatabase } from '../database/database';
import { countOrThrow } from '../database/dbResult';

// Primeiro preço antes do Financeiro (15/10/2026): enquanto nenhum produto tem
// preço de venda, o aviso fica escondido para não puxar a pessoa para o
// Financeiro antes de ela ver o primeiro resultado. Erro de leitura = mostra.
async function temProdutoComPreco() {
  try {
    const db = await getDatabase();
    return (await countOrThrow(db, 'SELECT COUNT(*) as n FROM produtos WHERE preco_venda > 0')) > 0;
  } catch {
    return true;
  }
}

/**
 * Aparece quando falta qualquer etapa do Financeiro (`completo` do
 * financeiroStatus): margem, faturamento, custos do mês ou custos por venda —
 * todas obrigatórias desde 14/10/2026. Tom informativo (cor da marca), não de erro.
 */
export default function FinanceiroPendenteBanner() {
  const navigation = useNavigation();
  const [pendente, setPendente] = useState(false);
  const [faltando, setFaltando] = useState('');

  const aplicar = useCallback(async (s) => {
    const completo = !!s.completo;
    setFaltando(textoPendenciaFinanceiro(s));
    if (completo) { setPendente(false); return; }
    setPendente(await temProdutoComPreco());
  }, []);

  // Atualiza a cada leitura de status em qualquer tela (salvar no Financeiro,
  // concluir o wizard, Home) — antes só lia na montagem e ficava "Falta: …"
  // mesmo depois de tudo preenchido.
  useEffect(() => assinarStatusFinanceiro(aplicar), [aplicar]);

  useFocusEffect(useCallback(() => {
    getFinanceiroStatus().then(aplicar).catch(() => {});
  }, [aplicar]));

  if (!pendente) return null;

  function goToFinanceiro() {
    try {
      // Cross-tab navigation: go up to tab navigator, then into Ferramentas > FinanceiroMain
      const parent = navigation.getParent();
      const tabNav = parent?.getParent?.() || parent;
      if (tabNav) {
        tabNav.navigate('Mais', { screen: 'FinanceiroMain' });
      } else {
        navigation.navigate('FinanceiroMain');
      }
    } catch {
      navigation.navigate('FinanceiroMain');
    }
  }

  return (
    <TouchableOpacity style={styles.banner} activeOpacity={0.8} onPress={goToFinanceiro}>
      <Feather name="info" size={18} color={colors.primary} style={styles.icon} />
      <View style={styles.body}>
        <Text style={styles.title}>Deixe seu preço mais certo</Text>
        <Text style={styles.desc}>{faltando ? `${faltando} ` : ''}Complete o Financeiro para o preço sugerido incluir seus custos do mês.</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.primary + '0F',
    borderWidth: 1, borderColor: colors.primary + '40',
    borderRadius: borderRadius.sm,
    padding: spacing.sm, marginHorizontal: spacing.md, marginTop: spacing.sm,
  },
  icon: { fontSize: 18, marginRight: spacing.sm },
  body: { flex: 1 },
  title: { fontSize: fonts.small, fontWeight: '700', color: colors.primary, marginBottom: 1 },
  desc: { fontSize: fonts.tiny, color: colors.textSecondary, lineHeight: 16 },
});
