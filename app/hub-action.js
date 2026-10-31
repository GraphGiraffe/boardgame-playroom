/* One shared installation/update affordance. No network-room responsibilities. */
(function(root){
  root.PlayroomHubAction={mount({hasUpdates,report}){
    const PWA=root.PlayroomPWA;let visibleMode='';
    function sync(){
      const heading=document.querySelector('.intro-heading');
      const mode=hasUpdates()?'update':PWA?.canInstall?.()&&!PWA.standalone?'install':'';
      let button=document.querySelector('.hub-install-button');
      if(!heading||!mode){button?.remove();visibleMode='';return;}
      if(!button){button=document.createElement('button');button.type='button';button.className='btn hub-install-button hub-hero-action';heading.appendChild(button);}
      const phase=mode==='update'?(PWA.updateInfo?(PWA.updateInfo.download?.phase||'ready'):'available'):'';
      if(button.dataset.mode!==mode||button.dataset.updatePhase!==phase){
        button.dataset.updatePhase=phase;
        button.dataset.mode=mode;button.id=mode==='update'?'pwa-update-button':'pwa-install-button';
        if(mode==='update')button.dataset.command='show-updates';else delete button.dataset.command;
        const label=root.PlayroomMessages.text(mode==='update'?'ui.updates.open':'ui.network-ui.a8c0e74a6502');
        button.title=label;button.setAttribute('aria-label',label);
        const icons={available:'download',downloading:'sync',paused:'warning',ready:'check'};button.innerHTML=root.PlayroomGameScreen.icon(mode==='update'?(icons[phase]||'reset'):'install');button.title=button.ariaLabel=mode==='update'?root.PlayroomMessages.text('ui.updates.phase.'+phase):label;
      }
      const visible=heading.closest('.is-active')&&!document.querySelector('dialog[open],#modal-root>*');
      if(visible&&visibleMode!==mode&&!root.matchMedia('(prefers-reduced-motion: reduce)').matches&&!document.body.classList.contains('reduced-motion')){
        button.getAnimations().forEach(animation=>animation.cancel());
        const background=getComputedStyle(button).backgroundColor;
        button.animate([{backgroundColor:background},{backgroundColor:'#528a69',offset:.5},{backgroundColor:background}],{duration:800,iterations:3,easing:'ease-in-out'});
      }
      visibleMode=visible?mode:'';
    }
    const click=event=>{if(!event.target.closest('#pwa-install-button'))return;event.preventDefault();PWA.install().catch(report).finally(sync);};
    document.addEventListener('click',click);
    const events=['playroom:hub-rendered','playroom-install-available','playroom-installed','playroom-update-ready','playroom-update-progress'];
    events.forEach(name=>root.addEventListener(name,sync));
    const observer=new MutationObserver(sync);observer.observe(document.querySelector('#modal-root'),{childList:true});
    sync();
    return ()=>{observer.disconnect();document.removeEventListener('click',click);events.forEach(name=>root.removeEventListener(name,sync));};
  }};
})(globalThis);
