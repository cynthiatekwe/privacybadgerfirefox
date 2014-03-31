function init()
{
  console.log("Initializing popup.js");
  // Attach event listeners
  $("#activate_btn").click(activate);
  $("#deactivate_btn").click(deactivate);

  // Initialize based on activation state
  $(document).ready(function () {
    $('#blockedResourcesContainer').on('click', '.actionToggle', updateOrigin);
    $('#blockedResourcesContainer').on('mouseenter', '.tooltip', displayTooltip);
    $('#blockedResourcesContainer').on('mouseleave', '.tooltip', hideTooltip);
  });
}
$(init);

function activate() {
  $("#activate_btn").toggle();
  $("#deactivate_btn").toggle();
  $(".clicker").toggleClass("greyed");
  self.port.emit("activate");
}

function deactivate() {
  $("#activate_btn").toggle();
  $("#deactivate_btn").toggle();
  $(".clicker").toggleClass("greyed");
  self.port.emit("deactivate");
}


// ugly helpers: not to be used!

/**
 * Possible states for action:
 *  noaction, block, cookieblock, usernoaction, userblock, usercookieblock
 */

function _addOriginHTML(origin, printable, action) {
  console.log("Popup: adding origin HTML for " + origin);
  var classes = ["clicker"];
  var feedTheBadgerTitle = '';
  if (action.indexOf("user") === 0) {
    feedTheBadgerTitle = "click to return control of this tracker to Privacy Badger";
    classes.push("userset");
    action = action.substr(4);
  }
  if (action == "block" || action == "cookieblock")
    classes.push(action);
  var classText = 'class="' + classes.join(" ") + '"';

  return printable + '<div ' + classText + '" data-origin="' + origin + '" data-original-action="' + action + '"><div class="honeybadgerPowered tooltip" tooltip="'+ feedTheBadgerTitle + '"></div><div class="origin tooltip" tooltip="' + _badgerStatusTitle(action, origin) + '">' + _trim(origin,24) + '</div>' + _addToggleHtml(origin, action) + '<div class="tooltipContainer"></div></div>';
}

function _trim(str,max){
  if(str.length >= max){
    return str.slice(0,max-3)+'...';
  } else {
    return str;
  }
}

function _badgerStatusTitle(action, origin){
  let postfix;
  if (!origin) {
    postfix = " this tracker.";
  } else {
    postfix = " "+origin+".";
  }

  var statusMap = {
    block: "Blocked",
    cookieblock: "Blocked cookies from",
    noaction: "Allowed"
  };

  return statusMap[action] + postfix;
}

function _addToggleHtml(origin, action){
  var output = "";
  output += '<div class="switch-container ' + action + '">';
  output += '<div class="switch-toggle switch-3 switch-candy">';
  output += '<input id="block-' + origin + '" name="' + origin + '" type="radio" '+ _checked('block',action)+ '><label tooltip="Block ' + origin + '" class="tooltip actionToggle" for="block-' + origin + '" data-origin="' + origin + '" data-action="block"></label>';
  output += '<input id="cookieblock-' + origin + '" name="' + origin + '" type="radio" '+ _checked('cookieblock',action)+ '><label tooltip="Block cookies from ' + origin + '" class="tooltip actionToggle" for="cookieblock-' + origin + '" data-origin="' + origin + '" data-action="cookieblock"></label>';
  output += '<input id="noaction-' + origin + '" name="' + origin + '" type="radio" '+ _checked('noaction',action)+ '><label tooltip="Allow ' + origin + '" class="tooltip actionToggle" for="noaction-' + origin + '" data-origin="' + origin + '" data-action="noaction"></label>';
  output += '<a></a></div></div>';
  return output;
}

function _checked(name, action){
  if(name == action){
    return 'checked';
  } else {
    return '';
  }
}

