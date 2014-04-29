// Privacy Badger user interface controller.

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const panel = require("sdk/panel");
const data = require("sdk/self").data;
const widget = require("sdk/widget");
const BROWSERURL = "chrome://browser/content/browser.xul";
const userStorage = require("./userStorage");
const utils = require("./utils");
const { Class } = require("sdk/core/heritage");
const { Unknown } = require("sdk/platform/xpcom");
const { Cc, Ci, Cu } = require("chrome");
const { on, once, off, emit } = require('sdk/event/core');
const main = require('./main');
let prefs = require("sdk/simple-prefs").prefs;

// Panel communicates with the content script (popup.js) using the port APIs.
// This is where the user toggles settings.
let pbPanel = panel.Panel({
  contentURL: data.url("popup.html"),
  contentScriptFile: [data.url("jquery-ui/js/jquery-1.7.1.min.js"),
                      data.url("vex/vex.combined.min.js"),
                      data.url("popup.js")],
  width: 370,
  height: 400,
  onShow: emitRefresh,
  onHide: function() {
    handleNewSettings(changedSettings);
    changedSettings = {};
    pbPanel.port.emit("afterClose");
  }
});

function emitRefresh() {
  if (!prefs.pbEnabled) {
    pbPanel.port.emit("show-inactive");
    return;
  }
  let settings = getCurrentSettings();
  console.log("Showing panel with settings: "+JSON.stringify(settings));
  pbPanel.port.emit("show-trackers", settings);
}

// Called whenever user toggles a setting
pbPanel.port.on("update", function(data) {
  handleUpdate(data);
});
// Called when user setting is undone
pbPanel.port.on("reset", function(origin) {
  changedSettings[origin] = "reset";
});
pbPanel.port.on("activate", function() {
  clearSettings();
  prefs.pbEnabled = true;
  emitRefresh();
});
pbPanel.port.on("deactivate", function() {
  clearSettings();
  prefs.pbEnabled = false;
  emitRefresh();
});
pbPanel.port.on("deleteUserSettings", function() {
  userStorage.empty();
  clearSettings();
  utils.reloadCurrentTab();
  emitRefresh();
});
pbPanel.port.on("deleteAllSettings", function() {
  main.empty();
  clearSettings();
  utils.reloadCurrentTab();
  emitRefresh();
});

// This is the little button in the addons bar that opens the panel on click.
let pbButton = widget.Widget({
  id: "pb-button",
  label: "Privacy Badger Button",
  contentURL: data.url("pbbutton.html"),
  width: 100,
  panel: pbPanel
});

exports.pbPanel = pbPanel;
exports.pbButton = pbButton;


/**
 * Retrieve and update block settings based on user interactions.
 *
 *  getCurrentSettings - returns a "dictionary" with the third-party tracking
 *  origins as keys and one of the following as values:
 *    * block: origin has been blocked by heuristic
 *    * userblock: origin has been blocked by user
 *    * cookieblock: origin is cookie-blocked by heuristics
 *    * usernoaction: origin has been whitelisted by user
 *    * usercookieblock: origin is cookie-blocked by user
 *    * noaction: none of the above
 *
 *  handleNewSettings - takes as input ONLY the settings that were changed
 *  after the user interacted with the popup, based on the "userset"
 *  attribute. updates Storage accordingly.
 *
 *  handleUpdate - stores the changed setting in a temporary object.
 *
 */

// origin-action keypairs
let changedSettings = {};

// Special key "cleared" in settings marks that a page needs to be reloaded
// before its settings are shown correctly
function clearSettings() {
  settingsMap.clear();
  var allWindows = utils.getAllWindows();
  console.log("ALL WINDOWS", allWindows);
  allWindows.forEach(function(element, index, array) {
    settingsMap.set(element, {cleared: true});
  })
}

