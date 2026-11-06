import { Actor, Epoch } from './src/machines.mjs';
import { newWork, cue, scene, validWork, validDraft, moveScene, safeText as esc, makeManifest, uid } from './src/domain.mjs';
import { localRepository, optimizeImage } from './src/storage.mjs';

const $ = s => document.querySelector(s);
const main = $('#app-main');
const sampleWorks = [
  { id:'sample-moon',ownerId:'scene-studio',version:1,title:'月待ち駅の、最後の灯り',description:'最終列車のあと、誰かが待っている。忘れものを探す旅人と、小さな約束の物語。',visibility:'sample',dubPermission:'allow',source:'sample',genre:'幻想',scenes:[
    {id:'moon-1',title:'夜の駅',image:'assets/scene1.svg',cues:[{id:'m1c1',speaker:'旅人',text:'こんな時間に、まだ灯りがついている。'},{id:'m1c2',speaker:'駅員',text:'ここは、帰りたい人が来る駅です。'}]},
    {id:'moon-2',title:'橋の上',image:'assets/scene2.svg',cues:[{id:'m2c1',speaker:'旅人',text:'あの向こうに、忘れた言葉がある気がする。'}]},
    {id:'moon-3',title:'もう一度',image:'assets/scene3.svg',cues:[{id:'m3c1',speaker:'語り',text:'やがて、夜明けがゆっくりと訪れた。'}]},
  ]},
  { id:'sample-water',ownerId:'scene-studio',version:1,title:'水面にほどける約束',description:'灯りがひとつ、川面を渡っていく。',visibility:'sample',dubPermission:'deny',source:'sample',genre:'幻想',scenes:[{id:'water-1',title:'灯る橋',image:'assets/scene2.svg',cues:[{id:'w1',speaker:'語り',text:'言えなかった言葉は、まだ水辺にある。'}]}]},
  { id:'sample-dawn',ownerId:'scene-studio',version:1,title:'夜明けを、もう一度',description:'朝の静けさに、物語の続きを見つける。',visibility:'sample',dubPermission:'deny',source:'sample',genre:'日常',scenes:[{id:'dawn-1',title:'夜明け',image:'assets/scene4.svg',cues:[{id:'d1',speaker:'語り',text:'一日がはじまる音がする。'}]}]},
];
const state = {
  page:'lobby', id:null, works:[], takes:[], takeUrls:new Map(), query:'',filter:'all',
  editor:null, editorSelected:0, editorDirty:false, editorActor:new Actor('editor'),
  playerActor:new Actor('player'), playerIndex:0, playerEpoch:new Epoch(), uploadEpoch:new Epoch(), editVersion:0,
  recorderActor:new Actor('recorder'),recordEpoch:new Epoch(), mediaRecorder:null,stream:null,
  studioScene:0, error:'', activeTake:null, storageAvailable:true,
};
function allWorks() { return [...state.works, ...sampleWorks]; }
function getWork(id) {
  return id === 'preview' ? state.editor : allWorks().find(w=>w.id===id);
}
function routeInfo() {
  const parts = (location.hash || '#/lobby').slice(2).split('/').map(decodeURIComponent);
  return {page:['lobby','explore','theater','create','perform','studio','library','about'].includes(parts[0])?parts[0]:'lobby',id:parts[1]??null};
}
function go(page,id){location.hash=`#/${page}${id?'/'+encodeURIComponent(id):''}`;}
function tag(text){return `<span class="code-badge">${esc(text)}</span>`;}
function workImage(work){return work?.scenes?.find(s=>s.image)?.image||'assets/scene1.svg';}
function sourceName(work){return work?.source==='sample'?'SCENE ORIGINAL · サンプル':'この端末の下書き';}
function labelAllow(work){return work?.dubPermission==='allow'?'アフレコ参加可':'アフレコ非公開';}
function notify(text){const toast=$('#toast');toast.textContent=text;toast.hidden=false;clearTimeout(notify.timer);notify.timer=setTimeout(()=>toast.hidden=true,5000);}
function setActiveNavigation(){
  const active=state.page==='theater'?(state.id==='preview'?'create':'explore'):state.page==='studio'?'perform':state.page;
  document.querySelectorAll('[data-route]').forEach(a=>{
    if(a.dataset.route===active)a.setAttribute('aria-current','page'); else a.removeAttribute('aria-current');
  });
  $('#breadcrumb-current').textContent=({lobby:'ロビー',explore:'作品を探す',theater:'鑑賞室',create:'制作室',perform:'出演作品を探す',studio:'アフレコ練習室',library:'ライブラリ',about:'この劇場について'})[state.page];
}
function workCard(work){
  return `<button class="work-card" type="button" data-action="open-work" data-id="${esc(work.id)}" aria-label="${esc(work.title)}を鑑賞する">
      <span class="thumb"><img src="${esc(workImage(work))}" alt="${esc(work.scenes[0]?.title||work.title)}のイラスト" loading="lazy"><span class="scene-count">${String(work.scenes.length).padStart(2,'0')} SCENES</span></span>
      <span class="body"><span class="work-meta"><span>${esc(sourceName(work))}</span><span class="bullet">·</span><span>${esc(work.genre||'創作')}</span></span>
      <h3>${esc(work.title)}</h3><p>${esc(work.description||'画像と台本で語る物語。')}</p>
      <span class="work-bottom"><span>${esc(work.source==='sample'?'SCENE 制作室':'ローカル制作')}</span><strong>${work.dubPermission==='allow'?'♫ 声で参加できる':'◇ 鑑賞する'}　↗</strong></span></span></button>`;
}
function stageHero(){const work=sampleWorks[0];return `<div class="kicker-row"><span class="star">✦</span><span>WELCOME TO THE STORY THEATER</span></div>
<div class="stage-hero"><div class="hero-img-wrap"><img class="hero-img" src="${esc(workImage(work))}" alt="夜の物語の舞台背景"></div>
  <div class="hero-copy"><span class="hero-tag">THE STORY LOBBY</span><h1>ひとつの絵に、<br><em>いくつもの声。</em></h1>
  <p class="intro">静かな物語が、あなたを待っている。<br>つくる。演じる。もう一度、観る。</p>
  <div class="hero-cta"><button class="btn btn-primary" data-action="open-work" data-id="${work.id}">幕を開ける <span aria-hidden="true">→</span></button><a class="btn btn-quiet" href="#/explore">物語を探す <span aria-hidden="true">◇</span></a></div></div>
  <div class="hero-side"><span>FEATURED STORY / 01</span><strong>${esc(work.title)}</strong><small>全3シーン · 無音の紙芝居</small><div class="hero-index"><span>SCENE 01—03</span><span>✦</span></div></div>
</div>`;}
function renderLobby(){return `<div class="wrap">${stageHero()}
  <div class="split-heading"><div><div class="eyebrow">THE COLLECTION</div><h2>物語の扉を、ひらく。</h2></div><a class="btn-link" href="#/explore">すべての作品を見る　→</a></div>
  <div class="work-grid">${allWorks().slice(0,3).map(workCard).join('')}</div>
  <div class="duo-panel"><section class="feature-panel"><div><span class="panel-icon" aria-hidden="true">✎</span><div class="eyebrow">CREATE A STORY</div><h3>あなたの物語も、この舞台へ。</h3><p>画像と台本だけで、無音の作品をつくれます。</p></div><a href="#/create" class="btn btn-quiet">制作室へ　→</a></section>
  <section class="feature-panel accent"><div><span class="panel-icon" aria-hidden="true">♫</span><div class="eyebrow">ADD YOUR VOICE</div><h3>その一幕を、声で演じる。</h3><p>許可された作品で、録音の練習ができます。</p></div><a class="btn btn-quiet" href="#/perform">アフレコ参加へ　→</a></section></div>
  <section class="empty-rank" aria-label="ランキング準備中"><div><h3>みんなの余韻 <span class="text-gold">/ RATINGS</span></h3><p>作品とアフレコを別々に評価します。実データが集まるまで架空の順位は表示しません。</p></div><a href="#/explore" class="btn btn-pill btn-quiet">代わりに作品を探す →</a></section>
  <p class="helper" style="margin-top:14px">現在の画面はローカル試作です。実際の作品公開・星評価・アカウント連携にはSites側の実装が必要です。</p>
</div>`;}
function renderExplore(){const works=allWorks();return `<div class="wrap"><div class="page-hero"><span class="eyebrow">EXPLORE / THE LIBRARY</span><h1 class="page-heading">まだ知らない物語に、出会う。</h1><p class="page-intro">気になる作品の幕を開けましょう。映像ではなく、絵と間（ま）で楽しむ短編劇場です。</p></div>
  <div class="search-row"><label class="search-field"><span class="sr-only">作品を検索</span><input id="search-works" value="${esc(state.query)}" type="search" placeholder="タイトルやあらすじから探す" autocomplete="off"></label>
    <div class="filter-set" aria-label="作品を絞り込む"><button class="btn btn-pill btn-quiet" data-action="filter" data-filter="all" aria-pressed="${state.filter==='all'}">すべて</button><button class="btn btn-pill btn-quiet" data-action="filter" data-filter="dub" aria-pressed="${state.filter==='dub'}">声で参加可</button><button class="btn btn-pill btn-quiet" data-action="filter" data-filter="local" aria-pressed="${state.filter==='local'}">自分の下書き</button></div></div>
  <div id="search-results" class="work-grid">${works.map(workCard).join('')}</div><p id="search-empty" class="library-empty" hidden>条件に合う作品がありません。検索語を変えてみてください。</p>
  <p id="search-count" class="helper" style="margin-top:20px">${works.length} 件の作品</p></div>`;}
