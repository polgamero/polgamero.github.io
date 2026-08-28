// Argentinia 23.18.1 — DOM mínimo para importar el motor real en Node.
// No pretende emular layout; sólo satisface las fronteras UI mientras render() corre no-op.
export function installHeadlessDom() {
  globalThis.__ARGENTINIA_HEADLESS_ENGINE__ = true;
  globalThis.__ARGENTINIA_HEADLESS_LOG__ = [];
  const noop = () => {};
  function makeClassList() { return { add:noop, remove:noop, toggle:noop, contains:()=>false }; }
  function makeNode() {
    const node = {
      style:{setProperty:noop,removeProperty:noop}, dataset:{}, classList:makeClassList(), children:[], parentElement:null, parentNode:null,
      appendChild(child){ if(child){ this.children.push(child); child.parentElement=this; child.parentNode=this; } return child; },
      removeChild:noop, insertBefore:noop, replaceChildren(...xs){ this.children=[...xs]; }, remove:noop,
      addEventListener:noop, removeEventListener:noop, dispatchEvent:()=>true,
      querySelector:()=>makeNode(), querySelectorAll:()=>[], closest:()=>null,
      setAttribute:noop, getAttribute:()=>null, removeAttribute:noop,
      focus:noop, click:noop, scrollIntoView:noop,
      getBoundingClientRect:()=>({left:0,top:0,width:100,height:140,right:100,bottom:140,x:0,y:0}),
      innerHTML:'', textContent:'', value:'', disabled:false, checked:false,
      scrollTop:0, scrollLeft:0, scrollHeight:0, scrollWidth:0,
      clientWidth:800, clientHeight:600, offsetWidth:100, offsetHeight:140,
      type:'div', id:'', className:'', title:'', src:'', alt:''
    };
    node.parentElement=node; node.parentNode=node;
    return node;
  }
  const body=makeNode();
  const documentElement=makeNode();
  globalThis.document={
    body, documentElement, readyState:'complete', visibilityState:'visible',
    getElementById:()=>makeNode(), querySelector:()=>makeNode(), querySelectorAll:()=>[],
    createElement:()=>makeNode(), createTextNode:(text)=>({textContent:String(text)}),
    addEventListener:noop, removeEventListener:noop
  };
  globalThis.window=globalThis;
  globalThis.window.addEventListener=noop; globalThis.window.removeEventListener=noop;
  globalThis.window.matchMedia=()=>({matches:false,addEventListener:noop,removeEventListener:noop});
  globalThis.matchMedia=globalThis.window.matchMedia;
  globalThis.location={search:'',href:'http://headless.local/argentinia/',origin:'http://headless.local',pathname:'/argentinia/',reload:noop};
  try { Object.defineProperty(globalThis,'navigator',{value:{userAgent:'ArgentiniaHeadless/23.18.1',maxTouchPoints:0,onLine:false},configurable:true}); } catch {}
  globalThis.screen={width:1280,height:720,availWidth:1280,availHeight:720};
  globalThis.innerWidth=1280; globalThis.innerHeight=720; globalThis.devicePixelRatio=1;
  globalThis.localStorage={getItem:()=>null,setItem:noop,removeItem:noop,clear:noop};
  globalThis.sessionStorage={getItem:()=>null,setItem:noop,removeItem:noop,clear:noop};
  globalThis.requestAnimationFrame=(cb)=>{ try{cb(Date.now());}catch{} return 1; };
  globalThis.cancelAnimationFrame=noop;
  globalThis.Image=class { constructor(){this.onload=null;this.onerror=null;} set src(_v){} };
  globalThis.CustomEvent=class { constructor(type,opts={}){this.type=type;this.detail=opts.detail;} };
  globalThis.Event=class { constructor(type){this.type=type;} preventDefault(){} stopPropagation(){} };
  globalThis.CSS={escape:s=>String(s)};
  globalThis.confirm=()=>true; globalThis.alert=noop; globalThis.prompt=()=>null;
  return { makeNode };
}
