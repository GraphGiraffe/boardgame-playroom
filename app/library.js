// Web ports for the portable session library. No rules or history decoding here.
(function(root){
  'use strict';
  const Base=root.PlayroomSessionLibrary||(typeof require==='function'?require('../application/library.js'):null);
  const Localization=root.PlayroomLocalization||(typeof require==='function'?require('../presentation/localization.js'):null);
  class Library extends Base{
    constructor(storage,engine,Session,packs=null){
      super(storage,engine,Session,packs,{idFactory:()=>root.crypto?.randomUUID?.()||'game-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)});
      const catalogs=root.PlayroomAppearanceResources?.catalogs||{ru:require('../locales/ru/common.json')};
      this.translator=new Localization.Translator({catalogs});
    }
    list(){return super.list().map(row=>({...row,result:row.outcome?this.translator.text(row.outcome.winner===null?'sessions.draw':'sessions.winner',{player:row.players[row.outcome.winner]||''}):''}));}
    open(id){return this.localized(()=>super.open(id));}
    write(session,id){return this.localized(()=>super.write(session,id));}
    localized(operation){try{return operation();}catch(error){
      const key={LIBRARY_NOT_FOUND:'sessions.not-found',LIBRARY_REMOVED:'sessions.removed'}[error.code];
      if(key)error.message=this.translator.text(key);
      throw error;
    }}
  }
  root.PlayroomLibrary=Library;
  if(typeof module==='object'&&module.exports)module.exports=Library;
})(globalThis);
