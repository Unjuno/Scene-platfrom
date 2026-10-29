import type {Work} from './domain';
export const sampleWorks:Work[]=[
 {id:'sample-lantern',versionId:'sample-lantern-v1',title:'月待ち駅の、最後の灯り',description:'最終列車が去ったあと、名前のない駅に灯りがともる。忘れものを探す旅人と、夜を渡る小さな約束の物語。',author:'SCENE 制作室',visibility:'public',owned:false,allowDub:false,sample:true,updatedAt:'2026-10-28',scenes:[
 {id:'sample-s1',assetId:'sample:lantern-station',alt:'月と山々に囲まれた湖畔の駅。提灯の灯りの下に旅人が立つ。',cues:[{id:'c1',speaker:'語り',text:'誰も降りないはずの駅に、その夜、一人の旅人が降りた。'},{id:'c2',speaker:'旅人',text:'まだ、灯りを消さないでください。'}]},
 {id:'sample-s2',assetId:'sample:lantern-bridge',alt:'夜の湖を渡る橋。水面に提灯の灯りが映る。',cues:[{id:'c3',speaker:'語り',text:'橋の向こうで、誰かが同じ灯りを待っていた。'}]},
 {id:'sample-s3',assetId:'sample:morning-station',alt:'朝霧の山間の駅に、柔らかな夜明けの光が差す。',cues:[{id:'c4',speaker:'旅人',text:'また、この場所で。'}]}]},
 {id:'sample-bridge',versionId:'sample-bridge-v1',title:'水面にほどける約束',description:'言葉にできなかった想いを、灯りに託して。静かな一枚の物語。',author:'SCENE 制作室',visibility:'public',owned:false,allowDub:false,sample:true,updatedAt:'2026-10-28',scenes:[{id:'bridge-1',assetId:'sample:lantern-bridge',alt:'青い夜の湖に灯る、橋の提灯。',cues:[{id:'b1',speaker:'語り',text:'水面に映る灯りは、消えたのではなく、遠くへ流れていった。'}]}]},
 {id:'sample-morning',versionId:'sample-morning-v1',title:'夜明けを、もう一度',description:'長い夜が終わるとき、物語は新しい頁へ。',author:'SCENE 制作室',visibility:'public',owned:false,allowDub:false,sample:true,updatedAt:'2026-10-28',scenes:[{id:'morning-1',assetId:'sample:morning-station',alt:'山間の小さな駅と、柔らかな朝の光。',cues:[{id:'m1',speaker:'語り',text:'始発の音が、世界に朝を連れてきた。'}]}]}
];
