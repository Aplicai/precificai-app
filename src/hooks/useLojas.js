/**
 * useLojas — Sessão 28.22
 *
 * Multi-loja MINIMAL VIABLE: lista de lojas + loja atual selecionada,
 * persistido em AsyncStorage com broadcast cross-screen (mesmo padrão de
 * useFeatureFlag e useListDensity).
 *
 * NOTA: nesta primeira iteração, a "loja" é só METADATA (label visível).
 * Os dados (insumos, produtos etc) NÃO são filtrados por loja ainda — isso
 * exigiria refactor profundo do schema (FK de loja_id em todas as tabelas).
 * Por hora, o usuário consegue:
 *   - Cadastrar várias lojas (ex: "Confeitaria Centro", "Lanchonete Filial")
 *   - Selecionar a "loja atual"
 *   - Ver no header/sidebar qual loja está ativa
 *
 * Próxima rodada: separação de dados por loja.
 *
 * Convenção das chaves AsyncStorage:
 *   `@lojas:list:<userId>`   → array de { id, nome, criada_em }
 *   `@lojas:current:<userId>`→ id da loja atual (string)
 */

import { useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const _state = { lojas: [], currentId: null, userId: null, loaded: false };
const _listeners = new Set();

function _key(userId, type) { return `@lojas:${type}:${userId || 'anon'}`; }

function _notify() {
  for (const fn of _listeners) {
    try { fn({ ..._state }); } catch {}
  }
}

async function _load(userId) {
  if (_state.userId === userId && _state.loaded) return;
  _state.userId = userId;
  try {
    const [lstRaw, curRaw] = await Promise.all([
      AsyncStorage.getItem(_key(userId, 'list')),
      AsyncStorage.getItem(_key(userId, 'current')),
    ]);
    let list = [];
    try { list = lstRaw ? JSON.parse(lstRaw) : []; } catch { list = []; }
    if (!Array.isArray(list)) list = [];
    _state.lojas = list;
    _state.currentId = curRaw || null;
  } catch {
    _state.lojas = [];
    _state.currentId = null;
  } finally {
    _state.loaded = true;
    _notify();
  }
}

async function _saveList(userId) {
  try { await AsyncStorage.setItem(_key(userId, 'list'), JSON.stringify(_state.lojas)); } catch {}
}

async function _saveCurrent(userId, id) {
  try {
    if (id) await AsyncStorage.setItem(_key(userId, 'current'), String(id));
    else await AsyncStorage.removeItem(_key(userId, 'current'));
  } catch {}
}

export async function adicionarLoja(userId, nome) {
  await _load(userId);
  const trimmed = String(nome || '').trim();
  if (!trimmed) return null;
  const novaId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const nova = { id: novaId, nome: trimmed, criada_em: new Date().toISOString() };
  _state.lojas = [..._state.lojas, nova];
  await _saveList(userId);
  // Se é a primeira, vira atual automaticamente
  if (!_state.currentId) {
    _state.currentId = novaId;
    await _saveCurrent(userId, novaId);
  }
  _notify();
  return nova;
}

export async function renomearLoja(userId, id, nome) {
  await _load(userId);
  const trimmed = String(nome || '').trim();
  if (!trimmed) return false;
  _state.lojas = _state.lojas.map(l => l.id === id ? { ...l, nome: trimmed } : l);
  await _saveList(userId);
  _notify();
  return true;
}

export async function removerLoja(userId, id) {
  await _load(userId);
  _state.lojas = _state.lojas.filter(l => l.id !== id);
  if (_state.currentId === id) {
    _state.currentId = _state.lojas[0]?.id || null;
    await _saveCurrent(userId, _state.currentId);
  }
  await _saveList(userId);
  _notify();
}

export async function selecionarLojaAtual(userId, id) {
  await _load(userId);
  _state.currentId = id || null;
  await _saveCurrent(userId, _state.currentId);
  _notify();
}

/**
 * Hook reativo. Retorna { lojas, currentId, current, loaded, ...actions }.
 */
export default function useLojas(userId) {
  const [snap, setSnap] = useState({ lojas: _state.lojas, currentId: _state.currentId, loaded: _state.loaded && _state.userId === userId });

  useEffect(() => {
    let cancelled = false;
    const listener = (s) => {
      if (cancelled) return;
      if (s.userId !== userId) return;
      setSnap({ lojas: s.lojas, currentId: s.currentId, loaded: s.loaded });
    };
    _listeners.add(listener);
    _load(userId).then(() => {
      if (cancelled) return;
      setSnap({ lojas: _state.lojas, currentId: _state.currentId, loaded: true });
    });
    return () => {
      cancelled = true;
      _listeners.delete(listener);
    };
  }, [userId]);

  const current = snap.lojas.find(l => l.id === snap.currentId) || null;

  const adicionar = useCallback((nome) => adicionarLoja(userId, nome), [userId]);
  const renomear = useCallback((id, nome) => renomearLoja(userId, id, nome), [userId]);
  const remover = useCallback((id) => removerLoja(userId, id), [userId]);
  const selecionar = useCallback((id) => selecionarLojaAtual(userId, id), [userId]);

  return { ...snap, current, adicionar, renomear, remover, selecionar };
}
