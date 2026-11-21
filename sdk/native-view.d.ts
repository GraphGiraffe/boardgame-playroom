import type {Command,JSONValue,Message,Projection,Result,Scene} from './contracts';

/** Authorized presentation envelope. Authority positions and checkpoints do not
 * belong to the renderer. The transport still validates every submitted command. */
export interface NativeFrame {
 /** Stable within a party and its history; changes on start/restore/reload. */
 sessionId?:string;
 projection:Projection & {revision?:number};
 scene:Scene;
 /** Public terminal ranking, omitted until the game has finished. */
 result?:Omit<Result,'metrics'> & {metrics:(Result['metrics'][number]&{label:Message|string;display?:'ranking';maximumFractionDigits?:number})[]};
 /** Presented public events; only validated current-event checkpoints appear here. */
 events?:({id:number;revision:number;player?:number|null;scene?:Scene;[key:string]:unknown})[];
 actions?:{command:Command;label?:Message|string;choice?:{confirmation?:Message|string;title?:Message|string;[key:string]:unknown}}[];
 participants?:{name:string;local?:boolean;primary?:boolean;bot?:boolean;avatar?:string}[];
 pack?:{id:string;version?:string;hash?:string;name?:Message|string;defaultLanguage?:string;skinFamilies?:string[]};
 metadata?:{name?:Message|string;cover?:{kind:'asset';id:string};deck?:string;sounds?:Record<string,JSONValue>};
 resources?:{assets:{file:string;mime:string;data:string;encoding?:'utf8'|'base64'}[]};
 history?:{index:number;count:number;reviewing:boolean};
 options?:{firstPlayer?:number};
 /** Projected event descriptor selected by the common live/history policy. */
 motion?:{actor:number|null;action:Command}|null;
 ui?:{[key:string]:JSONValue};
}

export interface NativeViewOptions {
 text?:(value:unknown)=>string;
 command:(command:Command)=>unknown|Promise<unknown>;
 preview?:(operation:JSONValue,command:Command)=>unknown|Promise<unknown>;
 restart?:()=>unknown|Promise<unknown>;
 error?:(error:unknown)=>void;
 hostCommand?:(command:string)=>void;
 /** Trusted host audio uses the presentation lifetime's cancellation signal. */
 audio?:{
  registerPack?:(pack:string,sounds:Record<string,unknown>)=>unknown;
  present?:(ids:string[],pack:string,signal:AbortSignal,phase:{
   track(handle:{pause():void;resume():void;rate(value:number):void;cancel():void}):void|(()=>void);
  })=>unknown|Promise<unknown>;
  batch?:(ids:string[],pack:string,signal:AbortSignal)=>unknown|Promise<unknown>;
  stop?:()=>void;
 };
}

/** Browser component; loaded with the canonical UI dependencies. No rule/pack
 * code is evaluated by this adapter. Game history uses update with another frame. */
export declare class GameView {
 constructor(host:HTMLElement,options:NativeViewOptions);
 /** The Studio host can supply one owned snapshot for an exact pack revision. */
 update(frame:NativeFrame,options?:{sharedPackData?:Readonly<Pick<NativeFrame,'metadata'|'resources'>>&{catalogs?:JSONValue}}):void;
 /** A transport processing its own request uses commands:false to avoid self-await. */
 whenIdle(options?:{commands?:boolean}):Promise<unknown>;
 setReducedMotion(value:boolean):void;
 preview(value:JSONValue[]):void;
 /** Opens the shared help for artwork already authorized in this viewport. */
 openHelp():void;
 closeHelp():void;
 destroy():void;
}

declare global {var PlayroomSDKGameView:typeof GameView;}
