/* One friend row for community and room invitations. Caller owns actions. */
(function(root){
 'use strict';
 function row(friend,{attrs='',actions='',openable=friend.accepted}={}){
  const H=root.PlayroomGameScreen,t=k=>root.PlayroomMessages.text('ui.community.'+k),f=friend;
  const status=f.accepted?t(f.online?(f.game?'in-game':'online'):'offline'):t(f.requested||f.id?(f.incoming?'incoming':'outgoing'):'not-friend');
  return `<li class="community-friend" data-entity="friend-${H.esc(f.userId||f.id)}"><button type="button" class="lobby-seat occupied friend-card" ${attrs} ${openable?'':'disabled'}>${root.PlayroomChatState.avatar('dm:'+f.userId,root.TabletopUI.avatar({name:f.nickname,avatar:f.avatar},0,{hidden:true}))}<span><strong>${H.esc(f.nickname)}</strong><small title="${H.esc(status)}">${f.accepted?`<i class="presence-dot ${f.online?'online':''}"></i>`:''}${H.esc(status)}</small></span></button>${actions}</li>`;
 }
 root.PlayroomFriendCard=Object.freeze({row});
})(globalThis);
