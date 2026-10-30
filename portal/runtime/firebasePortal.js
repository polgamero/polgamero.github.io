// Thin portal adapter: same Firebase project, default app, SDK pin and Auth.
// Does not import firebaseClientImpl, cardLoader, store, main, bot or game state.
let pending;
export function portalServices(){return pending??=(async()=>{
  const config=await fetch(new URL('../portal-config.json',import.meta.url),{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('No se pudo leer la configuración del portal.');return r.json();});
  if(config.sdkVersion!=='12.16.0')throw Error('FIREBASE_SDK_PIN_MISMATCH');
  const sdk='https://www.gstatic.com/firebasejs/12.16.0/';
  const [appSDK,authSDK,firestoreSDK,functionsSDK]=await Promise.all([import(sdk+'firebase-app.js'),import(sdk+'firebase-auth.js'),import(sdk+'firebase-firestore.js'),import(sdk+'firebase-functions.js')]);
  const existing=appSDK.getApps().find(a=>a.name==='[DEFAULT]');
  if(existing&&existing.options.projectId!==config.firebase.projectId)throw Error('FIREBASE_PROJECT_MISMATCH');
  const app=existing||appSDK.initializeApp(config.firebase),auth=authSDK.getAuth(app),db=firestoreSDK.getFirestore(app),functions=functionsSDK.getFunctions(app,config.region);
  if(config.emulators){
    if(!['127.0.0.1','localhost'].includes(location.hostname)||config.firebase.projectId!=='argentinia-editorial-stage2')throw Error('EMULATORS_REQUIRE_LOCAL_OWNER_GATE');
    authSDK.connectAuthEmulator(auth,config.emulators.auth,{disableWarnings:true});firestoreSDK.connectFirestoreEmulator(db,'127.0.0.1',config.emulators.firestore);functionsSDK.connectFunctionsEmulator(functions,'127.0.0.1',config.emulators.functions);
  }
  const call=functionsSDK.httpsCallable(functions,'editorialAdmin');
  return {config,auth,
    onAuth:fn=>authSDK.onAuthStateChanged(auth,fn),
    signIn:()=>authSDK.signInWithPopup(auth,new authSDK.GoogleAuthProvider()),
    signOut:()=>authSDK.signOut(auth),
    action:async data=>{if(!config.backendEnabled)throw Error('El servicio editorial todavía no está habilitado.');try{return (await call(data)).data;}catch(e){const error=new Error(e.details?.message||e.message);error.code=e.details?.editorialCode||e.code;throw error;}},
    fetchRanking:async()=>{const snap=await firestoreSDK.getDocs(firestoreSDK.collection(db,'playerStats'));return snap.docs.map(d=>({id:d.id,...d.data()}));}
  };
})().catch(error=>{pending=null;throw error;});}
