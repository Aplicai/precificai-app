import React from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import { useNavigation } from '@react-navigation/native';
import BackToSettings from '../components/BackToSettings';

const ULTIMA_ATUALIZACAO = '11 de maio de 2026';

// Sessão 28.51: Termos reforçados — linguagem mais robusta e protetiva,
// alinhada à LGPD (Lei 13.709/2018), CDC (Lei 8.078/1990) e Marco Civil
// da Internet (Lei 12.965/2014). Recomenda-se revisão jurídica final
// antes do uso comercial.
const SECOES = [
  {
    titulo: '1. Aceitação dos Termos',
    paragrafos: [
      'Estes Termos de Uso ("Termos") constituem um contrato eletrônico vinculante entre você ("Usuário") e a Aplicais ("Aplicais", "nós"), responsável pelo aplicativo PrecificaApp ("Aplicativo" ou "Serviço").',
      'Ao criar uma conta, acessar, instalar ou utilizar o Aplicativo, em qualquer plataforma (web, iOS, Android), você declara ter lido, compreendido e concordado integralmente com estes Termos e com a Política de Privacidade. Se você não concorda com qualquer disposição, não utilize o Serviço.',
      'O uso continuado após eventuais atualizações representa concordância tácita com a versão vigente. Você é responsável por revisar estes Termos periodicamente.',
      'Estes Termos prevalecem sobre quaisquer comunicações verbais, comerciais ou de marketing, salvo acordo escrito em contrário.',
    ],
  },
  {
    titulo: '2. Descrição do Serviço',
    paragrafos: [
      'O PrecificaApp é uma ferramenta SaaS (Software como Serviço) de auxílio à precificação de produtos e gestão de custos voltada para pequenos negócios do setor de gastronomia (lanchonetes, restaurantes, food trucks, confeitarias, marmitarias, pizzarias e estabelecimentos similares).',
      'O Serviço executa cálculos a partir de dados fornecidos exclusivamente pelo Usuário (custos de insumos, embalagens, mão de obra, despesas operacionais, margens desejadas, vendas e demais informações comerciais) e apresenta sugestões de preço, indicadores de desempenho, fichas técnicas e relatórios.',
      'TODOS os resultados gerados pelo Aplicativo têm caráter ESTRITAMENTE INFORMATIVO E AUXILIAR. Eles não constituem aconselhamento contábil, fiscal, tributário, financeiro, jurídico ou estratégico, e não substituem orientação profissional especializada.',
      'A Aplicais pode, a seu exclusivo critério e a qualquer tempo, adicionar, modificar, suspender ou descontinuar funcionalidades, integrações ou planos comerciais do Aplicativo, comunicando o Usuário por meios razoáveis (notificação dentro do app, e-mail ou aviso no site).',
    ],
  },
  {
    titulo: '3. Cadastro e Conta',
    paragrafos: [
      'Para utilizar o Aplicativo é necessário criar uma conta com endereço de e-mail válido, ativo e de sua titularidade, além de senha pessoal. O Usuário deve ter pelo menos 18 anos ou capacidade civil plena nos termos do Código Civil brasileiro.',
      'O Usuário é integralmente responsável por: (i) fornecer informações verdadeiras, exatas, atualizadas e completas no cadastro; (ii) manter sua senha em sigilo absoluto; (iii) não compartilhar credenciais com terceiros; (iv) todas as atividades realizadas em sua conta, autorizadas ou não.',
      'Em caso de suspeita de acesso não autorizado, comprometimento de credenciais ou qualquer atividade incomum, o Usuário deve comunicar-nos imediatamente pelos canais de contato indicados nestes Termos. A Aplicais não responde por danos decorrentes de não comunicação tempestiva.',
      'Reservamo-nos o direito de recusar cadastro, suspender ou encerrar contas que apresentem indícios de fraude, falsidade ideológica, violação destes Termos ou risco à integridade do Serviço.',
    ],
  },
  {
    titulo: '4. Planos, Preços e Pagamentos',
    paragrafos: [
      'O Aplicativo oferece plano gratuito com limitações de uso (por exemplo, número máximo de produtos cadastrados) e, futuramente, planos pagos com funcionalidades adicionais. A Aplicais reserva-se o direito de alterar limites, recursos e preços de qualquer plano, comunicando o Usuário com antecedência razoável (mínimo de 30 dias para planos pagos ativos).',
      'Quando aplicáveis, pagamentos são processados por operadoras de meios de pagamento terceirizadas. A Aplicais não armazena dados completos de cartão de crédito em seus servidores.',
      'Cancelamentos de planos pagos podem ser solicitados a qualquer momento e produzem efeito ao final do ciclo de cobrança vigente, sem reembolso proporcional, salvo disposição legal expressa em contrário (CDC Art. 49, no caso de contratação à distância nos primeiros 7 dias).',
    ],
  },
  {
    titulo: '5. Uso Permitido e Proibido',
    paragrafos: [
      'O Usuário compromete-se a utilizar o Aplicativo exclusivamente para fins lícitos, em conformidade com a legislação brasileira (incluindo CDC, LGPD, Marco Civil da Internet e Código Civil) e com estes Termos.',
      'É EXPRESSAMENTE PROIBIDO: (i) utilizar o Serviço para qualquer atividade ilegal, fraudulenta, lavagem de dinheiro, sonegação fiscal, ou que viole direitos de terceiros; (ii) tentar acessar áreas restritas, contas de outros usuários, sistemas internos, infraestrutura, código-fonte ou bancos de dados; (iii) realizar engenharia reversa, descompilação, desmontagem, modificação ou cópia de partes do Aplicativo, salvo na exata medida permitida por lei; (iv) coletar dados de outros usuários ou do Aplicativo por meios automatizados (scraping, bots, crawlers, screen-scraping); (v) revender, sublicenciar, alugar, ceder ou redistribuir o Aplicativo ou seu conteúdo; (vi) introduzir vírus, ransomware, malware, códigos maliciosos ou qualquer mecanismo que possa prejudicar o funcionamento do Aplicativo, sua infraestrutura ou seus usuários; (vii) sobrecarregar deliberadamente os servidores (ataques DoS/DDoS); (viii) personificar outras pessoas, empresas ou entidades; (ix) usar o Aplicativo para spam, phishing ou comunicações não solicitadas; (x) burlar limites de uso do plano gratuito por meio de múltiplas contas ou outras manobras.',
      'O descumprimento de qualquer destas regras resulta em suspensão imediata e/ou exclusão definitiva da conta, sem prejuízo de medidas judiciais cabíveis (incluindo ressarcimento de danos, perdas e lucros cessantes).',
    ],
  },
  {
    titulo: '6. Propriedade Intelectual',
    paragrafos: [
      'Todos os direitos de propriedade intelectual relativos ao Aplicativo — incluindo marcas registradas, nome empresarial, layout, design, código-fonte, textos, imagens, ícones, algoritmos, fluxos, conteúdo editorial, segmentos de mercado pré-cadastrados, preços de referência, fatores de correção e demais elementos — pertencem exclusivamente à Aplicais (razão social: [A definir antes da publicação], CNPJ: [A definir antes da publicação], com sede em [Endereço a definir]) ou a seus licenciantes, e são protegidos pela Lei 9.279/1996 (Propriedade Industrial), Lei 9.610/1998 (Direito Autoral), e tratados internacionais aplicáveis.',
      'Os dados que o Usuário cadastra no Aplicativo (insumos, produtos, preços, faturamento, despesas, fichas técnicas, vendas, fornecedores) são e permanecem de sua propriedade. A Aplicais recebe licença limitada, não exclusiva, mundial, gratuita e revogável de uso desses dados exclusivamente para: (i) prestar o Serviço ao Usuário; (ii) realizar manutenções, backups e atualizações; (iii) gerar estatísticas anonimizadas e agregadas (sem identificação individual) para melhoria do produto e do mercado em geral.',
      'A Aplicais NÃO comercializa, repassa nem disponibiliza dados identificáveis do Usuário a terceiros sem autorização expressa, exceto nas hipóteses previstas em lei ou em ordem judicial.',
    ],
  },
  {
    titulo: '7. Limitação de Responsabilidade',
    paragrafos: [
      'O Aplicativo gera cálculos e sugestões a partir EXCLUSIVAMENTE dos dados que o Usuário informa. As decisões finais de precificação, compra, venda, gestão financeira e estratégia comercial são EXCLUSIVAMENTE do Usuário.',
      'Na máxima extensão permitida pela legislação aplicável, a Aplicais NÃO se responsabiliza por: (i) decisões comerciais, financeiras, fiscais ou tributárias tomadas com base em informações geradas pelo Aplicativo; (ii) prejuízos, perdas de lucro, lucros cessantes, danos indiretos, incidentais, consequenciais ou punitivos decorrentes do uso ou da impossibilidade de uso do Serviço; (iii) erros nos cálculos causados por dados incorretos, desatualizados, incompletos ou inseridos com erro pelo Usuário; (iv) perdas decorrentes de falhas de conectividade, indisponibilidade temporária do Serviço ou de provedores terceirizados (hospedagem, autenticação, pagamentos); (v) atos de força maior, caso fortuito, ataques cibernéticos não imputáveis a culpa da Aplicais, falhas de redes elétricas/internet de terceiros, ou eventos fora de seu controle razoável.',
      'A responsabilidade total agregada da Aplicais perante o Usuário, em qualquer hipótese, fica limitada ao valor efetivamente pago pelo Usuário ao plano contratado nos 12 (doze) meses anteriores ao evento que originou a controvérsia. Para usuários do plano gratuito, a limitação corresponde a R$ 100,00 (cem reais).',
      'Recomendamos enfaticamente que o Usuário: (a) confira manualmente todos os resultados antes de utilizá-los comercialmente; (b) consulte profissionais especializados (contador, advogado, consultor financeiro) quando necessário; (c) mantenha cópias próprias e backups das informações importantes do seu negócio (o recurso "Exportar Dados" do app facilita isso).',
    ],
  },
  {
    titulo: '8. Disponibilidade e Manutenção do Serviço',
    paragrafos: [
      'A Aplicais envida seus melhores esforços para manter o Aplicativo disponível e funcionando corretamente, sob regime de melhor esforço (best-effort), SEM, contudo, garantia de disponibilidade contínua, ininterrupta, isenta de erros ou de qualquer SLA específico para o plano gratuito.',
      'Podemos realizar manutenções programadas, atualizações de segurança, deploys de novas versões ou ajustes operacionais que resultem em indisponibilidade temporária. Sempre que tecnicamente viável, comunicaremos com antecedência razoável.',
      'A Aplicais não garante compatibilidade com versões antigas de navegadores, sistemas operacionais ou dispositivos descontinuados pelos respectivos fabricantes.',
    ],
  },
  {
    titulo: '9. Privacidade e Proteção de Dados (LGPD)',
    paragrafos: [
      'O tratamento de dados pessoais do Usuário e dos dados comerciais por ele inseridos é regido pela Política de Privacidade do PrecificaApp, integrada a estes Termos por referência.',
      'A Aplicais atua como Controladora dos dados de cadastro do Usuário e como Operadora dos dados comerciais inseridos pelo Usuário (insumos, vendas, etc.), em conformidade com a Lei Geral de Proteção de Dados (Lei 13.709/2018).',
      'O Usuário pode exercer os direitos previstos no Art. 18 da LGPD (acesso, correção, anonimização, portabilidade, eliminação, informação sobre compartilhamento, revogação de consentimento) pelos canais de contato indicados nestes Termos, com prazo de resposta legal.',
    ],
  },
  {
    titulo: '10. Modificações dos Termos',
    paragrafos: [
      'A Aplicais pode atualizar estes Termos a qualquer momento para refletir mudanças no Aplicativo, em sua operação, em melhores práticas de mercado ou na legislação aplicável.',
      'Em alterações relevantes (que ampliem obrigações do Usuário ou reduzam direitos), notificaremos por meio do próprio Aplicativo ou por e-mail, com antecedência mínima de 15 (quinze) dias da entrada em vigor.',
      'Em mudanças não relevantes (correções, esclarecimentos, atualizações pontuais), a comunicação se dá pela atualização da data de "última atualização" no topo do documento.',
      'O uso continuado do Aplicativo após a vigência de uma nova versão representa aceite tácito dos novos Termos. Caso não concorde, o Usuário deve cessar o uso e poderá solicitar exclusão da conta.',
    ],
  },
  {
    titulo: '11. Encerramento da Conta',
    paragrafos: [
      'O Usuário pode encerrar sua conta a qualquer momento, diretamente pelo Aplicativo, na seção "Configurações > Conta e Segurança", ou solicitando a exclusão pelos canais de contato.',
      'Após o encerramento, os dados pessoais e comerciais são tratados conforme prazos previstos na Política de Privacidade, observando obrigações legais de retenção (Marco Civil da Internet — guarda de logs de acesso por 6 meses; legislação fiscal — guarda de registros contábeis por 5 anos quando aplicável).',
      'A Aplicais pode suspender ou encerrar contas, sem aviso prévio quando necessário, que: (i) violem estes Termos; (ii) apresentem risco à segurança do Serviço, infraestrutura ou outros usuários; (iii) sejam usadas para atividades ilícitas; (iv) permaneçam inativas por mais de 24 meses consecutivos, observado aviso prévio por e-mail.',
    ],
  },
  {
    titulo: '12. Garantias e Isenções',
    paragrafos: [
      'O Aplicativo é fornecido "NO ESTADO EM QUE SE ENCONTRA" e "CONFORME DISPONÍVEL", sem garantias de qualquer natureza, expressas ou implícitas, salvo aquelas que não podem ser excluídas por força do CDC ou de outra legislação consumerista aplicável.',
      'Em particular, a Aplicais NÃO garante que: (i) os resultados gerados serão livres de erros ou alinhados ao planejamento específico do Usuário; (ii) o Serviço atenderá necessidades particulares do Usuário; (iii) o Serviço será ininterrupto ou imune a falhas; (iv) precisão absoluta de preços de referência ou fatores de correção de mercado fornecidos pelo Aplicativo (são estimativas de auxílio).',
      'Nenhuma garantia adicional, expressa ou implícita, deve ser presumida a partir de comunicações de marketing, materiais informativos ou interações com a equipe da Aplicais, exceto quando formalizada por escrito.',
    ],
  },
  {
    titulo: '13. Indenização',
    paragrafos: [
      'O Usuário concorda em indenizar, defender e isentar a Aplicais, suas subsidiárias, sócios, diretores, empregados e agentes de quaisquer reclamações, demandas, ações judiciais, danos, perdas, custos e despesas (incluindo honorários advocatícios razoáveis) decorrentes de: (i) violação destes Termos pelo Usuário; (ii) uso indevido ou ilícito do Aplicativo; (iii) dados imprecisos, falsos ou ilegais inseridos pelo Usuário; (iv) violação de direitos de terceiros por meio do Aplicativo.',
    ],
  },
  {
    titulo: '14. Disposições Gerais',
    paragrafos: [
      'A eventual tolerância da Aplicais quanto a descumprimentos destes Termos não constitui novação, renúncia ou alteração das obrigações aqui previstas.',
      'Se qualquer disposição destes Termos for considerada inválida ou inexequível por autoridade competente, as demais disposições permanecem em pleno vigor.',
      'Estes Termos representam o entendimento integral entre as partes em relação ao uso do Aplicativo, prevalecendo sobre acordos ou entendimentos anteriores sobre o mesmo objeto.',
      'O Usuário não pode ceder seus direitos e obrigações destes Termos sem consentimento prévio e por escrito da Aplicais. A Aplicais pode ceder este contrato em caso de reorganização societária, fusão, aquisição ou venda de ativos, comunicando o Usuário.',
    ],
  },
  {
    titulo: '15. Lei Aplicável e Foro',
    paragrafos: [
      'Estes Termos são regidos e interpretados exclusivamente pelas leis da República Federativa do Brasil.',
      'Eventuais controvérsias decorrentes destes Termos serão dirimidas, preferencialmente, por meio de tratativa direta e amigável entre as partes. Não havendo composição, fica eleito o foro do domicílio do Usuário, na qualidade de consumidor, conforme previsto no Código de Defesa do Consumidor.',
    ],
  },
  {
    titulo: '16. Contato',
    paragrafos: [
      'Para dúvidas, sugestões, solicitações relacionadas a estes Termos, exercício de direitos da LGPD ou ao uso do Aplicativo, entre em contato pelo e-mail: contato@precificaiapp.com.',
      'O Encarregado de Proteção de Dados (DPO) pode ser acionado pelo mesmo endereço, com o assunto "LGPD".',
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
  const navigation = useNavigation();
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* APP-12: voltar pra Configurações */}
      <BackToSettings navigation={navigation} />
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
