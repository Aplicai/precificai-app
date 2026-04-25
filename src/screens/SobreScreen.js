import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Linking, Image } from 'react-native';
import { Feather } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';

const VERSION = Constants?.expoConfig?.version || '2.0.0';

async function openExternal(url, onError) {
  try {
    const supported = await Linking.canOpenURL(url);
    if (!supported) {
      onError?.('Não foi possível abrir este link no seu dispositivo.');
      return;
    }
    await Linking.openURL(url);
  } catch (e) {
    console.error('[SobreScreen.openExternal]', url, e);
    onError?.('Não foi possível abrir o link. Tente novamente.');
  }
}

// Sessão 26 — features divididas em Essenciais (sempre visíveis) e
// Avançadas (escondidas por feature flag até o usuário ativar).
// Removidos: Simulador (virou CTA contextual na Ficha Técnica) e
// Meta de Faturamento (tela órfã removida na Fase A1).
const FEATURES_ESSENCIAIS = [
  { icon: 'file-text', label: 'Cadastro completo', desc: 'Insumos, preparos, embalagens e produtos' },
  { icon: 'dollar-sign', label: 'Cálculo automático de CMV', desc: 'CMV e preço sugerido com markup e margem' },
  { icon: 'sliders', label: 'Configuração financeira completa', desc: 'Margem, custos do mês e por venda, faturamento' },
  { icon: 'shopping-cart', label: 'Lista de Compras automática', desc: 'Consolidação de ingredientes por produção' },
  { icon: 'printer', label: 'Exportar Fichas Técnicas em PDF', desc: 'Produtos e preparos para impressão' },
  { icon: 'book-open', label: 'Relatório', desc: 'Seus números em linguagem simples' },
  { icon: 'trending-up', label: 'Histórico de preços com gráfico', desc: 'Acompanhe a evolução dos custos' },
  { icon: 'alert-triangle', label: 'Alerta de erosão de margem', desc: 'Notificação quando margens caem' },
  { icon: 'activity', label: 'Semáforo de saúde por produto', desc: 'Visual rápido da saúde financeira' },
  { icon: 'zap', label: 'Simulador de Impacto', desc: 'Disponível direto na Ficha Técnica do produto' },
  { icon: 'copy', label: 'Duplicar receitas e produtos', desc: 'Clone e adapte rapidamente' },
  { icon: 'database', label: 'Backup e restauração de dados', desc: 'Segurança dos seus cadastros' },
  { icon: 'package', label: 'Kit de Início por segmento', desc: 'Modelos prontos para seu tipo de negócio' },
  { icon: 'cpu', label: 'Insights automáticos no Painel', desc: 'Dicas inteligentes baseadas nos seus dados' },
];

const FEATURES_AVANCADAS = [
  { icon: 'truck', label: 'Precificação para Delivery', desc: 'iFood, Rappi e outras plataformas (ative em Onboarding ou Configurações)' },
  { icon: 'layers', label: 'Gestão de combos', desc: 'Monte e precifique combos para delivery' },
  { icon: 'bar-chart-2', label: 'Engenharia do Cardápio', desc: 'Análise de portfólio (ative o modo análise avançada)' },
  { icon: 'users', label: 'Comparador de Fornecedores', desc: 'Encontre economia nos insumos (modo análise avançada)' },
  { icon: 'archive', label: 'Controle de Estoque', desc: 'Entradas, ajustes e saldo por insumo (ative o modo estoque avançado)' },
];

export default function SobreScreen() {
  const [linkError, setLinkError] = useState(null);
  const handleLink = (url) => openExternal(url, (msg) => {
    setLinkError(msg);
    setTimeout(() => setLinkError(null), 4000);
  });
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {linkError && (
        <View style={styles.errorBanner} accessibilityLiveRegion="polite">
          <Feather name="alert-circle" size={16} color="#dc2626" />
          <Text style={styles.errorBannerText}>{linkError}</Text>
        </View>
      )}
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

      {/* Features essenciais */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Funcionalidades essenciais</Text>
        {FEATURES_ESSENCIAIS.map((f, i) => (
          <View key={`ess-${i}`} style={styles.featureRow}>
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

      {/* Features avançadas / opcionais */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Funcionalidades avançadas (opcionais)</Text>
        <Text style={styles.cardText}>
          Estas funcionalidades ficam ocultas por padrão para deixar o app mais simples.
          Ative apenas as que fazem sentido para o seu negócio em Configurações ou no Onboarding.
        </Text>
        {FEATURES_AVANCADAS.map((f, i) => (
          <View key={`adv-${i}`} style={styles.featureRow}>
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
          onPress={() => handleLink('https://www.precificaiapp.com')}
          activeOpacity={0.6}
          accessibilityRole="link"
          accessibilityLabel="Abrir site www.precificaiapp.com"
        >
          <Feather name="globe" size={16} color={colors.primary} />
          <Text style={styles.linkText}>www.precificaiapp.com</Text>
          <Feather name="external-link" size={14} color={colors.disabled} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.linkRow}
          onPress={() => handleLink('mailto:contato@precificaiapp.com')}
          activeOpacity={0.6}
          accessibilityRole="link"
          accessibilityLabel="Enviar e-mail para contato@precificaiapp.com"
        >
          <Feather name="mail" size={16} color={colors.primary} />
          <Text style={styles.linkText}>contato@precificaiapp.com</Text>
          <Feather name="external-link" size={14} color={colors.disabled} />
        </TouchableOpacity>
      </View>

      {/* Legal links */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Termos e privacidade</Text>
        <TouchableOpacity
          style={styles.linkRow}
          onPress={() => handleLink('https://www.precificaiapp.com/termos')}
          activeOpacity={0.6}
          accessibilityRole="link"
          accessibilityLabel="Abrir Termos de Uso"
        >
          <Feather name="file-text" size={16} color={colors.primary} />
          <Text style={styles.linkText}>Termos de Uso</Text>
          <Feather name="external-link" size={14} color={colors.disabled} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.linkRow}
          onPress={() => handleLink('https://www.precificaiapp.com/privacidade')}
          activeOpacity={0.6}
          accessibilityRole="link"
          accessibilityLabel="Abrir Política de Privacidade"
        >
          <Feather name="shield" size={16} color={colors.primary} />
          <Text style={styles.linkText}>Política de Privacidade</Text>
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
  content: { padding: spacing.md, maxWidth: 720, alignSelf: 'center', width: '100%', paddingBottom: 100 },
  errorBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#fef2f2', padding: spacing.md,
    borderRadius: borderRadius.md, marginBottom: spacing.md,
    borderLeftWidth: 3, borderLeftColor: '#dc2626',
  },
  errorBannerText: {
    flex: 1, fontSize: fonts.small, color: '#991b1b',
    fontFamily: fontFamily.regular, lineHeight: 18,
  },

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