function renderTheater(){const work=getWork(state.id);if(!work) return missing('作品が見つかりません');const i=Math.min(state.playerIndex,work.scenes.length-1);const s=work.scenes[i];const finished=state.playerActor.state==='ended';const loading=state.playerActor.state==='loading';const isPreview=state.id==='preview';return `<div class="wrap">
  <div class="page-hero" style="display:flex;align-items:center;justify-content:space-between;gap:15px;flex-wrap:wrap"><div><span class="eyebrow">THEATER / STORY VIEWER</span><h1 class="page-heading" style="font-size:clamp(28px,3vw,39px)">${esc(work.title)}</h1><p class="page-intro">${esc(sourceName(work))} · 全${work.scenes.length}シーン</p></div><button class="btn btn-quiet" data-action="back-from-theater">← ${isPreview?'制作室に戻る':'ロビーに戻る'}</button></div>
  ${isPreview?'<div class="info-ribbon warning"><strong>編集プレビュー：</strong> この作品は未公開です。別の端末や人からは見えません。</div>':''}
  <section class="theater-shell" aria-label="作品の鑑賞">
    <div class="theater-header"><div><div class="crumb">SCENE ${String(i+1).padStart(2,'0')} / ${String(work.scenes.length).padStart(2,'0')}</div><h2 class="title">${esc(s.title||'物語の一幕')}</h2></div><button class="btn btn-quiet" data-action="fullscreen" aria-label="舞台を全画面表示">⛶　全画面</button></div>
    <div class="theater-stage" id="stage" aria-live="off">${loading?'<div class="library-empty">舞台を準備しています…</div>':`<img src="${esc(s.image)}" alt="${esc(s.title||'シーン'+(i+1))}の場面" decoding="async">`}<div class="theater-overlay">${String(i+1).padStart(2,'0')} / ${String(work.scenes.length).padStart(2,'0')}</div></div>
    <div class="theater-controls"><div class="scene-jumps" aria-label="シーン選択">${work.scenes.map((item,n)=>`<button type="button" data-action="jump" data-index="${n}" aria-label="シーン${n+1}へ" ${i===n?'aria-current="step"':''}>${String(n+1).padStart(2,'0')}</button>`).join('')}</div><div style="display:flex;gap:10px;flex-wrap:wrap;flex:1;justify-content:flex-end"><button class="btn btn-quiet" data-action="prev" ${i===0?'disabled':''}>← 前の絵</button><button class="btn btn-primary" data-action="next">${finished?'もう一度':i===work.scenes.length-1?'鑑賞を終える':'次の絵へ →'}</button></div></div>
    <div class="player-guide"><strong>手動でコマ送り</strong> · この作品の公開音声はありません。左右の矢印キー・ボタンで進めます。台本は鑑賞画像には表示されません。</div>
  </section>
  ${finished?`<div class="ended-panel"><div><div class="eyebrow">THE END</div><h3>最後までご覧いただき、ありがとうございます。</h3><p class="helper">星評価にはログインとサーバー側集計が必要です。試作では投稿できません。</p></div><button class="btn btn-primary" data-action="restart">最初から観る ↺</button></div>`:''}
  <div class="theater-detail"><section class="detail-box"><h3>この物語について</h3><p>${esc(work.description)}</p><div class="cue-hidden">台本は演者の収録画面でのみ表示。鑑賞中の画像には重ねません。</div></section><section class="detail-box"><h3>声のバージョン</h3><p>◇ 無音版 / ORIGINAL</p><p style="margin-top:13px">公開済みアフレコはまだありません。</p>${work.dubPermission==='allow'?`<a class="btn btn-quiet" style="margin-top:15px;width:100%" href="#/studio/${encodeURIComponent(work.id)}">この作品で声を試す →</a>`:''}</section></div>
</div>`;}
function missing(message){return `<div class="wrap"><div class="library-empty"><div class="big-mark">◇</div><h2>${esc(message)}</h2><a class="btn btn-primary" href="#/lobby">ロビーに戻る</a></div></div>`;}
function renderCreate(){const w=state.editor,sc=w.scenes[state.editorSelected]??w.scenes[0];return `<div class="wrap">
  <div class="page-hero"><div class="eyebrow">CREATOR STUDIO</div><h1 class="page-heading">一枚から、物語をつくる。</h1><p class="page-intro">画像を並べて、場面ごとに台詞を添えます。未完成の下書きもこの端末に保存できます。</p><button class="btn btn-quiet" style="margin-top:13px" data-action="new-work">＋ 新しい作品を始める</button></div>
  <div class="info-ribbon warning"><span>ⓘ</span><span><strong>ローカル下書き専用：</strong>「保存」はこのブラウザのIndexedDBに保存します。サーバー公開・他端末との同期は行いません。ブラウザのデータ削除で消えるため、必要なら下書きを書き出してください。</span></div>
  <div class="studio-grid"><section class="studio-panel scene-nav-panel"><h3>シーン一覧 <span class="text-gold">${w.scenes.length}</span></h3><div class="scene-list">${w.scenes.map((s,i)=>`<button class="scene-item" data-action="select-scene" data-index="${i}" aria-current="${i===state.editorSelected}"><img src="${esc(s.image||'assets/scene4.svg')}" alt=""><span><b>シーン ${String(i+1).padStart(2,'0')}</b><br><small>${esc(s.title||'未設定')}</small></span></button>`).join('')}</div><button class="btn btn-quiet" style="width:100%;margin-top:13px" data-action="add-scene">＋ シーンを追加</button><div class="helper" style="margin-top:15px">1枚の画像に、複数の台詞・語りを設定できます。</div></section>
  <section class="studio-panel editor-main"><div class="selected-scene-head"><h3>シーン ${state.editorSelected+1} の編集</h3><div style="display:flex;gap:8px"><button data-action="move-scene" data-delta="-1" class="btn btn-quiet" aria-label="前へ移動" ${state.editorSelected===0?'disabled':''}>↑</button><button data-action="move-scene" data-delta="1" class="btn btn-quiet" aria-label="後ろへ移動" ${state.editorSelected>=w.scenes.length-1?'disabled':''}>↓</button><button data-action="remove-scene" class="btn btn-danger" ${w.scenes.length===1?'disabled':''} aria-label="シーンを削除">削除</button></div></div>
  <div class="upload-box">${sc.image?`<img src="${esc(sc.image)}" alt="現在のシーン画像">`:''}<span class="upload-sign">▧</span><strong>${sc.image?'画像を差し替える':'舞台に画像を置く'}</strong><input class="file-input" id="image-picker" type="file" accept="image/jpeg,image/png,image/webp"><label tabindex="0" role="button" for="image-picker" class="btn btn-primary">画像を選ぶ</label><small class="field-note">JPEG / PNG / WebP · この体験版では16MB以下</small></div>
  <div class="field" style="margin-top:17px"><label for="scene-name">シーンの見出し</label><input class="field-input" id="scene-name" data-field="scene-title" value="${esc(sc.title)}" placeholder="例：夜の駅にて"></div>
  <div class="selected-scene-head" style="margin-top:22px"><h3 style="margin:0">台詞・ナレーション</h3><button class="btn btn-quiet" data-action="add-cue">＋ 台詞を追加</button></div>
  <div>${sc.cues.map((c,i)=>`<div class="cue-row"><input class="field-input" aria-label="台詞${i+1}の話者" data-field="cue-speaker" data-cue="${esc(c.id)}" value="${esc(c.speaker)}" placeholder="話者（任意）"><input class="field-input" aria-label="台詞${i+1}の本文" data-field="cue-text" data-cue="${esc(c.id)}" value="${esc(c.text)}" placeholder="ここに台詞を入力"><button class="btn btn-quiet" data-action="remove-cue" data-cue="${esc(c.id)}" aria-label="台詞${i+1}を削除">×</button></div>`).join('')}</div></section>
  <section class="studio-panel"><h3>作品の設定</h3><span class="editor-status" id="editor-save-status">${state.editorDirty?'未保存の変更があります':'編集可能'}</span>
  <div class="field"><label for="work-title">作品名 <span class="text-gold">*必須</span></label><input class="field-input" id="work-title" data-field="work-title" value="${esc(w.title)}" placeholder="物語に名前を"></div>
  <div class="field"><label for="work-description">あらすじ</label><textarea id="work-description" class="field-textarea" data-field="work-description" placeholder="作品の説明">${esc(w.description)}</textarea></div>
  <label class="option-line"><input type="checkbox" id="allow-dub" data-field="allow-dub" ${w.dubPermission==='allow'?'checked':''}><span><strong>他の人のアフレコを許可</strong><small>公開時のみ有効。既定はOFF</small></span></label>
  <hr class="chapter-rule"><div class="form-actions"><button class="btn btn-primary" data-action="save-draft">下書きを保存</button><button class="btn btn-quiet" data-action="preview-draft">プレビュー</button><button class="btn btn-quiet" data-action="export-work">台本JSONを書き出す</button></div><p class="helper" style="margin-top:13px">この試作から一般公開することはできません。サーバー認証・権限・ファイル保存接続後に公開を有効にします。</p>
  </section></div>
</div>`;}
function renderPerform(){const available=allWorks().filter(w=>w.dubPermission==='allow'&&w.scenes.some(s=>s.image));return `<div class="wrap"><div class="page-hero"><span class="eyebrow">CASTING ROOM</span><h1 class="page-heading">その物語に、あなたの声を。</h1><p class="page-intro">原作者がアフレコを許可した作品を選びます。初めてでも、何度でも録り直せます。</p></div>
  <div class="info-ribbon warning"><span>♫</span><span><strong>録音はローカル練習です。</strong> 本番のアフレコ公開・多人数の聴き比べはSitesの保存API接続後に実装します。録音前にブラウザのマイク許可が必要です。</span></div>
  <div class="section-head"><div><span class="eyebrow">OPEN FOR VOICES</span><h2>声の参加ができる作品</h2></div><p class="sub">画面上の「声で参加可」は作品ごとの作者設定に基づきます。</p></div>
  ${available.length?`<div class="work-grid">${available.map(workCard).join('')}</div><p class="helper" style="margin-top:14px">作品カードから鑑賞して「この作品で声を試す」を選べます。</p>`:`<div class="library-empty"><span class="big-mark">♫</span><h3>まだ募集作品がありません</h3><p>自分の作品にアフレコ許可を設定すると、練習対象になります。</p><a class="btn btn-primary" href="#/create">最初の作品をつくる</a></div>`}
</div>`;}
function renderStudio(){const work=getWork(state.id);if(!work||work.dubPermission!=='allow')return missing('この作品はアフレコに対応していません');const current=work.scenes[state.studioScene]||work.scenes[0];const r=state.recorderActor.state;const takes=state.takes.filter(t=>t.workId===work.id);const hasMic=Boolean(navigator.mediaDevices?.getUserMedia && globalThis.MediaRecorder);return `<div class="wrap">
  <div class="page-hero"><span class="eyebrow">VOICE STUDIO / PRIVATE TAKES</span><h1 class="page-heading">声を、重ねる。</h1><p class="page-intro">${esc(work.title)} — 録音の練習・テイク比較。ここで録った音声は自動公開されません。</p></div>
  <div class="info-ribbon warning"><strong>収録デモの方式：</strong> 現在はコマ単位での試し録りです。本番の録音単位（コマ別／通し録り）は最終仕様未確定のため、ここでは固定しません。</div>
  <div class="studio-grid"><section class="studio-panel scene-nav-panel"><h3>収録するシーン</h3><div class="scene-list">${work.scenes.map((s,i)=>`<button class="scene-item" data-action="choose-studio-scene" data-index="${i}" aria-current="${i===state.studioScene}" ${r==='recording'||r==='stopping'?'disabled':''}><img alt="" src="${esc(s.image)}"><span><b>シーン ${i+1}</b><br><small>${esc(s.title)}</small></span></button>`).join('')}</div><p class="helper" style="margin-top:14px">台本は収録中だけ表示されます。</p></section>
  <section class="studio-panel editor-main"><h3>${esc(current.title)} <span class="code-badge">SCENE ${state.studioScene+1}</span></h3><img class="studio-preview-img" src="${esc(current.image)}" alt="${esc(current.title)}の画像"><div class="cue-script" aria-label="収録用台本">${current.cues.length?current.cues.map(c=>`<p><small>${esc(c.speaker||'ナレーション')}</small>${esc(c.text||'（台詞未入力）')}</p>`).join(''):'<p>台本はありません。自由に練習してください。</p>'}</div></section>
  <section class="studio-panel"><h3>収録コントロール</h3>
    <div class="rec-status ${r==='recording'?'record-live':''}">${r==='recording'?'<span class="mic-dot"></span>録音中です。停止して採用テイクを確認してください。':`状態：<strong>${esc(({idle:'待機',requesting:'マイクの許可待ち',ready:'録音準備完了',stopping:'音声を保存中',reviewing:'テイクを確認',failed:'エラー'})[r]||r)}</strong>`}</div>
    <div class="form-actions">${!hasMic?'<p class="helper">このブラウザではマイク録音が利用できません。HTTPSまたはlocalhostで開いてください。</p>':r==='recording'?'<button class="btn btn-danger" data-action="stop-record">■ 録音を停止</button>':r==='ready'?'<button class="btn btn-primary" data-action="start-record">● 録音開始</button>':r==='requesting'||r==='stopping'?'<button class="btn" disabled>処理中…</button>':'<button class="btn btn-primary" data-action="prepare-mic">マイクを準備</button>'}</div>
    <hr class="chapter-rule"><h3>音声ファイルの読み込み</h3><div class="field"><label for="audio-kind">音声の種類</label><select id="audio-kind" class="field-select"><option value="" selected>選択してください</option><option value="human">人の声</option><option value="ai">外部AI音声</option><option value="mixed">混合</option></select></div>
    <input class="file-input" id="import-audio" type="file" accept="audio/*,.m4a,.webm"><label class="btn btn-quiet" for="import-audio" tabindex="0" role="button">音声を選ぶ</label>
    <p class="helper" style="margin-top:10px">持ち込む音声は、利用・公開する権利があるものだけにしてください。</p>
    <hr class="chapter-rule"><div class="rec-status">未公開テイクはIndexedDBに保存します。必要なら音声ファイルをダウンロードしてください。</div>
  </section></div>
  <div class="split-heading"><div><span class="eyebrow">YOUR PRIVATE RECORDINGS</span><h2>録音テイク <span class="text-gold">${takes.length}</span></h2></div><span class="helper">未公開 / この端末のみ</span></div>
  ${takes.length?`<div class="audio-list">${takes.map((t,i)=>`<article class="take-card"><div class="take-card-top"><strong>テイク ${takes.length-i} <span class="code-badge">${esc(t.sourceKind==='ai'?'外部AI':t.sourceKind==='mixed'?'混合':'人の声')}</span></strong><span class="helper">${esc((t.createdAt||'').slice(0,16).replace('T',' '))}</span></div><audio controls preload="none" src="${esc(getTakeUrl(t))}">音声を再生できません。</audio><div class="list-actions"><button class="btn btn-quiet" data-action="download-take" data-take="${esc(t.id)}">音声を書き出す</button><button class="btn btn-danger" data-action="remove-take" data-take="${esc(t.id)}">削除</button></div></article>`).join('')}</div>`:'<div class="library-empty" style="min-height:190px"><div class="big-mark">♫</div><p>まだテイクがありません。マイクで録音するか、音声ファイルを読み込んでください。</p></div>'}
  <div class="info-ribbon warning" style="margin-top:20px"><span>ⓘ</span><span><strong>公開機能は未接続です。</strong> ローカルテイクは他の利用者には見えません。作者許可、認証、メディア保存、権限検証をSitesで実装するまで、公開ボタンは提供しません。</span></div>
</div>`;}
function getTakeUrl(t){if(!t.blob)return '';if(!state.takeUrls.has(t.id))state.takeUrls.set(t.id,URL.createObjectURL(t.blob));return state.takeUrls.get(t.id);}
function renderLibrary(){return `<div class="wrap"><div class="page-hero"><span class="eyebrow">YOUR LOCAL LIBRARY</span><h1 class="page-heading">ここに、あなたの物語が残る。</h1><p class="page-intro">この端末で保存した下書きの一覧です。アカウント同期や一般公開ではありません。</p></div>
  <div class="info-ribbon warning"><strong>保存範囲：</strong>同じブラウザのIndexedDBのみ。別端末には同期されません。保存済み作品も、ブラウザのデータ消去により失われる可能性があります。</div>
  ${state.works.length?`<div class="library-grid">${state.works.map(w=>`<article class="library-card"><img alt="" src="${esc(workImage(w))}"><div><h3>${esc(w.title||'名前のない物語')}</h3><small>下書き · ${w.scenes.length}シーン</small><div class="list-actions"><button class="btn btn-quiet" data-action="edit-work" data-id="${esc(w.id)}">編集</button><button class="btn btn-quiet" data-action="open-work" data-id="${esc(w.id)}">プレビュー</button></div></div></article>`).join('')}</div>`:'<div class="library-empty"><span class="big-mark">▤</span><h3>まだ作品がありません。</h3><p>一枚の画像と、ひと言から始められます。</p><a class="btn btn-primary" href="#/create">作品をつくる →</a></div>'}
</div>`;}
function renderAbout(){return `<div class="wrap"><div class="page-hero"><div class="eyebrow">ABOUT SCENE</div><h1 class="page-heading">物語は、ひとつの絵から。</h1><p class="page-intro">静止画像・台本・声を分けて管理する、参加型のストーリーシアターです。</p></div>
<div class="help-grid"><article class="help-step"><span class="num">01</span><h3>物語をつくる</h3><p>一枚の画像にいくつもの台詞を添えます。無音のままでも作品が成立します。</p><a class="btn btn-quiet" href="#/create">制作室へ →</a></article>
<article class="help-step"><span class="num">02</span><h3>舞台で観る</h3><p>コマを手動で進めて物語を鑑賞します。台本は画像に重ねません。</p><a class="btn btn-quiet" href="#/explore">物語を探す →</a></article>
<article class="help-step"><span class="num">03</span><h3>声で参加する</h3><p>作者が許可した作品で試し録りができます。練習テイクは非公開のままです。</p><a class="btn btn-quiet" href="#/perform">収録へ →</a></article></div>
<div class="info-ribbon warning" style="margin-top:24px">この画面は設計改善を検証する試作品です。サーバー公開・認証・複数利用者の評価・ランキングは未実装で、完成したサービスと誤認しないようにしています。</div>
</div>`;}
function render(){setActiveNavigation(); const components={lobby:renderLobby,explore:renderExplore,theater:renderTheater,create:renderCreate,perform:renderPerform,studio:renderStudio,library:renderLibrary,about:renderAbout};main.innerHTML=components[state.page]?.()||renderLobby();if(state.page==='explore')filterWorks();}
function filterWorks(){const items=[...document.querySelectorAll('#search-results .work-card')];const q=state.query.trim().toLocaleLowerCase('ja');let found=0;for(const card of items){const id=card.dataset.id;const w=allWorks().find(x=>x.id===id);const allow=state.filter==='all'||(state.filter==='dub'&&w.dubPermission==='allow')||(state.filter==='local'&&w.source==='local');const match=!q||`${w.title} ${w.description} ${w.genre||''}`.toLocaleLowerCase('ja').includes(q);card.hidden=!(allow&&match);if(!card.hidden)found++;}const e=$('#search-empty');if(e)e.hidden=found!==0;const count=$('#search-count');if(count)count.textContent=`${found} 件の作品`;}
function setDirty(){state.editorDirty=true;state.editVersion++; const actor=state.editorActor;if(actor.state==='saved'||actor.state==='failed')actor.send('CHANGE');else if(actor.state==='editing')actor.send('CHANGE');const badge=$('#editor-save-status');if(badge)badge.textContent='未保存の変更があります';}
function loadEditor(id){state.editor=state.works.find(w=>w.id===id)||newWork();state.editorSelected=0;state.editorDirty=false;state.editVersion=0;state.uploadEpoch.invalidate();state.editorActor=new Actor('editor');}
function validateEditor(){if(!state.editor)return ['作品がありません'];return validWork(state.editor);}
async function saveEditor(){if(!state.editor)return;
 const actor=state.editorActor;if(actor.state==='saved')actor.send('CHANGE');if(actor.state!=='editing'&&actor.state!=='failed'){notify('保存処理中です');return;}
 if(actor.state==='failed')actor.send('CHANGE');actor.send('VALIDATE');const errs=validateEditor();
 if(errs.length){actor.send('INVALID');notify(errs.join(' / '));return;}
 actor.send('VALID',{valid:true});const w=structuredClone(state.editor);const v=state.editVersion;w.updatedAt=new Date().toISOString();
 try{await localRepository.saveWork(w);const n=state.works.findIndex(x=>x.id===w.id);if(n<0)state.works.unshift(w);else state.works[n]=w;actor.send('SUCCESS');
   if(v===state.editVersion){state.editor=w;state.editorDirty=false;notify('この端末に下書きを保存しました（公開ではありません）');render();}
   else {actor.send('CHANGE');notify('保存中の編集内容は画面に残しています。再度保存してください');}
 }
 catch(e){actor.send('FAILED');notify(`保存できませんでした：${e.message}`);}
}
function previewEditor(){const errors=validateEditor();if(errors.length){notify(errors[0]);return;}go('theater','preview');}
function downloadJson(data,filename){const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});downloadBlob(blob,filename);}
function downloadBlob(blob,filename){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);}
function nextScene(delta){const work=getWork(state.id);if(!work)return;if(state.playerActor.state==='loading')return;
 if(state.playerActor.state==='ended'){state.playerIndex=0;state.playerActor.send('RESTART');render();return;}
 const target=state.playerIndex+delta;if(target<0)return;
 if(target>=work.scenes.length){state.playerActor.send('FINISH');render();return;}
 const event=delta>0?'NEXT':'PREVIOUS';if(state.playerActor.send(event).accepted){state.playerIndex=target;render();}
}
function jumpScene(i){const work=getWork(state.id);if(!work||i<0||i>=work.scenes.length)return;
 if(state.playerActor.state==='ended')state.playerActor.send('RESTART');else if(!state.playerActor.send('JUMP').accepted)return;
 state.playerIndex=i;render();
}
async function prefetchFirst(work,token){if(!work?.scenes?.length)return;const src=work.scenes[0].image;if(!src){state.playerActor.send('FAILED');return;}
 try{await new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve();im.onerror=()=>reject(new Error('画像を読み込めません'));im.src=src;if(im.complete&&im.naturalWidth)resolve();});if(state.playerEpoch.current(token)&&state.page==='theater'){state.playerActor.send('READY');render();}}
 catch(e){if(state.playerEpoch.current(token)){state.playerActor.send('FAILED');notify(e.message);render();}}
}
async function handleNavigation(){const next=routeInfo(); if(state.page==='studio'&&next.page!=='studio'&&state.recorderActor.state==='recording'){
  const leave=confirm('録音中です。録音を停止して移動しますか？');if(!leave){history.replaceState(null,'',`#/studio/${encodeURIComponent(state.id)}`);return;}stopRecord();
 }
 state.playerEpoch.invalidate();if(next.page!=='studio'||next.id!==state.id)state.recordEpoch.invalidate();state.page=next.page;state.id=next.id;
 if(next.page==='create'&&(!state.editor||next.id&&state.editor.id!==next.id))loadEditor(next.id);
 if(next.page==='theater'){state.playerActor=new Actor('player');state.playerIndex=0;state.playerActor.send('OPEN');render();const token=state.playerEpoch.next();prefetchFirst(getWork(next.id),token);}
 else if(next.page==='studio') {state.studioScene=0;state.recorderActor=new Actor('recorder');render();}
 else render();
 window.scrollTo({top:0,behavior:'instant'});
}
async function prepareMic(){if(state.recorderActor.state==='failed')state.recorderActor.send('RETRY');const ok=state.recorderActor.send('REQUEST');if(!ok.accepted)return;
 const token=state.recordEpoch.next();render();
 try{
  if(!navigator.mediaDevices?.getUserMedia||!globalThis.MediaRecorder)throw new Error('マイク録音が利用できません');
  const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});
  if(!state.recordEpoch.current(token)||state.page!=='studio'){stream.getTracks().forEach(t=>t.stop());return;}
  state.stream=stream;state.recorderActor.send('GRANTED');render();
 }catch(e){if(state.recordEpoch.current(token)){state.recorderActor.send('DENIED');notify('マイクを使用できません：'+e.message);render();}}
}
function startRecord(){if(!state.stream?.active){notify('最初にマイクを準備してください');return;}if(!state.recorderActor.send('START').accepted)return;
 try{
  const options={};for(const type of ['audio/webm;codecs=opus','audio/mp4','audio/webm','audio/ogg'])if(MediaRecorder.isTypeSupported(type)){options.mimeType=type;break;}
  const chunks=[];const recorder=new MediaRecorder(state.stream,options);state.mediaRecorder=recorder;const actor=state.recorderActor;const ownStream=state.stream;
  const workId=state.id,sceneId=getWork(state.id)?.scenes[state.studioScene]?.id;
  recorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data);};
  recorder.onerror=e=>{actor.send('FAILED');notify('録音エラーが発生しました');if(state.recorderActor===actor&&state.page==='studio')render();};
  recorder.onstop=async()=>{
    ownStream?.getTracks().forEach(t=>t.stop());if(state.stream===ownStream)state.stream=null;if(state.mediaRecorder===recorder)state.mediaRecorder=null;
    try{
      const blob=new Blob(chunks,{type:recorder.mimeType||'audio/webm'});if(!blob.size)throw new Error('録音データが空です');
      const take={id:uid('take'),workId,sceneId,sourceKind:'human',blob,createdAt:new Date().toISOString()};
      await localRepository.saveTake(take);state.takes.unshift(take);actor.send('SAVED');
      if(state.page==='studio'&&state.recorderActor===actor)render();notify('録音テイクをこの端末に保存しました');
    }catch(err){actor.send('FAILED');notify('テイク保存に失敗：'+err.message);if(state.page==='studio'&&state.recorderActor===actor)render();}
  };
  recorder.start(250);render();
 }catch(e){state.recorderActor.send('FAILED');state.stream?.getTracks().forEach(t=>t.stop());state.stream=null;notify('録音を開始できません：'+e.message);render();}
}
function stopRecord(){if(!state.recorderActor.send('STOP').accepted)return;if(state.mediaRecorder?.state==='recording')state.mediaRecorder.stop();render();}
async function importAudio(file){if(!file)return;
 const source=$('#audio-kind')?.value;
 if(!source){notify('先に音声の種類（人の声・外部AI・混合）を選択してください');return;}
 if(!String(file.type).startsWith('audio/')&&!/\.(m4a|webm|wav|mp3|ogg|opus)$/i.test(file.name)){notify('音声ファイルのみ取り込めます');return;}
 if(file.size>30*1024*1024){notify('このローカル試作では30MB以下の音声を選んでください');return;}
 if(state.recorderActor.state==='recording'||state.recorderActor.state==='stopping'){notify('録音を停止してから取り込んでください');return;}
 if(state.recorderActor.state==='failed')state.recorderActor.send('RETRY');
 if(!state.recorderActor.send('IMPORT').accepted){notify('音声を取り込める状態ではありません');return;}
 const work=getWork(state.id);const take={id:uid('take'),workId:work.id,sceneId:work.scenes[state.studioScene].id,sourceKind:source,blob:file,createdAt:new Date().toISOString()};
 try{await localRepository.saveTake(take);state.takes.unshift(take);notify('音声をローカルに取り込みました');render();}catch(e){notify('保存できませんでした：'+e.message);}
}
async function openImage(file){if(!file||!state.editor)return;
 const draftId=state.editor.id, targetId=state.editor.scenes[state.editorSelected]?.id, token=state.uploadEpoch.next();
 const upload=new Actor('upload');upload.send('SELECT');
 try{if(!['image/png','image/jpeg','image/webp'].includes(file.type)){upload.send('INVALID');throw new Error('JPEG、PNG、WebPだけに対応しています');}
 upload.send('VALID');const src=await optimizeImage(file);if(!state.uploadEpoch.current(token)||state.editor?.id!==draftId)return;
 const target=state.editor.scenes.find(s=>s.id===targetId);if(!target)return;
 upload.send('DONE');target.image=src;upload.send('COMMITTED');setDirty();render();notify('画像を追加しました。下書き保存を押して確定してください');
 }catch(e){if(!state.uploadEpoch.current(token))return;if(upload.state==='optimizing'||upload.state==='persisting')upload.send('FAILED');notify(e.message);}
}
async function handleClick(e){const btn=e.target.closest('[data-action]');if(!btn)return;const action=btn.dataset.action;const id=btn.dataset.id;
 switch(action){
  case 'open-work':go('theater',id);break;
  case 'back-from-theater':go(state.id==='preview'?'create':'lobby');break;
  case 'next':nextScene(1);break;
  case 'prev':nextScene(-1);break;
  case 'jump':jumpScene(Number(btn.dataset.index));break;
  case 'restart':state.playerActor.send('RESTART');state.playerIndex=0;render();break;
  case 'fullscreen': {const node=$('#stage');if(!document.fullscreenElement)node?.requestFullscreen?.().catch(()=>notify('全画面表示できませんでした'));else document.exitFullscreen?.();break;}
  case 'filter':state.filter=btn.dataset.filter;render();break;
  case 'select-scene':state.editorSelected=Number(btn.dataset.index);render();break;
  case 'new-work':if(state.editorDirty&&!confirm('保存していない変更があります。新しい作品へ移りますか？'))break;loadEditor(null);render();notify('新しい下書きを作成しました');break;
  case 'add-scene':state.editor.scenes.push(scene());state.editorSelected=state.editor.scenes.length-1;setDirty();render();break;
  case 'remove-scene':if(state.editor.scenes.length>1&&confirm('このシーンを削除しますか？')){state.editor.scenes.splice(state.editorSelected,1);state.editorSelected=Math.min(state.editorSelected,state.editor.scenes.length-1);setDirty();render();}break;
  case 'move-scene':{const to=state.editorSelected+Number(btn.dataset.delta);state.editor=moveScene(state.editor,state.editorSelected,to);state.editorSelected=to;setDirty();render();break;}
  case 'add-cue':state.editor.scenes[state.editorSelected].cues.push(cue());setDirty();render();break;
  case 'remove-cue':{const cues=state.editor.scenes[state.editorSelected].cues;const n=cues.findIndex(x=>x.id===btn.dataset.cue);if(n>=0){cues.splice(n,1);setDirty();render();}break;}
  case 'save-draft':await saveEditor();break;
  case 'preview-draft':previewEditor();break;
  case 'export-work':downloadJson(makeManifest(state.editor),`${(state.editor.title||'scene-draft').replace(/[^\w\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}-]/gu,'-')}.json`);notify('台本JSONを書き出しました。画像データは含まれません');break;
  case 'edit-work':loadEditor(id);go('create',id);render();break;
  case 'choose-studio-scene':state.studioScene=Number(btn.dataset.index);render();break;
  case 'prepare-mic':await prepareMic();break;
  case 'start-record':startRecord();break;
  case 'stop-record':stopRecord();break;
  case 'download-take':{const t=state.takes.find(x=>x.id===btn.dataset.take);if(t)downloadBlob(t.blob,`scene-take-${t.id.slice(-8)}.${t.blob.type.includes('mp4')?'m4a':t.blob.type.includes('wav')?'wav':'webm'}`);break;}
  case 'remove-take':{const t=state.takes.find(x=>x.id===btn.dataset.take);if(t&&confirm('この未公開テイクを削除しますか？')){await localRepository.clearTake(t.id);state.takes=state.takes.filter(x=>x.id!==t.id);if(state.takeUrls.has(t.id)){URL.revokeObjectURL(state.takeUrls.get(t.id));state.takeUrls.delete(t.id);}render();}break;}
 }
}
function handleInput(e){const t=e.target;
 if(t.id==='search-works'){state.query=t.value;filterWorks();return;}
 if(!t.dataset.field||!state.editor)return;const w=state.editor,s=w.scenes[state.editorSelected];
 switch(t.dataset.field){case 'work-title':w.title=t.value;break;case 'work-description':w.description=t.value;break;case 'scene-title':s.title=t.value;break;case 'cue-speaker':{const c=s.cues.find(x=>x.id===t.dataset.cue);if(c)c.speaker=t.value;break;}case 'cue-text':{const c=s.cues.find(x=>x.id===t.dataset.cue);if(c)c.text=t.value;break;}case 'allow-dub':w.dubPermission=t.checked?'allow':'deny';break;default:return;}
 setDirty();
}
function ambientCanvas(){const canvas=$('#ambient-canvas');const ctx=canvas?.getContext('2d');if(!ctx)return;const reduce=window.matchMedia('(prefers-reduced-motion: reduce)');let raf,particles=[],width,height;
 function resize(){const scale=Math.min(devicePixelRatio||1,1.6);width=innerWidth;height=innerHeight;canvas.width=Math.max(1,Math.floor(width*scale));canvas.height=Math.max(1,Math.floor(height*scale));ctx.setTransform(scale,0,0,scale,0,0);particles=Array.from({length:Math.min(26,Math.round(width/55))},(_,i)=>({x:(i*79.5%100)/100*width,y:((i*43.7)%100)/100*height,r:.5+(i%3)*.4,speed:.035+(i%4)*.015}));}
 function draw(){ctx.clearRect(0,0,width,height);for(const p of particles){ctx.fillStyle='rgba(213,185,128,0.27)';ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();if(!reduce.matches)p.y=(p.y-p.speed+height)%height;}if(!reduce.matches&&!document.hidden)raf=requestAnimationFrame(draw);}
 function start(){cancelAnimationFrame(raf);draw();}resize();start();window.addEventListener('resize',()=>{resize();start();});reduce.addEventListener?.('change',start);document.addEventListener('visibilitychange',()=>{if(!document.hidden)start();else cancelAnimationFrame(raf);});}
