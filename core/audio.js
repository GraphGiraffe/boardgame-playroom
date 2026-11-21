(function (root, factory) {
  'use strict';
  const Audio = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = Audio;
  root.TabletopAudio = Audio;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const LIMITS = {groups:8, voices:32, sequence:12, notes:24, duration:5, sampleBytes:2 * 1024 * 1024};
  const PRESENTATION_SOUND_START_MS=120;
  const now=()=>root.performance?.now?.()??Date.now();
  const WARM_SAMPLE_LIMIT=8;
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
    constructor({enabled=false, volume=.6, contextFactory, diagnostics=null}={}) {
      this._diagnostics=diagnostics;this.enabled=!!enabled;this.volume=clamp(volume,0,1,.6);
      this._factory=contextFactory || (()=>{const Context=root.AudioContext || root.webkitAudioContext;return Context?new Context():null;});
      this._context=null;this._contextPromise=null;this._master=null;this._graph=[];this._packs=new Map();this._buffers=new Map();this._noise=null;
      this._groups=new Set();this._voices=new Set();this._generation=0;this._sequence=null;this._waits=new Set();this._preparing=0;this._resumePromise=null;
    }
    get busy() {return this._groups.size>0||this._preparing>0;}
    setEnabled(enabled) { this.enabled=!!enabled;if(!this.enabled){this._warming=null;this.stop();}return this; }
    setVolume(volume) {
      this.volume=clamp(volume,0,1,this.volume);
      if(this._master){try{this._master.gain.setTargetAtTime(this.volume*.55,this._context.currentTime,.012);}catch(_){this._master.gain.value=this.volume*.55;}}
      return this;
    }
    unlock() {
      if(!this.enabled)return Promise.resolve(false);
      // Construct and resume inside the trusted gesture, before any microtask.
      const attach=context=>{
        if(!context)throw new Error('Web Audio unavailable');
        const master=context.createGain();master.gain.value=this.volume*.55;
        const graph=[master];let tail=master;
        if(context.createDynamicsCompressor){const compressor=context.createDynamicsCompressor();compressor.threshold.value=-10;compressor.knee.value=8;compressor.ratio.value=12;compressor.attack.value=.003;compressor.release.value=.09;tail.connect(compressor);graph.push(compressor);tail=compressor;}
        if(context.createWaveShaper){const limiter=context.createWaveShaper(),curve=new Float32Array(1024);for(let i=0;i<curve.length;i++)curve[i]=Math.tanh((2*i/(curve.length-1)-1)*1.4)*.92;limiter.curve=curve;limiter.oversample='2x';tail.connect(limiter);graph.push(limiter);tail=limiter;}
        tail.connect(context.destination);this._context=context;this._master=master;this._graph=graph;return context;
      };
      const resume=context=>{
        if(!this.enabled||!context)return Promise.resolve(false);
        if(context.state==='suspended'||context.state==='interrupted'){
          // A gesture-end retry is allowed even while gesture-start resume waits.
          const pending=Promise.resolve(context.resume()).then(()=>this.enabled&&context.state==='running',()=>false);
          this._resumePromise=pending;return pending;
        }
        return Promise.resolve(context.state==='running');
      };
      try{
        if(this._context?.state==='closed'){this._context=null;this._contextPromise=null;this._resumePromise=null;this._buffers.clear();this._noise=null;}
        if(!this._contextPromise){
          const created=this._factory();
          if(created?.then){this._contextPromise=Promise.resolve(created).then(attach).catch(()=>{this._contextPromise=null;return null;});return this._contextPromise.then(resume);}
          attach(created);this._contextPromise=Promise.resolve(this._context);
        }
        return this._context?resume(this._context):this._contextPromise.then(resume);
      }catch(_){if(!this._context)this._contextPromise=null;return Promise.resolve(false);}
    }
    prepare({signal,timeoutMs=1000}={}) {
      // Only wait for an unlock already initiated by a gesture. Never queue a
      // startup cue until a later interaction or indefinitely stall gameplay.
      if(signal?.aborted||!this.enabled||!this.volume||!this._contextPromise)return Promise.resolve(false);
      if(this._context?.state==='running')return Promise.resolve(true);
      const generation=this._generation;this._preparing++;
      return new Promise(resolve=>{
        let settled=false;
        const finish=value=>{if(settled)return;settled=true;clearTimeout(wait.timer);this._waits.delete(wait);signal?.removeEventListener('abort',abort);this._preparing--;resolve(!!value&&generation===this._generation&&this.enabled&&this.volume>0&&!signal?.aborted&&this._context?.state==='running');};
        const abort=()=>finish(false),wait={resolve:finish,timer:setTimeout(()=>finish(false),clamp(timeoutMs,0,1500,1000))};
        this._waits.add(wait);signal?.addEventListener('abort',abort,{once:true});
        this._contextPromise.then(context=>context?.state==='running'||this._resumePromise||false).then(finish,()=>finish(false));
      });
    }
    registerPack(pack, sounds) {
      if(!idPattern.test(pack)||!sounds||typeof sounds!=='object'||Array.isArray(sounds))throw new TypeError('Invalid sound pack');
      const entries=Object.entries(sounds);if(entries.length>64)throw new RangeError('Too many pack sounds');
      const map=new Map(entries.map(([id,definition])=>{if(!idPattern.test(id))throw new TypeError('Invalid sound id');return[id,normalize(definition,id)];}));
      this._packs.set(pack,map);return this;
    }
    catalog(pack) { const map=new Map(base);for(const [id,definition]of this._packs.get(pack)||[])map.set(id,definition);return [...map].map(([id,definition])=>({id,label:definition.label})); }
    warmPack(pack) {
      const context=this._context,definitions=this._packs.get(pack);
      if(!this.enabled||!this.volume||!context||context.state==='closed'||!definitions||root.document?.hidden)return;
      if(this._warming?.definitions===definitions&&this._warming.context===context)return this._warming.done;
      const samples=[...new Set([...definitions.values()].map(sound=>sound.src).filter(Boolean))].slice(0,WARM_SAMPLE_LIMIT);
      const job={definitions,context};this._warming=job;
      // Use the same promise/buffer cache as playback. Never resume audio or
      // hold up a move to predecode a sample.
      job.done=(async()=>{
        for(const src of samples){
          await new Promise(resolve=>root.requestIdleCallback?root.requestIdleCallback(()=>resolve()):root.setTimeout(resolve,32));
          if(this._warming!==job)return;
          if(this._context!==context||context.state==='closed'||!this.enabled||!this.volume||root.document?.hidden){this._warming=null;return;}
          try{await this._decode(src,context);}catch(_){}
        }
      })();
      return job.done;
    }
    play(id, {pack, volume=1,signal,phase,startDeadlineMs}={}) {
      if(signal?.aborted||!this.enabled||!this.volume||!clamp(volume,0,1,1)||!this._context||this._context.state!=='running')return Promise.resolve(false);
      const definition=this._packs.get(pack)?.get(id)||base.get(id);if(!definition)return Promise.resolve(false);
      const generation=this._generation,context=this._context;
      let resolve;const promise=new Promise(done=>{resolve=done;});
      const group={diagnosticStart:this._diagnostics?.begin()??null,generation,done:false,sources:new Set(),nodes:new Set(),
        timer:null,resolve,context,definition,scale:clamp(volume,0,1,1),position:0,startedAt:null,paused:false,rate:1};
      this._groups.add(group);
      const abort=()=>this._finish(group,false);signal?.addEventListener('abort',abort,{once:true});group.detach=()=>signal?.removeEventListener('abort',abort);
      while(this._groups.size>LIMITS.groups)this._finish(this._groups.values().next().value,false);
      group.untrack=phase?.track?.({
        pause:()=>this._pauseGroup(group),
        resume:()=>{group.paused=false;if(group.duration!==undefined)this._startGroup(group);},
        rate:value=>{group.rate=value;},
        cancel:abort
      });
      const start=buffer=>{
        if(group.done||generation!==this._generation||!this.enabled||context.state!=='running'){this._finish(group,false);return;}
        group.buffer=buffer;
        group.duration=buffer?Math.min(buffer.duration,LIMITS.duration):Math.max(...definition.notes.map(n=>n.at+n.duration));
        if(!Number.isFinite(group.duration)||group.duration<=0){this._finish(group,false);return;}
        this._startGroup(group);
      };
      if(!definition.src)start(null);
      else{
        const cached=this._buffers.get(definition.src);
        if(cached&&typeof cached.then!=='function')start(cached);
        else{
          const deadline=startDeadlineMs?now()+startDeadlineMs:null;
          if(deadline!==null)group.timer=setTimeout(()=>this._finish(group,false),startDeadlineMs);
          this._decode(definition.src,context).then(buffer=>{
            // A decode microtask can run before an expired timer after a busy
            // frame. Check the actual deadline before scheduling a voice.
            if(deadline!==null&&now()>=deadline){this._finish(group,false);return;}
            clearTimeout(group.timer);group.timer=null;start(buffer);
          },()=>this._finish(group,false));
        }
      }
      return promise;
    }
    // A slow decode may warm the cache for later cues without holding an
    // accepted move or starting stale audio after its phase has passed.
    present(ids,options={}){
      return this.batch(ids,{...options,startDeadlineMs:PRESENTATION_SOUND_START_MS});
    }
    // A presentation group mixes its cues; it never interrupts another group.
    batch(ids,options={}) {
      if(!Array.isArray(ids))return Promise.resolve(false);
      return Promise.all([...new Set(ids)].slice(0,LIMITS.sequence).map(id=>this.play(id,options))).then(values=>values.some(Boolean));
    }
    async sequence(ids, options={}) {
      if(!Array.isArray(ids)||!ids.length||!this.enabled||options.signal?.aborted)return false;
      // Serial cues can replace one another. A game phase owns its own voices
      // and must keep playing when an interface starts a serial cue.
      this._sequence?.abort();
      const sequence=new AbortController(),signal=sequence.signal;
      const abort=()=>sequence.abort(),playback={...options,signal};
      this._sequence=sequence;
      options.signal?.addEventListener('abort',abort,{once:true});
      const list=ids.slice(0,LIMITS.sequence),gap=clamp(options.gapMs,0,250,45);let played=false;
      try{
        for(const [index,id] of list.entries()){
          played=(await this.play(id,playback))||played;
          if(signal.aborted)return false;
          if(index<list.length-1&&gap&&!await this._wait(gap,signal))return false;
        }
        return played;
      }finally{
        options.signal?.removeEventListener('abort',abort);
        if(this._sequence===sequence)this._sequence=null;
      }
    }
    stop() {
      this._diagnostics?.record('audio.stop',{groups:this._groups.size,voices:this._voices.size});
      this._generation++;
      this._sequence?.abort();
      for(const group of [...this._groups])this._finish(group,false);
      for(const wait of [...this._waits]){clearTimeout(wait.timer);wait.resolve(false);}this._waits.clear();
      return this;
    }
    _track(group, source, nodes) {
      group.sources.add(source);this._voices.add(source);for(const node of [source,...nodes])group.nodes.add(node);
      source.onended=()=>{group.sources.delete(source);this._voices.delete(source);for(const node of [source,...nodes]){group.nodes.delete(node);try{node.disconnect();}catch(_){}}
        if(!group.sources.size)this._finish(group,true);};
    }
    _startGroup(group) {
      if(group.done||group.paused||group.startedAt!==null)return;
      const {context,duration,position,rate,scale,buffer}=group;
      if(context!==this._context||context.state!=='running'){this._finish(group,false);return;}
      if(position>=duration){this._finish(group,true);return;}
      let notes=group.definition.notes;
      if(notes&&position>0)notes=notes.filter(n=>n.at+n.duration>position);
      while(this._voices.size+(notes?.length??1)>LIMITS.voices){
        const oldest=[...this._groups].find(g=>g!==group&&g.sources.size);
        if(!oldest)break;
        this._finish(oldest,false);
      }
      const at=context.currentTime+.005,remaining=(duration-position)/rate;
      group.startedAt=at;
      try{
        if(buffer){
          const source=context.createBufferSource(),gain=context.createGain();
          source.buffer=buffer;source.playbackRate.value=rate;source.connect(gain);gain.connect(this._master);
          gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(scale*.65,at+Math.min(.012,remaining/3));gain.gain.setValueAtTime(scale*.65,at+Math.max(remaining-.03,remaining/2));gain.gain.linearRampToValueAtTime(0,at+remaining);
          this._track(group,source,[gain]);source.start(at,position);source.stop(at+remaining);
        }else for(const note of notes)this._note(group,note,at);
        this._timeout(group,remaining);
      }catch(_){this._finish(group,false);}
    }
    _pauseGroup(group) {
      group.paused=true;
      if(group.startedAt===null)return;
      // Position is in media seconds. A rate change uses the old rate to
      // account for the elapsed interval before scheduling a new source.
      group.position=Math.min(group.duration,group.position+Math.max(0,group.context.currentTime-group.startedAt)*group.rate);
      group.startedAt=null;
      this._clearSources(group);
    }
    _note(group,n,start) {
      const {position,rate,scale}=group,elapsed=Math.max(0,position-n.at);
      const context=this._context,at=start+Math.max(0,n.at-position)/rate,end=at+(n.duration-elapsed)/rate,gain=context.createGain();
      const frequency=elapsed?n.frequency*Math.pow(n.to/n.frequency,elapsed/n.duration):n.frequency;
      let source,nodes=[gain];
      if(n.wave==='noise'){
        if(!this._noise){this._noise=context.createBuffer(1,Math.ceil(context.sampleRate*LIMITS.duration),context.sampleRate);const values=this._noise.getChannelData(0);for(let i=0;i<values.length;i++)values[i]=Math.random()*2-1;}
        source=context.createBufferSource();source.buffer=this._noise;source.playbackRate.value=rate;
        const filter=context.createBiquadFilter();filter.type='lowpass';filter.frequency.setValueAtTime(frequency,at);filter.frequency.exponentialRampToValueAtTime(n.to,end);source.connect(filter);filter.connect(gain);nodes.push(filter);
      }else{
        source=context.createOscillator();source.type=n.wave;source.frequency.setValueAtTime(frequency,at);source.frequency.exponentialRampToValueAtTime(n.to,end);source.connect(gain);
      }
      gain.connect(this._master);
      const floor=.0001,peak=Math.max(floor,n.gain*scale);
      if(elapsed<n.attack){
        gain.gain.setValueAtTime(floor+(peak-floor)*elapsed/n.attack,at);
        gain.gain.linearRampToValueAtTime(peak,at+(n.attack-elapsed)/rate);
      }else gain.gain.setValueAtTime(peak*Math.pow(floor/peak,(elapsed-n.attack)/(n.duration-n.attack)),at);
      gain.gain.exponentialRampToValueAtTime(floor,end);
      this._track(group,source,nodes);if(n.wave==='noise')source.start(at,elapsed);else source.start(at);source.stop(end+.005);
    }
    _timeout(group,duration) { group.timer=setTimeout(()=>this._finish(group,true),(duration+.15)*1000); }
    _clearSources(group) {
      clearTimeout(group.timer);group.timer=null;
      for(const source of group.sources){source.onended=null;try{source.stop();}catch(_){}this._voices.delete(source);}group.sources.clear();
      for(const node of group.nodes){try{node.disconnect();}catch(_){}}group.nodes.clear();
    }
    _finish(group,completed) {
      if(group.done)return;this._diagnostics?.end('audio.group',group.diagnosticStart,{completed,voices:group.sources.size});group.done=true;
      group.detach?.();group.untrack?.();this._groups.delete(group);this._clearSources(group);group.resolve(completed);
    }
    _wait(ms,signal) {
      if(signal.aborted)return Promise.resolve(false);
      return new Promise(resolve=>{
        const finish=completed=>{clearTimeout(timer);signal.removeEventListener('abort',abort);resolve(completed);};
        const abort=()=>finish(false),timer=setTimeout(()=>finish(true),ms);
        signal.addEventListener('abort',abort,{once:true});
      });
    }
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
      }).then(buffer=>{
        if(this._buffers.get(src)===decode)this._buffers.set(src,buffer);
        return buffer;
      },error=>{
        if(this._buffers.get(src)===decode)this._buffers.delete(src);
        throw error;
      });
      if(this._buffers.size>=32)this._buffers.delete(this._buffers.keys().next().value);
      this._buffers.set(src,decode);return decode;
    }
  }
  return TabletopAudio;
});
