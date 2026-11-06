/** Non-browser runtime contract smoke test. Does NOT validate CSS/rendered pixels. */
import test from 'node:test';
import assert from 'node:assert/strict';

test('every main view returns meaningful markup with DOM-shell stubs',async()=>{
  const store=new Map();
  const events={};
  const main={innerHTML:'',focus() {}};
  store.set('#app-main',main);
  store.set('#breadcrumb-current',{textContent:''});
  store.set('#toast',{textContent:'',hidden:true});
  store.set('#ambient-canvas',{getContext:()=>null});
  globalThis.document={
    querySelector(s){return store.get(s)||null;},
    querySelectorAll(){return [];},
    addEventListener(name,cb){events[name]=cb;},
    hidden:false,
  };
  globalThis.window={
    addEventListener(name,cb){events[name]=cb;},
    matchMedia:()=>({matches:true,addEventListener(){}}),
    scrollTo(){},
  };
  globalThis.location={hash:'#/lobby'};
  Object.defineProperty(globalThis,'navigator',{value:{mediaDevices:null},configurable:true});
  globalThis.Image=class {set src(val){this._src=val;queueMicrotask(()=>this.onload?.());} get complete(){return false;} get naturalWidth(){return 0;}};
  globalThis.innerWidth=1100;globalThis.innerHeight=800;
  await import('../app.mjs?render-test');
  await new Promise(resolve=>setTimeout(resolve,30));
  assert.match(main.innerHTML,/ひとつの絵に/);
  const cases=[
    ['#/explore','まだ知らない物語'],
    ['#/create','一枚から、物語をつくる'],
    ['#/perform','その物語に、あなたの声を'],
    ['#/library','あなたの物語が残る'],
    ['#/studio/sample-moon','声を、重ねる'],
    ['#/theater/sample-moon','THEATER'],
    ['#/about','物語は、ひとつの絵から'],
  ];
  for(const [hash,expected] of cases){
    globalThis.location.hash=hash;
    await events.hashchange();
    assert.match(main.innerHTML,new RegExp(expected),hash);
  }
});
