import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Linking, Image } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';

const VERSION = '2.0.0';

const FEATURES = [
  { icon: 'file-text', label: 'Cadastro completo', desc: 'Insumos, preparos, embalagens e produtos' },
  { icon: 'dollar-sign', label: 'Cálculo automático de CMV', desc: 'CMV e preço sugerido com markup e margem' },
  { icon: 'sliders', label: 'Configuração financeira completa', desc: 'Margem, despesas fixas e variáveis, faturamento' },
  { icon: 'bar-chart-2', label: 'Engenharia de Cardápio', desc: 'Análise de portfólio com vendas mensais' },
  { icon: 'zap', label: 'Simulador de Impacto', desc: 'Variação de preços e cenários' },
  { icon: 'target', label: 'Meta de Faturamento', desc: 'Ponto de equilíbrio e metas diárias' },
  { icon: 'truck', label: 'Precificação para Delivery', desc: 'iFood, Rappi e outras plataformas' },
  { icon: 'users', label: 'Comparador de Fornecedores', desc: 'Encontre economia nos insumos' },
  { icon: 'shopping-cart', label: 'Lista de Compras automática', desc: 'Consolidação de ingredientes por produção' },
  { icon: 'printer', label: 'Exportar Fichas Técnicas em PDF', desc: 'Produtos e preparos para impressão' },
  { icon: 'book-open', label: 'Relatório Simplificado', desc: 'Explica aí - seus números em linguagem simples' },
  { icon: 'trending-up', label: 'Histórico de preços com gráfico', desc: 'Acompanhe a evolução dos custos' },
  { icon: 'alert-triangle', label: 'Alerta de erosão de margem', desc: 'Notificação quando margens caem' },
  { icon: 'activity', label: 'Semáforo de saúde por produto', desc: 'Visual rápido da saúde financeira' },
  { icon: 'copy', label: 'Duplicar receitas e produtos', desc: 'Clone e adapte rapidamente' },
  { icon: 'database', label: 'Backup e restauração de dados', desc: 'Segurança dos seus cadastros' },
  { icon: 'package', label: 'Kit de Início por segmento', desc: 'Modelos prontos para seu tipo de negócio' },
  { icon: 'cpu', label: 'Insights automáticos no Painel', desc: 'Dicas inteligentes baseadas nos seus dados' },
  { icon: 'layers', label: 'Gestão de combos', desc: 'Monte e precifique combos facilmente' },
];

export default function SobreScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Logo e nome */}
      <View style={styles.logoSection}>
        <Image
          source={require('../../assets/images/logo-header-white.png')}
          style={{ width: 180, height: 40 }}
          resizeMode="contain"
        />
        <Text style={styles.tagline}>Precificação inteligente para seu negócio</Text>
        <View style={styles.versionBadge}>
          <Text style={styles.versionText}>v{VERSION}</Text>
        </View>
      </View>

      {/* Sobre */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Sobre o Precificaí</Text>
        <Text style={styles.cardText}>
          O Precificaí é a ferramenta mais completa e acessível para precificação de alimentos no Brasil.
          Desenvolvido para micro e pequenos empreendedores do food service, o app transforma a complexidade
          da gestão de custos em decisões simples e visuais.
        </Text>
        <Text style={styles.cardText}>
          Nosso objetivo é democratizar a precificação: qualquer pessoa, mesmo sem conhecimento contábil,
          consegue precificar seus produtos corretamente em minutos.
        </Text>
      </View>

      {/* Features */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Funcionalidades</Text>
        {FEATURES.map((f, i) => (
          <View key={i} style={styles.featureRow}>
            <View style={styles.featureIcon}>
              <Feather name={f.icon} size={16} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.featureLabel}>{f.label}</Text>
              <Text style={styles.featureDesc}>{f.desc}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Contato */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Contato e Suporte</Text>
        <TouchableOpacity
          style={styles.linkRow}
          onPress={() => Linking.openURL('https://www.precificaiapp.com')}
        >
          <Feather name="globe" size={16} color={colors.primary} />
          <Text style={styles.linkText}>www.precificaiapp.com</Text>
          <Feather name="external-link" size={14} color={colors.disabled} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.linkRow}
          onPress={() => Linking.openURL('mailto:contato@precificaiapp.com')}
        >
          <Feather name="mail" size={16} color={colors.primary} />
          <Text style={styles.linkText}>contato@precificaiapp.com</Text>
          <Feather name="external-link" size={14} color={colors.disabled} />
        </TouchableOpacity>
      </View>

      {/* Legal */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Informações Legais</Text>
        <Text style={styles.legalText}>
          © {new Date().getFullYear()} Precificaí. Todos os direitos reservados.
        </Text>
        <Text style={styles.legalText}>
          Os cálculos e sugestões de preço são estimativas baseadas nos dados informados pelo usuário.
          Recomendamos consultar um contador para decisões financeiras importantes.
        </Text>
      </View>

      <Text style={styles.footer}>
        Feito com dedicação para o food service brasileiro
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, maxWidth: 720, alignSelf: 'center', width: '100%', paddingBottom: 40 },

  logoSection: {
    alignItems: 'center', backgroundColor: colors.primary,
    borderRadius: borderRadius.lg, padding: spacing.xl,
    marginBottom: spacing.lg,
  },
  tagline: {
    fontSize: fonts.small, color: 'rgba(255,255,255,0.8)',
    fontFamily: fontFamily.medium, marginTop: spacing.sm, textAlign: 'center',
  },
  versionBadge: {
    backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 4, marginTop: spacing.sm,
  },
  versionText: { fontSize: 12, color: '#fff', fontFamily: fontFamily.semiBold },

  card: {
    backgroundColor: colors.surface, borderRadius: borderRadius.lg,
    padding: spacing.md, marginBottom: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
  cardTitle: {
    fontSize: fonts.regular, fontFamily: fontFamily.bold, color: colors.text,
    marginBottom: spacing.sm,
  },
  cardText: {
    fontSize: fonts.small, fontFamily: fontFamily.regular, color: colors.textSecondary,
    lineHeight: 22, marginBottom: spacing.sm,
  },

  featureRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: colors.border + '40',
  },
  featureIcon: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.primary + '10', alignItems: 'center', justifyContent: 'center',
    marginRight: 12,
  },
  featureLabel: { fontSize: fonts.small, fontFamily: fontFamily.semiBold, color: colors.text },
  featureDesc: { fontSize: 12, fontFamily: fontFamily.regular, color: colors.textSecondary },

  linkRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border + '40',
  },
  linkText: { flex: 1, fontSize: fonts.small, fontFamily: fontFamily.medium, color: colors.primary },

  legalText: {
    fontSize: 12, fontFamily: fontFamily.regular, color: colors.textSecondary,
    lineHeight: 18, marginBottom: spacing.xs,
  },

  footer: {
    textAlign: 'center', fontSize: 12, color: colors.disabled,
    fontFamily: fontFamily.regular, marginTop: spacing.md,
  },
});
