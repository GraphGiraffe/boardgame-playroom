/* One friend row for community and room invitations. Caller owns actions. */
(function(root){
 'use strict';
 function row(friend,{attrs='',actions='',rowActions='',openable=friend.accepted,status:explicitStatus=null}={}){
  const H=root.PlayroomGameScreen,t=k=>root.PlayroomMessages.text('ui.community.'+k),f=friend;
  const status=explicitStatus??(f.accepted?t(f.online?(f.game?'in-game':'online'):'offline'):t(f.requested||f.id?(f.incoming?'incoming':'outgoing'):'not-friend'));
  const front=`<button type="button" class="lobby-seat occupied friend-card" ${attrs} ${openable?'':'disabled'}>${root.PlayroomChatState.avatar('dm:'+f.userId,root.TabletopUI.avatar({name:f.nickname,avatar:f.avatar},0,{hidden:true}))}<span><strong>${H.esc(f.nickname)}</strong><small title="${H.esc(status)}">${f.accepted?`<i class="presence-dot ${f.online?'online':''}"></i>`:''}${H.esc(status)}</small></span></button>`;
  return `<li class="community-friend" data-entity="friend-${H.esc(f.userId||f.id)}">${rowActions?`<div class="social-row-actions">${rowActions}</div><div class="social-row-front">${front}<button type="button" class="icon-btn social-actions-toggle" data-social-actions-toggle aria-expanded="false" aria-label="Действия с ${H.esc(f.nickname)}">⋯</button></div>`:front}${actions}</li>`;
 }
 root.PlayroomFriendCard=Object.freeze({row});
})(globalThis);
