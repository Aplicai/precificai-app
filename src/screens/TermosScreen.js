import React from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';

const ULTIMA_ATUALIZACAO = '24 de abril de 2026';

const SECOES = [
  {
    titulo: '1. Aceitação dos Termos',
    paragrafos: [
      'Ao criar uma conta, acessar ou utilizar o aplicativo PrecificaApp ("Aplicativo"), você declara ter lido, compreendido e concordado integralmente com estes Termos de Uso.',
      'Se você não concordar com qualquer disposição destes Termos, não utilize o Aplicativo. O uso continuado após eventuais atualizações representa concordância com a versão vigente.',
    ],
  },
  {
    titulo: '2. Descrição do Serviço',
    paragrafos: [
      'O PrecificaApp é uma ferramenta de auxílio à precificação de produtos e gestão de custos voltada para pequenos negócios do setor de gastronomia, como lanchonetes, restaurantes, food trucks, confeitarias e estabelecimentos similares.',
      'O Aplicativo realiza cálculos com base em informações fornecidas pelo próprio usuário (custos de insumos, embalagens, mão de obra, despesas, margens desejadas etc.) e apresenta sugestões de preço, indicadores e relatórios.',
      'Os resultados têm caráter informativo e auxiliar. Não substituem orientação contábil, financeira ou jurídica especializada.',
    ],
  },
  {
    titulo: '3. Cadastro e Conta',
    paragrafos: [
      'Para utilizar o Aplicativo é necessário criar uma conta com e-mail válido e senha. Você é responsável por fornecer informações verdadeiras, atualizadas e completas no momento do cadastro.',
      'A senha é pessoal e intransferível. Você é o único responsável por manter a confidencialidade das suas credenciais e por todas as atividades realizadas em sua conta.',
      'Em caso de uso não autorizado da sua conta, comunique-nos imediatamente pelos canais de contato indicados nestes Termos.',
    ],
  },
  {
    titulo: '4. Uso Permitido e Proibido',
    paragrafos: [
      'Você se compromete a utilizar o Aplicativo apenas para fins lícitos, em conformidade com a legislação brasileira e com estes Termos.',
      'É expressamente proibido: (i) utilizar o Aplicativo para qualquer atividade ilegal, fraudulenta ou que viole direitos de terceiros; (ii) tentar acessar áreas restritas, contas de outros usuários ou sistemas internos; (iii) realizar engenharia reversa, descompilar, modificar ou copiar partes do Aplicativo; (iv) coletar dados de outros usuários ou do Aplicativo por meios automatizados (scraping, bots, crawlers); (v) revender, sublicenciar ou redistribuir o Aplicativo ou seu conteúdo; (vi) introduzir vírus, códigos maliciosos ou qualquer mecanismo que possa prejudicar o funcionamento do Aplicativo ou de seus usuários.',
      'O descumprimento destas regras pode resultar em suspensão ou exclusão da conta, sem prejuízo de outras medidas cabíveis.',
    ],
  },
  {
    titulo: '5. Propriedade Intelectual',
    paragrafos: [
      'Todos os direitos relativos ao Aplicativo — incluindo marca, layout, código-fonte, textos, imagens, ícones e demais elementos — pertencem à Aplicais (razão social: [A definir antes de publicação], CNPJ: [A definir antes de publicação], com sede em [Endereço a definir]) ou a seus licenciantes, sendo protegidos pela legislação de propriedade intelectual.',
      'Os dados que você cadastra no Aplicativo (insumos, produtos, preços, faturamento, despesas, fichas técnicas) permanecem de sua propriedade. A Aplicais utiliza essas informações exclusivamente para prestar o serviço a você, conforme descrito nestes Termos e na Política de Privacidade.',
    ],
  },
  {
    titulo: '6. Limitação de Responsabilidade',
    paragrafos: [
      'O Aplicativo fornece cálculos e sugestões a partir dos dados que você informa. As decisões finais de precificação, compra, venda e gestão do seu negócio são exclusivamente suas.',
      'A Aplicais não se responsabiliza por: (i) decisões comerciais ou financeiras tomadas com base em informações geradas pelo Aplicativo; (ii) prejuízos, lucros cessantes ou danos indiretos decorrentes do uso ou da impossibilidade de uso do Aplicativo; (iii) erros nos cálculos causados por dados incorretos ou incompletos informados pelo usuário; (iv) perdas decorrentes de falhas de conectividade, indisponibilidade temporária do serviço ou de provedores terceiros.',
      'Recomendamos que você confira os resultados, consulte profissionais especializados quando necessário e mantenha cópias próprias das informações importantes do seu negócio.',
    ],
  },
  {
    titulo: '7. Disponibilidade do Serviço',
    paragrafos: [
      'Empenhamo-nos para manter o Aplicativo disponível e funcionando corretamente, mas o serviço é fornecido em regime de melhor esforço (best-effort), sem garantia de disponibilidade contínua, ininterrupta ou livre de erros.',
      'Podemos realizar manutenções programadas, atualizações ou ajustes que resultem em indisponibilidade temporária. Sempre que possível, comunicaremos com antecedência.',
    ],
  },
  {
    titulo: '8. Modificações dos Termos',
    paragrafos: [
      'Podemos atualizar estes Termos a qualquer momento, para refletir mudanças no Aplicativo, em nossa operação ou na legislação aplicável.',
      'Quando isso acontecer, alteraremos a data de "última atualização" no topo deste documento. Em mudanças relevantes, notificaremos você dentro do próprio Aplicativo.',
      'O uso continuado do Aplicativo após uma atualização representa aceite dos novos Termos.',
    ],
  },
  {
    titulo: '9. Encerramento da Conta',
    paragrafos: [
      'Você pode encerrar sua conta a qualquer momento, diretamente pelo Aplicativo, em "Configurações > Conta e Segurança", ou solicitando a exclusão pelos canais de contato.',
      'Podemos suspender ou encerrar contas que violem estes Termos ou que apresentem risco à segurança do serviço ou de outros usuários, sem aviso prévio quando necessário.',
      'O tratamento dos seus dados após o encerramento da conta segue o disposto na nossa Política de Privacidade.',
    ],
  },
  {
    titulo: '10. Lei Aplicável e Foro',
    paragrafos: [
      'Estes Termos são regidos pelas leis da República Federativa do Brasil.',
      'Eventuais controvérsias decorrentes destes Termos serão dirimidas no foro do domicílio do usuário, conforme previsto no Código de Defesa do Consumidor.',
    ],
  },
  {
    titulo: '11. Contato',
    paragrafos: [
      'Para dúvidas, sugestões ou solicitações relacionadas a estes Termos ou ao uso do Aplicativo, entre em contato pelo e-mail: contato@precificaiapp.com.',
    ],
  },
];

