import React from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';

const ULTIMA_ATUALIZACAO = '23 de abril de 2026';

const SECOES = [
  {
    titulo: '1. Aceitação dos Termos',
    paragrafos: [
      'Ao criar uma conta, acessar ou utilizar o aplicativo PrecificaApp ("Aplicativo"), você declara ter lido, compreendido e concordado integralmente com estes Termos de Uso.',
      'Caso não concorde com qualquer disposição, você não deve utilizar o Aplicativo.',
    ],
  },
  {
    titulo: '2. Descrição do Serviço',
    paragrafos: [
      'O PrecificaApp é uma ferramenta de auxílio à precificação de produtos e gestão de custos voltada para pequenos negócios de alimentação.',
      'O Aplicativo fornece cálculos, sugestões e relatórios com base nos dados informados pelo usuário. Os resultados têm caráter informativo e não substituem a análise de um profissional contábil ou financeiro.',
    ],
  },
  {
    titulo: '3. Cadastro e Conta',
    paragrafos: [
      'Para utilizar o Aplicativo é necessário criar uma conta com e-mail e senha válidos. Você é responsável por manter a confidencialidade das suas credenciais e por todas as atividades realizadas em sua conta.',
      'Você deve fornecer informações verdadeiras, atualizadas e completas no cadastro e ao longo do uso do Aplicativo.',
    ],
  },
  {
    titulo: '4. Uso Permitido',
    paragrafos: [
      'Você se compromete a utilizar o Aplicativo apenas para fins lícitos e em conformidade com a legislação vigente.',
      'É vedado: (i) usar o Aplicativo para qualquer atividade ilegal ou fraudulenta; (ii) tentar acessar áreas restritas, contas de outros usuários ou os sistemas internos do PrecificaApp; (iii) realizar engenharia reversa, descompilar ou copiar partes do Aplicativo; (iv) introduzir vírus ou códigos maliciosos.',
    ],
  },
  {
    titulo: '5. Privacidade e Dados Pessoais',
    paragrafos: [
      'O tratamento de dados pessoais é regido pela nossa Política de Privacidade, que faz parte integrante destes Termos.',
      'Coletamos apenas dados estritamente necessários para o funcionamento do Aplicativo (e-mail, nome, dados do negócio cadastrados pelo usuário) e seguimos a Lei Geral de Proteção de Dados (LGPD - Lei 13.709/2018).',
    ],
  },
  {
    titulo: '6. Propriedade Intelectual',
    paragrafos: [
      'Todos os direitos relativos ao Aplicativo, marca, layout, código-fonte, textos e demais elementos pertencem ao PrecificaApp ou a seus licenciantes.',
      'Os dados que você cadastra (insumos, produtos, preços, faturamento) permanecem de sua propriedade. O PrecificaApp os utiliza apenas para prestar o serviço contratado.',
    ],
  },
  {
    titulo: '7. Limitação de Responsabilidade',
    paragrafos: [
      'O Aplicativo é fornecido "como está", sem garantias de qualquer natureza. Embora nos esforcemos para manter os cálculos e dados corretos, não garantimos ausência de erros, indisponibilidades ou perda de dados.',
      'O PrecificaApp não se responsabiliza por decisões comerciais tomadas com base em informações geradas pelo Aplicativo, nem por lucros cessantes, danos indiretos ou consequenciais.',
      'Você é responsável por manter cópias de segurança (backups) dos seus dados sempre que considerar necessário.',
    ],
  },
  {
    titulo: '8. Modificações dos Termos',
    paragrafos: [
      'Podemos atualizar estes Termos a qualquer momento. Quando isso acontecer, alteraremos a data de "última atualização" no topo deste documento e, em casos de mudanças relevantes, notificaremos você no Aplicativo.',
      'O uso continuado do Aplicativo após uma atualização constitui aceite dos novos Termos.',
    ],
  },
  {
    titulo: '9. Encerramento',
    paragrafos: [
      'Você pode encerrar sua conta a qualquer momento. Podemos suspender ou encerrar contas que violem estes Termos, sem aviso prévio quando necessário para proteger o serviço ou outros usuários.',
    ],
  },
  {
    titulo: '10. Foro e Lei Aplicável',
    paragrafos: [
      'Estes Termos são regidos pelas leis da República Federativa do Brasil. Fica eleito o foro do domicílio do usuário para dirimir eventuais controvérsias.',
    ],
  },
  {
    titulo: '11. Contato',
    paragrafos: [
      'Em caso de dúvidas, sugestões ou solicitações, entre em contato pelo e-mail: contato@precificaiapp.com.',
    ],
  },
];

export default function TermosScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.iconCircle}>
          <Feather name="file-text" size={22} color={colors.primary} />
        </View>
        <Text style={styles.title} accessibilityRole="header">Termos de Uso</Text>
        <Text style={styles.subtitle}>Última atualização: {ULTIMA_ATUALIZACAO}</Text>
      </View>

      <Text style={styles.intro}>
        Estes Termos regulam o uso do aplicativo PrecificaApp. Leia com atenção antes de continuar.
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
        Documento meramente exemplificativo (placeholder). A versão definitiva deve ser revisada por um profissional do direito.
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
});
