# Argentinia 23.18.1 — Headless Full Game Lab

23.18.1 ejecuta partidas completas del motor real de Argentinia desde Node, sin DOM visible ni Firebase.
No es un simulador paralelo: el worker importa `main.js`, `turnManager.js`, `stackManager.js`,
`combatRules.js`, `bot.js`, Telemetría y Replay reales.

## Gate determinista

```bash
node tools/run_headless_full_game_lab_23_18_1.mjs --games 30 --determinismRuns 2 --concurrency 6 --maxTurns 100 --maxSteps 8000
```

Cada caso se ejecuta desde procesos limpios y compara `status`, `actionCount`, `finalHash` y `traceHash`.

## Stress

```bash
node tools/run_headless_full_game_lab_23_18_1.mjs --games 100 --determinismRuns 1 --concurrency 8 --maxTurns 100 --maxSteps 8000
```

## Re-ejecutar una corrida

```bash
node tools/headless_full_game_worker_23_18_1.mjs --seed mi-seed --difficulty hard --identity RG > fixture.json
node tools/reexecute_headless_fixture_23_18_1.mjs fixture.json
```

## Action Re-executor para Telemetría

```bash
node tools/reexecute_telemetry_actions_23_18_1.mjs log.json --strict --out audit.json
```

## Cobertura actual

El agente local V1 automatiza el flujo completo de turnos, tierras, criaturas headless-safe, pago,
prioridad, ataque, bloqueo, daño, Cleanup y descarte. El rival usa la IA real del Tano.
Las mecánicas que exigen decisiones humanas especializadas todavía se amplían de forma incremental;
si aparece una decisión no soportada, el worker debe cortar con `coverage_stop`, nunca inventar una respuesta.

## Invariants

El worker usa `evaluateRuntimeInvariants()` de Telemetría en cada paso. Replay, producción y Headless
comparten así la misma definición de integridad. 23.18.1 corrigió un bug descubierto por este gate:
`blockingIndex` podía quedar obsoleto al compactarse un array de Combat después de que un atacante
abandonara el campo. Todas las salidas relevantes de Combat rebasan o limpian ahora esos índices.
