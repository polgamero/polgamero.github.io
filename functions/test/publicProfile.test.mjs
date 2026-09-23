import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPublicPlayerProfile, normalizePublicProfileCosmetics } from '../src/community/publicProfile.js';
import { favoriteCardIdIfOwned, favoriteCardPatchForCollection } from '../src/shared/profileFavorite.js';

test('HF23.3.16.1 public profile is server-sanitized, exposes only deliberate favorite card and keeps private collection secret', () => {
  const profile=buildPublicPlayerProfile({
    uid:'u_test',
    profile:{
      username:'La Piba', photoURL:'https://example.com/avatar.png', email:'secret@example.com',
      points:9999,fichas:88,essence:44,decks:[{id:'secretDeck'}],collection:['crea_001','crea_002'],favoriteCardId:'crea_001',
      profileCosmetics:{backgroundId:'fogoncito_01',nameBadgeId:'campeon-oro',frameId:'marco_pampa',titleId:'leyenda'},
      achievements:{claimed:{soloWins_copper:Date.now()}}
    },
    stats:{username:'La Piba',gamesPlayed:12,wins:7,soloWins:6,eloRating:1260,pointsCurrent:9999,fichasCurrent:88,essenceCurrent:44,uniqueCards:2,enhancementsCrafted:3,cardsEvolved:2,industrialMixes:1},
    achievementsConfig:{}
  });
  assert.equal(profile.schemaVersion,2);
  assert.equal(profile.uid,'u_test');
  assert.equal(profile.username,'La Piba');
  assert.equal(profile.stats.gamesPlayed,12);
  assert.equal(profile.stats.eloRating,1260);
  assert.equal(profile.workshop.cardsEvolved,2);
  assert.equal(profile.favoriteCardId,'crea_001');
  assert.ok(profile.favoriteCardName);
  assert.equal(profile.cosmetics.backgroundId,'fogoncito_01');
  assert.equal(profile.cosmetics.nameBadgeId,'campeon-oro');
  assert.equal(profile.achievements.find(row=>row.familyId==='soloWins')?.tiers?.find(row=>row.tier==='copper')?.claimed,true);
  const serialized=JSON.stringify(profile);
  for(const secret of ['secret@example.com','secretDeck','crea_002','pointsCurrent','fichasCurrent','essenceCurrent','"points":9999','"collection"']) assert.equal(serialized.includes(secret),false,`leak: ${secret}`);
});

test('HF23.3.16.1 favorite card is fail-closed when no longer owned and collection mutations clear only when last copy disappears', () => {
  const profile={collection:['crea_001','crea_001','crea_002'],favoriteCardId:'crea_001'};
  assert.equal(favoriteCardIdIfOwned(profile),'crea_001');
  assert.deepEqual(favoriteCardPatchForCollection(profile,['crea_001','crea_002']),{});
  assert.deepEqual(favoriteCardPatchForCollection(profile,['crea_002']),{favoriteCardId:''});
  const publicProfile=buildPublicPlayerProfile({uid:'u_fav',profile:{...profile,collection:['crea_002']},stats:{},achievementsConfig:{}});
  assert.equal(publicProfile.favoriteCardId,'');
  assert.equal(publicProfile.favoriteCardName,'');
});

test('HF23.3.16.1 profile cosmetics sanitize IDs only and reject URL/style injection', () => {
  assert.deepEqual(normalizePublicProfileCosmetics({backgroundId:'bg_01',nameBadgeId:'badge-gold',frameId:'javascript:alert(1)',titleId:'../secret'}),{
    schemaVersion:1,backgroundId:'bg_01',nameBadgeId:'badge-gold',frameId:'',titleId:''
  });
});

test('HF23.3.16 public profile rejects non-https avatar URLs and normalizes missing ELO', () => {
  const profile=buildPublicPlayerProfile({uid:'safe_uid',profile:{username:'Jugador',photoURL:'javascript:alert(1)'},stats:{},achievementsConfig:{}});
  assert.equal(profile.photoURL,'');
  assert.equal(profile.stats.eloRating,1200);
  assert.equal(profile.achievements.length,10);
});
