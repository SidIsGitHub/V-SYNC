const fs = require('fs');

const file = 'src/mentorship7.js';
let code = fs.readFileSync(file, 'utf8');

const funcsToRemove = [
    'loadEvents', 'openEventFilterModal', 'setEventFilter', 'setEventSort', 'applyEventFilters', 'clearEventFilters',
    'openAddEventModal', 'submitManualEvent', 'deleteEvent', 'editEvent', 'openEditEventModal', 'saveEventChanges', 'previewEditEventImages',
    
    'loadMentors', 'handleUserSearch', 'openExploreSortModal', 'toggleExploreFilter', 'applyExploreFilters', 'clearExploreFilters',
    
    'loadRequests', 'handleConnectRequest', 'sendConnectRequest', 'cancelConnectRequest', 'acceptRequest', 'rejectRequest', 'removeConnection', 'loadConnections', 'showConnectionsModal',
    
    'loadChats', 'filterChatConnections', 'openChat', 'closeChatView', 'handleSendMessage', 'toggleEmojiPicker', 'addEmoji',
    'handleChatFileSelect', 'unsendMessage', 'deleteChat', 'deleteCurrentStory',
    
    'loadStories', 'renderStories', 'openStoryUpload', 'handleStoryFileSelect', 'uploadStory', 'openStoryViewer', 'closeStoryViewer', 'nextStory', 'prevStory',
    
    'openProfileModal', 'closeProfileModal', 'shareViewedProfile', 'toggleStoryMenu', 'renderEmojiPicker'
];

let lines = code.split('\n');

function findFunctionRange(funcName) {
    let startIdx = -1;
    for(let i=0; i<lines.length; i++) {
        if(!lines[i]) continue;
        if(lines[i].includes(`function ${funcName}(`) || lines[i].includes(`const ${funcName} =`) || lines[i].includes(`let ${funcName} =`)) {
            if(!lines[i].trim().startsWith('//')) {
                startIdx = i;
                break;
            }
        }
    }
    
    if(startIdx === -1) return null;
    
    let openBraces = 0;
    let started = false;
    
    for(let i=startIdx; i<lines.length; i++) {
        let line = lines[i];
        if(!line) continue;
        for(let j=0; j<line.length; j++) {
            if(line[j] === '{') {
                openBraces++;
                started = true;
            } else if(line[j] === '}') {
                openBraces--;
            }
        }
        if(started && openBraces === 0) {
            return {start: startIdx, end: i};
        }
    }
    return null;
}

for(let f of funcsToRemove) {
    let range = findFunctionRange(f);
    while(range) {
        console.log(`Removing ${f} from line ${range.start+1} to ${range.end+1}`);
        for(let i=range.start; i<=range.end; i++) {
            lines[i] = null;
        }
        range = findFunctionRange(f);
    }
}

fs.writeFileSync(file, lines.filter(l => l !== null).join('\n'));
console.log('JS Excision complete.');
