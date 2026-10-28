console.log("This is the background page.");
console.log("Put the background scripts here.");

/*
 * This background listener is used as a proxy to communicate with the content script.
 */
chrome.runtime.onConnect.addListener(function (port) {
  console.log("Connected .....");
  port.onMessage.addListener(function (message) {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      chrome.tabs.sendMessage(tabs[0].id ?? 0, message, function (response) {
        console.log(response);
      });
    });
  });
});
