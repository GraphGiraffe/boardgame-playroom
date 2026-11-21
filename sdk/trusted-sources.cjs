'use strict';
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

function trustedSources(){
 const authority=['events','random','bot-difficulty','model-inputs','model-runtime'];
 // Both roles validate values. Only the rules and bot realms run the model.
 return [
  {file:'sdk/core/model-values.js',source:read('core/model-values.js')},
  ...authority.map(name=>({file:'sdk/core/'+name+'.js',source:read('core/'+name+'.js'),authorityOnly:true})),
  {file:'sdk/common-format.js',source:'globalThis.PlayroomCommonCatalogs='+JSON.stringify(require('../locales/common.json'))+';\n'+read('presentation/common-format.js')},
  {file:'sdk/support.js',source:read('sdk/sdk-support.js')}
 ];
}

module.exports={trustedSources};
