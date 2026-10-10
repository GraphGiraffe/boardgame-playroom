'use strict';
// Conservative dependency groups. Unmapped application changes require all tests.
module.exports = [
  {paths:['core/ui.js','core/ui.css','app/game-screen.js','app/design-system.css','app/styles.css'],select:['core/screen','ui','games','input/hands','network/resume','storage']},
  {paths:['app/lobby-view.js','app/lobby.css'],select:['ui/room','ui/navigation','network/authority']},
  {paths:['app/saved-games.css','app/library.js'],select:['core/state','ui/history','ui/navigation','storage']},
  {paths:['app/shared-views.js'],select:['core/screen','ui','network/resume','storage/history','input/feedback']},
  {paths:['app/network-ui.js'],select:['network','pairing','storage','ui']},
  {paths:['app/pairing.js','app/qr.js','app/qr-scanner.js'],select:['pairing/codes','network/resume']},
  {paths:['app/acoustic-pairing.js'],select:['pairing/audio','pairing/codes']},
  {paths:['app/pwa.js','sw.js','manifest.webmanifest'],select:['pairing/pwa','network/resume']},
  {paths:['app/transports/','app/session-client.js'],select:['network','storage']},
  {paths:['app/network-session-store.js','app/network-client-history.js'],select:['storage','network/resume','ui/history']},
  {paths:['core/input.js','core/input.css','core/player-target.js'],select:['input/gestures','games/actions']},
  {paths:['core/motion.js','core/motion.css','core/game-flow.js'],select:['input/motion','core/screen','network/resume']},
  {paths:['core/hand-overflow.js'],select:['input/hands','games/layout']},
  {paths:['core/engine.js','core/session.js','core/protocol.js','core/authority.js'],select:['core','storage','network','games']},
  {paths:['core/packs.js','app/pack-manager.js'],select:['core/packs','core/state','ui/navigation']}
];
