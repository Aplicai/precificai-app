import React from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';

const ULTIMA_ATUALIZACAO = '23 de abril de 2026';

const SECOES = [
  {
    titulo: '1. Quem somos',
    paragrafos: [
      'O PrecificaApp é responsável pelo tratamento dos dados pessoais coletados por meio do aplicativo, atuando como controlador de dados nos termos da Lei Geral de Proteção de Dados (LGPD - Lei 13.709/2018).',
      'Esta política descreve quais dados coletamos, como utilizamos, com quem compartilhamos e quais são os seus direitos.',
    ],
  },
  {
    titulo: '2. Dados que coletamos',
    paragrafos: [
      'Dados de cadastro: e-mail e nome informados na criação da conta.',
      'Dados do negócio: nome do estabelecimento, segmento, telefone e demais informações que você cadastrar voluntariamente em "Perfil do Negócio".',
      'Dados operacionais: insumos, embalagens, preparos, produtos, preços, faturamento, despesas e demais informações que você inserir para utilizar as funcionalidades de precificação.',
      'Dados técnicos: informações automáticas necessárias ao funcionamento do app (versão, plataforma, eventuais erros) — coletados de forma anonimizada quando possível.',
    ],
  },
  {
    titulo: '3. Como utilizamos seus dados',
    paragrafos: [
      'Autenticação: para identificá-lo e proteger sua conta.',
      'Sincronização: para manter seus dados disponíveis em diferentes dispositivos via nuvem.',
      'Funcionamento: para realizar cálculos de precificação, gerar relatórios e exibir suas informações no app.',
      'Suporte: para responder dúvidas e resolver problemas que você nos relatar.',
      'Melhoria do produto: análise agregada e anonimizada de uso, para evoluir funcionalidades.',
    ],
  },
  {
    titulo: '4. Armazenamento e segurança',
    paragrafos: [
      'Os dados são armazenados em provedor de nuvem (Supabase) com criptografia em trânsito (HTTPS/TLS) e em repouso.',
      'O acesso aos dados é restrito e exige autenticação. Adotamos medidas técnicas e administrativas razoáveis para proteger as informações contra acesso não autorizado, perda ou alteração.',
      'Apesar dos cuidados, nenhum sistema é 100% seguro. Recomendamos manter senhas fortes e exclusivas, e não compartilhar suas credenciais.',
    ],
  },
  {
    titulo: '5. Compartilhamento com terceiros',
    paragrafos: [
      'Não vendemos seus dados. Compartilhamos informações apenas com prestadores estritamente necessários para a operação do app (ex.: provedor de hospedagem e banco de dados).',
      'Esses parceiros são contratualmente obrigados a tratar seus dados com a mesma confidencialidade e somente para as finalidades descritas nesta política.',
      'Podemos divulgar dados quando exigido por lei, ordem judicial ou autoridade competente.',
    ],
  },
  {
    titulo: '6. Seus direitos (LGPD)',
    paragrafos: [
      'Você pode, a qualquer momento: (i) confirmar se tratamos seus dados; (ii) acessar seus dados; (iii) corrigir dados incompletos, inexatos ou desatualizados; (iv) solicitar a anonimização, bloqueio ou eliminação de dados desnecessários; (v) solicitar a portabilidade; (vi) solicitar a exclusão dos dados tratados com base no seu consentimento; (vii) revogar o consentimento.',
      'Para exercer seus direitos, entre em contato pelo e-mail informado abaixo. Responderemos em prazo razoável, observados os limites legais.',
    ],
  },
  {
    titulo: '7. Retenção e exclusão',
    paragrafos: [
      'Mantemos seus dados enquanto sua conta estiver ativa ou pelo tempo necessário para cumprir as finalidades descritas nesta política.',
      'Ao solicitar a exclusão da conta, removeremos seus dados pessoais em prazo razoável, ressalvadas obrigações legais de retenção.',
    ],
  },
  {
    titulo: '8. Cookies e tecnologias similares',
    paragrafos: [
      'Na versão web, podemos utilizar armazenamento local (localStorage) e cookies essenciais para manter sua sessão e preferências de uso. Não utilizamos cookies de rastreamento publicitário.',
    ],
  },
  {
    titulo: '9. Crianças e adolescentes',
    paragrafos: [
      'O aplicativo não se destina a menores de 18 anos. Não coletamos intencionalmente dados de menores. Se tomarmos conhecimento de coleta indevida, providenciaremos a exclusão.',
    ],
  },
  {
    titulo: '10. Alterações nesta política',
    paragrafos: [
      'Podemos atualizar esta política periodicamente. A data de "última atualização" no topo será revista a cada mudança. Em alterações relevantes, notificaremos no app.',
    ],
  },
  {
    titulo: '11. Contato',
    paragrafos: [
      'Encarregado pelo Tratamento de Dados (DPO) / Suporte: privacidade@precificaiapp.com.',
    ],
  },
];

export default function PrivacidadeScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.iconCircle}>
          <Feather name="shield" size={22} color={colors.accent} />
        </View>
        <Text style={styles.title} accessibilityRole="header">Política de Privacidade</Text>
        <Text style={styles.subtitle}>Última atualização: {ULTIMA_ATUALIZACAO}</Text>
      </View>

      <Text style={styles.intro}>
        Sua privacidade é importante. Esta política explica como o PrecificaApp coleta, usa e protege seus dados pessoais, em conformidade com a LGPD.
      </Text>

      {SECOES.map((sec, idx) => (
        <View key={idx} style={styles.section}>
          <Text style={styles.sectionTitle} accessibilityRole="header">{sec.titulo}</Text>
          {sec.paragrafos.map((p, i) => (
            <Text key={i} style={styles.paragraph}>{p}</Text>
          ))}
        </View>
      ))}

      <Text style={styles.footer}>
        Documento meramente exemplificativo (placeholder). A versão definitiva deve ser revisada por um profissional do direito e por encarregado de proteção de dados.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: {
    padding: spacing.md,
    paddingBottom: 40,
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
  },
  header: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
  },
  iconCircle: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.accent + '12',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: fonts.title,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: fonts.tiny,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
    marginTop: 4,
  },
  intro: {
    fontSize: fonts.small,
    fontFamily: fontFamily.regular,
    color: colors.text,
    lineHeight: 20,
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
  },
  section: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: fonts.regular,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    color: colors.accent,
    marginBottom: spacing.xs + 2,
  },
  paragraph: {
    fontSize: fonts.small,
    fontFamily: fontFamily.regular,
    color: colors.text,
    lineHeight: 21,
    marginBottom: spacing.xs + 2,
  },
  footer: {
    fontSize: fonts.tiny,
    fontFamily: fontFamily.regular,
    fontStyle: 'italic',
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
  },
});
