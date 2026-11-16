'use strict';
const {parse}=require('acorn');
const {loadProject}=require('./project.cjs');
const {auditAssets}=require('./assets.cjs');
const {encodeSource}=require('./artifact.cjs');
const ts=require('typescript');
const path=require('node:path');
const forbidden=new Set(['process','fetch','XMLHttpRequest','WebSocket','WebTransport','EventSource','document','window','navigator','localStorage','sessionStorage','indexedDB','caches','Worker','SharedWorker','importScripts','setTimeout','setInterval','Date','performance']);
function checkSource({file,source}){
 const diagnostics=[];let tree;
 try{tree=parse(source,{ecmaVersion:'latest',sourceType:'script',locations:true});}catch(error){return [{code:'SDK_SYNTAX_INVALID',file,line:error.loc.line,column:error.loc.column+1,hint:'Use browser-compatible script modules; imports are listed in sdk/project.json.'}];}
 function walk(node,parent){
  if(!node||typeof node!=='object')return;
  let resource=null;
  if(node.type==='ImportExpression')resource='dynamic import';
  if(node.type==='Identifier'&&forbidden.has(node.name)&&!(parent?.type==='MemberExpression'&&parent.property===node&&!parent.computed)&&!(parent?.type==='Property'&&parent.key===node&&!parent.shorthand))resource=node.name;
  if(node.type==='MemberExpression'&&node.object.type==='Identifier'&&['globalThis','root','window','self'].includes(node.object.name)){
   const key=node.computed?node.property.value:node.property.name;if(forbidden.has(key))resource=key;
  }
  if(node.type==='CallExpression'&&node.callee.type==='Identifier'&&node.callee.name==='require'&&typeof node.arguments[0]?.value==='string'&&!node.arguments[0].value.startsWith('.'))resource='require:external';
  if(resource)diagnostics.push({code:'SDK_ACCESS_DENIED',file,line:node.loc.start.line,column:node.loc.start.column+1,resource,hint:'Use the documented SDK capability and explicit deterministic inputs.'});
  for(const [key,value]of Object.entries(node)){if(['loc','start','end'].includes(key))continue;if(Array.isArray(value))for(const child of value)walk(child,node);else if(value&&typeof value==='object')walk(value,node);}
 }
 walk(tree,null);return diagnostics.slice(0,100);
}
function prepareProject(directory,options){
 const p=loadProject(directory,options),sources=[...p.dependencies,...p.rules,...p.helpers,...p.presentation];
 const diagnostics=sources.flatMap(checkSource),assets=auditAssets(p.root);
 if(p.descriptor.checkTypes===true){
  // Ignore project tsconfig/plugins and installation scripts. Check explicit
  // authored files with the canonical SDK declarations and no emit.
  const files=[...p.rules,...p.presentation,...p.helpers].map(f=>path.join(p.root,f.file));
  const config={allowJs:true,checkJs:true,noEmit:true,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,strict:true,skipLibCheck:true,types:[]};
  const declarations=path.join(__dirname,'contracts.d.ts'),allowed=new Set([...files,declarations,path.join(p.root,'sdk/contracts.d.ts')].map(name=>path.resolve(name)));
  const libraries=path.dirname(ts.getDefaultLibFilePath(config)),host=ts.createCompilerHost(config),read=host.readFile,exists=host.fileExists;
  const permitted=name=>{name=path.resolve(name);return allowed.has(name)||name.startsWith(libraries+path.sep);};
  const copiedDeclarations=path.join(p.root,'sdk/contracts.d.ts');
  host.readFile=name=>path.resolve(name)===copiedDeclarations?read(declarations):permitted(name)?read(name):undefined;host.fileExists=name=>path.resolve(name)===copiedDeclarations||permitted(name)&&exists(name);
  host.directoryExists=name=>[p.root,path.join(p.root,'sdk'),libraries].includes(path.resolve(name));
  host.realpath=name=>name;
  host.getSourceFile=(name,version)=>{const content=host.readFile(name);return content===undefined?undefined:ts.createSourceFile(name,content,version,true);};
  const program=ts.createProgram([...files,declarations],config,host);
  for(const d of ts.getPreEmitDiagnostics(program).slice(0,100)){const location=d.file&&d.start!==undefined?d.file.getLineAndCharacterOfPosition(d.start):null;diagnostics.push({code:'SDK_TYPE_'+d.code,file:d.file?path.relative(p.root,d.file.fileName).replaceAll('\\','/'):undefined,line:location?location.line+1:undefined,column:location?location.character+1:undefined,message:ts.flattenDiagnosticMessageText(d.messageText,' ').replace(/"[^"\r\n]*"/g,'"<literal>"').slice(0,500),hint:'Check the canonical SDK type at this location. String literal values are redacted.'});}
 }
 const artifact=encodeSource(p,assets);
 return {text:artifact.text,report:{status:diagnostics.length?'failed':'passed',id:p.manifest.id,hash:p.hash,sourceBytes:p.sourceBytes,diagnostics,warnings:[...artifact.budget.warnings,...assets.files.flatMap(file=>file.warnings)],budget:artifact.budget,assets,scope:'source-contract-assets-and-source-export-budget; not gameplay or player-pack verification'}};
}
function check(directory,options){return prepareProject(directory,options).report;}
module.exports={checkSource,check,prepareProject};
