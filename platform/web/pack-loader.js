/* Trusted plugin execution adapter. A scope is registration staging, not a sandbox. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomPackLoader=api;})(globalThis,function(){
  'use strict';
  function execute(source,scope){
    if(typeof source!=='string'||!scope||typeof scope!=='object')throw Error('PACK_MODULE_INVALID');
    const module={exports:{}};
    Function('globalThis','module','exports','"use strict";\n'+source)(scope,module,module.exports);
    return module.exports;
  }
  return Object.freeze({execute});
});
