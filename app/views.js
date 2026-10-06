/* Browser game packs keep their registry alias; reusable UI lives in core/ui.js. */
(function (root) {
  'use strict';
  const UI = root.TabletopUI || (typeof module === 'object' && module.exports ? require('../core/ui.js') : null);
  if (!UI) throw new Error('Load core/ui.js before views.js');
  const views = UI.createRegistry();
  root.PlayroomViews = views;
  if (typeof module === 'object' && module.exports) module.exports = views;
})(typeof globalThis !== 'undefined' ? globalThis : this);
