import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Linking, TextInput, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';

const CATEGORY_ICONS = {
  'Primeiros Passos': 'play-circle',
  'Precificação': 'dollar-sign',
  'Gestão': 'briefcase',
  'Recursos': 'tool',
};

const FAQ_ITEMS = [
  // — Primeiros Passos —
  {
    category: 'Primeiros Passos',
    question: 'Como começar a usar o Precificaí?',
    answer: 'Siga 5 passos simples: 1) Configure o Financeiro (margem, faturamento, despesas), 2) Cadastre seus insumos com preços, 3) Crie preparos (receitas intermediárias), 4) Monte seus produtos finais, 5) Analise resultados no Painel.',
  },
  {
    question: 'Preciso cadastrar todos os ingredientes?',
    answer: 'Sim, quanto mais completo o cadastro, mais preciso será o cálculo do CMV. Comece pelos itens de maior impacto no custo e vá adicionando aos poucos. Use o Kit de Início para agilizar.',
  },
  {
    question: 'O que é o Kit de Início e como funciona?',
    answer: 'São modelos pré-configurados para diferentes tipos de negócio (confeitaria, hamburgueria, pizzaria, etc) com categorias e insumos mais comuns já cadastrados. Acesse em Configurações.',
  },
  // — Precificação —
  {
    category: 'Precificação',
    question: 'Como definir o preço de venda ideal?',
    answer: 'O Precificaí calcula automaticamente usando a fórmula: Preço = Custo / (1 - Margem% - Desp.Fixas% - Desp.Variáveis%). Configure sua margem desejada no Financeiro e o preço sugerido aparece em cada produto.',
  },
  {
    question: 'O que é CMV e qual a porcentagem ideal?',
    answer: 'CMV (Custo de Mercadoria Vendida) é quanto você gasta em ingredientes por produto. O ideal para alimentação é entre 28% e 35% do preço de venda. Acima de 35% indica que seus preços estão baixos ou seus custos altos.',
  },
  {
    question: 'Qual a diferença entre margem e markup?',
    answer: 'Margem é o percentual de lucro sobre o preço de venda (ex: vende a R$100 com custo de R$60 = margem de 40%). Markup é o multiplicador sobre o custo (ex: custo R$60 × markup 1.67 = R$100). O app calcula ambos automaticamente.',
  },
  {
    question: 'Como precificar para delivery sem ter prejuízo?',
    answer: 'No módulo Delivery, cadastre as taxas da plataforma (comissão, frete, cupons). O Simulador de Preço calcula quanto cobrar para manter sua margem. Lembre: o preço no delivery geralmente precisa ser 20-30% maior que no balcão.',
  },
  // — Gestão —
  {
    category: 'Gestão',
    question: 'O que são despesas fixas e variáveis?',
    answer: 'Fixas são custos que existem mesmo sem vender nada: aluguel, energia, funcionários, internet. Variáveis mudam conforme o volume de vendas: impostos (Simples), taxas de cartão/PIX, embalagens. Cadastre ambas no Financeiro para um cálculo preciso.',
  },
  {
    question: 'Como usar a Engenharia de Cardápio?',
    answer: 'Informe a quantidade vendida por mês de cada produto. O app classifica em 4 categorias: Estrela (manter e promover), Cavalo de Batalha (reduzir custos), Quebra-Cabeça (aumentar vendas), Abacaxi (reformular ou retirar). Atualize mensalmente.',
  },
  {
    question: 'Como interpretar o Ponto de Equilíbrio?',
    answer: 'É o faturamento mínimo mensal para cobrir todos os custos. Se seu ponto de equilíbrio é R$15.000/mês, faturar abaixo disso significa prejuízo. O Painel mostra se você está acima ou abaixo.',
  },
  // — Recursos —
  {
    category: 'Recursos',
    question: 'Como gerar a lista de compras?',
    answer: 'Em Lista de Compras, informe quantas unidades pretende produzir de cada produto. O app consolida todos os ingredientes necessários (incluindo dos preparos) com quantidades e custos estimados. Pode exportar em PDF.',
  },
  {
    question: 'Posso exportar fichas técnicas?',
    answer: 'Sim! Em Exportar PDF, selecione os produtos ou preparos desejados. O PDF inclui: ingredientes com quantidades, custos, composição do preço e informações adicionais. Ideal para padronização e treinamento.',
  },
  {
    question: 'Meus dados estão seguros?',
    answer: 'Seus dados são armazenados em servidores seguros (Supabase/AWS). Cada usuário só acessa seus próprios dados. Você pode exportar um backup completo em Configurações > Backup e Restauração.',
  },
];

