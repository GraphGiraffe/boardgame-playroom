/* Browser persistence for player preferences; no gameplay or UI side effects. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomPlayerSettingsStore=api;})(globalThis,function(){
 'use strict';
 class PlayerSettingsStore {
  #storage;
  constructor(storageProvider){this.#storage=storageProvider;}
  read(){try{return JSON.parse(this.#storage()?.getItem('playroom.settings.v1')||'{}');}catch(_){return {};}}
  write(value){try{this.#storage()?.setItem('playroom.settings.v1',JSON.stringify(value));return true;}catch(_){return false;}}
 }
 return PlayerSettingsStore;
});
