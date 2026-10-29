'use client';
import {useEffect,useRef,useState} from 'react';
export default function Stage({src,alt,reduced=false,curtain=true}:{src:string;alt:string;reduced?:boolean;curtain?:boolean}){
 const canvas=useRef<HTMLCanvasElement>(null);const [fallback,setFallback]=useState(false);const [error,setError]=useState(false);
 useEffect(()=>{const el=canvas.current;const ctx=el?.getContext('2d');if(!el||!ctx){setFallback(true);return;}let frame=0,alive=true,loaded=false,start=0,previous=0;const samples:number[]=[];const picture=new Image();let width=0,height=0;const motion=()=>reduced||matchMedia('(prefers-reduced-motion: reduce)').matches;
 const draw=(time:number)=>{if(!alive||!width||!height)return;const elapsed=start?time-start:1000;const p=motion()?1:Math.min(1,elapsed/650);ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,el.width,el.height);const dpr=Math.min(devicePixelRatio||1,2);ctx.scale(dpr,dpr);ctx.fillStyle='#080f13';ctx.fillRect(0,0,width,height);
 if(loaded){const scale=Math.min(width/picture.width,height/picture.height);const w=picture.width*scale,h=picture.height*scale;ctx.globalAlpha=motion()?1:Math.min(1,p*2);ctx.drawImage(picture,(width-w)/2,(height-h)/2,w,h);ctx.globalAlpha=1;}
 if(curtain&&p<1){const eased=1-Math.pow(1-p,3);const cw=width/2*(1-eased);ctx.fillStyle='#263336';ctx.fillRect(0,0,cw,height);ctx.fillRect(width-cw,0,cw,height);ctx.strokeStyle='#77543a';for(let x=0;x<cw;x+=18){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,height);ctx.stroke();ctx.beginPath();ctx.moveTo(width-x,0);ctx.lineTo(width-x,height);ctx.stroke();}}
 if(p<1){if(previous)samples.push(time-previous);previous=time;frame=requestAnimationFrame(draw)}else{el.dataset.animationFrames=String(samples.length);el.dataset.meanFrameMs=samples.length?(samples.reduce((a,b)=>a+b,0)/samples.length).toFixed(2):'0';el.dataset.animating='false';}
 };
 const resize=()=>{const r=el.getBoundingClientRect();width=r.width;height=r.height;const dpr=Math.min(devicePixelRatio||1,2);el.width=Math.round(width*dpr);el.height=Math.round(height*dpr);if(loaded){cancelAnimationFrame(frame);frame=requestAnimationFrame(draw)}};
 const observer=new ResizeObserver(resize);observer.observe(el);resize();setError(false);picture.onload=()=>{if(!alive)return;loaded=true;start=motion()?0:performance.now();previous=0;el.dataset.animating=String(!motion());frame=requestAnimationFrame(draw)};picture.onerror=()=>{if(alive)setError(true)};picture.src=src;
 return()=>{alive=false;cancelAnimationFrame(frame);observer.disconnect();picture.onload=null;picture.onerror=null;picture.src='';};
 },[src,reduced,curtain]);
 return <div className="stage-surface"><canvas ref={canvas} role="img" aria-label={alt} style={{display:fallback?'none':undefined}}/>{fallback&&<img src={src} alt={alt} className="stage-fallback"/>}{error&&<p className="stage-error" role="alert">画像を読み込めませんでした。ページを再読み込みしてください。</p>}</div>;
}
