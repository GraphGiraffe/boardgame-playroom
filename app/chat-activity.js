/* Room visibility/read policy and counters: overlays are not the playing surface. */
(function(root){
 'use strict';let flight=null,timer=null,lastRoom='';
 const C=()=>root.PlayroomChatState,context=()=>root.PlayroomNetworkLibrary?.chatContext?.();
 function visible(){if(document.hidden||!document.hasFocus())return false;const modal=document.querySelector('#modal-root .modal');if(modal)return !!modal.querySelector('.lobby-shell');return !!document.querySelector('#app .table-shell:not([data-reaction-replay="true"]),#app .lobby-shell');}
 function base(ctx){return 'room:'+ctx.roomId+':'+ctx.participantId;}
 async function incoming(event){const ctx=context();if(!ctx||ctx.roomId!==event.roomId||event.entry.mine)return;const key=base(ctx)+':'+event.entry.scope,c=C().count(key);C().roomCounts(key,{...c,unread:(c.unread||0)+1});if(visible()){try{await ctx.call({type:'room-chat-seen',scope:event.entry.scope,through:event.entry.seq,only:true});const latest=C().count(key);C().roomCounts(key,{...latest,unread:Math.max(0,(latest.unread||0)-1)});}catch(_){}}}
 async function poll(){if(flight||document.hidden)return;const ctx=context();if(!ctx?.connected)return;const identity=base(ctx);lastRoom=identity;flight=(async()=>{try{const result=await ctx.call({type:'room-chat-summary'});if(base(context()||{})!==identity)return;const teamKey=result.teamId||'';const previous=C().get(identity+':team');if(previous.teamId!==teamKey){previous.rows=[];previous.cursor='0';previous.loaded=false;previous.scroll=null;previous.teamId=teamKey;}
  C().roomCounts(identity+':room',{unread:result.room||0});C().roomCounts(identity+':team',{unread:result.team||0,color:root.PlayroomChatComponents.teamColor(result.teamColor,result.teamColorRole)});
 }catch(_){}finally{flight=null;}})();await flight;}
 function schedule(){clearTimeout(timer);timer=setTimeout(async()=>{await poll();schedule();},4000);}
 root.addEventListener('focus',()=>void poll());document.addEventListener('visibilitychange',()=>{if(!document.hidden)void poll();});schedule();
 root.PlayroomChatActivity=Object.freeze({incoming,poll,visible});
})(globalThis);
