# Argentinia 23.18 — Stability & Replay Foundation

Este bloque convierte la telemetría de partida en una base reproducible y auditable.

## Dos niveles de replay

### Replay Legacy (logs 23.17.x)
Los logs históricos no contienen toda la aleatoriedad/decisiones necesarias para volver a ejecutar el motor desde cero. Sí pueden reconstruirse de forma event-sourced a partir de `state_change` hasta un `manual_bug_marker`, auditar invariants y generar fixtures compactos.

```bash
node tools/replay_telemetry_23_18.mjs Argentinia_Log_....json --list
node tools/replay_telemetry_23_18.mjs Argentinia_Log_....json --marker 1 --out marker1.json
node tools/audit_replay_batch_23_18.mjs ./logs --strict
node tools/extract_bug_fixture_23_18.mjs Argentinia_Log_....json --marker 1 --out bug_fixture.json --before 120 --after 40
```

### Replay Deterministic V1 (sesiones 23.18+)
Las sesiones nuevas registran:
- RNG de gameplay versionado (`mulberry32-v1`);
- seed/estado RNG;
- hashes estables antes/después de cada `state_change`;
- checkpoints periódicos y en bug markers;
- action journal semántico derivado;
- hashes del estado final;
- invariants de integridad.

En Solitario, para QA manual, se puede forzar una semilla:

```text
?argSeed=mi-bug-123
```

**Seguridad:** Multiplayer ignora deliberadamente `argSeed`. Su seed es aleatoria por sesión y sólo se registra para diagnóstico posterior, para que un jugador no pueda controlar/predecir su shuffle.

## Solo Recovery
Recovery schema 2 persiste `rngState`. Un F5 y recuperación conserva la trayectoria futura del RNG de gameplay.

## Stability Lab

```bash
node tools/run_stability_lab_23_18.mjs --seeds 1000
```

Hoy cubre:
- reproducibilidad del RNG;
- construcción competitiva determinista de mazos para `good`, `strong`, `elite`;
- las diez identidades bicolor;
- validación de mazos;
- replay/hash sintético;
- fuzz de invariants.

### Limitación deliberadamente explícita
23.18 **no** afirma todavía ejecutar miles de partidas completas bot-vs-bot con el rules engine headless. Es la foundation necesaria para construir ese runner de forma fiable en una siguiente fase.

## Invariants V2
Además de los checks históricos, 23.18 detecta:
- el mismo `_syncObjectId` / `_effectObjectId` en múltiples zonas simultáneamente;
- `gameOver` con una decisión interactiva todavía pendiente;
- inconsistencias de hashes de Replay V1.