const GUIDE_STEPS = [
  'Configure o Financeiro com sua margem, faturamento e despesas.',
  'Cadastre insumos (ingredientes) com preços de compra.',
  'Crie preparos (receitas intermediárias como massas e recheios).',
  'Monte produtos finais com insumos, preparos e embalagens.',
  'Analise margens no Painel e ajuste preços se necessário.',
  'Use a Engenharia de Cardápio para otimizar seu mix de produtos.',
  'Configure o Delivery para precificar corretamente nas plataformas.',
];

export default function SuporteScreen({ navigation }) {
  const [expandedFaq, setExpandedFaq] = useState(null);
  const [searchText, setSearchText] = useState('');

  const toggleFaq = (index) => {
    setExpandedFaq(expandedFaq === index ? null : index);
  };

  const filteredFaqItems = useMemo(() => {
    if (!searchText.trim()) return FAQ_ITEMS;
    const term = searchText.toLowerCase().trim();
    return FAQ_ITEMS.filter(
      item => item.question.toLowerCase().includes(term) || item.answer.toLowerCase().includes(term)
    );
  }, [searchText]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.header}>Central de Suporte</Text>

      {/* Search bar */}
      <View style={styles.searchBar}>
        <Feather name="search" size={16} color={colors.textSecondary} />
        <TextInput
          style={[styles.searchInput, Platform.OS === 'web' && { outlineStyle: 'none' }]}
          placeholder="Buscar nas perguntas frequentes..."
          placeholderTextColor={colors.disabled}
          value={searchText}
          onChangeText={setSearchText}
        />
        {searchText.length > 0 && (
          <TouchableOpacity onPress={() => setSearchText('')} activeOpacity={0.7}>
            <Feather name="x" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Section 1: FAQ */}
      <Text style={styles.sectionTitle}>Perguntas Frequentes</Text>
      <View style={styles.card}>
        {filteredFaqItems.length === 0 ? (
          <View style={{ paddingVertical: spacing.lg, alignItems: 'center' }}>
            <Feather name="search" size={32} color={colors.disabled} />
            <Text style={{ fontSize: fonts.small, fontFamily: fontFamily.regular, color: colors.textSecondary, marginTop: spacing.sm }}>
              Nenhuma pergunta encontrada para "{searchText}"
            </Text>
          </View>
        ) : (
          filteredFaqItems.map((item, index) => (
            <View key={index}>
              {item.category && (
                <View style={[styles.faqCategoryRow, index > 0 && { marginTop: spacing.md }]}>
                  <View style={styles.faqCategoryIcon}>
                    <Feather name={CATEGORY_ICONS[item.category] || 'help-circle'} size={14} color={colors.primary} />
                  </View>
                  <Text style={styles.faqCategory}>
                    {item.category}
                  </Text>
                </View>
              )}
              {index > 0 && !item.category && <View style={styles.faqDivider} />}
              <TouchableOpacity
                style={styles.faqItem}
                activeOpacity={0.7}
                onPress={() => toggleFaq(index)}
              >
                <View style={styles.faqHeader}>
                  <Text style={styles.faqQuestion}>{item.question}</Text>
                  <Feather
                    name={expandedFaq === index ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={colors.textSecondary}
                  />
                </View>
                {expandedFaq === index && (
                  <Text style={styles.faqAnswer}>{item.answer}</Text>
                )}
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>

      {/* Section 2: Guide */}
      <Text style={styles.sectionTitle}>Como utilizar</Text>
      <View style={styles.card}>
        <Text style={styles.guideIntro}>
          Siga estes passos para configurar o app e precificar seus produtos corretamente:
        </Text>
        {GUIDE_STEPS.map((step, index) => (
          <View key={index} style={styles.stepRow}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>{index + 1}</Text>
            </View>
            <Text style={styles.stepText}>{step}</Text>
          </View>
        ))}
      </View>

      {/* Section 3: Contact - highlighted card */}
      <View style={styles.contactCard}>
        <View style={styles.contactCardHeader}>
          <Feather name="help-circle" size={20} color={colors.primary} />
          <Text style={styles.contactCardTitle}>Não encontrou sua resposta?</Text>
        </View>
        <Text style={styles.contactCardDesc}>
          Entre em contato com nossa equipe. Estamos prontos para ajudar!
        </Text>

        <TouchableOpacity
          style={styles.contactRow}
          activeOpacity={0.7}
          onPress={() => Linking.openURL('mailto:suporte@precificaiapp.com')}
        >
          <View style={[styles.contactIcon, { backgroundColor: colors.primary + '12' }]}>
            <Feather name="mail" size={18} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.contactLabel}>E-mail</Text>
            <Text style={styles.contactValue}>suporte@precificaiapp.com</Text>
          </View>
          <Feather name="external-link" size={16} color={colors.textSecondary} />
        </TouchableOpacity>

        <View style={styles.faqDivider} />

        <TouchableOpacity
          style={styles.contactRow}
          activeOpacity={0.7}
          onPress={() => Linking.openURL('https://www.precificaiapp.com')}
        >
          <View style={[styles.contactIcon, { backgroundColor: colors.accent + '12' }]}>
            <Feather name="globe" size={18} color={colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.contactLabel}>Website</Text>
            <Text style={styles.contactValue}>www.precificaiapp.com</Text>
          </View>
          <Feather name="external-link" size={16} color={colors.textSecondary} />
        </TouchableOpacity>

        <View style={styles.faqDivider} />

        <View style={styles.responseTimeRow}>
          <Feather name="clock" size={16} color={colors.success || colors.primary} />
          <Text style={styles.responseTimeText}>Responderemos em até 24 horas úteis</Text>
        </View>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.md,
    paddingBottom: 40,
    maxWidth: 900,
    alignSelf: 'center',
    width: '100%',
  },
  header: {
    fontSize: 20,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: fonts.regular,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? 12 : 0,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: fonts.regular,
    fontFamily: fontFamily.regular,
    color: colors.text,
    paddingVertical: 10,
  },
  faqItem: {
    paddingVertical: spacing.sm,
  },
  faqHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  faqQuestion: {
    flex: 1,
    fontSize: fonts.small,
    fontFamily: fontFamily.medium,
    fontWeight: '500',
    color: colors.text,
    marginRight: spacing.sm,
  },
  faqAnswer: {
    fontSize: fonts.small,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
    lineHeight: 20,
    marginTop: spacing.sm,
  },
  faqCategoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: spacing.xs,
    paddingTop: spacing.xs,
  },
  faqCategoryIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary + '12',
    alignItems: 'center',
    justifyContent: 'center',
  },
  faqCategory: {
    fontSize: fonts.small,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  faqDivider: {
    height: 1,
    backgroundColor: colors.border,
  },
  guideIntro: {
    fontSize: fonts.small,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
    marginTop: 1,
  },
  stepNumberText: {
    fontSize: 12,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    color: '#fff',
  },
  stepText: {
    flex: 1,
    fontSize: fonts.small,
    fontFamily: fontFamily.regular,
    color: colors.text,
    lineHeight: 20,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  contactIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  contactLabel: {
    fontSize: fonts.tiny,
    fontFamily: fontFamily.medium,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  contactValue: {
    fontSize: fonts.small,
    fontFamily: fontFamily.medium,
    fontWeight: '500',
    color: colors.primary,
  },
  responseTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingTop: spacing.md,
  },
  responseTimeText: {
    fontSize: fonts.small,
    fontFamily: fontFamily.medium,
    color: colors.success || colors.primary,
    marginLeft: spacing.sm,
  },
  contactCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.md,
    borderWidth: 2,
    borderColor: colors.primary,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  contactCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: spacing.sm,
  },
  contactCardTitle: {
    fontSize: fonts.regular,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
    color: colors.primary,
  },
  contactCardDesc: {
    fontSize: fonts.small,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
});
