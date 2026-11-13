if(typeof module==='object'&&module.exports&&typeof require==='function')require("./messages.js");
(function (root, factory) {
  'use strict';
  const Components=root.PlayroomComponents||(typeof require==='function'?require('./component-assets.js'):null);
  const GameComponents=root.PlayroomGameComponents||(typeof require==='function'?require('./game-components.js'):null);
  const UI = factory(Components,GameComponents);
  if (typeof module === 'object' && module.exports) module.exports = UI;
  root.TabletopUI = UI;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Components,GameComponents) {
  'use strict';
  const tokenLayout=globalThis.PlayroomTokenLayout||(typeof require==='function'?require('./token-layout.js'):null);
  const {firstSymbol,numberPath,numberMark}=Components;
  let renderingPack=null;
  const assetVariant=family=>globalThis.PlayroomAssetResolver?.resolve(family,{packId:renderingPack})?.variant||null;
  const assetLayout=family=>globalThis.PlayroomAssetResolver?.resolve(family,{packId:renderingPack})?.stacking||null;
  const assetArt=(family,params,fallback)=>{params={...params,...(renderingPack?{packId:renderingPack}:{})};const output=globalThis.PlayroomAssetResolver?globalThis.PlayroomAssetResolver.render(family,params):fallback(params);const end=output.indexOf('>');return output.slice(0,end)+` data-asset-family="${esc(family)}"${family==='score-table'?'':` data-asset-params="${esc(JSON.stringify(params))}"`}`+output.slice(end);};
  const roundTokenArt=params=>assetArt('round-token',params||{},Components.roundTokenArt);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  const cloudArch='a4 4 0 0 1-.6-8A7 7 0 0 1 18 8a5 5 0 0 1 1 10';
  const cloudOutline='<path d="M6 18H5'+cloudArch+'h-1"/>';
  const cloudTransferOutline='<path d="M5 18'+cloudArch+'"/>';
  const icon = (name) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" focusable="false" data-ui-icon="'+esc(name)+'" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+({
    'link-off':'<path d="m3 3 18 18M9 7l2-2a5 5 0 0 1 7 7l-1 1M7 9l-2 2a5 5 0 0 0 7 7l1-1M8 16l2-2m4-4 2-2"/>',
    bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
    'bell-off':'<path d="m3 3 18 18M6 6c-1 2 0 8-3 11h14M10 21h4M10 2a6 6 0 0 1 8 6c0 2 0 4 1 5"/>',
    cloud:cloudOutline+'<path d="M6 18h12"/>',
    'file-export':'<path d="M17 8V6l-3-3H3v18h14v-4M12 3v5h5M22 13H10m4-4-4 4 4 4"/>',
    'file-import':'<path d="M17 8V6l-3-3H3v18h14v-4M12 3v5h5M10 13h12m-4-4 4 4-4 4"/>',
    'cloud-check':cloudOutline+'<path d="m8 15 3 3 5-6"/>',
    'cloud-upload':cloudTransferOutline+'<path d="M12 22V12m-4 4 4-4 4 4"/>',
    'cloud-download':cloudTransferOutline+'<path d="M12 11v11m-3-3 3 3 3-3"/>',
    app:'<g transform="rotate(-8 12 12)" fill="currentColor" stroke="none"><rect x="2" y="2" width="9" height="9" rx="2.5"/><rect x="13" y="2" width="9" height="9" rx="2.5"/><rect x="2" y="13" width="9" height="9" rx="2.5"/><rect x="13" y="13" width="9" height="9" rx="2.5"/></g>',
    warning:'<path d="m12 3 10 18H2Z"/><path d="M12 9v5m0 3h.01"/>',
    gear:'<path d="M9.47 5.05 L9.98 2.51 L14.02 2.51 L14.53 5.05 L16.76 6.33 L19.21 5.51 L21.23 9.00 L19.29 10.72 L19.29 13.28 L21.23 15.00 L19.21 18.49 L16.76 17.67 L14.53 18.95 L14.02 21.49 L9.98 21.49 L9.47 18.95 L7.24 17.67 L4.79 18.49 L2.77 15.00 L4.71 13.28 L4.71 10.72 L2.77 9.00 L4.79 5.51 L7.24 6.33Z"/><circle cx="12" cy="12" r="3.2"/>',
    sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
    moon:'<path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z"/>',
    sync:'<path d="M20 4v6h-6M4 20v-6h6M5.3 8a7 7 0 0 1 11.5-3L20 10M4 14l3.2 5A7 7 0 0 0 18.7 16"/>',
    'host-transfer':'<path d="m3 13-1-8 4 3 3-5 3 5 4-3-1 8H3Zm1 3h6m2 1h10m-4-4 4 4-4 4"/>',
    'cloud-sync':cloudOutline+'<path d="M9 13a3 3 0 0 1 5-1l1 1m0-3v3h-3m3 4a3 3 0 0 1-5 1l-1-1m0 3v-3h3"/>',
    'cloud-off':cloudOutline+'<path d="m8 13 8 8m0-8-8 8"/>',
    'cloud-alert':cloudOutline+'<path d="M12 11v5m0 4h.01"/>',
    cards:'<path d="M7.8 5H5.4A2.4 2.4 0 0 0 3 7.4v12a2.4 2.4 0 0 0 2.4 2.4h7.2a2.4 2.4 0 0 0 2.4-2.4"/><g transform="rotate(10 13 10.4)"><rect x="7" y="2" width="12" height="16.8" rx="2.4"/><path d="M10 8V5h3"/></g>',
    board:'<g transform="rotate(10 12 12)"><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/></g>',
    pieces:"<circle cx=\"9\" cy=\"14\" r=\"7\"/><path d=\"M7 5a7 7 0 1 1 12 11M5 14a4 4 0 0 0 4 4\"/>",
    solitaire:"<rect x=\"2\" y=\"3\" width=\"6\" height=\"9\" rx=\"1\"/><rect x=\"10\" y=\"3\" width=\"6\" height=\"9\" rx=\"1\"/><path d=\"M4 15v6h6m2-6v6h6m0-18h4v9h-4\"/>",
    words:"<path d=\"m3 19 6-14 6 14M5 14h8M17 5h5m-2.5 0v14\"/>",
    puzzle:"<path d=\"M3 3h6a3 3 0 1 1 6 0h6v6a3 3 0 1 0 0 6v6h-6a3 3 0 1 0-6 0H3v-6a3 3 0 1 1 0-6Z\"/>",
    duel:"<circle cx=\"6\" cy=\"6\" r=\"3\"/><circle cx=\"18\" cy=\"6\" r=\"3\"/><path d=\"M1 21v-5a5 5 0 0 1 10 0v5m2 0v-5a5 5 0 0 1 10 0v5\"/>",
    three:"<circle cx=\"12\" cy=\"5\" r=\"2.5\"/><circle cx=\"4\" cy=\"10\" r=\"2.5\"/><circle cx=\"20\" cy=\"10\" r=\"2.5\"/><path d=\"M8 19v-7a4 4 0 0 1 8 0v7M1 22v-6a3 3 0 0 1 6 0v6m10 0v-6a3 3 0 0 1 6 0v6\"/>",
    teams:"<circle cx=\"4\" cy=\"5\" r=\"2\"/><circle cx=\"9\" cy=\"8\" r=\"2\"/><circle cx=\"15\" cy=\"8\" r=\"2\"/><circle cx=\"20\" cy=\"5\" r=\"2\"/><path d=\"M1 17v-5a3 3 0 0 1 6 0m-1 7v-5a3 3 0 0 1 6 0v5m0 0v-5a3 3 0 0 1 6 0v5m-1-7a3 3 0 0 1 6 0v5M1 22h9m4 0h9\"/>",
    filter:'<path d="M3 4h18l-7 8v7l-4 2v-9Z"/>',
    star:"<path d=\"m12 2 3 6 7 1-5 5 1 8-6-4-6 4 1-8-5-5 7-1Z\"/>",
    shuffle:"<path d=\"M3 6h2c6 0 8 12 14 12h3m-4-4 4 4-4 4M3 18h2c2 0 4-2 6-5m2-3c2-3 4-4 6-4h3m-4-4 4 4-4 4\"/>",
    ship:"<path d=\"M2 16h20l-4 5H6ZM8 15V8h8v7m-4-7V3m0 2h5\"/>",
    sword:'<path d="M7 15 18 4l4-2-2 4L9 17Z" fill="currentColor" stroke="none"/><path d="M4 14l6 6M7 17l-4 4" stroke-width="2.2"/>',
    adjustDie:'<text x="12" y="12.5" text-anchor="middle" dominant-baseline="central" font-family="system-ui, sans-serif" font-weight="800" font-size="18" font-style="normal" fill="currentColor" stroke="none">±1</text>',
    lessDie:'<path d="M1 12h5"/><rect x="9" y="5" width="14" height="14" rx="3"/><circle cx="13" cy="9" r=".8"/><circle cx="19" cy="15" r=".8"/>',
    skipTurn:'<circle cx="12" cy="12" r="9"/><path d="m6 18 12-12"/>',
    secondDie:'<rect x="9" y="9" width="13" height="13" rx="3"/><path d="M15 5V3H2v13h3"/><circle cx="13" cy="13" r=".8"/><circle cx="18" cy="18" r=".8"/>',
    extraTurn:'<path d="M5 7a8 8 0 1 1-1 9M5 2v5h5m-1 6h6m-3-3v6"/>',
    shield:'<path d="M12 3 4 6v5c0 5 3 8 8 10 5-2 8-5 8-10V6Z"/>',
    takeCards:'<path d="m8 7-2-4 6 2 6-2-2 4M8 8h8M8 10c-3 3-5 6-5 9 0 2 3 2 9 2s9 0 9-2c0-3-2-6-5-9Z"/>',
    grid:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
    undo:'<path d="M9 5 4 10l5 5M4 10h9a6 6 0 0 1 0 12"/>',
    refresh:'<path d="M3 12a9 9 0 0 1 15.4-6.4L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.4 6.4L3 16M3 21v-5h5"/>',
    hint:'<path d="M9 18h6m-5 3h4M8 14a6 6 0 1 1 8 0c-1 1-1 2-1 3H9c0-1 0-2-1-3Z"/>',
    history:'<path d="M3 11a9 9 0 1 1 2.6 7M3 4v7h7M12 7v5l3 2"/>',
    help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4M12 17h.01"/>',
    full:'<path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5"/>',
    copy:'<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3"/>',
    palette:'<path d="M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1.4-3.4 1.5 1.5 0 0 1 1.1-2.6H18a3 3 0 0 0 3-3 9 9 0 0 0-9-9Z"/><circle cx="7.5" cy="10" r=".8" fill="currentColor"/><circle cx="10.5" cy="7" r=".8" fill="currentColor"/><circle cx="15" cy="7.5" r=".8" fill="currentColor"/>',
    settings:'<path d="M4 7h16M4 17h16"/><circle cx="8" cy="7" r="3" fill="currentColor"/><circle cx="16" cy="17" r="3" fill="currentColor"/>',
    play:'<path d="m9 5 10 7-10 7Z" fill="currentColor" stroke="none"/>',
    send:'<path d="m22 2-7 20-4-9-9-4 20-7Z"/><path d="M22 2 11 13"/>',
    reaction:'<circle cx="12" cy="12" r="9"/><path d="M8 14a4 4 0 0 0 8 0"/><path d="M8 9h.01M16 9h.01" stroke-width="3"/>',
    arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',
    back:'<path d="M19 12H5m5-5-5 5 5 5"/>',
    next:'<path d="m9 6 6 6-6 6"/>',
    prev:'<path d="m15 6-6 6 6 6"/>',
    'rules-contents':'<path d="M8 5h13M8 12h13M8 19h13"/><circle cx="3" cy="5" r="1"/><circle cx="3" cy="12" r="1"/><circle cx="3" cy="19" r="1"/>',
    up:'<path d="m6 15 6-6 6 6"/>',
    download:'<path d="M12 3v18m-6-6 6 6 6-6"/>',
    down:'<path d="m6 9 6 6 6-6"/>',
    close:'<path d="m6 6 12 12M6 18 18 6"/>',
    trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
    seatType:'<rect x="5" y="3" width="14" height="9" rx="2"/><path d="M4 12v5h16v-5M6 17v4M18 17v4"/>',
    replacement:'<path d="M4 7h15m-4-4 4 4-4 4M20 17H5m4-4-4 4 4 4"/>',
    player:'<circle cx="12" cy="7" r="3"/><path d="M5 21v-3a7 7 0 0 1 14 0v3"/>',
    bot:'<rect x="4" y="7" width="16" height="14" rx="3"/><path d="M12 3v4M2 12v5M22 12v5M9 17h6"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/>',
    'bot-easy':'<rect x="4" y="7" width="16" height="14" rx="4"/><path d="M12 3v4M2 12v5M22 12v5M8 16q4 4 8 0"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/>',
    'bot-medium':'<rect x="4" y="7" width="16" height="14" rx="3"/><path d="M12 3v4M2 12v5M22 12v5M9 17h6"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/>',
    'bot-hard':'<rect x="4" y="7" width="16" height="14" rx="3"/><path d="M8 7 6 3M16 7l2-4M2 12v5M22 12v5m-15-5 4 1m2 0 4-1M8 17h8m-5 0v2m2-2v2"/>',
    host:'<path d="m3 6 4 4 5-6 5 6 4-4-2 13H5ZM5 16h14"/>',
    lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4M12 14v3"/>',
    unlock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 7.5-2M12 14v3"/>',
    groupChat:'<path d="M15 14H8l-5 3V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2Z"/><path d="M8 18h8l5 3V9a2 2 0 0 0-2-2"/>',
    chat:'<path d="M20 15a3 3 0 0 1-3 3H9l-5 3V6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3Z"/><path d="M8 8h8M8 12h5"/>',
    mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/>',
    gamepad:'<path d="M7 7h10a4 4 0 0 1 4 3l1 6a3 3 0 0 1-5 3l-3-3h-4l-3 3a3 3 0 0 1-5-3l1-6a4 4 0 0 1 4-3Z"/><path d="M5 11h6M8 8v6"/><circle cx="16" cy="10" r=".7"/><circle cx="19" cy="13" r=".7"/>',
    wifi:'<path d="M2 8a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0m-11 4a6 6 0 0 1 8 0"/><circle cx="12" cy="20" r="1"/>',
    globe:'<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M5 6h14M5 18h14"/>',
    search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
    people:'<circle cx="9" cy="7" r="3"/><path d="M3 20v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 5"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    pause:'<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
    check:'<path d="m5 12 4 4L19 6"/>',
    hand:'<path d="M8 12V5a2 2 0 0 1 4 0v7-8a2 2 0 0 1 4 0v9-6a2 2 0 0 1 4 0v8c0 5-3 7-7 7-3 0-5-2-7-5l-3-4a2 2 0 0 1 3-3l2 2Z"/>',
    layers:'<path d="m12 3 9 5-9 5-9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5"/>',
    sound:'<path d="m11 4-6 5H2v6h3l6 5Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
    reset:'<path d="M3 10a9 9 0 1 1 2 8M3 3v7h7"/>',
    save:'<path d="M5 3h12l4 4v14H3V3Zm3 0v6h8V3M7 21v-8h10v8"/>',
    rules:'<path d="M12 5C8 2 4 2 2 3v16c3-1 7 0 10 2 3-2 7-3 10-2V3c-2-1-6-1-10 2Zm0 0v16M5 7l4 1m-4 3 4 1m6-4 4-1m-4 5 4-1"/>',
    edit:'<path d="m14 5 5 5M4 20l1-6L16 3a2.12 2.12 0 0 1 3 0l2 2a2.12 2.12 0 0 1 0 3L10 19Zm1-6 5 5"/>',
addPlayer:'<circle cx="9" cy="7" r="4"/><path d="M2 22v-3a7 7 0 0 1 14 0v3M19 7v8m-4-4h8"/>',
    stop:'<rect x="5" y="5" width="14" height="14" rx="2"/>',
        connect:'<rect x="2" y="4" width="12" height="10" rx="2"/><path d="M5 18h5M8 14v4M18 3v6M15 6h6"/><rect x="14" y="11" width="7" height="10" rx="1"/>',
    trophy:'<path d="M8 3h8v6a4 4 0 0 1-8 0ZM8 5H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4m-4 2v5m-4 3h8m-6-3h4v3"/>',
    camera:'<rect x="3" y="6" width="18" height="15" rx="3"/><path d="m7 6 2-3h6l2 3"/><circle cx="12" cy="13" r="4"/>',
    image:'<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1"/><path d="m3 17 5-5 4 4 3-3 6 6"/>',
    mic:'<rect x="9" y="2" width="6" height="13" rx="3"/><path d="M6 10v2a6 6 0 0 0 12 0v-2m-6 8v4m-4 0h8"/>',
    share:'<path d="M12 15V3m-4 4 4-4 4 4M6 11H3v10h18V11h-3"/>',
    install:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
    qr:'<g stroke-linejoin="miter" stroke-width="1.5"><rect x="3" y="3" width="6" height="6"/><rect x="15" y="3" width="6" height="6"/><rect x="3" y="15" width="6" height="6"/></g><g fill="currentColor" stroke="none"><path d="M5 5h2v2H5zM17 5h2v2h-2zM5 17h2v2H5zM12 12h3v3h-3zM18 12h3v3h-3zM15 15h3v3h-3zM12 18h3v3h-3zM18 18h3v3h-3z"/></g>',
    network:'<rect x="9" y="2" width="6" height="5" rx="1"/><rect x="2" y="17" width="6" height="5" rx="1"/><rect x="16" y="17" width="6" height="5" rx="1"/><path d="M12 7v5M5 17v-5h14v5"/>',
    text:'<path d="M4 5h16M4 10h16M4 15h10M4 20h7"/>',
    chevron:'<path d="m6 9 6 6 6-6"/>',
    dice:'<path d="M7 9H4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-1M5.5 12h.01M5.5 17h.01M10 17h.01"/><g transform="rotate(10 15 9)"><rect x="9" y="3" width="12" height="12" rx="2"/><path d="M12 6h.01M15 9h.01M18 12h.01"/></g>',
    first:firstSymbol(),
    exit:'<path d="M10 4H3v16h7M10 12h11m-4-4 4 4-4 4"/>',
    room:'<path d="M3 21V3h13v18M7 12h.01M16 7h5v14H3"/>',
    'eye-off':'<path d="m3 3 18 18M9.8 5.2A12 12 0 0 1 12 5c7 0 10 7 10 7a17 17 0 0 1-3.1 4.2M6.1 6.1A18 18 0 0 0 2 12s3 7 10 7a12 12 0 0 0 5.9-1.4M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    eye:'<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>'
  }[name] || '')+'</svg>';
  const actionAttr = (action,{allowLayoutChange=false}={}) => `data-action="${esc(JSON.stringify(action))}"${allowLayoutChange===true?' data-allow-layout-change="true"':''}`;
  const button=options=>GameComponents.button(options,{icon});
  const actionButton=(action,extra='')=>button({label:action.label||action.type,icon:action.icon||'',attrs:actionAttr(action),variant:'game',className:extra});
  const actionBar = (actions, hint) => `<div class="scene-actions">${actions.map(a => actionButton(a)).join('')}${!actions.length && hint ? `<span class="scene-hint">${esc(hint)}</span>` : ''}</div>`;
  // A canonical artboard scales as a whole, including typography and frame.
  // main/compact are trusted pack HTML; neither contains interaction handlers.
  const {art}=GameComponents;
  const countBadge=(value,label,options={})=>assetArt('counter',{value,label,...options},params=>GameComponents.countBadge(params.value,params.label,params));
  const shipSilhouette=size=>assetArt('ship',{size},params=>GameComponents.shipSilhouette(params.size));
  const back = (kind = 'card') => `<span data-size-role="${kind==='card'?'card':'back'}" class="piece-back ${esc(kind)}-back art-card" role="img" aria-label="${globalThis.PlayroomMessages.text("ui.ui.c13a6680430c")}">${assetArt('card-back',{},GameComponents.cardBack)}</span>`;
  // Display indices only: game indices and private hands remain unchanged.
  function seatOrder(count,viewer=-1,sequence=null){
    const own=Number.isInteger(viewer)&&viewer>=0&&viewer<count;
    const order=Array.isArray(sequence)&&sequence.length===count&&new Set(sequence).size===count&&sequence.every(index=>Number.isInteger(index)&&index>=0&&index<count)?sequence:Array.from({length:count},(_,index)=>index);
    const start=own?order.indexOf(viewer)+1:0;return Array.from({length:own?count-1:count},(_,i)=>order[(start+i)%count]);
  }
  function playerOrderPosition(state,index){return (index-(Number.isInteger(state.firstPlayer)?state.firstPlayer:0)+state.players.length)%state.players.length+1;}
  // Tight paint bounds include the 2px round stroke; preserve the original glyph scale.
  const participantGlyphBounds={"player":[4,3,16,19],"bot-easy":[1,2,22,20],"bot-medium":[1,2,22,20],"bot-hard":[1,2,22,20],"host":[2,3,20,17],"hand":[1.37868,1,19.62132,22],"grid":[2,2,20,20],"eye":[1,4,22,16],"replacement":[3,2,18,20]};
  function participantGlyph(name){const b=participantGlyphBounds[name];return b?icon(name).replace('viewBox="0 0 24 24"',`viewBox="${b.join(' ')}" style="--role-ink-width:${b[2]};--role-ink-height:${b[3]}"`):icon(name);}
  function participantIcon(person={}, {network=person.network===true,avatar=false}={}) {
    const role=person.role==='table'?'grid':person.role==='spectator'?'eye':person.bot?'bot':person.local&&!person.isHost&&!person.primary?'hand':'player';
    const host=network&&person.isHost;
    const glyphs=(avatar&&['bot','hand'].includes(role)?participantGlyph(role==='bot'?'bot-'+(['easy','medium','hard'].includes(person.botSettings?.difficulty)?person.botSettings.difficulty:'medium'):'hand'):['grid','eye'].includes(role)?participantGlyph(role):'')+(person.replacement?participantGlyph('replacement'):'');
    const status=network&&!person.bot&&!person.local&&typeof person.connected==='boolean'&&(person.connected||person.hasConnected||Number.isFinite(person.joinedAt))?(person.connected?'online':'offline'):'neutral';
    const label=globalThis.PlayroomMessages.text("ui.ui.be876869eb2e",{p0:String(({grid:globalThis.PlayroomMessages.text("ui.ui.da639244db1d"),eye:globalThis.PlayroomMessages.text("ui.ui.9ae566816505"),bot:globalThis.PlayroomMessages.text('ui.ui.aa691043b447')+' · '+globalThis.PlayroomMessages.text('ui.bot-settings.'+(person.botSettings?.difficulty||'medium')),hand:'Hotseat',player:network?globalThis.PlayroomMessages.text("ui.ui.c0562fc31385"):globalThis.PlayroomMessages.text("ui.ui.f54f58cf08df")})[role]),p1:String(host?globalThis.PlayroomMessages.text("ui.ui.32c4ccc5277d"):''),p2:String(status==='online'?globalThis.PlayroomMessages.text("ui.ui.b74f9d035c25"):status==='offline'?globalThis.PlayroomMessages.text("ui.ui.1a19fe2fb654"):''),p3:String(person.replacement?globalThis.PlayroomMessages.text("ui.ui.389e565be3fa"):'')});
    const replacement=person.replacement?globalThis.PlayroomMessages.text("ui.ui.f4420ff3ee50",{p0:String(person.replacement.previousName?' '+person.replacement.previousName:''),p1:String(person.replacement.accepted===false?globalThis.PlayroomMessages.text("ui.ui.b8f9ffc5334a"):'')}):'';
    return `<span class="participant-role is-${status}${avatar?' is-avatar-role':''}" data-role-placement="${avatar?'avatar':'name'}" data-participant-role="${role}"${role==='bot'?` data-bot-difficulty="${['easy','medium','hard'].includes(person.botSettings?.difficulty)?person.botSettings.difficulty:'medium'}"`:''} data-connection="${status}" role="${replacement?'button':'img'}" aria-label="${esc(replacement?`${label} · ${replacement}`:label)}" title="${esc(replacement||label)}"${replacement?` tabindex="0" data-tooltip="${esc(replacement)}" data-player-replacement="true"`:''}>${glyphs}</span>`;
  }
  function viewPreferences(game,viewer,key,value){const storageKey='playroom.view-preferences.v1:'+game+':'+viewer;try{const data=JSON.parse(globalThis.localStorage.getItem(storageKey)||'{}');if(key&&/^[a-zA-Z][a-zA-Z0-9]{0,39}$/.test(key)&&typeof value==='string'&&value.length<=80){data[key]=value;globalThis.localStorage.setItem(storageKey,JSON.stringify(data));}return data&&typeof data==='object'?data:{};}catch(_){return {};}}
  function validIndicators(items){return Array.isArray(items)&&items.length<=8&&items.every(x=>x&&['ship','cards','pieces','dice'].includes(x.icon)&&Number.isSafeInteger(x.value)&&x.value>=0&&typeof x.label==='string'&&(x.size===undefined||Number.isInteger(x.size)&&x.size>=1&&x.size<=8)&&(x.dragPiece===undefined||typeof x.dragPiece==='string'&&x.dragPiece.length<=40)&&(x.complete===undefined||typeof x.complete==='boolean')&&(x.selected===undefined||typeof x.selected==='boolean')&&(x.vertical===undefined||typeof x.vertical==='boolean'));}
  function indicators(items=[]){if(!validIndicators(items))throw Error('Invalid player indicators');return `<span class="player-indicators">${items.map(x=>`<span class="player-indicator${x.icon==='ship'&&x.size?' fleet-indicator':''}${x.icon==='ship'&&x.value===0?' is-empty':''}${x.complete?' is-complete':''}${x.selected?' is-selected':''}"${x.dragPiece?` data-select="${esc(x.dragPiece)}" data-drag-piece="${esc(x.dragPiece)}" data-drag-shape="${x.size}:${x.vertical?'v':'h'}"${x.icon==='ship'&&x.size?` data-drag-segment="${Math.floor(x.size/2)}"`:''} role="button" tabindex="0"`:''} aria-label="${esc(x.label)}: ${x.value}" title="${esc(x.label)}: ${x.value}">${x.icon==='ship'&&x.size?shipSilhouette(x.size):icon(x.icon)}${x.size&&x.icon!=='ship'?`<span class="indicator-size" aria-hidden="true">${'▪'.repeat(x.size)}</span>`:''}<b>${x.value}</b></span>`).join('')}</span>`;}
  const playerPalette=['#348653','#d75245','#387bbf','#d9b136','#9055b5','#e68532','#42b7d6','#d66b8f','#6371a0','#a76a45','#6d8f77','#8a6a58'];
  const playerColor=index=>'var(--color-seat-'+index+','+(playerPalette[index]||'hsl('+Math.round(index*137.508%360)+' 46% 50%)')+')';
  function avatar(person,index=0,{color=null,hidden=false}={}){
    const name=person.name||person.nickname||'',hotseat=!person.bot&&person.local&&!person.isHost&&!person.primary,symbolic=person.bot||hotseat,face=person.connectionOffline?icon('link-off'):symbolic?participantIcon(person,{avatar:true}):(globalThis.PlayroomAvatars?.content(person.avatar,name)??esc(Array.from(name)[0]||''))+participantIcon(person,{avatar:true});
    const label=name+(person.isHost?' · '+globalThis.PlayroomMessages.text('ui.ui.32c4ccc5277d'):'')+(person.connectionOffline?' · '+globalThis.PlayroomMessages.text('ui.resume.disconnected'):person.connectionRestored?' · '+globalThis.PlayroomMessages.text('ui.resume.connected'):'');
    return `<span class="avatar p${index}${symbolic?' is-symbol-avatar':''}${person.bot?' is-bot-avatar':''}${hotseat?' is-hotseat-avatar':''}${person.isHost?' is-host-avatar':''}" style="background:${color?esc(color):`color-mix(in srgb,${playerColor(index)} 65%,var(--color-surface-panel,#f4f2e8))`};color:var(--color-text-primary,#172b24)" ${hidden?'aria-hidden="true"':`role="img" aria-label="${esc(label)}" title="${esc(label)}"`}>${face}</span>`;
  }
  function validCounters(counters) {
    return Array.isArray(counters)&&counters.length<=4&&counters.every(c=>GameComponents.validMetric(c,{localized:true}))&&new Set(counters.map(c=>c.id||c.kind)).size===counters.length;
  }
  function scoreBadge(counter) {
    if(!validCounters([counter]))throw Error('Invalid player counters');
    const label=counter.label||(counter.kind==='wins'?globalThis.PlayroomMessages.text("ui.ui.8e5f4bb5654f"):counter.kind==='pieces'?globalThis.PlayroomMessages.text("ui.ui.24b775243171"):globalThis.PlayroomMessages.text("ui.ui.6cc0ad965516"));
    return assetArt('counter',{style:'score',...counter,label},params=>GameComponents.pieceTypes.badge.render(params,{roundTokenArt:Components.roundTokenArt}));
  }
  function teamFor(layouts,preset,seat){
    const layout=layouts?.[preset];
    if(!layout||!Array.isArray(layout.seatTeams)||layout.seatTeams.length>32||!Array.isArray(layout.teams)||layout.teams.length>16||!Number.isInteger(seat)||seat<0)return null;
    const team=layout.teams.find(team=>team&&typeof team.id==='string'&&team.id===layout.seatTeams[seat]);
    return team&&typeof team.label==='string'&&(typeof team.color==='string'||typeof team.colorRole==='string')?team:null;
  }
  function playerMedallion({first=false,team=null,place=null,last=false,layout=null}={}) {
    if(!first&&!team&&place==null&&!last)return '';
    const label=last?globalThis.PlayroomMessages.text("ui.ui.last-player"):team?(first?globalThis.PlayroomMessages.text("ui.ui.5a0a57b96032",{p0:String(team.label)}):globalThis.PlayroomMessages.text("ui.ui.a0547497e28d",{p0:String(team.label)})):first?globalThis.PlayroomMessages.text("ui.ui.374e683d6421"):globalThis.PlayroomMessages.text("ui.ui.5e20b8d4db80",{p0:String(place)});
    const tone=last?'last':team?'team':place!=null?'place':'first';
    const literal=team&&/^(#[0-9a-f]{3,8}|[a-z]+)$/i.test(team.color||'')?team.color:'';
    const color=team&&/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/.test(team.colorRole||'')?'var(--color-'+team.colorRole.replaceAll('.','-')+','+(literal||'currentColor')+')':literal;
    return `<span class="player-medallion is-${tone}${place!=null?` place-${place}${place>3?' is-minor':''}`:''}" role="img" aria-label="${esc(label)}" title="${esc(label)}"${color||layout?` style="${color?`--medallion-color:${esc(color)};`:''}${layout?`left:${layout.x}px;top:${layout.y}px;z-index:${layout.z};`:''}"`:''}>${roundTokenArt({value:place,first})}${last?'<span class="last-player-symbol" aria-hidden="true">×</span>':''}</span>`;
  }
  function playerContent(state, viewer, cardRender, options={}) {
    return state.players.map((person,index)=>{
      const semantic=state.scene?.players?.find(player=>player.player===index);
      const metrics=semantic?.metrics?.filter(metric=>['points','wins','pieces'].includes(metric.kind));
      const cards=semantic?.hand,open=cards?.some(card=>!card.hidden);
      const visible=cards||[];
      const handHTML=index===viewer?'':visible.map((card,i)=>card.hidden?(options.backRender?.()||cardRender?.(card,'disabled',{variant:'compact',surface:'opponent',interactive:false})||back(options.kind||'card')):`<span class="public-card" data-public-card-index="${i}">${cardRender?.(card,'disabled',{variant:'compact',surface:'opponent',interactive:false})||''}</span>`).join('');
      return {handHTML,next:typeof options.next==='function'?!!options.next(index,person):state.status==='playing'&&state.scene?.nextPlayer===index,turnPreview:options.turnPreview?.(index,person)||null,showHand:semantic?.showHand,countLabel:semantic?.countLabel||options.countLabel||globalThis.PlayroomMessages.text("ui.ui.c81b450ffa45"),ready:!!options.ready?.(index,person),decisionPlayer:options.decisionPlayer?.(index,person)??null,inactive:!!options.inactive?.(index,person),orderPosition:semantic?.orderPosition??playerOrderPosition(state,index),indicators:options.indicators?.(index,person)||semantic?.indicators||[],...(metrics?{counters:metrics.map(({id,kind,value,label,display})=>({id,kind,value,label,...(display?{display}:{})}))}:options.counters?{counters:options.counters(index,person)}:{}),scoreLabel:options.scoreLabel||globalThis.PlayroomMessages.text("ui.ui.d7ab0767bbee"),...(Number.isSafeInteger(semantic?.handCount)?{handCount:semantic.handCount,handMetricId:'hand-count'}:cards?{handCount:cards.length,handMetricId:'hand-count'}:{}),open:!!open,badges:options.badges?.(index,person)||[],team:semantic?.team||options.team?.(index,person)||null,color:options.color?.(index,person)||'',colorLabel:options.colorLabel?.(index,person)||''};
    });
  }
  function playerPanel(state,index,viewer,content={},actions=[]) {
    const orderPosition=Number.isInteger(content.orderPosition)&&content.orderPosition>=1&&content.orderPosition<=8?content.orderPosition:playerOrderPosition(state,index);
    const next=typeof content.next==='boolean'?content.next:state.status==='playing'&&state.scene?.nextPlayer===index;
    const person=state.players[index],own=index===viewer,target=!own&&actions.some(a=>a.target===index&&a.targetKind==='player');
    const renderBadge=b=>GameComponents.pieceTypes.badge.status(b,{icon});
    const avatarBadges=(content.badges||[]).filter(b=>['avatar-bottom','avatar-center'].includes(b?.position)).map(renderBadge).join('');
    const badges=(content.badges||[]).filter(b=>!['avatar-bottom','avatar-center'].includes(b?.position)).map(renderBadge).join('');
    const counters=content.counters??[{kind:content.scoreKind||'points',value:Number.isSafeInteger(person.score)&&person.score>=0?person.score:0,label:content.scoreLabel||globalThis.PlayroomMessages.text("ui.ui.d7ab0767bbee")}];
    if(!validCounters(counters))throw Error('Invalid player counters');
    const headingCounter=content.headingCounter===undefined?null:counters.find(c=>c.id===content.headingCounter);
    const headingCounters=counters.filter(c=>content.headingCounters?.includes(c.id));
    const heading=headingCounter?(headingCounter.value>0?`<span class="player-heading-counter">${scoreBadge(headingCounter)}</span>`:''):content.orderPosition===false?'':`<span class="player-turn-position" aria-label="${globalThis.PlayroomMessages.text('ui.ui.ec2c9f35dee9')}${orderPosition}">${orderPosition}</span>`;
    const color=/^(#[0-9a-f]{3,8}|[a-z]+)$/i.test(content.color||'')?content.color:'';
    const preview=['positive','negative'].includes(content.turnPreview)?content.turnPreview:null;
    return `<article class="player-panel ${own?'self-player':'opponent-hand'} ${state.turn===index?'is-turn':''} ${content.open?'is-open-hand':''} ${content.inactive?'is-inactive':''} ${person.connectionOffline?'is-network-offline':''} ${person.connectionRestored?'is-network-returned':''} ${content.ready?'is-ready':''} ${next?'is-next':''} ${preview?'is-turn-preview-'+preview:''}" data-dom-key="player-panel-${index}" data-player-index="${index}"${preview?` data-turn-preview="${preview}"`:''}${next?' data-next-turn="true"':''}${state.turn===index?' aria-current="true"':''} ${target?`data-player-panel-target="${index}"`:""}${content.handCount!==undefined?` data-hand-count="${content.handCount}" style="--mini-hand-count:${Math.max(1,content.handCount)}"`:''}>
      <${target?'button':'div'} class="player-info player-token" ${target?`type="button" data-player-target="${index}" aria-haspopup="menu" aria-expanded="false" aria-label="${esc(globalThis.PlayroomMessages.text("ui.ui.ccc8d5ca0326",{name:person.name}))}"`:''}>
      <span class="player-avatar-wrap"${Number.isInteger(content.decisionPlayer)?` data-decision-player="${content.decisionPlayer}" role="button" tabindex="0" aria-label="${esc(person.name)}"`:""}>${avatar(person,index,{color})}${playerMedallion({first:content.showFirstPlayer!==false&&state.firstPlayer===index,team:content.team})}<span data-finish-award>${playerMedallion({place:state.scene?.players?.find(p=>p.player===index)?.finishPlace||null,last:state.result?.lastPlayers?.includes(index)||false})}</span>${avatarBadges}</span><span class="player-details"><span class="player-heading"><strong>${esc(person.name)}${own&&content.showSelfLabel!==false?globalThis.PlayroomMessages.text("ui.ui.13292d3eac84"):""}</strong>${heading}${headingCounters.length?`<span class="player-heading-counters">${headingCounters.map(scoreBadge).join('')}</span>`:''}</span><span class="player-data"><span class="player-scores">${content.handCount!==undefined?countBadge(content.handCount,globalThis.PlayroomMessages.text("ui.ui.aac1090346a5",{p0:String(person.name),p1:String(content.countLabel||globalThis.PlayroomMessages.text("ui.ui.c81b450ffa45"))}),{hand:true}):''}${counters.filter(c=>c!==headingCounter&&!headingCounters.includes(c)).sort((a,b)=>(a.kind==='wins')-(b.kind==='wins')).map(scoreBadge).join('')}</span>${indicators(content.indicators)}${content.statusHTML?`<span class="player-status" style="--player-status-min-width:${Number.isInteger(content.statusMinWidth)?content.statusMinWidth:24}px">${content.statusHTML}</span>`:''}${content.colorLabel?`<span class="player-side">${esc(content.colorLabel)}</span>`:''}${badges?`<span class="player-badges">${badges}</span>`:''}</span></span></${target?'button':'div'}>
      ${own?'<!--self-controls-->':''}${!own&&content.showHand!==false&&content.handCount!==undefined?`<div class="player-hand">${content.handCount!==undefined?`<div class="mini-hand ${content.open?'is-open':''}" tabindex="${content.open?'0':'-1'}" aria-label="${globalThis.PlayroomMessages.text("ui.ui.e7e0d10b26d3")}${esc(person.name)}">${content.handHTML||''}</div>`:''}</div>`:''}${content.handoffSlot?'<!--handoff-control-->':''}</article>`;
  }
  function hand(content, count, hint=globalThis.PlayroomMessages.text("ui.ui.473a2525ab0a"), extraControlHTML='', options={}) {
    const cards=Array.isArray(content)?content:null,fan=options.layout==='fan'&&cards?.length,tiles=options.layout==='tiles',overlap=options.layout==='overlap'&&cards?.length;
    const layout=cards?GameComponents.handLayout(cards):null;
    let body=layout?layout.html:content;
    if(fan){
      body=`<div class="hand-fan-row ${cards.length===1?'is-single':''}" style="--fan-count:${cards.length}">${body}</div>`;
    }
    if(overlap){
      body=`<div class="hand-overlap-row" style="--hand-count:${cards.length};grid-template-columns:${layout.columns}">${body}</div>`;
    }
    return `<section class="own-hand" data-hand-count="${count}" aria-label="${globalThis.PlayroomMessages.text("ui.ui.2d10172eed3f")}"><div class="hand-heading"><strong>${globalThis.PlayroomMessages.text("ui.ui.2d10172eed3f")}</strong><span>${esc(hint)}</span>${extraControlHTML?`<div class="hand-tools">${extraControlHTML}</div>`:''}</div><div class="hand-track ${tiles?'is-tiles':''} ${fan?'is-fan':''} ${overlap?'is-overlapping':''} ${(fan&&cards.length>8)||(tiles&&count>7)?'is-long-hand':''}" ${tiles?`style="--hand-columns:${Math.max(1,count)}"`:''}>${body || ("<span class=\"empty-hand\">"+globalThis.PlayroomMessages.text("ui.ui.8c687618fd99")+"</span>")}</div></section>`;
  }
  function source(id, actions, selected, options = {}) {
    const key = options.key || 'card', value = String(id);
    const choices = actions.filter(action => action[key] != null && String(action[key]) === value);
    const available = choices.length > 0, inspectable = !!options.inspect;
    const chosen = selected != null && String(selected) === value;
    const className = [options.className ?? 'hand-card', available ? 'is-playable' : '', chosen ? 'is-selected' : ''].filter(Boolean).join(' ');
    if (!available && !inspectable) return {choices, className, attr: 'disabled aria-disabled="true"'};
    const attrs = [];
    const immediate = options.mode === 'immediate' && choices.length === 1;
    if (!immediate || options.preview || inspectable) attrs.push(`data-select="${esc(value)}"`);
    if (available && options.drag) attrs.push(`data-drag-piece="${esc(value)}"`);
    if (options.preview) attrs.push(`data-hand-preview="${esc(value)}"`);
    attrs.push(`aria-pressed="${chosen}"`);
    if (immediate) attrs.push(actionAttr(choices[0]));
    if (available && options.swipe) attrs.push(choices.length === 1
      ? `data-swipe-action="${esc(JSON.stringify(choices[0]))}"`
      : `data-swipe-select="${esc(value)}"`);
    return {choices, className, attr: attrs.join(' ')};
  }
  function boardTarget(action,{kind='move',color=null}={}) {
    if(!['move','capture','home'].includes(kind)||color!==null&&!/^#[0-9a-f]{6}$/i.test(color))throw Error('Invalid board target');
    return {className:action?'board-target target-'+kind:'',attrs:action?actionAttr(action):'',style:action&&color?`--target-fill:color-mix(in srgb,${color} 78%,white);--target-edge:${color};`:''};
  }
  const routeDot=()=>'<i class="board-route-dot" aria-hidden="true"></i>';
  function target(piece, action = null) {
    const exact = action && typeof action === 'object' && !Array.isArray(action);
    return `data-drop-piece="${esc(piece)}" ${exact ? actionAttr(action) : `data-drop-select="${esc(piece)}"`}`;
  }
  function cardAttrs(card, actions, selected) {
    return source(card.id, actions, selected, {mode: 'immediate'});
  }
  const svg = content => GameComponents.vector.viewport({width:300,height:180,content,attrs:'aria-hidden="true"'});
  const actionGroups=({start='',primary='',end='',exclusive=false})=>`<div class="game-action-bar"${exclusive?' data-exclusive="true"':''}><div data-action-position="start"${exclusive?' inert aria-hidden="true"':''}>${start}</div><div class="scene-actions" data-action-position="primary">${primary}</div><div data-action-position="end"${exclusive?' inert aria-hidden="true"':''}>${end}</div></div>`;
  function translator(catalogs) {
    const Localization = globalThis.PlayroomLocalization;
    if (!Localization) throw Error('Localization module is required');
    return new Localization.Translator({catalogs});
  }
  function choiceSlider({key,label,choices,value,disabled=false}){
    const index=Math.max(0,choices.findIndex(c=>c.value===value));
    return globalThis.PlayroomGameScreen.rangeSetting({id:'view-'+key,label,value:index,max:choices.length-1,display:choices[index].label,choices}).replace('<input ',`<input data-view-range="${esc(key)}" ${disabled?'disabled ':''}`);
  }
  // Shared public parameter diagram: fixed seats, no participant or game state.
  function parameterTableArt({numbers=false,shuffle=false,sourceSeat=null,currentSeat=null}={}){
    const V=GameComponents.vector,valid=seat=>Number.isInteger(seat)&&seat>=0&&seat<4;
    const chairs=[[18,35,14,14,25,42],[38,8,15,13,45.5,14.5],[67,8,15,13,74.5,14.5],[88,35,14,14,95,42]];
    let content='<circle data-round-table cx="60" cy="43" r="21" fill="currentColor" fill-opacity=".05"/><circle cx="60" cy="43" r="21"/>';
    content+=chairs.map(([x,y,w,h,cx,cy],i)=>`<g data-table-chair="${i+1}"${sourceSeat===i?' data-source-seat':''}${currentSeat===i?' data-current-seat':''}><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2.5" fill="currentColor" fill-opacity="${sourceSeat===i?'.24':currentSeat===i?'.16':'.07'}"/><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2.5"/>${i===0?'<path d="M14 34V50"/>':i===3?'<path d="M106 34V50"/>':`<path d="M${x} ${y-4}H${x+w}"/>`}${numbers?V.text(i+1,{x:cx,y:cy+.5,size:9,weight:700,attrs:'data-seat-number stroke="none"'}):''}</g>`).join('');
    if(shuffle)content+=V.place(icon('shuffle'),{x:48,y:31,width:24,height:24});
    if(valid(sourceSeat)&&valid(currentSeat)&&sourceSeat!==currentSeat){
      const from=chairs[sourceSeat],to=chairs[currentSeat],dx=to[4]-from[4],dy=to[5]-from[5],length=Math.hypot(dx,dy),ux=dx/length,uy=dy/length,sx=from[4]+ux*10,sy=from[5]+uy*10,tx=to[4]-ux*12,ty=to[5]-uy*12;
      content+=`<path data-card-transfer d="M${sx} ${sy}L${tx} ${ty}M${tx-ux*6-uy*4} ${ty-uy*6+ux*4}L${tx} ${ty}L${tx-ux*6+uy*4} ${ty-uy*6-ux*4}"/>`;
    }
    if(valid(currentSeat))content+=V.text('Вы',{x:chairs[currentSeat][4],y:65,size:9,weight:600,attrs:'stroke="none"'});
    return V.viewport({width:120,height:72,attrs:'data-art-role="parameter-diagram" data-parameter-table fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"',content});
  }
  const helpers = {viewApi:3,parameterTableArt,choiceSlider,playerOrderPosition,playerColor,tokenLayout,assetArt,assetLayout,assetVariant,components:GameComponents,translator,teamFor,seatOrder,viewPreferences,indicators,avatar,playerMedallion,roundTokenArt,numberPath,numberMark,icon,button,actionGroups,art,esc,actionAttr,actionButton,actionBar,back,countBadge,participantIcon,scoreBadge,playerContent,playerPanel,hand,source,target,boardTarget,routeDot,cardAttrs,svg};
  function selectLayout(width,height){if(width>height&&height<=550)return 'phone-landscape';if(width<=760)return 'phone-portrait';return width>=1100?'desktop':'tablet';}
  const elementNames=Object.freeze(['participants','status','field','actions','hand','auxiliary','shared']);
  function motionSequence(value){
    if(value===undefined)return '';
    const anchor=point=>point&&typeof point==='object'&&typeof point.anchor==='string'&&/^[\w-]{1,80}$/.test(point.anchor)&&(point.label===undefined||typeof point.label==='string');
    if(!value||typeof value!=='object'||typeof value.trigger!=='string'||!value.entity||typeof value.entity!=='object'||!Number.isInteger(value.player)||value.player<0||typeof value.counter!=='string'||!anchor(value.origin)||!Array.isArray(value.steps)||value.steps.length>100||!value.steps.every(anchor)||(value.jump!==undefined&&!anchor(value.jump)))throw Error('Invalid motion sequence');
    GameComponents.entityKey(value.entity);
    if(value.departures!==undefined||value.arrival==='after-departures'){
      const ids=Array.isArray(value.departures)?value.departures.map(GameComponents.entityKey):[];
      if(value.arrival!=='after-departures'||ids.length<1||ids.length>32||new Set(ids).size!==ids.length||ids.includes(GameComponents.entityKey(value.entity)))throw Error('Invalid motion departures');
    }
    return ` data-motion-sequence="${esc(JSON.stringify(value))}"`;
  }
  // Public Table commands are supplied by the authority/model projection.
  // Layout does not grant a spectator the identity of an acting player.
  function tableCommands(state, actions) {
    return (state?.tableActions || []).filter(command => actions.some(action =>
      Object.keys(command).every(key => JSON.stringify(command[key]) === JSON.stringify(action[key]))));
  }
  function fieldContent(value) {
    if(!value||value.api!==3||!['cards','board'].includes(value.family)||typeof value.elements?.field!=='string'||!value.elements.field.trim())throw Error('Game elements API 3 required');
    if(value.fieldGroups===undefined)return value.elements.field;
    const groups=value.fieldGroups;
    if(!groups||Array.isArray(groups)||typeof groups!=='object'||Object.keys(groups).some(k=>!['stock','play'].includes(k))||Object.values(groups).some(html=>typeof html!=='string')||!groups.play)throw Error('Invalid field groups');
    return `<div class="game-field-groups" data-scene-scroll>${['stock','play'].filter(k=>groups[k]).map(k=>`<section class="field-group field-group-${k}" data-field-group="${k}">${groups[k]}</section>`).join('')}</div>`;
  }

  function composeSceneValue(value,{surface='combined',state=null,viewer=-1,actions=[],selection=null,seating='auto',seatingPolicy=null,presentationTurn=null,presentationField=false}={}) {
    if(!value||value.api!==3||!['cards','board'].includes(value.family)||!value.elements||typeof value.elements.field!=='string'||!value.elements.field.trim())throw Error('Game elements API 3 required');
    if(Object.keys(value.elements).some(key=>!elementNames.includes(key))||Object.values(value.elements).some(html=>typeof html!=='string'))throw Error('Invalid game elements');
    if(value.fieldAspect!==undefined&&(!Number.isFinite(value.fieldAspect)||value.fieldAspect<=0||value.fieldAspect>10))throw Error('Invalid field aspect');
    if(value.fieldSizing!==undefined&&!['fit','content','scroll'].includes(value.fieldSizing))throw Error('Invalid field sizing');
    if(['content','scroll'].includes(value.fieldSizing)&&value.fieldAspect!==undefined)throw Error('Content fields cannot set fieldAspect');
    if(value.actionPlacement!==undefined&&value.actionPlacement!=='header-landscape')throw Error('Invalid action placement');
    if(value.fieldDropZone!==undefined&&typeof value.fieldDropZone!=='boolean')throw Error('Invalid field drop zone');
    if(value.actionReserve!==undefined&&typeof value.actionReserve!=='boolean')throw Error('Invalid action reserve');
    if(value.showTurn!==undefined&&typeof value.showTurn!=='boolean')throw Error('Invalid turn presentation');
    if(value.showTurn===false){state={...state,turn:-1};presentationTurn=-1;}
    if(value.hidePlayers!==undefined&&(typeof value.hidePlayers!=='boolean'||value.hidePlayers&&state?.players?.length!==1))throw Error('Invalid solo layout');
    const layout=value.layout||{};
    const seatNames=['north','north-west','north-east','west','east','south-west','south-east','south'];
    if(!layout||typeof layout!=='object'||Array.isArray(layout)||Object.keys(layout).some(key=>!['focus','seats','duplicateSelf','wideHand','overrides'].includes(key))||layout.focus!==undefined&&!['hands','field','balanced'].includes(layout.focus)||layout.duplicateSelf!==undefined&&typeof layout.duplicateSelf!=='boolean'||layout.wideHand!==undefined&&typeof layout.wideHand!=='boolean'||layout.seats!==undefined&&(!Array.isArray(layout.seats)||layout.seats.length!==state?.players?.length||!layout.seats.every(seat=>seatNames.includes(seat))))throw Error('Invalid layout policy');
    const overrides=layout.overrides||{};
    if(!overrides||typeof overrides!=='object'||Array.isArray(overrides)||Object.keys(overrides).some(key=>!['fieldColumns','opponentsAlign','playerIndicators','mirrorIndicators'].includes(key))||overrides.fieldColumns!==undefined&&overrides.fieldColumns!==3||overrides.opponentsAlign!==undefined&&!['start','end'].includes(overrides.opponentsAlign)||overrides.playerIndicators!==undefined&&overrides.playerIndicators!=='below-avatar'||overrides.mirrorIndicators!==undefined&&typeof overrides.mirrorIndicators!=='boolean')throw Error('Invalid layout overrides');
    const overrideAttrs=(overrides.fieldColumns?' data-field-columns="3"':'')+(overrides.opponentsAlign?' data-opponents-align="'+overrides.opponentsAlign+'"':'')+(overrides.playerIndicators?' data-player-indicators="'+overrides.playerIndicators+'"':'')+(overrides.mirrorIndicators?' data-mirror-indicators="true"':'');
    const focus=layout.focus||(value.family==='board'?'field':'balanced');
    const strategy=layout.seats&&(state?.players?.length||0)>=2&&(seatingPolicy||seating)!=='row'?'anchors':'row';
    const anchored=strategy==='anchors',circular=strategy!=='row'&&surface!=='player'&&(state?.players?.length||0)>=2;
    const opponentHands=(value.playerContent||[]).some((p,i)=>i!==viewer&&(Number.isInteger(p.handCount)?p.handCount>0:!!p.handHTML));
    const className=typeof value.className==='string'?value.className:'';
    if(surface==='table')actions=tableCommands(state,actions);
    const e={...value.elements},content=value.playerContent;
    const zoneAttribute=name=>{const id=name==='hand'?'hand-'+viewer:name;return state?.scene?.zones?.some(zone=>zone.id===id)?` data-scene-zone="${esc(id)}"`:'';};
    // A hidden public field must not take a selected private card's targets away.
    if(surface==='player'&&selection!==null){
      const missing=actions.filter(action=>String(action.card)===String(selection)&&!(e.actions||'').includes(actionAttr(action)));
      if(missing.length)e.actions=(e.actions||'')+actionBar(missing);
    }
    if(value.actionReserve&&(surface!=='table'||state?.scene?.audience==='public')&&!e.actions)e.actions='<div class="scene-actions"></div>';
    if(content!==undefined&&(!Array.isArray(content)||(state?.players&&content.length!==state.players.length)||content.some(p=>!p||typeof p!=='object'||Array.isArray(p)||['scoreLabel','countLabel','color','colorLabel','statusHTML'].some(k=>p[k]!==undefined&&typeof p[k]!=='string')||(p.statusMinWidth!==undefined&&(!Number.isInteger(p.statusMinWidth)||p.statusMinWidth<24||p.statusMinWidth>320))||(p.showFirstPlayer!==undefined&&typeof p.showFirstPlayer!=='boolean')||(p.showSelfLabel!==undefined&&typeof p.showSelfLabel!=='boolean')||(p.orderPosition!==undefined&&p.orderPosition!==false&&(!Number.isInteger(p.orderPosition)||p.orderPosition<1||p.orderPosition>8))||(p.headingCounters!==undefined&&(!Array.isArray(p.headingCounters)||p.headingCounters.some(id=>typeof id!=='string'||!p.counters?.some(c=>c.id===id))))||(p.headingCounter!==undefined&&(typeof p.headingCounter!=='string'||!p.counters?.some(c=>c.id===p.headingCounter)))||(p.team!==undefined&&p.team!==null&&(!p.team||typeof p.team.label!=='string'||(typeof p.team.color!=='string'&&typeof p.team.colorRole!=='string')))||(p.indicators!==undefined&&!validIndicators(p.indicators))||(p.counters!==undefined&&!validCounters(p.counters))||(p.open!==undefined&&typeof p.open!=='boolean')||(p.handHTML!==undefined&&typeof p.handHTML!=='string')||(p.handCount!==undefined&&(!Number.isSafeInteger(p.handCount)||p.handCount<0))||(p.badges!==undefined&&(!Array.isArray(p.badges)||p.badges.some(b=>typeof b!=='string'&&(!b||typeof b.label!=='string'||(b.color!==undefined&&!/^#[0-9a-f]{6}$/i.test(b.color))||(b.position!==undefined&&!['avatar-bottom','avatar-center'].includes(b.position))||(b.value!==undefined&&(!Number.isSafeInteger(b.value)||b.value<1))||(b.icon!==undefined&& !['sword','shield','takeCards','adjustDie','lessDie','skipTurn','secondDie','extraTurn','host'].includes(b.icon)))))))))throw Error('Invalid player content');
    e.field=fieldContent(value);
    const unified=!!state?.players;
    let self='';
    if(unified&&!value.hidePlayers){
      const order=seatOrder(state.players.length,viewer);
      if(circular&&viewer>=0&&surface!=='table')order.push(viewer);
      const panels=order.map(i=>({player:i,html:playerPanel(state,i,viewer,content?.[i]||{},actions)}));
      if(circular){
        const groups=new Map();
        for(const panel of panels){
          const relative=viewer>=0?(panel.player-viewer+state.players.length)%state.players.length:panel.player;
          const seat=layout.seats?.[panel.player]||['south-east','south-west','north-west','north-east'][Math.ceil(relative*4/state.players.length)%4];
          if(!groups.has(seat))groups.set(seat,[]);groups.get(seat).push((panel.player===viewer?panel.html.replace(' is-turn','').replace(' aria-current="true"',''):panel.html).replace(`data-player-index="${panel.player}"`,`data-player-index="${panel.player}" data-seat="${seat}"${panel.player===viewer?` data-seat-copy="true"${layout.duplicateSelf?'':' data-portrait-copy="true"'}`:''}`));
        }
        e.participants=`<div class="players-panels opponent-hands" data-opponent-count="${panels.filter(panel=>panel.player!==viewer).length}">${[...groups].map(([seat,html])=>`<div class="seat-group seat-${seat}" data-seat-group="${seat}">${(seat.endsWith('west')?html.reverse():html).join('')}</div>`).join('')}</div>`;
      }else e.participants=`<div class="players-panels opponent-hands" data-opponent-count="${panels.filter(panel=>panel.player!==viewer).length}">${panels.map(panel=>panel.html).join('')}</div>`;
      if(viewer>=0&&surface!=='table')self=`<section class="layout-self" data-game-element="self">${playerPanel(state,viewer,viewer,{...content?.[viewer],showSelfLabel:false,handoffSlot:!layout.duplicateSelf},[])}${e.actions?`<section class="game-layout-slot layout-actions" data-game-element="actions">${e.actions}</section>`:''}${e.hand?`<section class="game-layout-slot layout-hand" data-game-element="hand"${zoneAttribute('hand')}>${e.hand}</section>`:''}</section>`;
    }
    if(unified&&viewer>=0&&surface!=='table'&&layout.duplicateSelf)self+='<div class="handoff-corner"><!--handoff-control--></div>';
    const slots=elementNames.filter(name=>e[name]&&!(self&&['actions','hand'].includes(name))&&!(surface==='table'&&(name==='hand'||name==='actions'&&state?.scene?.audience!=='public'))).map(name=>`<section class="game-layout-slot layout-${name}" data-game-element="${name}"${zoneAttribute(name)}${name==='field'&&value.fieldAspect?` style="--field-aspect:${value.fieldAspect}"`:''}>${name==='field'?`<div class="game-field-content"${value.fieldDropZone?' data-drop-zone':''}${presentationField?' inert data-presentation-field="true"':''}>${e[name]}</div>`:e[name]}</section>`).join('');
    return `<div class="game-scene app-game-layout ${esc(className)}" data-view-api="3"${overrideAttrs} data-field-topology="${esc(state?.scene?.geometry?.topology||'')}"${value.showTurn===false?' data-show-turn="false"':''} data-appearance-pack="${esc(state?.game||'')}"${Array.isArray(value.skinFamilies)?` data-skin-families="${esc(JSON.stringify(value.skinFamilies))}"`:''}${value.hidePlayers?' data-solo-field="true"':''}${value.actionPlacement?' data-action-placement="'+value.actionPlacement+'"':''} data-player-count="${state?.players?.length||0}" data-turn-player="${state?.turn??-1}"${Number.isInteger(presentationTurn)?` data-presentation-turn="${presentationTurn}"`:""} data-layout-focus="${focus}" data-wide-hand="${value.layout?.wideHand===true}" data-seating="${circular?'circle':'row'}" data-seat-anchors-available="true" data-seat-style="${anchored?'anchors':'edge'}" data-opponent-hands="${!!opponentHands}"${anchored?' data-seat-anchors="true"':''} data-has-hand="${!!e.hand&&(content?.[viewer]?.handCount===undefined||content[viewer].handCount>0)}"${unified?' data-player-layout="unified"':''}${value.actionReserve?' data-action-reserve="true"':''}${motionSequence(value.motionSequence)} data-field-sizing="${value.fieldSizing||'fit'}" data-layout-family="${value.family}" data-surface="${esc(surface)}">${slots}${self}</div>`;
  }

  function composeScene(value,context={}) {
    const previousPack=renderingPack;
    try {renderingPack=context.state?.game||previousPack;return composeSceneValue(value,context);}
    finally {renderingPack=previousPack;}
  }

  function createRegistry() {
    const packs = new Map(),regionOwners=new WeakMap();
    function withRegions(state,viewer,ui,lane,render,run){
      const {renderOwner:owner,regionSink,...safeUI}=ui;
      if(!owner||!['object','function'].includes(typeof owner))return run(safeUI);
      let lanes=regionOwners.get(owner);if(!lanes){lanes=new Map();regionOwners.set(owner,lanes);}
      const scope=[state.game,state.packVersion,viewer,state.scene?.audience,ui.surface||'combined',!!ui.replay,!!ui.hotseat,render,globalThis.PlayroomAssetResolver,globalThis.document?.documentElement.dataset.assetGeometry,globalThis.document?.documentElement.dataset.appearanceMode];
      let entry=lanes.get(lane);
      if(!entry||entry.scope.some((value,i)=>value!==scope[i])){entry={scope,regions:new Map()};lanes.set(lane,entry);}
      const emit=(id,markup)=>{
        if(!regionSink)return markup;
        const key=lane+':'+id;regionSink.set(key,markup);
        return `<template data-scene-fragment="${esc(key)}"></template>`;
      };
      const used=new Set(),region=(id,dependencies,build)=>{
        if(typeof id!=='string'||!id||id.length>80||typeof build!=='function')throw Error('Invalid scene region');
        const signature=JSON.stringify(dependencies);if(signature===undefined)throw Error('Invalid scene region dependencies');
        used.add(id);const previous=entry.regions.get(id);if(previous?.signature===signature)return emit(id,previous.markup);
        const markup=build();if(typeof markup!=='string')throw Error('Invalid scene region markup');
        if(entry.regions.has(id)||entry.regions.size<128)entry.regions.set(id,{signature,markup});return emit(id,markup);
      };
      // Frame renderers are local presentation ports, never serialized scene data.
      // Their lifetime has the same viewer/pack/skin boundary as cached regions.
      const frameKeys=new Set(),publicFrames=regionSink?options=>{
        const {key,plan,renderFrame,live,...labels}=options;
        if(typeof key!=='string'||!key||key.length>80||typeof renderFrame!=='function'||!plan||!Array.isArray(plan.groups)||plan.groups.length>64||plan.initial!==0||plan.final!==plan.groups.length)throw Error('PUBLIC_PLAN_INVALID');
        frameKeys.add(key);entry.frames||=new Map();let source=entry.frames.get(key);
        if(!source||source.id!==plan.id){
          const records=new Map();source={id:plan.id,count:plan.final+1,read(index){
            if(!Number.isInteger(index)||index<0||index>=this.count)throw Error('PUBLIC_FRAME_INVALID');
            if(index===this.count-1)return this.live;
            if(!records.has(index)){
              const record=this.render(index);
              if(!record||typeof record.markup!=='string'||typeof record.label!=='string')throw Error('PUBLIC_FRAMES_INVALID');
              records.set(index,record);
            }
            return records.get(index);
          }};entry.frames.set(key,source);
        }
        const frame=(build)=>{const fragments=new Map(),region=(id,markup)=>{if(typeof id!=='string'||!id||id.length>80||typeof markup!=='string'||fragments.has(id)||fragments.size>=256)throw Error('Invalid frame fragment');fragments.set(id,markup);return `<template data-scene-fragment="${esc(id)}"></template>`;};const record=build({region});return {...record,fragments};};
        source.render=index=>{const previous=renderingPack;try{renderingPack=state.game;return frame(context=>renderFrame(index,context));}finally{renderingPack=previous;}};source.live=typeof live==='function'?frame(live):live;
        const id=lane+':'+key;(regionSink.publicFrames||=new Map()).set(id,source);
        return GameComponents.publicFrames({...labels,plan,source:{id,initial:{markup:'',label:source.live.label}}});
      }:undefined;
      if(publicFrames)publicFrames.supportsFragments=true;
      const result=run({...safeUI,region,...(publicFrames?{publicFrames}:{})});
      for(const id of entry.regions.keys())if(!used.has(id))entry.regions.delete(id);
      for(const id of entry.frames?.keys()||[])if(!frameKeys.has(id))entry.frames.delete(id);
      return result;
    }
    return {
      register(id,render,cover,options={}) {
        if(typeof render!=='function'||(cover!=null&&typeof cover!=='function'))throw Error('Invalid game view');
        const surfaces=options?.surfaces||{};
        if(typeof surfaces!=='object'||Array.isArray(surfaces)||Object.entries(surfaces).some(([key,fn])=>!['table','player'].includes(key)||typeof fn!=='function'))throw Error('Invalid view surfaces');
        if(options.illustrations!==undefined&&typeof options.illustrations!=='function')throw Error('Invalid rule illustrations');
        if(options.reveal!==undefined&&typeof options.reveal!=='function')throw Error('Invalid reveal renderer');
        if(options.seating!==undefined&&options.seating!=='row')throw Error('Invalid seating policy');
        packs.set(id,{render,cover,illustrations:options.illustrations,reveal:options.reveal,seating:options.seating,surfaces:Object.freeze({...surfaces})});
      },
      registerTutorial(id,tutorial){const pack=packs.get(id);if(!pack||typeof tutorial!=='function')throw Error('Invalid tutorial');pack.tutorial=tutorial;},
      reveal(id,value){const previousPack=renderingPack;try{renderingPack=id;return packs.get(id)?.reveal?.(value)||'';}catch(_){return '';}finally{renderingPack=previousPack;}},
      illustration(id,key){if(typeof key!=='string'||!/^[-a-zA-Z0-9._]+$/.test(key))return '';const previousPack=renderingPack;try{renderingPack=id;return packs.get(id)?.illustrations?.(key)||'';}finally{renderingPack=previousPack;}},
      supports(id,surface='combined'){return !!packs.get(id) && (surface==='combined'||typeof packs.get(id).surfaces[surface]==='function');},
      get(id){return packs.get(id);},
      remove(id){return packs.delete(id);},
      renderField(state,viewer,scene,ui={}) {
        const {data,modelProjection,...semantic}=state;
        if(!scene||scene.audience!==state.scene?.audience)throw Error('Field audience mismatch');
        const surface=ui.surface||'combined',item=packs.get(state.game),render=surface==='combined'?item?.render:item?.surfaces[surface];
        if(!render)throw Error('Field renderer unavailable');
        const previousPack=renderingPack;
        try {
          renderingPack=state.game;
          const fieldState={...semantic,scene:{...scene,interactions:[]}},fieldUI={...ui,fieldScene:null,selected:null,viewState:{},replay:true};
          const value=withRegions(fieldState,viewer,fieldUI,'field',render,context=>render(fieldState,viewer,[],context));
          return fieldContent(value);
        }finally{renderingPack=previousPack;}
      },
      render(state,viewer,actions,ui={}){
        // Rendering receives semantics only; rule projections remain authority inputs.
        const {data,modelProjection,...sceneState}=state;state=sceneState;
        if(ui.displayScene){
          if(ui.displayScene.audience!==state.scene?.audience||ui.displayScene.viewer!==state.scene?.viewer)throw Error('Scene audience mismatch');
          state={...state,scene:{...ui.displayScene,interactions:[]}};actions=[];
        }
        const previousPack=renderingPack;try { renderingPack=state.game; const item=packs.get(state.game),surface=ui.surface||'combined',render=surface==='combined'?item?.render:item?.surfaces[surface]; if(!render)return ("<p class=\"scene-hint\">"+globalThis.PlayroomMessages.text("ui.ui.31b2f9c7d8e5")+"</p>");const allowedActions=surface==='table'?tableCommands(state,actions):actions;const value=withRegions(state,viewer,ui,'scene',render,context=>{const value=render(state,viewer,allowedActions,context),aux=value?.elements?.auxiliary;
          return context.region&&value?.api===3&&typeof aux==='string'&&aux&&!aux.includes('data-scene-fragment')?{...value,elements:{...value.elements,auxiliary:context.region('__sdk_auxiliary',[aux],()=>'<div style="display:contents">'+aux+'</div>')}}:value;});const recipe=ui.fieldScene?{...value,fieldGroups:undefined,elements:{...value.elements,field:this.renderField(state,viewer,ui.fieldScene,ui)}}:value;return composeScene(recipe,{surface,state,viewer,presentationField:!!ui.fieldScene,actions:allowedActions,selection:ui.selected,presentationTurn:ui.presentationTurn,seatingPolicy:item.seating,seating:ui.seating||globalThis.PlayroomAppBridge?.gameOptions?.(state.game).seating||'auto'}); }
        catch (_) { return ("<p class=\"scene-hint\" role=\"alert\">"+globalThis.PlayroomMessages.text("ui.ui.a3179ce31aab")+"</p>"); } finally {renderingPack=previousPack;}
      },
      cover(id){
        try { return packs.get(id)?.cover?.() || ''; }
        catch (_) { return ("<span class=\"scene-hint\">"+globalThis.PlayroomMessages.text("ui.ui.dfbd4a35e748")+"</span>"); }
      },
      helpers
    };
  }
  return {...helpers,helpers,createRegistry,composeScene,elementNames,selectLayout};
});
