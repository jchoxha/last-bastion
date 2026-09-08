'use client';
import {useEffect,useRef,useState} from 'react';
import * as THREE from 'three';
import {Mountain,Play,FolderOpen,SlidersHorizontal,ArrowLeft,Shield} from 'lucide-react';
import WorldLab from './world-lab';
import {generateWorld,type Settings} from '@/lib/world';
import {bastionSource} from '@/lib/bastion-source';
import {parseSave,SAVE_KEY,type SaveGame} from '@/lib/save-game';
const DEFAULT:Settings={seed:'MEGABONK',size:64,hilliness:.15,trees:.22,scale:1,dynamic:false};
type Session={id:number;settings:Settings;saved:SaveGame|null};
type GameWindow=Window & {bastion?:{pause:(paused:boolean)=>void;save:()=>boolean}};
export default function Bastion(){
 const [screen,setScreen]=useState<'menu'|'world'|'game'>('menu'),[settings,setSettings]=useState<Settings>(DEFAULT),[saved,setSaved]=useState<SaveGame|null>(null),[session,setSession]=useState<Session|null>(null),[started,setStarted]=useState(false),[notice,setNotice]=useState('');const iframe=useRef<HTMLIFrameElement>(null),timeout=useRef<ReturnType<typeof setTimeout>|null>(null);
 const notify=(message:string)=>{setNotice(message);if(timeout.current)clearTimeout(timeout.current);timeout.current=setTimeout(()=>setNotice(''),6500);};
 useEffect(()=>{try{const raw=localStorage.getItem(SAVE_KEY);if(raw)setSaved(parseSave(raw));}catch{notify('The saved game could not be read. You can still start a new run.');}return()=>{if(timeout.current)clearTimeout(timeout.current);};},[]);
 const menu=()=>{(iframe.current?.contentWindow as GameWindow|null)?.bastion?.pause(true);setScreen('menu');};
 const start=(load:SaveGame|null)=>{const config=load?load.config:{...settings,size:Math.max(64,settings.size),scale:settings.scale??1,dynamic:false};setSession({id:Date.now(),settings:config,saved:load});setStarted(false);setScreen('game');};
 useEffect(()=>{if(!session)return;const bridge={THREE,generateWorld,settings:session.settings,saved:session.saved,notify,started:()=>setStarted(true),menu,save:(value:SaveGame)=>{try{const raw=JSON.stringify(value);const checked=parseSave(raw);localStorage.setItem(SAVE_KEY,raw);setSaved(checked);notify('Game saved on this device.');return true;}catch{notify('Saving failed. Browser storage may be full or unavailable; keep this run open.');return false;}}};(window as Window & {__lastBastionBridge?:unknown}).__lastBastionBridge=bridge;if(iframe.current)iframe.current.srcdoc=bastionSource;return()=>{delete (window as Window & {__lastBastionBridge?:unknown}).__lastBastionBridge;};},[session]);
 const resume=()=>{setScreen('game');(iframe.current?.contentWindow as GameWindow|null)?.bastion?.pause(false);iframe.current?.focus();};
 return <div className="bastion-shell">
 {session&&<iframe key={session.id} ref={iframe} title="Last Bastion game" className={`game-frame ${screen==='game'?'':'game-paused'}`} allow="fullscreen"/>}
 {screen==='world'&&<><WorldLab initialSettings={settings} onConfigure={setSettings}/><button className="return-menu" onClick={menu}><ArrowLeft size={16}/> Main menu</button></>}
 {screen==='menu'&&<><div className="menu-backdrop"><WorldLab initialSettings={settings}/></div><div className="main-menu"><div className="menu-story"><span className="menu-kicker"><Shield size={17}/> A PROCEDURAL DEFENSE ROGUELIKE</span><h1>Last<br/><em>Bastion.</em></h1><p>Find your ground.<br/>Build your defenses. Hold the line.</p><div className="menu-rule"/><span className="menu-footnote">FOUR BASTIONS. TWENTY WAVES. ONE RUN.</span></div><nav className="menu-actions" aria-label="Main menu"><span className="menu-kicker">THE WILDS ARE WAITING</span>{session&&<button className="menu-choice resume" onClick={resume}><Play/><span>{started?'Resume game':'Continue setup'}<small>Return to your current session</small></span><b>↗</b></button>}<button className="menu-choice" onClick={()=>start(null)}><Shield/><span>New game<small>Choose Knight, Ranger, or Pyromancer</small></span><b>↗</b></button><button className="menu-choice" disabled={!saved} onClick={()=>saved&&start(saved)}><FolderOpen/><span>Load saved game<small>{saved?`${saved.classId} · wave ${saved.state.wave} · ${new Date(saved.savedAt).toLocaleString()}`:'No saved game on this device yet'}</small></span><b>↗</b></button><button className="menu-choice" onClick={()=>setScreen('world')}><SlidersHorizontal/><span>World gen<small>Shape the terrain for your next run</small></span><b>↗</b></button><div className="menu-settings"><Mountain size={17}/><p>Seed <strong>{settings.seed||'Random'}</strong> · {Math.max(64,settings.size)} × {Math.max(64,settings.size)}<br/>{(settings.scale??1).toFixed(2)}× terrain · {settings.hilliness.toFixed(2)} hilliness<small>Runs use at least 64 × 64 tiles to fit four bastions. Exploration-driven growth remains available in World Gen.</small></p></div><p className="save-note">Save anytime in-game. Autosaves every 30 seconds.<br/>Saves stay in this browser on this device.</p></nav></div></>}
 {notice&&<div className="app-notice" role="status">{notice}</div>}
 </div>;
}
