// Official Google Privacy & messaging API. No consent decision is invented,
// persisted by this adapter, or inferred from visiting/playing/accepting terms.
export function mountConsent(root=document,host=window) {
  const buttons=[...root.querySelectorAll('[data-consent-reopen]')];
  if(!buttons.length)return;
  const googlefc=host.googlefc=host.googlefc||{};
  googlefc.callbackQueue=googlefc.callbackQueue||[];
  let available=false;
  const update=value=>{available=value;for(const button of buttons)button.hidden=!value;};
  for(const button of buttons)button.addEventListener('click',()=>{
    if(!available)return;
    googlefc.callbackQueue.push({CONSENT_API_READY:()=>{
      if(typeof googlefc.showRevocationMessage==='function')googlefc.showRevocationMessage();
      else update(false);
    }});
  });
  googlefc.callbackQueue.push({CONSENT_API_READY:()=>{
    if(typeof host.__tcfapi!=='function')return;
    // Version 0 requests the latest supported TCF version, as Google documents.
    host.__tcfapi('addEventListener',0,(data,success)=>{
      update(!!(success&&data?.gdprApplies===true&&typeof googlefc.showRevocationMessage==='function'));
      // Readiness is diagnostic, never a claim that end-to-end consent passed.
      root.documentElement?.setAttribute('data-cmp-api',success?'ready':'error');
    });
  }});
}
if(typeof document!=='undefined'&&window.top===window)mountConsent();