async function boot(){
 document.addEventListener('click',e=>{handleClick(e).catch(err=>notify(err.message));});
 document.addEventListener('input',handleInput);
 document.addEventListener('change',e=>{if(e.target.id==='image-picker')openImage(e.target.files?.[0]);if(e.target.id==='import-audio')importAudio(e.target.files?.[0]);});
 document.addEventListener('keydown',e=>{
  if(e.target.matches('label[for="image-picker"],label[for="import-audio"]')&&(e.key==='Enter'||e.key===' ')){e.preventDefault();document.getElementById(e.target.htmlFor)?.click();return;}
  if(state.page==='theater'&&!e.target.closest('input,textarea,select,button,a')&&(e.key==='ArrowRight'||e.key==='ArrowLeft')){e.preventDefault();nextScene(e.key==='ArrowRight'?1:-1);}
 });
 window.addEventListener('hashchange',handleNavigation);
 window.addEventListener('beforeunload',e=>{if(state.editorDirty){e.preventDefault();e.returnValue='';}});
 try{[state.works,state.takes]=await Promise.all([localRepository.listWorks(),localRepository.listTakes()]);state.works.sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)));state.takes.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));}
 catch(err){state.storageAvailable=false;notify('IndexedDBが使えません：保存機能を利用できません');}
 if(!location.hash)location.hash='#/lobby';
 const initial=routeInfo();state.page=initial.page;state.id=initial.id;if(state.page==='create')loadEditor(initial.id);
 if(state.page==='theater'){state.playerActor.send('OPEN');render();const token=state.playerEpoch.next();prefetchFirst(getWork(state.id),token);}else render();
 ambientCanvas();
}
boot().catch(err=>{main.innerHTML=missing('画面の初期化に失敗しました');console.error(err);});
