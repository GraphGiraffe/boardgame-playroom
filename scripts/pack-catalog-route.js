// This module is appended to the private Pages worker at packaging time.
// The private worker authenticates first and calls this through env.ASSETS.fetch.
const PlayroomPackRoute={
  async fetch(request,env){
    if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405,headers:{Allow:'GET, HEAD'}});
    if(!env.PLAYROOM_PACKS?.get)return new Response('Pack storage unavailable',{status:503,headers:{'Cache-Control':'no-store'}});
    const path=new URL(request.url).pathname;
    const prefix=typeof PlayroomPackCatalogPrefix==='string'?PlayroomPackCatalogPrefix:'';
    if(path==='/api/packs/catalog'){
      const pointer=await env.PLAYROOM_PACKS.get(prefix+'catalog/current.json');
      if(!pointer)return new Response('Catalog unavailable',{status:503,headers:{'Cache-Control':'no-store'}});
      let descriptor;
      try{descriptor=JSON.parse(await pointer.text());}catch(_){return new Response('Invalid catalog pointer',{status:503});}
      if(descriptor?.version!==1||!/^[a-f0-9]{64}$/.test(descriptor.sha256)||descriptor.key!==`${prefix}catalog/snapshots/${descriptor.sha256}.json`)return new Response('Invalid catalog pointer',{status:503});
      const snapshot=await env.PLAYROOM_PACKS.get(descriptor.key);
      if(!snapshot)return new Response('Catalog snapshot unavailable',{status:503,headers:{'Cache-Control':'no-store'}});
      const body=await snapshot.arrayBuffer(),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',body))].map(byte=>byte.toString(16).padStart(2,'0')).join('');
      if(hash!==descriptor.sha256)return new Response('Catalog checksum mismatch',{status:503,headers:{'Cache-Control':'no-store'}});
      return new Response(request.method==='HEAD'?null:body,{headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, max-age=0','X-Content-Type-Options':'nosniff',ETag:`"${hash}"`}});
    }
    const match=/^\/api\/packs\/files\/([a-z][a-z0-9_-]{0,63})\/([0-9A-Za-z.+-]+)\/([a-f0-9]{64})\.playroom-pack\.json$/.exec(path);
    if(!match)return new Response('Not found',{status:404,headers:{'Cache-Control':'no-store'}});
    const key=`files/${match[1]}/${match[2]}/${match[3]}.playroom-pack.json`,object=await env.PLAYROOM_PACKS.get(key);
    if(!object)return new Response('Pack not found',{status:404,headers:{'Cache-Control':'no-store'}});
    return new Response(request.method==='HEAD'?null:object.body,{headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, max-age=31536000, immutable','X-Content-Type-Options':'nosniff',ETag:`"${match[3]}"`}});
  }
};
