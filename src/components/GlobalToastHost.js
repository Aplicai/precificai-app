/**
 * Sessão 28.53 — Host global do toast bus.
 *
 * Renderiza UM InfoToast por vez, conectado ao toastBus.
 * Montar UMA única vez na raiz do app (ver App.js).
 */
import React, { useEffect, useState } from 'react';
import InfoToast from './InfoToast';
import { subscribeToast } from '../utils/toastBus';

export default function GlobalToastHost() {
  const [current, setCurrent] = useState(null);

  useEffect(() => {
    const unsub = subscribeToast((payload) => {
      // Replace any in-flight toast — simpler que fila e suficiente p/ feedback rápido
      setCurrent(payload);
    });
    return () => { try { unsub && unsub(); } catch (_) {} };
  }, []);

  return (
    <InfoToast
      visible={!!current}
      message={current?.message}
      icon={current?.icon}
      durationMs={current?.durationMs}
      onDismiss={() => setCurrent(null)}
    />
  );
}
