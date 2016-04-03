var AjeyaTogglLock = false;

var AJEYA_START_TIMEOUT = 500;
var AJEYA_MAX_TIMEOUT = 60000;

function urlPair(r, d, p) {
    return { regex: r, description: d, project: p };
}

var AJEYA_WEBSITES = [
    urlPair(/http:\/\/(?:.*\.)?xkcd\.com\S*/, 'XKCD', 'Fun'),
    urlPair(/http:\/\/(?:.*\.)?smbc-comics\.com\S*/, 'SMBC', 'Fun'),
]

function contains(a, obj) {
    for (var i = 0; i < a.length; i++) {
        if (a[i] === obj) {
            return true;
        }
    }
    return false;
}

function changeToggl (tab) {
    /* If the tab contains a recognized URL, changes Toggl so that it is
     * tracking the right task. Releases the lock when it is done.
     * Precondition:  The lock has been acquired.
     * tab:           The tab currently in focus
     */ 
    if (!AjeyaTogglLock) {
	console.log("ERROR: Lock not acquired when changing Toggl");
    }
    
    var entry = TogglButton.$curEntry;
    if (entry && !(entry.tags && contains(entry.tags, "auto-toggl"))) {
	AjeyaTogglLock = false;
	return;
    }

    var websiteEntry = null;
    for (var i = 0; i < AJEYA_WEBSITES.length; i++) {
        if (AJEYA_WEBSITES[i].regex.exec(tab.url)) {
	    websiteEntry = AJEYA_WEBSITES[i];
            break;
        }
    }

    // If the new task is the same as the old task, we don't need to do
    // anything, so we release the lock and return.
    if (entry && websiteEntry && entry.description == websiteEntry.description) {
	AjeyaTogglLock = false;
	return;
    }

    // If there is a task going on, it must be an Auto-Toggl'd task.  Since
    // we have navigated away from the old site, we should stop that task.
    if (entry) {
	console.log('Stopping the current task');
	TogglButton.stopTimeEntry(
	    { type: 'stop', respond: true },
	    function(response) {
		if (response.success) {
		    // Lock will be released in startToggl
		    startToggl(websiteEntry);
		} else {
		    console.log('ERROR: Failed to stop task!');
		    console.log(response);
		    AjeyaTogglLock = false;
		}
	    });
    } else if (websiteEntry) {
	// Lock will be released in startToggl
	startToggl(websiteEntry);
    } else {
	// Release the lock
	AjeyaTogglLock = false;
    }
}

function startToggl(websiteEntry) {
    /* Starts a new Toggl entry based on details from websiteEntry.
     * Precondition:  The lock has been acquired, no task is running
     * websiteEntry:  An element of AJEYA_WEBSITES
     */
    if (!websiteEntry) {
	AjeyaTogglLock = false;
	return;
    }

    opts = {
        type: 'timeEntry',
        respond: true,
        description: websiteEntry.description,
        tags: [ 'auto-toggl' ],
        projectName: websiteEntry.project,
        createdWith: "TogglButton-AutoToggl",
        service: 'AutoToggl'
    };

    console.log('Creating new task: ' + opts.description);
    TogglButton.createTimeEntry(opts, function (response) {
	if (!response.success) {
	    console.log('ERROR: Failed to create task!');
	    console.log(response);
	}
	AjeyaTogglLock = false;
    });
    TogglButton.hideNotification('remind-to-track-time');

}

function checkActiveTab(timeout) {
    if (AjeyaTogglLock) {
        if (timeout <= AJEYA_MAX_TIMEOUT) {
            setTimeout(function () {
                         checkActiveTab(timeout*2);
                       },
                       timeout);
        }
    } else {
	AjeyaTogglLock = true;
	chrome.tabs.query(
	    {active: true, currentWindow: true},
	    function (tabs) {
		if (tabs.length === 1) {
		    changeToggl(tabs[0]);
		} else {
		    console.log('ERROR: Did not find the active tab -- instead got ' + tabs);
		    AjeyaTogglLock = false;
		}
	    });
    }
}

chrome.tabs.onActivated.addListener(function(activeInfo) {
    checkActiveTab(AJEYA_START_TIMEOUT);
});

chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
    if (changeInfo.url) {
	checkActiveTab(AJEYA_START_TIMEOUT);
    }
});
