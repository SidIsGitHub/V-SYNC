const fs = require('fs');
const path = require('path');

const indexFile = path.join(__dirname, 'src', 'index.html');
let html = fs.readFileSync(indexFile, 'utf8');
const lines = html.split('\n');

function removeLines(start, end) {
    for (let i = start - 1; i <= end - 1; i++) {
        lines[i] = null;
    }
}

// 1. Tabs 266-290 (Events, Chats)
removeLines(266, 290);
// Tabs 302-310 (Mentors)
removeLines(302, 310);

// 2. Mentors tab (325-357)
removeLines(325, 357);

// 3. Requests tab (387-389)
removeLines(387, 389);

// 4. Chats tab (391-448)
removeLines(391, 448);

// 5. StoriesBar (453-455)
removeLines(453, 455);

// 6. Events tab (493-532)
removeLines(493, 532);

// 7. Modals: EditEvent to ExploreFilter (533-840)
removeLines(533, 840);

// 8. ConnectionsModal (1158-1173)
removeLines(1158, 1173);

const newHtml = lines.filter(l => l !== null).join('\n');
fs.writeFileSync(indexFile, newHtml);
console.log('Frontend excision complete.');
