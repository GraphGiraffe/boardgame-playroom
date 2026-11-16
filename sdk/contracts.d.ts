/** Studio contract v1. Player application integration is a separate boundary. */
export type JSONValue = null | boolean | number | string | JSONValue[] | {[key:string]:JSONValue};
export type Command = {type:string; [key:string]:JSONValue};
export interface Position {playerCount:number; turn:number; status:'playing'|'finished'; winners:number[]; data:{[key:string]:JSONValue}; rng?:number; revision?:number}
export interface Projection {contractVersion:1; game:string; viewer:number; actor:number; audience:'public'|'player'; playerCount:number; turn:number; status:'playing'|'finished'; winners:number[]; data:{[key:string]:JSONValue}; actions:Command[]; events:JSONValue[]}
export interface Message {key:string; params?:{[key:string]:JSONValue | Message}}
export interface Choice {command:Command; visibility:'public'|'private'}
export interface Definition {
 contractVersion:1; id:string; minPlayers:number; maxPlayers:number;
 create(options:{playerCount:number;firstPlayer:number;rng:number;[key:string]:JSONValue}):Position | {position:Position;events:JSONValue[]};
 validate(position:Position):boolean;
 actions(position:Position,actor:number):Choice[];
 reduce(position:Position,actor:number,command:Command):{position:Position;events:JSONValue[];turnEnded?:boolean};
 project(position:Position,viewer:number):{[key:string]:JSONValue};
 result(position:Position):JSONValue;
 bot?(projection:Projection,actor:number,choices:Command[],memory:JSONValue,context:unknown):Command;
}
export interface Scene {
 contractVersion:1; id:string; family:string;
 players:({player:number;metrics:JSONValue[]}&{[key:string]:JSONValue})[];
 cells?:JSONValue[]; rows?:number|JSONValue[]; columns?:number; dice?:JSONValue[];
 geometry?:JSONValue; zones?:JSONValue[]; objects?:JSONValue[]; interactions?:JSONValue[];
}
export interface Presentation {
 metadata?:{name?:Message|string;rules?:Array<Message|string>;rulebook?:JSONValue;[key:string]:unknown};
 scene(projection:Projection):Scene;
 action?(command:Command,projection:Projection):Message|string;
 event?(event:JSONValue):JSONValue;
}
export interface Diagnostic {code:string;role?:'rules'|'presentation';phase?:string;resource?:string;file?:string;line?:number;column?:number;frames?:{file:string;line:number;column:number}[];hint?:string}
export interface StudioDescriptor {contractVersion:1;rules:string[];presentation:string[];helpers?:string[];checkTypes?:boolean;options?:{[key:string]:JSONValue}}
declare global {
 const SDK:Readonly<{read<T extends object,K extends keyof T>(value:T,key:K):T[K];resource(id:string):{kind:'asset';id:string}}>;
 var PlayroomPackDefinition: Definition;
 var PlayroomPackPresentation: Presentation;
}
