/**
 * Identificação da empresa responsável pelo Precificaí (Termos, Privacidade,
 * rodapés). Dados do cadastro na Receita Federal — mudou o CNPJ ou a sede,
 * troque aqui e nas páginas públicas (public/terms, public/privacy e o
 * rodapé da landing em precificai-site).
 */
export const EMPRESA = {
  razaoSocial: 'APLICAI CONSULTORIA E TREINAMENTO LTDA',
  nome: 'Aplicaí',
  cnpj: '53.054.196/0001-63',
  endereco: 'Rua Antônio Altaf, 390, Cascatinha, Juiz de Fora/MG, CEP 36033-330',
  email: 'contato@precificaiapp.com',
};

export const EMPRESA_IDENTIFICACAO =
  `${EMPRESA.razaoSocial}, CNPJ ${EMPRESA.cnpj}, com sede na ${EMPRESA.endereco}`;