function DevPlaceholderBanner() {
  if (!__DEV__) return null;
  return (
    <View
      style={styles.devBanner}
      accessibilityRole="alert"
      accessibilityLabel="Aviso de desenvolvimento: dados empresariais da Aplicais ainda não preenchidos"
    >
      <Text style={styles.devBannerText}>
        [ATENÇÃO DEV]: Razão social, CNPJ e endereço da Aplicais ainda não preenchidos. Atualize antes de publicar em App Store/Google Play.
      </Text>
    </View>
  );
}

export default function TermosScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <DevPlaceholderBanner />
      <View style={styles.header}>
        <View style={styles.iconCircle}>
          <Feather name="file-text" size={22} color={colors.primary} />
        </View>
        <Text style={styles.title} accessibilityRole="header">Termos de Uso</Text>
        <Text style={styles.subtitle}>Última atualização: {ULTIMA_ATUALIZACAO}</Text>
      </View>

      <Text style={styles.intro}>
        Estes Termos regulam o uso do aplicativo PrecificaApp, oferecido pela Aplicais.
        Leia com atenção antes de continuar — ao utilizar o Aplicativo, você concorda com tudo o que está descrito a seguir.
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
        PrecificaApp é um produto Aplicais. Domínio oficial: precificaiapp.com.
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
    backgroundColor: colors.primary + '12',
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
    color: colors.primary,
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
  devBanner: {
    backgroundColor: '#FFF3CD',
    borderWidth: 1,
    borderColor: '#FFC107',
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  devBannerText: {
    fontSize: fonts.small,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    color: '#856404',
    lineHeight: 18,
  },
});
