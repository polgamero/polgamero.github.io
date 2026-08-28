# Argentinia 23.19 — Multiplayer Reliability Lab

## Objetivo

Endurecer la sincronización 1v1 real sin cambiar reglas de gameplay ni el pool. La release ataca fallos de transporte/reconexión: escrituras públicas y privadas partidas, snapshots viejos, saltos de revisiones, ecos propios coalescidos, fallos transitorios de publicación y desconexiones silenciosas del rival.

## Contrato de commit atómico

Cada publicación gameplay usa `publishMatchStateAtomic()` y una transacción Firestore única:

- incrementa `syncRevision` global del match;
- escribe el delta público;
- actualiza `syncFieldRevisions[key]` con la revisión exacta de cada campo público tocado;
- si cambió mano/mazo, escribe `private/{uid}` en la misma transacción;
- sella `hostPrivateRevision` / `guestPrivateRevision` y `_syncRevision` privado con la misma revisión;
- `syncMeta.serverRevision` identifica el commit confirmado.

Así un reconnect nunca debe mezclar battlefield/contadores públicos de una revisión con mano/mazo privados de otra.

## Orden fuerte de snapshots + recuperación de gaps

`syncRevision` es el gate global: una snapshot con revisión menor que la última ya aplicada se descarta y no puede hacer rollback. Si se salta una o varias revisiones, el documento más nuevo sigue siendo suficiente para converger porque Firestore entrega el documento acumulado.

La pieza decisiva es `syncFieldRevisions`: cada key gameplay conserva la última revisión que la modificó. Cada cliente mantiene su mapa de revisiones ya aplicadas y, al recibir un snapshot, importa exactamente las keys cuyo sello sea mayor. Esto evita depender del `syncMeta.touchedKeys` del último write para reconstruir qué cambió en revisiones intermedias.

En un eco propio, las keys declaradas por ese mismo write no se reimportan desde el servidor —el state local puede haber avanzado otra acción de forma optimista—, pero sí se aplican las keys con revisión nueva que hayan quedado coalescidas desde el rival. `touchedKeys` + delta contra baseline quedan sólo como fallback/diagnóstico para documentos legacy sin `syncFieldRevisions`.

## Reconnect consistente

`fetchMatchForReconnect()` lee documento público y privado dentro de la misma transacción de lectura y valida la pareja `rolePrivateRevision === private._syncRevision`. Un par roto se rechaza en vez de reconstruir un state híbrido.

## Retry acotado

Los errores transitorios de sync (`unavailable`, `deadline-exceeded`, etc.) reintentan con backoff 300 / 750 / 1500 ms, hasta 3 intentos. Errores no transitorios como `permission-denied` no entran en loop infinito.

## Presence

El heartbeat existente de 30 s ahora se interpreta. Si el `lastSeen` rival supera 65 s, la bitácora avisa que la conexión parece interrumpida; cuando vuelve a actualizarse, informa recuperación. No se declara abandono automático: la partida sigue siendo reconectable.

## Reliability Lab

```bash
node tools/run_multiplayer_reliability_lab_23_19.mjs --seeds 500 --commits 120
```

El simulador inyecta latencia, duplicados, drops intermedios y reordenamiento entre dos clientes; fuerza revision gaps, snapshots viejos y ecos propios con cambios remotos coalescidos, y exige convergencia final contra el documento más nuevo. También prueba que reconnects deliberadamente "torn" sean rechazados y valida la política de retry.

## Firestore Rules

No cambia la política de Rules. Los participantes ya pueden actualizar los campos del match activo y cada `private/{uid}` continúa protegido por dueño. Firestore Rules permanece en 23.13.75.
## Deck Intelligence Privacy Guard

Antes del release se eliminó el `console.log` de `buildRandomDeck()` que publicaba identidad, arquetipo, calidad, score, tierras y MV del mazo generado. También se retiró el arquetipo del Tano del diagnóstico `rival_deck_ready` y ya no se conserva `rivalDeckBuildReport` durante gameplay Solo. El contrato 23.19 falla si reaparece cualquiera de esas dos fugas casuales.



## Ready barrier fail-closed

El `ready` inicial ahora sólo se publica después de que `publishMatchState({ force: true })` confirme el commit atómico post-mulligan. Si ese commit no puede confirmarse, se cancela el retry pendiente de esa barrera y el inicio falla cerrado con `MULTIPLAYER_INITIAL_SYNC_NOT_CONFIRMED`; nunca se anuncia al rival que el jugador está listo con un estado inicial no confirmado.
