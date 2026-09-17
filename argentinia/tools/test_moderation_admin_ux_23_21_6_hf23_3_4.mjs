import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=process.cwd();
const ui=fs.readFileSync(path.join(root,'js/ui.js'),'utf8');

assert.match(ui,/const moderationBtnHTML = user\.email === ADMIN_EMAIL[\s\S]*\? ''[\s\S]*id=\\?"menu-moderation\\?"/,
  'ADMIN must not receive the player-facing Moderation button');
assert.match(ui,/id=\"moderation-center-back\" style=\"flex:0 0 auto;white-space:nowrap;\"/,
  'Moderation back button must not shrink');
assert.match(ui,/id=\"moderation-center-new\" style=\"width:auto;max-width:220px;flex:0 0 auto;margin:0 0 0 auto;white-space:nowrap;/,
  'New message button must be bounded instead of inheriting admin-save-btn width:100%');
assert.ok(!ui.includes('id="admin-community-ban-clear"'),
  'generic top-level unban button must be removed');
assert.match(ui,/data-community-unban-uid=/,
  'each active ban row must carry its exact UID');
assert.match(ui,/const targetUid = btn\.dataset\.communityUnbanUid \|\| '';/,
  'row-level unban must use the clicked ban UID, never the unrelated user picker');
assert.match(ui,/await adminUnbanCommunityUser\(targetUid, reason\)/,
  'row-level unban calls server authority with exact clicked UID');
assert.match(ui,/¿Levantar el ban activo de \$\{label\}\?/,
  'specific unban requires explicit confirmation naming the target');

console.log('MODERATION_ADMIN_UX_23_21_6_HF23_3_4_OK adminPlayerButton=ABSENT header=BOUNDED unban=ROW_UID_SPECIFIC');
