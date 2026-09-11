ARGENTINIA 23.21.4 — GAME TEXT CONTRACT FIX2

Scope: CI/catalog-only hotfix. No gameplay, Functions, Rules, economy protocol or schema changes.

Cause of GitHub failure:
Four obsolete controlled keys remained in gameTexts.js after the Admin Statistics dashboard redesign:
- admin.stats.games.sub
- admin.stats.col.soloMulti
- admin.stats.col.wins
- admin.stats.col.winRate

They were superseded by runtime keys admin.stats.games.sub3, admin.stats.col.soloRecord,
admin.stats.col.pvpRecord, admin.stats.col.tournaments and admin.stats.col.elo.
The validator correctly rejects controlled keys that no runtime surface references.

Fix:
Remove only the four obsolete definitions from argentinia/js/gameTexts.js.
Do not relax the validator and do not reintroduce fake runtime references.

Validation after fix:
GAME_TEXT_CONTRACT_OK definitions=1928 used=1297 strictSurfaces=4 controlled=159
FAST_CONTRACT_SWEEP total=117 passed=117 failed=0

Gate03/Gate05/Gate07 do NOT need to be rerun: this patch only changes unused catalog definitions.
Re-run the GitHub build from the corrected source.