function getCurrentSettings() {
  let topContentWindow = utils.getMostRecentContentWindow();
  console.log("LOCATION topContentWindow", topContentWindow.location.href);
  return settingsMap.get(topContentWindow, {});
}

function handleUpdate(data) {
  changedSettings[data.origin] = data.action;
}

function handleNewSettings(settings) {
  if (Object.keys(settings).length === 0) { return false; }
  console.log("handling new settings", JSON.stringify(settings));
  for (let origin in settings) {
    switch (settings[origin]) {
      case "reset":
        userStorage.clearOrigin(origin);
        break;
      case "block":
        userStorage.addRed(origin);
        break;
      case "cookieblock":
        userStorage.addYellow(origin);
        break;
      case "noaction":
        userStorage.addGreen(origin);
    }
  }
  utils.reloadCurrentTab();
  return true;
}


/**
 * nsIWebProgressListener implementation in order to track which cookies
 * were blocked for each DOM window. settingsMap is a WeakMap of (nsIDOMWindow,
 * ApplicableList) key-value pairs. This should eventually be a separate
 * module.
 */

var PBListener = Class({

  extends: Unknown,

  interfaces: [ 'nsIWebProgressListener', 'nsISupportsWeakReference' ],

  onLocationChange: function(aBrowser, aProgress, aRequest, aURI, aFlags) {
    // Reset the applicable list for every window location change that is
    // a document change (rather than an anchor, etc.)
    if (!aFlags ||
        (aFlags !== Ci.nsIWebProgressListener.LOCATION_CHANGE_SAME_DOCUMENT)) {
      console.log('GOT LOCATION CHANGE: '+aURI.spec);
      var win = aProgress.DOMWindow;
      clearSettingsListener(win);
    }
  },

  initialize: function(aBrowser) { aBrowser.addTabsProgressListener(this); },

  uninitialize: function(aBrowser) { aBrowser.removeTabsProgressListener(this); }

});

var pbListener;

exports.onStartup = function(event) {
  let win = utils.getMostRecentWindow();
  pbListener = PBListener(win.gBrowser);
};

exports.onShutdown = function() {
  try {
    pbListener.uninitialize();
  } catch (e) {
    console.log("ERROR removing pbListener");
  }
};


/**
 * settingsMap implementation. This object keeps track of which allow/block
 * settings were applied to each window.
 */
let settingsMap = new WeakMap();

/**
 * Register our event listener to update Settings. Events are emitted
 * in the form emit(target, type, msg, nsIDOMWindow, origin),
 * where origin is the cookie origin and nsIDOMWindow is the parent origin.
 */
on(settingsMap, "update-settings", updateSettingsListener);

/**
 * Ways for settingsMap value to get updated for a domwin:
 *   third party cookie is set = noaction
 *   third party cookie on preloads list is heuristic-blacklisted: cookieblock
 *   third party cookie is heuristics-blacklisted = block
 *   user sets green on third party cookie = usernoaction
 *   user sets yellow on third party cookie = usercookieblock
 *   user sets red on third party cookie = userblock
 *
 *   @param {string} msg
 *   @param {nsIDOMWindow} aWin
 *   @param {string} aOrigin
 *   @return {null}
 */
function updateSettingsListener(msg, aWin, aOrigin) {
  if (!aWin) {
    console.log("Can't update request without a window");
    return;
  } else if (!aOrigin) {
    console.log("Missing origin for cookie");
    return;
  }

  aWin = aWin.top;
  var setting = settingsMap.get(aWin, {});
  setting[aOrigin] = msg;

  settingsMap.set(aWin, setting);
  //console.log("settingsMap: ", aWin.location.href, JSON.stringify(settingsMap.get(aWin)));
}

/**
 * Used on location change.
 *
 * @param {nsIDOMWindow} aWin
 */
function clearSettingsListener(aWin) {
  settingsMap.delete(aWin);
}

on(settingsMap, "clear-settings", clearSettingsListener);

exports.settingsMap = settingsMap;