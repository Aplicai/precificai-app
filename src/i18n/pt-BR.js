/**
 * pt-BR — Microcopy centralizada (audit P1-06).
 *
 * Princípios:
 *  - Tom amigável, próximo, mas profissional.
 *  - Verbos de ação concretos ("Salvar", "Adicionar"), não genéricos ("OK").
 *  - Mensagens de erro: nunca culpar o usuário — orientar a próxima ação.
 *  - "Atenção" em vez de "Erro" para validações (palavra menos punitiva).
 *  - Feedback positivo curto e específico ("Insumo salvo!", não "Sucesso").
 *  - Empty states: 1 linha de contexto + 1 CTA claro.
 *
 * Top 20 microcopy revisadas (vide notas no fim do arquivo).
 */

export const t = {
  // ─────────────────────────────────────────────────────────
  // Títulos de Alert/Modal genéricos
  // ─────────────────────────────────────────────────────────
  alertAttention: 'Atenção',
  alertError: 'Algo deu errado',
  alertSuccess: 'Tudo certo!',
  alertConfirm: 'Confirmar',

  // ─────────────────────────────────────────────────────────
  // Validação de formulário (uso comum)
  // ─────────────────────────────────────────────────────────
  validation: {
    required: (campo) => `Preencha o campo "${campo}" para continuar.`,
    requiredName: 'Dê um nome para identificar este item.',
    requiredCategoryName: 'Dê um nome para a nova categoria.',
    requiredSubcategoryName: 'Dê um nome para a nova subcategoria.',
    invalidEmail: 'Confira se o e-mail está digitado corretamente.',
    emailMismatch: 'Os e-mails não coincidem. Digite o mesmo e-mail nos dois campos.',
    passwordMin: 'A senha precisa ter pelo menos 8 caracteres.',
    passwordWeak: 'Use letras maiúsculas, minúsculas e números na senha.',
    passwordMismatch: 'As senhas não coincidem.',
    invalidQuantity: 'Informe uma quantidade maior que zero.',
    invalidPrice: 'Informe um preço maior que zero.',
    invalidDate: 'Use o formato AAAA-MM-DD (ex: 2026-04-22).',
    confirmDeleteToken: 'Digite EXCLUIR (em maiúsculas) para confirmar.',
  },

  // ─────────────────────────────────────────────────────────
  // Salvar / Excluir (feedback)
  // ─────────────────────────────────────────────────────────
  feedback: {
    saved: 'Alterações salvas',
    savedItem: (nome) => `${nome} salvo!`,
    deleted: 'Item excluído',
    deletedNamed: (nome) => `"${nome}" excluído`,
    undoHint: 'Toque em "Desfazer" para reverter.',
    networkError: 'Sem conexão. Confira sua internet e tente de novo.',
    genericError: 'Não conseguimos concluir agora. Tente novamente em instantes.',
  },

  // ─────────────────────────────────────────────────────────
  // Confirmações de exclusão
  // ─────────────────────────────────────────────────────────
  confirm: {
    deleteTitle: 'Excluir este item?',
    deleteMessage: (nome) =>
      `Você está prestes a excluir "${nome}". Essa ação não pode ser desfeita imediatamente.`,
    deleteCategoryTitle: 'Remover categoria?',
    deleteCategoryMessage:
      'Os itens desta categoria continuarão existindo, mas ficarão como "Sem categoria".',
    accountDelete:
      'Tem certeza? Sua conta e todos os dados serão removidos permanentemente.',
  },

  // ─────────────────────────────────────────────────────────
  // Empty states (resumos curtos — completos via EmptyState)
  // ─────────────────────────────────────────────────────────
  empty: {
    insumos: 'Comece cadastrando seus insumos — eles são a base do custo.',
    preparos: 'Crie preparos (bases, recheios, massas) para reaproveitar.',
    embalagens: 'Inclua caixas, potes e sacos para o custo final do produto.',
    produtos: 'Monte fichas técnicas combinando insumos, preparos e embalagens.',
    busca: (termo) => `Não encontramos nada para "${termo}".`,
  },

  // ─────────────────────────────────────────────────────────
  // Loaders (mensagens contextuais — P1-16)
  // ─────────────────────────────────────────────────────────
  loading: {
    generic: 'Carregando...',
    saving: 'Salvando alterações...',
    calculating: 'Calculando custos...',
    syncing: 'Sincronizando seus dados...',
    exporting: 'Preparando o arquivo...',
    deleting: 'Removendo...',
  },

  // ─────────────────────────────────────────────────────────
  // CTAs comuns (botões)
  // ─────────────────────────────────────────────────────────
  cta: {
    save: 'Salvar',
    saveAndContinue: 'Salvar e continuar',
    cancel: 'Cancelar',
    delete: 'Excluir',
    addCategory: 'Nova categoria',
    addSubcategory: 'Nova subcategoria',
    create: 'Criar',
    add: 'Adicionar',
    confirm: 'Confirmar',
    backToList: 'Voltar para a lista',
  },

  // ─────────────────────────────────────────────────────────
  // Auth
  // ─────────────────────────────────────────────────────────
  auth: {
    forgotPassword: 'Esqueci minha senha',
    loginErrorGeneric: 'Não conseguimos entrar. Confira e-mail e senha.',
    signupSuccess: 'Conta criada! Verifique seu e-mail para ativar.',
    passwordChanged: 'Senha atualizada com sucesso.',
    emailChanged: 'Enviamos um link de confirmação para o novo e-mail.',
  },
};

/**
 * Notas — Top 20 microcopy revisadas (P1-06):
 *
 * 1.  "Erro" → "Atenção" (validações) / "Algo deu errado" (falhas técnicas)
 * 2.  "Informe a descrição" → "Preencha o campo X para continuar"
 * 3.  "Informe o nome da categoria" → "Dê um nome para a nova categoria"
 * 4.  "Informe um e-mail válido" → "Confira se o e-mail está digitado corretamente"
 * 5.  "A nova senha deve ter no mínimo 8 caracteres" → "A senha precisa ter pelo menos 8 caracteres"
 * 6.  "A senha deve conter letras maiúsculas..." → "Use letras maiúsculas, minúsculas e números na senha"
 * 7.  "As senhas não coincidem" → mantida (já clara)
 * 8.  "Senha atual incorreta" → mantida
 * 9.  "Digite EXCLUIR para confirmar" → "Digite EXCLUIR (em maiúsculas) para confirmar"
 * 10. "Não foi possível excluir a conta" → "Algo deu errado / Tente novamente em instantes"
 * 11. "Sucesso" → "Tudo certo!" (mais natural em PT-BR)
 * 12. "OK" → CTA específico ("Salvar", "Adicionar")
 * 13. "Nenhum item adicionado" → empty states do EmptyState (P1-10 done)
 * 14. "Carregando..." → mensagens contextuais (P1-16 done)
 * 15. "Excluir" (modal) → "Excluir este item?" (pergunta abre conversa)
 * 16. "Esta ação é irreversível" → "Essa ação não pode ser desfeita imediatamente"
 *      (com undo toast P1-11, "imediatamente" é honesto)
 * 17. "Remover" categoria → "Os itens continuarão existindo como Sem categoria"
 *      (mata o medo de perder dados)
 * 18. "Salvo!" → "{nome} salvo!" (específico)
 * 19. "Erro de rede" → "Sem conexão. Confira sua internet e tente de novo."
 * 20. "Esqueci a senha" → "Esqueci minha senha" (P1-15 done)
 */

export default t;
