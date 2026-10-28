import { z } from 'zod';
export const cueSchema = z.object({ id:z.string().min(1).max(100), speaker:z.string().max(80), text:z.string().max(8000) }).strict();
export const sceneSchema = z.object({ id:z.string().min(1).max(100), assetId:z.string().min(1).max(100), alt:z.string().max(300), cues:z.array(cueSchema) }).strict();
export const workInput = z.object({ title:z.string().trim().min(1,'作品名を入力してください').max(120), description:z.string().max(3000), scenes:z.array(sceneSchema).min(1,'画像を一枚以上追加してください'), allowDub:z.boolean(), visibility:z.enum(['draft','public']), rightsConfirmed:z.literal(true), baseVersion:z.string().nullable().optional() }).strict().superRefine((w,ctx)=>{if(new Set(w.scenes.map(s=>s.id)).size!==w.scenes.length)ctx.addIssue({code:'custom',message:'シーンIDが重複しています'});});
export type Cue = z.infer<typeof cueSchema>;
export type Scene = z.infer<typeof sceneSchema>;
export type Work = {id:string;versionId:string;title:string;description:string;scenes:Scene[];allowDub:boolean;visibility:'draft'|'public';owned:boolean;author:string;updatedAt:string;sample?:boolean;rating?:{average:number;count:number};};
export const timelineSchema = z.object({ sceneId:z.string(), start:z.number().finite().nonnegative(), duration:z.number().finite().positive(), takeId:z.string().nullable() }).strict();
export const dubInput = z.object({workId:z.string(),versionId:z.string(),title:z.string().trim().min(1).max(120),mode:z.enum(['scene','continuous']),sourceKind:z.enum(['human','ai']),timings:z.array(timelineSchema).min(1),continuousTakeId:z.string().nullable(),visibility:z.enum(['draft','public']),rightsConfirmed:z.literal(true)}).strict();
export type Timing = z.infer<typeof timelineSchema>;
export type Dub = z.infer<typeof dubInput> & {id:string;owned:boolean;author:string;updatedAt:string;rating?:{average:number;count:number};};
export type Take = {id:string;workId:string;versionId:string;sceneId:string|null;assetId:string;duration:number;label:string;sourceKind:'human'|'ai';createdAt:string;markers?:number[];};
export class DomainError extends Error {constructor(public status:number,message:string){super(message);}}
export function requireOwner(owner:string,user:string|null){if(!user)throw new DomainError(401,'ログインが必要です');if(owner!==user)throw new DomainError(403,'このデータを編集する権限がありません');}
export function validateTimeline(input:z.infer<typeof dubInput>,scenes:Scene[],takes:Take[]){
 if(input.timings.length!==scenes.length)throw new DomainError(400,'すべてのシーンに表示時間を設定してください');
 const takeMap=new Map(takes.map(t=>[t.id,t])); let end=0;
 input.timings.forEach((t,i)=>{if(t.sceneId!==scenes[i].id||Math.abs(t.start-end)>0.05)throw new DomainError(400,'画像の順序・開始時刻が一致しません');end=t.start+t.duration;
 if(input.mode==='scene'){const take=t.takeId?takeMap.get(t.takeId):null;if(!take||take.sceneId!==t.sceneId||take.sourceKind!==input.sourceKind||take.workId!==input.workId||take.versionId!==input.versionId)throw new DomainError(400,'各シーンのテイクを採用してください');if(t.duration+0.05<take.duration)throw new DomainError(400,'表示時間は音声より短くできません');}
 });
 if(input.mode==='continuous'){const take=input.continuousTakeId?takeMap.get(input.continuousTakeId):null;if(!take||take.sceneId!==null||take.sourceKind!==input.sourceKind||take.versionId!==input.versionId||take.workId!==input.workId)throw new DomainError(400,'通し録音のテイクを採用してください');if(end+0.05<take.duration)throw new DomainError(400,'タイムラインが音声より短くなっています');}
}
export function sniffMedia(bytes:Uint8Array,type:string){
 const a=(s:string)=>Array.from(s).map(c=>c.charCodeAt(0));const is=(v:number[],at=0)=>v.every((x,i)=>bytes[at+i]===x);const text=new TextDecoder('latin1').decode(bytes);
 if(type==='image/jpeg')return is([255,216,255]);
 if(type==='image/png')return is([137,80,78,71,13,10,26,10])&&!text.includes('acTL');
 if(type==='image/webp')return is(a('RIFF'))&&is(a('WEBP'),8)&&!text.includes('ANIM')&&!text.includes('ANMF');
 if(type==='audio/wav'||type==='audio/x-wav')return is(a('RIFF'))&&is(a('WAVE'),8);
 if(type==='audio/mpeg')return is(a('ID3'))||(bytes[0]===255&&(bytes[1]&224)===224);
 if(type==='audio/ogg')return is(a('OggS'));
 if(type==='audio/webm')return is([26,69,223,163]);
 if(type==='audio/mp4'||type==='audio/x-m4a')return is(a('ftyp'),4);
 return false;
}
export const assetUrl=(id:string)=>id.startsWith('sample:')?`/art/${id.slice(7)}.webp`:`/api/assets/${encodeURIComponent(id)}`;
export const audioUrl=(take:Take)=>assetUrl(take.assetId);
export const seconds=(n:number)=>`${Math.floor(n/60)}:${String(Math.floor(n%60)).padStart(2,'0')}`;
export function moveItem<T>(items:T[],from:number,to:number){if(to<0||to>=items.length)return items;const copy=[...items];copy.splice(to,0,copy.splice(from,1)[0]);return copy;}
