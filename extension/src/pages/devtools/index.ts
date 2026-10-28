chrome.devtools.panels.create(
  "Chrome Extension DevTools",
  "32x32.png",
  // This is the creation of the actual panel in the devtools,
  // you can create as many as you want
  // you will have to create a new html file for each one and make the ingestion
  "panel/panel.html"
);

// Example of how to create a new panel in the devtools
// chrome.devtools.panels.create(
//   "Chrome Extension DevTools",
//   "32x32.png",
//   "newt_panel/newtab_panel.html"
// );
