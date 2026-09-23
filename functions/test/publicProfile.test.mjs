import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPublicPlayerProfile, normalizePublicProfileCosmetics } from '../src/community/publicProfile.js';
import { favoriteCardIdIfOwned, favoriteCardPatchForCollection, favoriteCardPatchForState, FAVORITE_ENHANCED_SUFFIX } from '../src/shared/profileFavorite.js';

test('HF23.3.16.2 public profile is server-sanitized and exposes only the deliberate favorite variant', () => {
  const profile=buildPublicPlayerProfile({
    uid:'u_test',
    profile:{
      username:'La Piba', photoURL:'https://example.com/avatar.png', email:'secret@example.com',
      points:9999,fichas:88,essence:44,decks:[{id:'secretDeck'}],collection:['crea_001','crea_001','crea_002'],favoriteCardId:`crea_001${FAVORITE_ENHANCED_SUFFIX}`,
      enhancements:{crea_001:'Vuela'},
      profileCosmetics:{backgroundId:'fogoncito_01',nameBadgeId:'campeon-oro',frameId:'marco_pampa',titleId:'leyenda'},
      achievements:{claimed:{soloWins_copper:Date.now()}}
    },
    stats:{username:'La Piba',gamesPlayed:12,wins:7,soloWins:6,eloRating:1260,pointsCurrent:9999,fichasCurrent:88,essenceCurrent:44,uniqueCards:2,enhancementsCrafted:3,cardsEvolved:2,industrialMixes:1},
    achievementsConfig:{}
  });
  assert.equal(profile.schemaVersion,3);
  assert.equal(profile.uid,'u_test');
  assert.equal(profile.username,'La Piba');
  assert.equal(profile.stats.gamesPlayed,12);
  assert.equal(profile.stats.eloRating,1260);
  assert.equal(profile.workshop.cardsEvolved,2);
  assert.equal(profile.favoriteCardId,'crea_001::enhanced');
  assert.equal(profile.favoriteCardBaseId,'crea_001');
  assert.equal(profile.favoriteCardVariant,'enhanced');
  assert.equal(profile.favoriteCardEnhancementKeyword,'Vuela');
  assert.ok(profile.favoriteCardName);
  assert.equal(profile.cosmetics.backgroundId,'fogoncito_01');
  assert.equal(profile.cosmetics.nameBadgeId,'campeon-oro');
  assert.equal(profile.achievements.find(row=>row.familyId==='soloWins')?.tiers?.find(row=>row.tier==='copper')?.claimed,true);
  const serialized=JSON.stringify(profile);
  for(const secret of ['secret@example.com','secretDeck','crea_002','pointsCurrent','fichasCurrent','essenceCurrent','"points":9999','"collection"']) assert.equal(serialized.includes(secret),false,`leak: ${secret}`);
});

test('HF23.3.16.2 favorite variants are fail-closed and respect physical base/enhanced copies', () => {
  const enhancedProfile={collection:['crea_001','crea_001','crea_002'],enhancements:{crea_001:'Vuela'},favoriteCardId:'crea_001'};
  assert.equal(favoriteCardIdIfOwned(enhancedProfile),'crea_001','second physical copy keeps base variant available');
  assert.equal(favoriteCardIdIfOwned(enhancedProfile,'crea_001::enhanced'),'crea_001::enhanced');
  assert.deepEqual(favoriteCardPatchForCollection({...enhancedProfile,favoriteCardId:'crea_001'},['crea_001','crea_002']),{favoriteCardId:''},'base favorite clears when only enhanced copy remains');
  assert.deepEqual(favoriteCardPatchForCollection({...enhancedProfile,favoriteCardId:'crea_001::enhanced'},['crea_001','crea_002']),{},'enhanced favorite survives while enhanced physical copy exists');
  assert.deepEqual(favoriteCardPatchForCollection({...enhancedProfile,favoriteCardId:'crea_001::enhanced'},['crea_002']),{favoriteCardId:''});
  assert.deepEqual(favoriteCardPatchForState({...enhancedProfile,favoriteCardId:'crea_001::enhanced'},{enhancements:{}}),{favoriteCardId:''},'enhanced favorite clears if enhancement state disappears');
  const publicProfile=buildPublicPlayerProfile({uid:'u_fav',profile:{...enhancedProfile,collection:['crea_002'],favoriteCardId:'crea_001::enhanced'},stats:{},achievementsConfig:{}});
  assert.equal(publicProfile.favoriteCardId,'');
  assert.equal(publicProfile.favoriteCardName,'');
});

test('HF23.3.16.2 base favorite clears when the only normal copy becomes enhanced or evolved', () => {
  const base={collection:['crea_001'],favoriteCardId:'crea_001'};
  assert.equal(favoriteCardIdIfOwned(base),'crea_001');
  assert.deepEqual(favoriteCardPatchForState(base,{enhancements:{crea_001:'Vuela'}}),{favoriteCardId:''});
  assert.deepEqual(favoriteCardPatchForState(base,{evolutions:{crea_001:{stage:1}}}),{favoriteCardId:''});
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
