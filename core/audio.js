(function (root, factory) {
  'use strict';
  const Audio = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = Audio;
  root.TabletopAudio = Audio;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const LIMITS = {groups:8, voices:32, sequence:12, notes:24, duration:5, sampleBytes:2 * 1024 * 1024};
  const idPattern = /^[a-z][a-z0-9_.-]{0,63}$/;
  const clamp = (value, min, max, fallback) => Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Number(value))) : fallback;
  const defaults=root.PlayroomStandardSounds||(typeof require==='function'?require('./standard-sounds.js'):null);
  if(!defaults)throw Error('Standard sound resources are required');
  function normalize(definition, id) {
    if (!definition || typeof definition !== 'object') throw new TypeError('Invalid sound: ' + id);
    const label = typeof definition.label === 'string' ? definition.label.slice(0,120) : id;
    if (typeof definition.src === 'string') {
      if (!/^data:audio\/[\w.+-]+(?:;[\w=.+-]+)*;base64,[A-Za-z0-9+/=\s]+$/.test(definition.src) || definition.src.length > LIMITS.sampleBytes * 1.4) throw new TypeError('Sound samples must be small audio data URLs');
      return Object.freeze({label, src:definition.src});
    }
    if (!Array.isArray(definition.notes) || !definition.notes.length || definition.notes.length > LIMITS.notes) throw new TypeError('Invalid sound notes: ' + id);
    const notes = definition.notes.map(n => {
      if (!n || !Number.isFinite(n.frequency) || !Number.isFinite(n.duration)) throw new TypeError('Invalid sound note: ' + id);
      const at=clamp(n.at,0,LIMITS.duration-.02,0), duration=clamp(n.duration,.02,LIMITS.duration-at,.12);
      return Object.freeze({at,duration,frequency:clamp(n.frequency,40,12000,440),to:clamp(n.to,40,12000,n.frequency),gain:clamp(n.gain,0,.35,.15),attack:clamp(n.attack,.002,Math.min(.08,duration/3),.006),wave:['sine','triangle','square','sawtooth','noise'].includes(n.wave)?n.wave:'sine'});
    });
    return Object.freeze({label, notes:Object.freeze(notes)});
  }
  const base = new Map(Object.entries(defaults).map(([id,definition])=>[id,normalize(definition,id)]));
  class TabletopAudio {
    constructor({enabled=false, volume=.6, contextFactory}={}) {
      this.enabled=!!enabled;this.volume=clamp(volume,0,1,.6);
      this._factory=contextFactory || (()=>{const Context=root.AudioContext || root.webkitAudioContext;return Context?new Context():null;});
      this._context=null;this._contextPromise=null;this._master=null;this._graph=[];this._packs=new Map();this._buffers=new Map();this._noise=null;
      this._groups=new Set();this._voices=new Set();this._generation=0;this._waits=new Set();
    }
    setEnabled(enabled) { this.enabled=!!enabled;if(!this.enabled)this.stop();return this; }
    setVolume(volume) {
      this.volume=clamp(volume,0,1,this.volume);
      if(this._master){try{this._master.gain.setTargetAtTime(this.volume*.55,this._context.currentTime,.012);}catch(_){this._master.gain.value=this.volume*.55;}}
      return this;
    }
    async unlock() {
      if(!this.enabled)return false;
      try {
        if(this._context?.state==='closed'){this._context=null;this._contextPromise=null;this._buffers.clear();this._noise=null;}
        if(!this._contextPromise)this._contextPromise=Promise.resolve().then(()=>this._factory()).then(context=>{
          if(!context)throw new Error('Web Audio unavailable');
          const master=context.createGain();master.gain.value=this.volume*.55;
          const graph=[master];let tail=master;
          if(context.createDynamicsCompressor){const compressor=context.createDynamicsCompressor();compressor.threshold.value=-10;compressor.knee.value=8;compressor.ratio.value=12;compressor.attack.value=.003;compressor.release.value=.09;tail.connect(compressor);graph.push(compressor);tail=compressor;}
          if(context.createWaveShaper){const limiter=context.createWaveShaper(),curve=new Float32Array(1024);for(let i=0;i<curve.length;i++)curve[i]=Math.tanh((2*i/(curve.length-1)-1)*1.4)*.92;limiter.curve=curve;limiter.oversample='2x';tail.connect(limiter);graph.push(limiter);tail=limiter;}
          tail.connect(context.destination);this._context=context;this._master=master;this._graph=graph;return context;
        }).catch(()=>{this._contextPromise=null;return null;});
        const context=await this._contextPromise;
        if(!this.enabled||!context)return false;
        if(context.state==='suspended'||context.state==='interrupted')await context.resume();
        return this.enabled&&context.state==='running';
      }catch(_){return false;}
    }
    registerPack(pack, sounds) {
      if(!idPattern.test(pack)||!sounds||typeof sounds!=='object'||Array.isArray(sounds))throw new TypeError('Invalid sound pack');
      const entries=Object.entries(sounds);if(entries.length>64)throw new RangeError('Too many pack sounds');
      const map=new Map(entries.map(([id,definition])=>{if(!idPattern.test(id))throw new TypeError('Invalid sound id');return[id,normalize(definition,id)];}));
      this._packs.set(pack,map);return this;
    }
    catalog(pack) { const map=new Map(base);for(const [id,definition]of this._packs.get(pack)||[])map.set(id,definition);return [...map].map(([id,definition])=>({id,label:definition.label})); }
    play(id, {pack, volume=1}={}) {
      if(!this.enabled||!this.volume||!clamp(volume,0,1,1)||!this._context||this._context.state!=='running')return Promise.resolve(false);
      const definition=this._packs.get(pack)?.get(id)||base.get(id);if(!definition)return Promise.resolve(false);
      const generation=this._generation,context=this._context;
      let resolve;const promise=new Promise(done=>{resolve=done;});
      const group={generation,done:false,sources:new Set(),nodes:new Set(),timer:null,resolve};this._groups.add(group);
      while(this._groups.size>LIMITS.groups)this._finish(this._groups.values().next().value,false);
      const start=buffer=>{
        if(group.done||generation!==this._generation||!this.enabled||context.state!=='running'){this._finish(group,false);return;}
        const count=buffer?1:definition.notes.length;
        while(this._voices.size+count>LIMITS.voices){const oldest=[...this._groups].find(g=>g!==group&&g.sources.size);if(!oldest)break;this._finish(oldest,false);}
        try {
          const at=context.currentTime+.005,scale=clamp(volume,0,1,1);
          if(buffer){
            const source=context.createBufferSource(),gain=context.createGain(),duration=Math.min(buffer.duration,LIMITS.duration);
            if(!Number.isFinite(duration)||duration<=0)throw new Error('Empty sound');
            source.buffer=buffer;source.connect(gain);gain.connect(this._master);
            gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(scale*.65,at+Math.min(.012,duration/3));gain.gain.setValueAtTime(scale*.65,at+Math.max(duration-.03,duration/2));gain.gain.linearRampToValueAtTime(0,at+duration);
            this._track(group,source,[gain]);source.start(at);source.stop(at+duration);this._timeout(group,duration);
          }else{
            for(const n of definition.notes)this._note(group,n,at,scale);
            this._timeout(group,Math.max(...definition.notes.map(n=>n.at+n.duration)));
          }
        }catch(_){this._finish(group,false);}
      };
      if(definition.src)this._decode(definition.src,context).then(start,()=>this._finish(group,false));else start(null);
      return promise;
    }
    async sequence(ids, options={}) {
      this.stop();
      if(!Array.isArray(ids)||!ids.length||!this.enabled)return false;
      const generation=this._generation,list=ids.slice(0,LIMITS.sequence),gap=clamp(options.gapMs,0,250,45);let played=false;
      for(let index=0;index<list.length;index++){
        if(generation!==this._generation||!this.enabled)return false;
        played=(await this.play(list[index],options))||played;
        if(generation!==this._generation)return false;
        if(index<list.length-1&&gap&&!await this._wait(gap,generation))return false;
      }
      return played;
    }
    stop() {
      this._generation++;
      for(const group of [...this._groups])this._finish(group,false);
      for(const wait of [...this._waits]){clearTimeout(wait.timer);wait.resolve(false);}this._waits.clear();
      return this;
    }
    _track(group, source, nodes) {
      group.sources.add(source);this._voices.add(source);for(const node of [source,...nodes])group.nodes.add(node);
      source.onended=()=>{group.sources.delete(source);this._voices.delete(source);for(const node of [source,...nodes]){try{node.disconnect();}catch(_){}}
        if(!group.sources.size)this._finish(group,true);};
    }
    _note(group,n,start,scale) {
      const context=this._context,at=start+n.at,end=at+n.duration,gain=context.createGain();let source,nodes=[gain];
      if(n.wave==='noise'){
        if(!this._noise){this._noise=context.createBuffer(1,Math.ceil(context.sampleRate*LIMITS.duration),context.sampleRate);const values=this._noise.getChannelData(0);for(let i=0;i<values.length;i++)values[i]=Math.random()*2-1;}
        source=context.createBufferSource();source.buffer=this._noise;
        const filter=context.createBiquadFilter();filter.type='lowpass';filter.frequency.setValueAtTime(n.frequency,at);filter.frequency.exponentialRampToValueAtTime(n.to,end);source.connect(filter);filter.connect(gain);nodes.push(filter);
      }else{
        source=context.createOscillator();source.type=n.wave;source.frequency.setValueAtTime(n.frequency,at);source.frequency.exponentialRampToValueAtTime(n.to,end);source.connect(gain);
      }
      gain.connect(this._master);gain.gain.setValueAtTime(.0001,at);gain.gain.linearRampToValueAtTime(Math.max(.0001,n.gain*scale),at+n.attack);gain.gain.exponentialRampToValueAtTime(.0001,end);
      this._track(group,source,nodes);source.start(at);source.stop(end+.005);
    }
    _timeout(group,duration) { group.timer=setTimeout(()=>this._finish(group,true),(duration+.15)*1000); }
    _finish(group,completed) {
      if(group.done)return;group.done=true;clearTimeout(group.timer);this._groups.delete(group);
      for(const source of group.sources){source.onended=null;try{source.stop();}catch(_){}this._voices.delete(source);}group.sources.clear();
      for(const node of group.nodes){try{node.disconnect();}catch(_){}}group.nodes.clear();group.resolve(completed);
    }
    _wait(ms,generation) { return new Promise(resolve=>{const wait={resolve,timer:setTimeout(()=>{this._waits.delete(wait);resolve(generation===this._generation);},ms)};this._waits.add(wait);}); }
    _decode(src,context) {
      if(this._buffers.has(src))return this._buffers.get(src);
      const decode=new Promise((resolve,reject)=>{
        let timer=setTimeout(()=>reject(new Error('Audio decode timeout')),5000);
        const done=buffer=>{clearTimeout(timer);resolve(buffer);},fail=error=>{clearTimeout(timer);reject(error);};
        try {
          const encoded=src.slice(src.indexOf(',')+1),binary=root.atob?root.atob(encoded):root.Buffer.from(encoded,'base64').toString('binary');
          if(binary.length>LIMITS.sampleBytes)throw new Error('Audio sample too large');
          const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0)),result=context.decodeAudioData(bytes.buffer,done,fail);
          if(result?.then)result.then(done,fail);
        }catch(error){fail(error);}
      }).catch(error=>{this._buffers.delete(src);throw error;});
      if(this._buffers.size>=32)this._buffers.delete(this._buffers.keys().next().value);
      this._buffers.set(src,decode);return decode;
    }
  }
  return TabletopAudio;
});
