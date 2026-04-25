import React from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';

const ULTIMA_ATUALIZACAO = '24 de abril de 2026';

const SECOES = [
  {
    titulo: '1. Quem Somos',
    paragrafos: [
      'O PrecificaApp é um produto da Aplicais (razão social: [A definir antes de publicação], CNPJ: [A definir antes de publicação], com sede em [Endereço a definir]), que atua como controladora dos dados pessoais coletados por meio do Aplicativo, nos termos da Lei Geral de Proteção de Dados (LGPD — Lei 13.709/2018).',
      'Esta Política descreve, de forma clara e objetiva, quais dados coletamos, como utilizamos, com quem compartilhamos, por quanto tempo guardamos e quais são os seus direitos como titular dos dados.',
    ],
  },
  {
    titulo: '2. Quais Dados Coletamos',
    paragrafos: [
      'Coletamos apenas o que é necessário para o funcionamento do Aplicativo:',
      'Dados de cadastro: e-mail e senha. A senha é armazenada de forma criptografada (hash) pelo nosso provedor de autenticação e nunca temos acesso ao texto original.',
      'Dados do negócio: nome do estabelecimento, segmento, telefone e demais informações que você optar por preencher em "Perfil do Negócio".',
      'Dados operacionais: insumos, embalagens, fichas de preparo, produtos, preços, faturamento, despesas, fornecedores e demais informações inseridas para utilizar as funcionalidades de precificação. Esses dados ficam armazenados localmente no seu dispositivo (SQLite) e podem ser sincronizados com a nuvem para manter as informações disponíveis em diferentes aparelhos.',
      'Avatar (opcional): se você escolher uma foto de perfil, ela é guardada apenas localmente no seu dispositivo (AsyncStorage), não sendo enviada aos nossos servidores.',
      'Dados técnicos mínimos: informações automáticas de uso (versão do Aplicativo, plataforma e eventuais erros) coletadas para diagnóstico, sempre que possível de forma anonimizada.',
    ],
  },
  {
    titulo: '3. Para Que Usamos Seus Dados',
    paragrafos: [
      'Operação do Aplicativo: autenticar sua conta, executar cálculos de precificação, exibir relatórios e permitir o uso das funcionalidades.',
      'Sincronização entre dispositivos: manter seus dados disponíveis quando você acessar o Aplicativo a partir de outro celular, tablet ou da versão web.',
      'Suporte ao usuário: responder dúvidas, resolver problemas técnicos e processar solicitações que você nos enviar.',
      'Segurança: detectar e prevenir uso indevido, fraude ou acesso não autorizado às contas.',
      'Comunicações essenciais: enviar avisos relacionados à sua conta, atualizações de Termos e desta Política. Não enviamos comunicações de marketing de terceiros.',
    ],
  },
  {
    titulo: '4. Base Legal para o Tratamento',
    paragrafos: [
      'Tratamos seus dados com fundamento nas seguintes bases legais previstas no Art. 7º da LGPD:',
      'Execução de contrato (Art. 7º, V): para os dados estritamente necessários à prestação do serviço contratado por você ao criar a conta e usar o Aplicativo.',
      'Consentimento (Art. 7º, I): para tratamentos opcionais que dependam da sua autorização expressa, como informações adicionais que você optar por preencher.',
      'Cumprimento de obrigação legal ou regulatória (Art. 7º, II): quando precisarmos atender exigências legais.',
      'Legítimo interesse (Art. 7º, IX): para finalidades como segurança da informação, prevenção de fraude e melhoria do serviço, sempre respeitando seus direitos e liberdades fundamentais.',
    ],
  },
  {
    titulo: '5. Compartilhamento com Terceiros',
    paragrafos: [
      'Não vendemos, alugamos ou cedemos seus dados pessoais. Compartilhamos informações apenas com prestadores estritamente necessários para a operação do Aplicativo:',
      'Supabase: provedor de infraestrutura de autenticação, banco de dados e sincronização em nuvem.',
      'Sentry: serviço de monitoramento de erros, utilizado para identificar e corrigir falhas técnicas. As informações enviadas são minimizadas e voltadas ao diagnóstico.',
      'Esses parceiros são contratualmente obrigados a tratar seus dados com confidencialidade e somente para as finalidades descritas nesta Política.',
      'Não compartilhamos seus dados com plataformas de marketing, anunciantes ou agregadores de terceiros.',
      'Poderemos divulgar informações quando exigido por lei, ordem judicial ou determinação de autoridade competente.',
    ],
  },
  {
    titulo: '6. Armazenamento e Segurança',
    paragrafos: [
      'Seus dados são armazenados em servidores do Supabase, com criptografia em trânsito (HTTPS/TLS) e em repouso. As senhas são protegidas por algoritmo de hash (bcrypt), de modo que ninguém — nem mesmo nossa equipe — tem acesso ao texto original.',
      'Adotamos medidas técnicas e administrativas razoáveis para proteger as informações contra acesso não autorizado, perda, alteração ou destruição.',
      'O acesso administrativo aos dados é restrito a pessoas autorizadas e ocorre apenas quando estritamente necessário para suporte, manutenção ou segurança.',
      'Apesar dos cuidados, nenhum sistema é totalmente imune a incidentes. Recomendamos manter senhas fortes, exclusivas e não compartilhar suas credenciais.',
    ],
  },
  {
    titulo: '7. Seus Direitos como Titular (LGPD Art. 18)',
    paragrafos: [
      'Você pode, a qualquer momento, exercer os seguintes direitos garantidos pela LGPD:',
      'Confirmação da existência de tratamento dos seus dados;',
      'Acesso aos dados que tratamos sobre você;',
      'Correção de dados incompletos, inexatos ou desatualizados;',
      'Anonimização, bloqueio ou eliminação de dados desnecessários, excessivos ou tratados em desconformidade com a LGPD;',
      'Portabilidade dos seus dados a outro fornecedor de serviço, observados os segredos comercial e industrial;',
      'Eliminação dos dados pessoais tratados com base no seu consentimento;',
      'Informação sobre as entidades públicas e privadas com as quais compartilhamos seus dados;',
      'Informação sobre a possibilidade de não fornecer consentimento e sobre as consequências da negativa;',
      'Revogação do consentimento a qualquer momento, mediante manifestação expressa.',
    ],
  },
  {
    titulo: '8. Como Exercer Seus Direitos',
    paragrafos: [
      'Para exercer qualquer dos direitos acima, envie um e-mail para privacidade@precificaiapp.com indicando: (i) o seu nome e e-mail cadastrado no Aplicativo; (ii) qual direito você deseja exercer; (iii) descrição da solicitação.',
      'Responderemos em prazo razoável, observados os limites legais. Poderemos solicitar informações adicionais para confirmar a sua identidade antes de atender o pedido, como medida de segurança.',
    ],
  },
  {
    titulo: '9. Retenção e Exclusão',
    paragrafos: [
      'Mantemos seus dados pessoais enquanto sua conta estiver ativa ou pelo tempo necessário para cumprir as finalidades descritas nesta Política.',
      'Quando você solicita a exclusão da conta, removemos seus dados pessoais dos nossos sistemas em até 30 dias, ressalvadas obrigações legais de retenção (por exemplo, registros exigidos por legislação aplicável).',
      'Cópias de segurança (backups) podem reter dados por período adicional limitado, sendo automaticamente sobrescritas conforme o ciclo de retenção dos backups.',
    ],
  },
  {
    titulo: '10. Cookies e Rastreamento',
    paragrafos: [
      'Na versão web, utilizamos apenas armazenamento técnico essencial (localStorage e cookies de sessão) para manter você autenticado e preservar suas preferências de uso.',
      'Não utilizamos cookies de rastreamento publicitário, ferramentas de analytics de terceiros ou pixels de redes sociais.',
    ],
  },
  {
    titulo: '11. Alterações desta Política',
    paragrafos: [
      'Podemos atualizar esta Política periodicamente, para refletir mudanças no Aplicativo, em nossa operação ou na legislação aplicável.',
      'A data de "última atualização" no topo será revista a cada mudança. Em alterações relevantes, notificaremos você dentro do Aplicativo antes de a nova versão entrar em vigor.',
    ],
  },
  {
    titulo: '12. Encarregado pelo Tratamento de Dados (DPO)',
    paragrafos: [
      'Para questões específicas relacionadas à proteção dos seus dados pessoais, fale com o nosso Encarregado pelo Tratamento de Dados (DPO):',
      'E-mail: dpo@precificaiapp.com',
      'Para outras solicitações sobre exercício de direitos LGPD, utilize: privacidade@precificaiapp.com.',
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

export default function PrivacidadeScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <DevPlaceholderBanner />
      <View style={styles.header}>
        <View style={styles.iconCircle}>
          <Feather name="shield" size={22} color={colors.accent} />
        </View>
        <Text style={styles.title} accessibilityRole="header">Política de Privacidade</Text>
        <Text style={styles.subtitle}>Última atualização: {ULTIMA_ATUALIZACAO}</Text>
      </View>

      <Text style={styles.intro}>
        Sua privacidade é importante para nós. Esta Política explica, de forma clara, como o PrecificaApp — produto da Aplicais — coleta, utiliza, compartilha e protege seus dados pessoais, em conformidade com a LGPD.
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
    paddingBottom: 100,
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
