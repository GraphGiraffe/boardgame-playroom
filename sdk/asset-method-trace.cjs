'use strict';

// Keep the host inventory closed. A method name produced by a game must
// never become telemetry or be used as an instrumentation entry point.
const profiles = new Map([
  ['asset.js', ['Asset', ['ref', 'place', 'activate', 'describe', 'print']]],
  ['board-asset.js', ['BoardAsset', ['target', 'activateCell', 'layout']]],
  ['card-face-asset.js', ['CardFaceAsset', ['describe', 'reveal']]],
  ['card-asset.js', ['CardAsset', ['transfer', 'move']]],
  ['die-asset.js', ['DieAsset', ['print', 'reveal']]],
  ['token-asset.js', ['TokenAsset', ['atCell', 'atPoint', 'move']]],
  ['route-token-asset.js', ['RouteTokenAsset', ['walk']]],
  ['tile-asset.js', ['TileAsset', ['describe', 'onSlot']]],
  ['chain-tile-asset.js', ['ChainTileAsset', ['placement', 'reveal']]],
  ['score-table-asset.js', ['ScoreTableAsset', ['categoryRows']]],
].map(([file, profile]) => ['shared/presentation/' + file, profile]));
const profileNames = [...profiles.values()].map(([name])=>name);

function inventory(project) {
  const files = new Set([...project.dependencies,...project.helpers,...project.support,...project.presentation].map(({file}) => file));
  return [...files].flatMap(file => {
    const profile = profiles.get(file);
    return profile ? [{file, name:profile[0], methods:profile[1]}] : [];
  });
}

function traceAssetMethods() {
  const newBatch = () => ({methods:new Set(),printOverrides:new Set()});
  let batch = newBatch();
  function loaded(file, vm, evaluate) {
    const profile = profiles.get(file);
    if (!profile) return;
    const [name, methods] = profile;
    const record = vm.newFunction('observeAssetMethod', index => {
      const slot=vm.getNumber(index),method=methods[slot];
      if (method) batch.methods.add(name + '.' + method);
      else if(name==='Asset'&&profileNames[slot-methods.length])batch.printOverrides.add(profileNames[slot-methods.length]+'.print');
    });
    vm.setProp(vm.global, '__observeSDKAssetMethod', record);
    record.dispose();
    // Install the wrapper before the pack can inherit or bind a method.
    // Preserve its receiver so overrides and super calls keep their meaning.
    evaluate(`(()=>{
      const observe=globalThis.__observeSDKAssetMethod;
      delete globalThis.__observeSDKAssetMethod;
      const prototype=globalThis.Playroom${name}?.prototype;
      if(!prototype)return;
      const names=${JSON.stringify(profileNames)};
      const methods=${JSON.stringify(methods)};
      function observePrintOverride(receiver){
        let overridden=false;
        // Inspect the dispatch without reading a getter or reporting a
        // name supplied by the author. Only shared profile names leave the VM.
        for(let owner=receiver;owner;owner=Object.getPrototypeOf(owner)){
          const shared=names.findIndex(name=>owner===globalThis['Playroom'+name]?.prototype);
          if(shared>=0){if(overridden)observe(methods.length+shared);return;}
          if(!overridden){
            const descriptor=Object.getOwnPropertyDescriptor(owner,'print');
            if(descriptor){
              if(typeof descriptor.value!=='function')return;
              overridden=true;
            }
          }
        }
      }
      methods.forEach((method,index)=>{
        const descriptor=Object.getOwnPropertyDescriptor(prototype,method);
        if(typeof descriptor?.value!=='function'||!descriptor.configurable)return;
        const original=descriptor.value;
        let seen=false;
        Object.defineProperty(prototype,method,{...descriptor,value:{
          [method](...args){
            if(!seen){seen=true;observe(index);}
            if(${name==='Asset'}&&method==='describe')observePrintOverride(this);
            return Reflect.apply(original,this,args);
          }
        }[method]});
      });
    })()`, 'sdk/asset-method-trace.js').dispose();
  }
  function take() {
    const result = {methods:[...batch.methods],printOverrides:[...batch.printOverrides]};
    batch.methods.clear();
    batch.printOverrides.clear();
    return result;
  }
  function capture(render) {
    // A cached event owns only observations from its own presentation realm.
    const outer = batch;
    batch = newBatch();
    try {
      const value = render();
      return {value, observations:take()};
    } finally {
      batch = outer;
    }
  }
  function include(observations) {
    for(const method of observations.methods)batch.methods.add(method);
    for(const override of observations.printOverrides)batch.printOverrides.add(override);
  }
  return {loaded, take, capture, include};
}

module.exports = {inventory, traceAssetMethods};