function toggleBlockedStatus(elt,status) {
  console.log('toggle blocked status', elt, status);
  if(status){
    $(elt).removeClass("block cookieblock noaction").addClass(status);
    $(elt).addClass("userset");
    return;
  }

  var originalAction = elt.getAttribute('data-original-action');
  if ($(elt).hasClass("block"))
    $(elt).toggleClass("block");
  else if ($(elt).hasClass("cookieblock")) {
    $(elt).toggleClass("block"); // Why is this here?
    $(elt).toggleClass("cookieblock");
  }
  else
    $(elt).toggleClass("cookieblock");
  if ($(elt).hasClass(originalAction) ||
      (originalAction == 'noaction' && !($(elt).hasClass("block") ||
                                         $(elt).hasClass("cookieblock"))))
    $(elt).removeClass("userset");
  else
    $(elt).addClass("userset");
}

function refreshPopup(settings) {
  var origins = Object.keys(settings);
  if (!origins || origins.length === 0) {
    $('#applyButtonDiv').hide();
    document.getElementById("blockedResources").innerHTML = "Could not detect any tracking cookies.";
    return;
  }
  // old text that could go in printable:
  // "Suspicious 3rd party domains in this page.  Red: we've blocked it;
  // yellow: only cookies blocked; blue: no blocking yet";
  var printable = '<div id="associatedTab" data-tab-id="' + 0 + '"></div>';
  for (var i=0; i < origins.length; i++) {
    var origin = origins[i];
    var action = settings[origin];
    // todo: gross hack, use templating framework
    printable = _addOriginHTML(origin, printable, action);
    console.log('adding html for', origin, action);
  }
  document.getElementById("blockedResources").innerHTML = printable;
  $('#applyButtonDiv').show();
  $('#applyButton').click(applySettings);
  console.log("Done refreshing popup");
}

function reloadPage() {
  // TODO: fill in
  console.log("Reload page called");
}

function updateOrigin(event){
  var $elm = $(event.currentTarget);
  var $switchContainer = $elm.parents('.switch-container').first();
  var $clicker = $elm.parents('.clicker').first();
  var action = $elm.data('action');
  $switchContainer.removeClass('block cookieblock noaction').addClass(action);
  toggleBlockedStatus($clicker, action);
}

function displayTooltip(event){
  var $elm = $(event.currentTarget);
  var $container = $elm.parents('.clicker').children('.tooltipContainer');
  $container.text($elm.attr('tooltip'));
}

function hideTooltip(event){
  var $elm = $(event.currentTarget);
  var $container = $elm.parents('.clicker').children('.tooltipContainer');
  $container.text('');
}

function getCurrentClass(elt) {
  if ($(elt).hasClass("block"))
    return "block";
  else if ($(elt).hasClass("cookieblock"))
    return "cookieblock";
  else
    return "noaction";
}

function buildSettingsDict() {
  var settingsDict = {};
  $('.clicker').each(function() {
    var origin = $(this).attr("data-origin");
    if ($(this).hasClass("userset") && getCurrentClass(this) != $(this).attr("data-original-action")) {
      // todo: DRY; same as code above, break out into helper
      if ($(this).hasClass("block"))
        settingsDict[origin] = "block";
      else if ($(this).hasClass("cookieblock"))
        settingsDict[origin] = "cookieblock";
      else
        settingsDict[origin] = "noaction";
    }
  });
  return settingsDict;
}


/**
 * Listeners for communicating with the main process.
 */

function applySettings() {
  console.log("Starting to unload popup");
  var settings = buildSettingsDict();
  console.log("settings: ", JSON.stringify(settings));
  self.port.emit("done", settings);
};

self.port.on("show-trackers", function(settings) { refreshPopup(settings); });

self.port.on("cookiePrefsChange", function(prefBlocksCookies) {
  var cookiePrefsWarning = $('#cookiePrefsWarning');
  if (prefBlocksCookies) {
    if (cookiePrefsWarning.length == 0) {
      cookiePrefsWarning = $('<p id="cookiePrefsWarning">Your cookie preferences are changed from the defaults. This may reduce the effectiveness of Privacy Badger.</p>');
      $('#privacyBadgerHeader').prepend(cookiePrefsWarning);
    }
  } else {
    cookiePrefsWarning.remove();
  }
});