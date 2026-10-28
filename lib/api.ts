import {z} from 'zod';
import {DomainError,requireOwner,sniffMedia,workInput,dubInput,validateTimeline,type Work,type Take} from './domain';
const now=()=>new Date().toISOString();const id=()=>crypto.randomUUID();
const sampleAssets=new Set(['sample:lantern-station','sample:lantern-bridge','sample:morning-station']);
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
const error=(status:number,message:string):never=>{throw new DomainError(status,message)};
async function readJson(req:Request){const bytes=await readBody(req,512*1024);try{return JSON.parse(new TextDecoder().decode(bytes))}catch{return error(400,'入力形式が正しくありません')}}
async function readBody(req:Request,max:number){const reader=req.body?.getReader();if(!reader)return error(400,'データがありません');const chunks:Uint8Array[]=[];let length=0;while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>max){await reader.cancel();return error(413,`このファイルは受付サイズ（${Math.round(max/1024/1024)} MB）を超えています`)}chunks.push(value)}const data=new Uint8Array(length);let p=0;for(const c of chunks){data.set(c,p);p+=c.length}return data;}
type Row=Record<string,any>;
export async function handleApi(req:Request,env:{DB?:D1Database;BUCKET?:R2Bucket;SCENE_MODERATOR_IDS?:string},userId:string|null){
 try{
 const path=new URL(req.url).pathname.replace(/^\/api\/?/,'').split('/').filter(Boolean);const url=new URL(req.url);const method=req.method;const DB=env.DB;const bucket=env.BUCKET;
 if(!DB||!bucket)return error(503,'保存サービスに接続できません。時間をおいて再試行してください');
 const one=async(sql:string,...args:any[])=>DB.prepare(sql).bind(...args).first<Row>();
 const all=async(sql:string,...args:any[])=>(await DB.prepare(sql).bind(...args).all<Row>()).results;
 const run=async(sql:string,...args:any[])=>DB.prepare(sql).bind(...args).run();
 const auth=()=>userId||error(401,'保存・投稿にはChatGPTでログインしてください');
 if(method!=='GET'&&method!=='HEAD'){
  const origin=req.headers.get('origin');const forwardedHost=req.headers.get('x-forwarded-host');const hosts=[url.host,forwardedHost].filter(Boolean);
  if(origin&&!hosts.includes(new URL(origin).host))return error(403,'別のサイトからの操作は許可されていません');
  if(req.headers.get('sec-fetch-site')==='cross-site')return error(403,'別のサイトからの操作は許可されていません');
 }
 const getWorkRow=async(workId:string)=>{const w=await one('SELECT * FROM works WHERE id=? AND deleted=0',workId);if(!w)return error(404,'作品が見つかりません');return w;};
 const canRead=(w:Row)=>w.visibility==='public'||w.owner_id===userId;
 const stats=async(type:string,target:string)=>{const r=await one('SELECT AVG(stars) average, COUNT(*) count FROM ratings WHERE target_type=? AND target_id=?',type,target);return {average:r?.average||0,count:r?.count||0}};
 const presentWork=async(w:Row,version?:Row)=>{const v=version||await one('SELECT * FROM work_versions WHERE id=?',w.current_version);if(!v)return error(404,'作品の版が見つかりません');const p=await one('SELECT display_name FROM profiles WHERE user_id=?',w.owner_id);return {...JSON.parse(v.content),id:w.id,versionId:v.id,allowDub:!!w.allow_dub,visibility:w.visibility,owned:w.owner_id===userId,author:p?.display_name||'旅の創作者',updatedAt:w.updated_at,rating:await stats('work',w.id)} as Work;};
 const takeShape=(t:Row):Take=>({id:t.id,workId:t.work_id,versionId:t.version_id,sceneId:t.scene_id,assetId:t.asset_id,duration:t.duration,label:t.label,sourceKind:t.source_kind,createdAt:t.created_at,markers:JSON.parse(t.markers||'[]')});
 const presentDub=async(d:Row)=>{const p=await one('SELECT display_name FROM profiles WHERE user_id=?',d.owner_id);return {...JSON.parse(d.content),id:d.id,owned:d.owner_id===userId,author:p?.display_name||'旅の演者',updatedAt:d.updated_at,rating:await stats('dub',d.id)}};
 const mayDub=async(workId:string,versionId:string)=>{const w=await getWorkRow(workId);if(w.visibility!=='public'||!w.allow_dub)return error(403,'この作品はアフレコを受け付けていません');const v=await one('SELECT * FROM work_versions WHERE id=? AND work_id=? AND published=1',versionId,workId);if(!v)return error(400,'公開済みの作品版を選んでください');return {w,v}};
 if(path[0]==='session'&&method==='GET')return json({signedIn:!!userId,moderator:!!userId&&!!env.SCENE_MODERATOR_IDS?.split(',').includes(userId)});
 if(path[0]==='assets'){
  if(path.length===1&&method==='POST'){
   const uid=auth();const mime=(req.headers.get('content-type')||'').split(';')[0];const image=mime.startsWith('image/');const bytes=await readBody(req,image?12*1024*1024:25*1024*1024);
   if(!sniffMedia(bytes,mime))return error(415,'静止画JPEG / PNG / WebP、または対応する音声ファイルを選んでください。アニメーション画像は使用できません');
   const assetId=id(),key=`assets/${assetId}`;await bucket.put(key,bytes,{httpMetadata:{contentType:mime}});try{await run('INSERT INTO assets(id,owner_id,mime,size,object_key,created_at) VALUES(?,?,?,?,?,?)',assetId,uid,mime,bytes.length,key,now())}catch(e){await bucket.delete(key);throw e}return json({id:assetId,mime,size:bytes.length},201);
  }
  if(path[1]&&method==='GET'){
   const a=await one('SELECT * FROM assets WHERE id=?',path[1]);if(!a)return error(404,'素材がありません');
   const accessible=a.owner_id===userId||await one(`SELECT 1 FROM version_assets va JOIN work_versions v ON va.version_id=v.id JOIN works w ON w.id=v.work_id WHERE va.asset_id=? AND w.visibility='public' AND w.deleted=0 AND v.published=1 LIMIT 1`,a.id)||await one(`SELECT 1 FROM takes t JOIN dub_takes dt ON dt.take_id=t.id JOIN dubs d ON dt.dub_id=d.id JOIN works w ON w.id=d.work_id WHERE t.asset_id=? AND d.visibility='public' AND w.visibility='public' AND w.deleted=0 LIMIT 1`,a.id);
   if(!accessible)return error(404,'素材がありません');
   const range=req.headers.get('range');let byteRange:{offset:number;length:number}|undefined;if(range){const m=/^bytes=(\d*)-(\d*)$/.exec(range);if(!m||(!m[1]&&!m[2]))return error(416,'音声の範囲指定が正しくありません');const start=m[1]?Number(m[1]):Math.max(0,a.size-Number(m[2]));const end=m[1]?(m[2]?Math.min(Number(m[2]),a.size-1):a.size-1):a.size-1;if(start>=a.size||start>end||!Number.isSafeInteger(start)||!Number.isSafeInteger(end))return error(416,'音声の範囲指定が正しくありません');byteRange={offset:start,length:end-start+1};}const object=await bucket.get(a.object_key,byteRange?{range:byteRange}:undefined);if(!object)return error(404,'素材がありません');const h=new Headers({'Content-Type':a.mime,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Accept-Ranges':'bytes'});let status=200;
   if(range&&object.range&&'offset'in object.range){const r=object.range as {offset:number;length:number};h.set('Content-Range',`bytes ${r.offset}-${r.offset+r.length-1}/${object.size}`);h.set('Content-Length',String(r.length));status=206}else h.set('Content-Length',String(object.size));return new Response(object.body,{status,headers:h});
  }
 }
 if(path[0]==='works'){
  if(path.length===1&&method==='GET'){
   const mine=url.searchParams.get('mine')==='1';if(mine)auth();const list=await all(`SELECT * FROM works WHERE deleted=0 AND ${mine?'owner_id=?':"visibility='public'"} ORDER BY updated_at DESC LIMIT 200`,...(mine?[userId]:[]));return json(await Promise.all(list.map(w=>presentWork(w))));
  }
  if(path.length===1&&method==='POST'||path.length===2&&method==='PUT'){
   const uid=auth();const input=workInput.parse(await readJson(req));const old=path[1]?await getWorkRow(path[1]):null;if(old)requireOwner(old.owner_id,uid);if(old&&input.baseVersion!==old.current_version)return error(409,'別の画面で更新されています。保存前に作品を開き直してください');
   for(const scene of input.scenes){if(sampleAssets.has(scene.assetId))continue;const a=await one('SELECT * FROM assets WHERE id=? AND owner_id=?',scene.assetId,uid);if(!a||!a.mime.startsWith('image/'))return error(403,'使用できない画像が含まれています');}
   const workId=old?.id||id(),versionId=id(),ts=now(),content=JSON.stringify({title:input.title,description:input.description,scenes:input.scenes});
   const statements:D1PreparedStatement[]=[];
   if(!old)statements.push(DB.prepare('INSERT INTO works(id,owner_id,current_version,visibility,allow_dub,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').bind(workId,uid,versionId,input.visibility,Number(input.allowDub),ts,ts));
   statements.push(DB.prepare('INSERT INTO work_versions(id,work_id,content,published,created_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM works WHERE id=? AND owner_id=? AND current_version=?)').bind(versionId,workId,content,Number(input.visibility==='public'),ts,workId,uid,old?.current_version||versionId));
   for(const assetId of new Set(input.scenes.map(s=>s.assetId).filter(a=>!sampleAssets.has(a))))statements.push(DB.prepare('INSERT INTO version_assets(version_id,asset_id) SELECT ?,? WHERE EXISTS(SELECT 1 FROM work_versions WHERE id=?)').bind(versionId,assetId,versionId));
   if(old)statements.push(DB.prepare('UPDATE works SET current_version=?,visibility=?,allow_dub=?,updated_at=? WHERE id=? AND owner_id=? AND current_version=? AND EXISTS(SELECT 1 FROM work_versions WHERE id=?)').bind(versionId,input.visibility,Number(input.allowDub),ts,workId,uid,old.current_version,versionId));
   const results=await DB.batch(statements);if(results[old?0:1].meta.changes!==1)return error(409,'更新が競合しました。作品を開き直してください');return json(await presentWork(await getWorkRow(workId)),old?200:201);
  }
  if(path[1]&&method==='GET'){
   const w=await getWorkRow(path[1]);if(!canRead(w))return error(404,'作品が見つかりません');const versionId=url.searchParams.get('version');const v=versionId?await one('SELECT * FROM work_versions WHERE id=? AND work_id=?',versionId,w.id):undefined;if(versionId&&(!v||!v.published&&w.owner_id!==userId))return error(404,'版が見つかりません');return json(await presentWork(w,v||undefined));
  }
  if(path[1]&&method==='DELETE'){
   const uid=auth(),w=await getWorkRow(path[1]);requireOwner(w.owner_id,uid);await run('UPDATE works SET deleted=1,visibility=?,allow_dub=0,updated_at=? WHERE id=? AND owner_id=?','draft',now(),w.id,uid);return json({ok:true,message:'作品を削除し、関連音声版の公開を停止しました。復旧・監査用の記録は保持されます。'});
  }
 }
 if(path[0]==='takes'){
  const uid=auth();
  if(method==='GET'){const rows=await all('SELECT * FROM takes WHERE owner_id=? AND work_id=? AND version_id=? ORDER BY created_at DESC',uid,url.searchParams.get('work'),url.searchParams.get('version'));return json(rows.map(takeShape));}
  if(method==='POST'){
   const v=z.object({workId:z.string(),versionId:z.string(),sceneId:z.string().nullable(),assetId:z.string(),duration:z.number().finite().positive(),label:z.string().min(1).max(100),markers:z.array(z.number().finite().nonnegative()).default([]),sourceKind:z.enum(['human','ai'])}).strict().parse(await readJson(req));const {v:version}=await mayDub(v.workId,v.versionId);if(v.sceneId&&!JSON.parse(version.content).scenes.some((s:any)=>s.id===v.sceneId))return error(400,'シーンがありません');const asset=await one('SELECT * FROM assets WHERE id=? AND owner_id=?',v.assetId,uid);if(!asset||!asset.mime.startsWith('audio/'))return error(403,'使用できない音声です');const takeId=id();const ts=now();await run('INSERT INTO takes(id,owner_id,work_id,version_id,scene_id,asset_id,duration,label,markers,source_kind,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',takeId,uid,v.workId,v.versionId,v.sceneId,v.assetId,v.duration,v.label,JSON.stringify(v.markers),v.sourceKind,ts);return json({...v,id:takeId,createdAt:ts},201);
  }
  if(method==='DELETE'&&path[1]){const t=await one('SELECT * FROM takes WHERE id=?',path[1]);if(!t)return error(404,'テイクがありません');requireOwner(t.owner_id,uid);if(await one('SELECT 1 FROM dub_takes WHERE take_id=?',t.id))return error(409,'保存した音声版に採用されています。先に音声版を削除してください');const a=await one('SELECT * FROM assets WHERE id=?',t.asset_id);await run('DELETE FROM takes WHERE id=? AND owner_id=?',t.id,uid);if(!await one('SELECT 1 FROM takes WHERE asset_id=?',t.asset_id)){await bucket.delete(a!.object_key);await run('DELETE FROM assets WHERE id=?',t.asset_id)}return json({ok:true});}
 }
 if(path[0]==='dubs'){
  if(method==='GET'&&path.length===1){const mine=url.searchParams.get('mine')==='1';if(mine)auth();const rows=await all(`SELECT d.* FROM dubs d JOIN works w ON d.work_id=w.id WHERE w.deleted=0 AND ${mine?'d.owner_id=?':"d.work_id=? AND d.visibility='public' AND w.visibility='public'"} ORDER BY d.updated_at DESC`,mine?userId:url.searchParams.get('work'));return json(await Promise.all(rows.map(presentDub)));}
  if(method==='GET'&&path[1]){const d=await one('SELECT * FROM dubs WHERE id=?',path[1]);if(!d)return error(404,'音声版がありません');const w=await getWorkRow(d.work_id);if(d.owner_id!==userId&&(d.visibility!=='public'||w.visibility!=='public'))return error(404,'音声版がありません');const selected=await all('SELECT t.* FROM takes t JOIN dub_takes dt ON t.id=dt.take_id WHERE dt.dub_id=?',d.id);return json({dub:await presentDub(d),takes:selected.map(takeShape),work:await presentWork(w,(await one('SELECT * FROM work_versions WHERE id=?',d.version_id))!)});}
  if(method==='POST'||method==='PUT'){
   const uid=auth(),input=dubInput.parse(await readJson(req));const {v}=await mayDub(input.workId,input.versionId);const allTakes=(await all('SELECT * FROM takes WHERE owner_id=? AND work_id=? AND version_id=?',uid,input.workId,input.versionId)).map(takeShape);validateTimeline(input,JSON.parse(v.content).scenes,allTakes);
   const old=path[1]?await one('SELECT * FROM dubs WHERE id=?',path[1]):null;if(path[1]&&!old)return error(404,'音声版がありません');if(old)requireOwner(old.owner_id,uid);
   const dubId=old?.id||id(),ts=now(),content=JSON.stringify(input);const statements:D1PreparedStatement[]=[];
   // Publication permission and ownership are checked in the write statement, so revocation cannot race a prior SELECT.
   if(old)statements.push(DB.prepare("UPDATE dubs SET content=?,visibility=?,updated_at=? WHERE id=? AND owner_id=? AND work_id=? AND version_id=? AND EXISTS(SELECT 1 FROM works WHERE id=? AND allow_dub=1 AND visibility='public' AND deleted=0)").bind(content,input.visibility,ts,dubId,uid,input.workId,input.versionId,input.workId));
   else statements.push(DB.prepare("INSERT INTO dubs(id,owner_id,work_id,version_id,content,visibility,created_at,updated_at) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM works WHERE id=? AND allow_dub=1 AND visibility='public' AND deleted=0)").bind(dubId,uid,input.workId,input.versionId,content,input.visibility,ts,ts,input.workId));
   const refs=input.mode==='continuous'?[input.continuousTakeId!]:input.timings.map(t=>t.takeId!);
   if(old)statements.push(DB.prepare('DELETE FROM dub_takes WHERE dub_id=? AND EXISTS(SELECT 1 FROM dubs WHERE id=? AND updated_at=?)').bind(dubId,dubId,ts));
   for(const t of new Set(refs))statements.push(DB.prepare('INSERT OR IGNORE INTO dub_takes(dub_id,take_id) SELECT ?,? WHERE EXISTS(SELECT 1 FROM dubs WHERE id=? AND updated_at=?)').bind(dubId,t,dubId,ts));
   const r=await DB.batch(statements);if(r[0].meta.changes!==1)return error(403,'作者のアフレコ許可が変更されました。公開できません');return json(await presentDub((await one('SELECT * FROM dubs WHERE id=?',dubId))!),old?200:201);
  }
  if(method==='DELETE'&&path[1]){const uid=auth(),d=await one('SELECT * FROM dubs WHERE id=?',path[1]);if(!d)return error(404,'音声版がありません');requireOwner(d.owner_id,uid);await DB.batch([DB.prepare('DELETE FROM dub_takes WHERE dub_id=?').bind(d.id),DB.prepare('DELETE FROM dubs WHERE id=? AND owner_id=?').bind(d.id,uid)]);return json({ok:true});}
 }
 if(path[0]==='ratings'&&method==='POST'){
  const uid=auth(),v=z.object({targetType:z.enum(['work','dub']),targetId:z.string(),stars:z.number().int().min(1).max(5)}).strict().parse(await readJson(req));const target=v.targetType==='work'?await one("SELECT id FROM works WHERE id=? AND visibility='public' AND deleted=0",v.targetId):await one("SELECT d.id FROM dubs d JOIN works w ON d.work_id=w.id WHERE d.id=? AND d.visibility='public' AND w.visibility='public' AND w.deleted=0",v.targetId);if(!target)return error(404,'評価できる公開作品がありません');await run('INSERT INTO ratings(target_type,target_id,user_id,stars,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(target_type,target_id,user_id) DO UPDATE SET stars=excluded.stars,updated_at=excluded.updated_at',v.targetType,v.targetId,uid,v.stars,now());return json(await stats(v.targetType,v.targetId));
 }
 if(path[0]==='profile'){
  const uid=auth();if(method==='GET'){const p=await one('SELECT display_name,bio FROM profiles WHERE user_id=?',uid);const received=await one("SELECT AVG(r.stars) average,COUNT(*) count FROM ratings r WHERE (r.target_type='work' AND r.target_id IN(SELECT id FROM works WHERE owner_id=? AND deleted=0)) OR(r.target_type='dub' AND r.target_id IN(SELECT id FROM dubs WHERE owner_id=?))",uid,uid);return json({name:p?.display_name||'旅の創作者',bio:p?.bio||'',received});}
  if(method==='PUT'){const v=z.object({name:z.string().trim().min(1).max(60),bio:z.string().max(1000)}).strict().parse(await readJson(req));await run('INSERT INTO profiles(user_id,display_name,bio,updated_at) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET display_name=excluded.display_name,bio=excluded.bio,updated_at=excluded.updated_at',uid,v.name,v.bio,now());return json(v);}
 }
 if(path[0]==='history'&&method==='GET'){const uid=auth();return json(await all('SELECT v.id,v.work_id,v.published,v.created_at,json_extract(v.content,\'$.title\') title FROM work_versions v JOIN works w ON v.work_id=w.id WHERE w.owner_id=? AND w.deleted=0 ORDER BY v.created_at DESC LIMIT 100',uid));}
 if(path[0]==='reports'&&method==='POST'){
  const uid=auth(),v=z.object({targetType:z.enum(['work','dub']),targetId:z.string(),reason:z.string().trim().min(5).max(2000)}).strict().parse(await readJson(req));const target=v.targetType==='work'?await one("SELECT id FROM works WHERE id=? AND visibility='public' AND deleted=0",v.targetId):await one("SELECT d.id FROM dubs d JOIN works w ON d.work_id=w.id WHERE d.id=? AND d.visibility='public' AND w.visibility='public' AND w.deleted=0",v.targetId);if(!target)return error(404,'通報対象がありません');await run('INSERT INTO reports(id,user_id,target_type,target_id,reason,status,created_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id,target_type,target_id) DO UPDATE SET reason=excluded.reason,status=\'open\'',id(),uid,v.targetType,v.targetId,v.reason,'open',now());return json({ok:true});
 }
 if(path[0]==='moderation'){
  const uid=auth();if(!env.SCENE_MODERATOR_IDS?.split(',').includes(uid))return error(403,'運営権限が必要です');if(method==='GET')return json(await all('SELECT id,target_type,target_id,reason,status,created_at FROM reports ORDER BY created_at DESC LIMIT 200'));
  if(method==='POST'){const v=z.object({reportId:z.string(),action:z.enum(['hide','dismiss'])}).parse(await readJson(req));const report=await one('SELECT * FROM reports WHERE id=?',v.reportId);if(!report)return error(404,'通報がありません');const statements:D1PreparedStatement[]=[];if(v.action==='hide')statements.push(DB.prepare(`UPDATE ${report.target_type==='work'?'works':'dubs'} SET visibility='draft' WHERE id=?`).bind(report.target_id));statements.push(DB.prepare("UPDATE reports SET status='resolved' WHERE id=?").bind(report.id),DB.prepare('INSERT INTO audit(id,actor,action,target_id,created_at) VALUES(?,?,?,?,?)').bind(id(),uid,v.action,report.target_id,now()));await DB.batch(statements);return json({ok:true});}
 }
 return error(404,'ページが見つかりません');
 }catch(e){if(e instanceof DomainError)return json({error:e.message},e.status);if(e instanceof z.ZodError)return json({error:e.issues[0]?.message||'入力を確認してください'},400);console.error('SCENE API error',e instanceof Error?e.message:'unknown');return json({error:'保存サービスでエラーが発生しました。入力を残したまま再試行してください'},500);}
}
