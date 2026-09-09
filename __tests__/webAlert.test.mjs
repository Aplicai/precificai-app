import test from 'node:test';
import assert from 'node:assert/strict';
import { webAlert, installWebAlertShim } from '../src/utils/webAlert.js';

function fakeWin(confirmResult = true) {
  const calls = { alert: [], confirm: [] };
  return {
    calls,
    alert: (t) => { calls.alert.push(t); },
    confirm: (t) => { calls.confirm.push(t); return confirmResult; },
  };
}

test('sem botões → window.alert com título e mensagem', () => {
  const win = fakeWin();
  webAlert(win, 'Atenção', 'Preencha o nome');
  assert.deepEqual(win.calls.alert, ['Atenção\n\nPreencha o nome']);
  assert.equal(win.calls.confirm.length, 0);
});

test('1 botão → alert e executa onPress', () => {
  const win = fakeWin();
  let ran = false;
  webAlert(win, 'Ok', 'msg', [{ text: 'OK', onPress: () => { ran = true; } }]);
  assert.equal(win.calls.alert.length, 1);
  assert.equal(ran, true);
});

test('2 botões, confirm=true → executa o botão não-cancel', () => {
  const win = fakeWin(true);
  const log = [];
  webAlert(win, 'Excluir?', 'Definitivo', [
    { text: 'Cancelar', style: 'cancel', onPress: () => log.push('cancel') },
    { text: 'Excluir', style: 'destructive', onPress: () => log.push('delete') },
  ]);
  assert.deepEqual(log, ['delete']);
  assert.equal(win.calls.confirm.length, 1);
});

test('2 botões, confirm=false → executa o cancel', () => {
  const win = fakeWin(false);
  const log = [];
  webAlert(win, 'Excluir?', 'Definitivo', [
    { text: 'Cancelar', style: 'cancel', onPress: () => log.push('cancel') },
    { text: 'Excluir', onPress: () => log.push('delete') },
  ]);
  assert.deepEqual(log, ['cancel']);
});

test('2 botões sem style cancel → primeiro é cancel, último é primário', () => {
  const win = fakeWin(true);
  const log = [];
  webAlert(win, 'T', 'M', [
    { text: 'Não', onPress: () => log.push('nao') },
    { text: 'Sim', onPress: () => log.push('sim') },
  ]);
  assert.deepEqual(log, ['sim']);
});

test('3 botões → confirm entre cancel e o ÚLTIMO não-cancel', () => {
  const win = fakeWin(true);
  const log = [];
  webAlert(win, 'T', 'M', [
    { text: 'Cancelar', style: 'cancel', onPress: () => log.push('cancel') },
    { text: 'Opção A', onPress: () => log.push('a') },
    { text: 'Opção B', onPress: () => log.push('b') },
  ]);
  assert.deepEqual(log, ['b']);
});

test('onPress que lança não quebra o shim', () => {
  const win = fakeWin();
  assert.doesNotThrow(() => webAlert(win, 'T', 'M', [{ text: 'OK', onPress: () => { throw new Error('x'); } }]));
});

test('installWebAlertShim substitui Alert.alert', () => {
  class FakeAlert { static alert() {} }
  const win = fakeWin();
  assert.equal(installWebAlertShim(FakeAlert, win), true);
  FakeAlert.alert('A', 'B');
  assert.deepEqual(win.calls.alert, ['A\n\nB']);
  assert.equal(installWebAlertShim(null, win), false);
});
