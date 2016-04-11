var AjeyaTogglLock = false;

// Time in milliseconds between checking the current active tab.
var AJEYA_TIME_INTERVAL = 1000;

// Time in milliseconds that we must be on a tab before we start a task for it.
var AJEYA_TIME_TO_START_TASK = 5000;

// True if there is no current task and the last task was stopped by AutoToggl.
var lastTaskStoppedByAutoToggl = null;

// A urlEntry consists of:
// 1. regex -- Regular expression. This entry should be used for any URL
//             matching the regex.
// 2. description -- Description for the associated Toggl task.
// 3. project -- Project for the associated Toggl task.
// 4. force -- true if AutoToggl should create a new Toggl task even if a
//             user-initiated Toggl task is ongoing.
function urlEntry(r, d, p, f) {
    return { regex: r, description: d, project: p, force: f };
}

// TODO: Will the regex screw up for something like http://foo.com/?q=http://xkcd.com
var AJEYA_WEBSITES = [
    urlEntry(/https?:\/\/(?:.*\.)?xkcd\.com\S*/, 'XKCD', 'Fun', false),
    urlEntry(/https?:\/\/(?:.*\.)?smbc-comics\.com\S*/, 'SMBC', 'Fun', false),
    urlEntry(/https?:\/\/(?:.*\.)?todoist\.com\S*/, 'Todoist', 'Work - Misc.', false)
]

function contains(a, obj) {
    for (var i = 0; i < a.length; i++) {
        if (a[i] === obj) {
            return true;
        }
    }
    return false;
}

function changeTogglBasedOnTab (tab) {
    /* If the tab contains a recognized URL, changes Toggl so that it is
     * tracking the right task.
     * Precondition:  The lock has been acquired.
     * tab:           The tab currently in focus
     */ 
    var entry = TogglButton.$curEntry;
    var websiteEntry = null;
    for (var i = 0; i < AJEYA_WEBSITES.length; i++) {
        if (AJEYA_WEBSITES[i].regex.exec(tab.url)) {
	    websiteEntry = AJEYA_WEBSITES[i];
            break;
        }
    }

    // If the new task is the same as the old task, no need to do anything.
    if (entry && websiteEntry && entry.description === websiteEntry.description) {
	return;
    }

    // If there is a task going on, it must be an Auto-Toggl'd task.  Since
    // we have navigated away from the old site, we should stop that task.
    if (websiteEntry) {
	maybeStartToggl(websiteEntry);
    } else if (entry) {
	stopAutoToggl();
    }
}

function maybeStartToggl(websiteEntry) {
    /* Starts a new Toggl entry based on details from websiteEntry.
     * websiteEntry:  An element of AJEYA_WEBSITES
     * entry:         A TogglButton entry
     */
    if (!websiteEntry) {
	return;
    }
    var entry = TogglButton.$curEntry;

    // If there is no current task, but the task we want to start and the last
    // task stopped are the same, and the last task was stopped by the user,
    // then don't start the task -- we would be undoing the user's action
    var noCurrTask = !entry;
    var lastTask = TogglButton.$latestStoppedEntry
    var sameAsLastDesc = lastTask && websiteEntry.description === lastTask.description;
    var sameAsLastProj = lastTask && websiteEntry.project === lastTask.project;
    var sameAsLastTask = sameAsLastDesc && sameAsLastProj;
    if (noCurrTask && sameAsLastTask && !lastTaskStoppedByAutoToggl) {
	return;
    }

    // We can only start a new task if we want to force the task to start, or
    // if there is no current task, or the current task is AutoToggld
    var currTaskIsAuto = entry && entry.tags && contains(entry.tags, "auto-toggl");
    if (!(websiteEntry.force || noCurrTask || currTaskIsAuto)) {
	return;
    }

    AjeyaTogglLock = true;

    function startTogglIfMatch(tab) {
	if (websiteEntry.regex.exec(tab.url)) {
	    startAutoToggl(websiteEntry);
	}
    };

    setTimeout(function () {
	checkActiveTab(startTogglIfMatch, function () {});
	AjeyaTogglLock = false;
    }, AJEYA_TIME_TO_START_TASK);
}

function startAutoToggl(websiteEntry) {
    var opts = {
        type: 'timeEntry',
        respond: true,
        description: websiteEntry.description,
        tags: [ 'auto-toggl' ],
        projectName: websiteEntry.project,
        createdWith: "TogglButton-AutoToggl",
        service: 'AutoToggl'
    };

    console.log('Creating new task: ' + opts.description);
    lastTaskStoppedByAutoToggl = TogglButton.$curEntry;
    TogglButton.createTimeEntry(opts, function (response) {
	if (!response.success) {
	    console.log('ERROR: Failed to create task!');
	    console.log(response);
	}
    });
    TogglButton.hideNotification('remind-to-track-time');
}

function stopAutoToggl() {
    /*
     * Stops the current task if it was created by Auto-Toggl.
     */
    var entry = TogglButton.$curEntry;
    if (!(entry && entry.tags && contains(entry.tags, "auto-toggl"))) {
	return;
    }

    console.log('Stopping the task ' + entry.description);
    lastTaskStoppedByAutoToggl = entry;
    TogglButton.stopTimeEntry(
	{ type: 'stop', respond: true },
	function(response) {
	    if (!response.success) {
		console.log('ERROR: Failed to stop task!');
		console.log(response);
	    }
	});
}

function checkActiveTab(onSuccess, onFail) {
    chrome.tabs.query(
	{active: true, currentWindow: true},
	function (tabs) {
	    if (tabs.length === 1) {
		onSuccess(tabs[0]);
	    } else {
		onFail();
	    }
	});
}

function loop () {
    // Don't do anything until the extension has finished loading the user
    // Don't do anything if the lock has been acquired
    if (TogglButton.$user && !AjeyaTogglLock) {

	var entry = TogglButton.$curEntry;
	// Intentionally using identity instead of equality, I think it means
	// that if the same task is started again, it will not be identical
	// even though it could be equal.
	if (entry && entry != lastTaskStoppedByAutoToggl) {
	    lastTaskStoppedByAutoToggl = null;
	}

	checkActiveTab(changeTogglBasedOnTab, stopAutoToggl);
    }

    setTimeout(loop, AJEYA_TIME_INTERVAL);
}

loop();

/*
chrome.tabs.onActivated.addListener(function(activeInfo) {
    checkActiveTab(AJEYA_START_TIMEOUT);
});

chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
    if (changeInfo.url) {
	checkActiveTab(AJEYA_START_TIMEOUT);
    }
});
*/
