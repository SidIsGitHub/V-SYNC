
// --- JWT / LOCALSTORAGE AUTH ---
let currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
window.currentUser = currentUser;



// --- DAILY POLL LOGIC ---

// REPLACE THESE WITH REAL UIDs
const ADMIN_UIDS = [
    'user_1766072628767',  //Sid
    'user_1766080376453' //Selva
];

let currentPollData = null;

let pollUnsub; // Global variable to stop duplicate listeners
/* --- AUTO MODERATION SYSTEM --- */
const BANNED_WORDS = [
    "fuck", "bitch", "chutiya", "madarchod", "bhosdika", "bhosdike", "rand"
    , "bhadwe", "gandu", "lavda", "bhenchod", "lavdu", "chamar", "chamaar", "asshole"
];

// 2. The Filter Function
function containsSensitiveContent(text) {
    if (!text) return false;
    const lowerText = text.toLowerCase();

    // Check if any banned word exists in the text
    return BANNED_WORDS.some(word => lowerText.includes(word));
}

// 3. (Optional) Log the attempt to the server for Admins to see
function logModerationAttempt(text, type) {
    console.log("Moderation event:", text, type);
}

function openDailyPoll() {
    lockScroll();
    const modal = document.getElementById('dailyPollModal');
    if (modal) modal.classList.add('active');

    // Check Admin Status
    const editBtn = document.getElementById('btnEditPoll');
    if (editBtn) {
        if (currentUser && typeof ADMIN_UIDS !== 'undefined' && ADMIN_UIDS.includes(currentUser.uid)) {
            editBtn.style.display = 'block';
        } else {
            editBtn.style.display = 'none';
        }
    }

    // Ensure listener is running (in case it wasn't started on login)
    if (!pollUnsub) {
        loadActivePoll();
    }
}

/* --- FIXED POLL LOADER (Prevents 'uid' of null error) --- */
/* --- FIXED POLL LOADER (Prevents 'uid' of null error) --- */
function loadActivePoll() {
    const container = document.getElementById('pollOptionsContainer');
    const questionEl = document.getElementById('pollQuestionDisplay');
    const votesEl = document.getElementById('pollTotalVotes');
    const pollBtn = document.querySelector('.daily-poll-style');

    if (container) container.innerHTML = '<p style="color:#888;">Loading...</p>';

    if (pollUnsub) pollUnsub(); // Clear old listener

    pollUnsub = db.collection('system').doc('daily_poll').onSnapshot(doc => {
        if (!doc.exists) {
            if (questionEl) questionEl.innerText = "No active poll today.";
            if (container) container.innerHTML = "";
            currentPollData = null;
            return;
        }

        const data = doc.data();
        currentPollData = data;

        // 🚨 SAFETY CHECK: If user isn't logged in yet, default to "not voted"
        // This prevents the "reading 'uid' of null" crash
        const myUid = currentUser ? currentUser.uid : null;

        // 2. CHECK VOTE STATUS
        let hasVoted = false;
        if (myUid) {
            if (data.votes && data.votes[myUid] !== undefined) hasVoted = true;
            else if (data.voters && data.voters.includes(myUid)) hasVoted = true;
        }

        if (pollBtn) {
            if (hasVoted) pollBtn.classList.add('voted');
            else pollBtn.classList.remove('voted');
        }

        // 3. RENDER CONTENT
        if (!questionEl || !container) return;

        questionEl.innerText = data.question;
        const totalVotes = data.totalVotes || 0;
        if (votesEl) votesEl.innerText = `${totalVotes} Votes`;

        let html = '';
        // Safe access to vote index
        const myVoteIndex = (myUid && data.votes) ? data.votes[myUid] : undefined;

        // Show results if voted OR if Admin
        const isAdmin = myUid && typeof ADMIN_UIDS !== 'undefined' && ADMIN_UIDS.includes(myUid);
        const showResults = hasVoted || isAdmin;

        data.options.forEach((opt, index) => {
            const voteCount = data.counts ? (data.counts[index] || 0) : 0;
            const percent = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
            const isSelected = myVoteIndex === index ? 'voted' : '';

            // Disable clicking if voted OR if user is not logged in (optional UX choice)
            const clickAction = myUid ? `onclick="submitVote(${index})"` : `onclick="showToast('Please login to vote')"`;

            html += `
            <div class="poll-option-btn ${isSelected}" ${clickAction} style="${hasVoted ? 'pointer-events:none;' : ''}">
                <div class="poll-fill-bar" style="width: ${showResults ? percent : 0}%"></div>
                <div class="poll-text-wrapper">
                    <span>${opt}</span>
                    ${showResults ? `<span>${percent}%</span>` : ''}
                </div>
            </div>`;
        });

        container.innerHTML = html;
    });
}

function submitVote(optionIndex) {
    triggerHaptic();
    if (!currentUser) return showToast("Please login to vote.");

    // 1. SAFETY CHECK: Ensure poll data exists
    if (!currentPollData) {
        console.error("Poll data not loaded yet.");
        return showToast("Poll is loading, please wait...");
    }

    // 2. SAFETY CHECK: Ensure 'votes' object exists (Initialize if missing)
    const votesMap = currentPollData.votes || {};

    // 3. Optimistic check using safe variable
    if (votesMap[currentUser.uid] !== undefined) {
        return showToast("You already voted today!");
    }

    const pollRef = db.collection('system').doc('daily_poll');

    db.runTransaction(async (t) => {
        const doc = await t.get(pollRef);
        if (!doc.exists) throw "Poll does not exist";

        const data = doc.data();
        const safeVotes = data.votes || {}; // Double safety inside transaction

        if (safeVotes[currentUser.uid] !== undefined) {
            throw "Already voted";
        }

        const newCounts = data.counts || new Array(data.options.length).fill(0);
        newCounts[optionIndex] = (newCounts[optionIndex] || 0) + 1;

        t.update(pollRef, {
            [`votes.${currentUser.uid}`]: optionIndex,
            counts: newCounts,
            totalVotes: firebase.firestore.FieldValue.increment(1)
        });
    }).then(() => {
        showToast("Vote cast!");
    }).catch(e => {
        if (e === "Already voted") showToast("You already voted.");
        else {
            console.error(e);
            showToast("Error processing vote.");
        }
    });
}
// --- ADMIN ONLY FUNCTIONS ---

// --- ADMIN ONLY FUNCTIONS ---

function togglePollEditMode() {
    const view = document.getElementById('pollViewMode');
    const edit = document.getElementById('pollEditMode');
    const optionsList = document.getElementById('pollOptionsList');

    if (view.classList.contains('hidden')) {
        // Switching BACK to View Mode
        view.classList.remove('hidden');
        edit.classList.add('hidden');
    } else {
        // Switching TO Edit Mode
        view.classList.add('hidden');
        edit.classList.remove('hidden');

        // Clear and Initialize with 2 empty options if empty
        if (optionsList.innerHTML.trim() === '') {
            addPollOptionField('', false); // Option 1 (No remove button)
            addPollOptionField('', false); // Option 2 (No remove button)
        }
    }
}

function addPollOptionField(value = '', allowRemove = true) {
    const container = document.getElementById('pollOptionsList');
    const div = document.createElement('div');
    div.className = 'poll-input-row';

    // Generate unique ID for input
    const id = 'pollOpt_' + Date.now() + Math.random().toString(36).substr(2, 5);

    div.innerHTML = `
                <input type="text" id="${id}" value="${value}" placeholder="Enter option..." class="poll-option-input">
                ${allowRemove ? `<div class="btn-remove-opt" onclick="this.parentElement.remove()">✕</div>` : ''}
            `;

    container.appendChild(div);
}

function saveNewPoll() {
    const q = document.getElementById('newPollQuestion').value.trim();

    // Collect all inputs from the dynamic list
    const inputs = document.querySelectorAll('.poll-option-input');
    const options = [];

    inputs.forEach(input => {
        const val = input.value.trim();
        if (val) options.push(val);
    });

    if (!q) return alert("Please enter a question.");
    if (options.length < 2) return alert("Please provide at least 2 valid options.");

    if (!confirm("This will WIPE the current poll and start fresh. Confirm?")) return;

    // Initialize counts array based on number of options
    const zeroCounts = new Array(options.length).fill(0);

    db.collection('system').doc('daily_poll').set({
        question: q,
        options: options,
        counts: zeroCounts,
        votes: {}, // Reset votes map
        totalVotes: 0,
        createdAt: new Date()
    }).then(() => {
        showToast("New Daily Poll Published!");

        // Reset UI
        document.getElementById('newPollQuestion').value = "";
        document.getElementById('pollOptionsList').innerHTML = ""; // Clear options

        togglePollEditMode(); // Go back to view mode
    }).catch(e => {
        console.error(e);
        alert("Error saving poll: " + e.message);
    });
}
/* =========================================
   PROFILE PICTURE CROPPER (Fixed: Mobile Scrolling & Huge Image)
   ========================================= */

let profileEditorState = {
    scale: 1,
    panning: false,
    pointX: 0,
    pointY: 0,
    startX: 0,
    startY: 0,
    imgElement: null,
    mode: null,
    file: null
};

// 1. Handle File Selection
function handleProfileFileSelect(input, mode) {
    if (input.files && input.files[0]) {
        const file = input.files[0];
        const url = URL.createObjectURL(file);

        profileEditorState.mode = mode;
        profileEditorState.file = file;

        const img = document.getElementById('profileEditorImg');
        const container = document.getElementById('profileCropperZone'); // Use the Zone

        // Reset Visuals
        img.src = url;
        img.style.display = 'block';
        img.style.opacity = '0';
        img.style.transform = 'translate(0px, 0px) scale(1)';

        document.getElementById('profileUploadModal').classList.add('active');

        img.onload = () => {
            setTimeout(() => {
                const boxWidth = container.offsetWidth;
                const boxHeight = container.offsetHeight;
                const imgW = img.naturalWidth;
                const imgH = img.naturalHeight;

                if (boxWidth === 0) return;

                // Auto-Fit Logic
                const scaleX = boxWidth / imgW;
                const scaleY = boxHeight / imgH;
                const initialScale = Math.max(scaleX, scaleY);

                profileEditorState.pointX = 0;
                profileEditorState.pointY = 0;
                profileEditorState.scale = initialScale;
                profileEditorState.imgElement = img;

                updateProfileTransform();
                img.style.opacity = '1';

            }, 100);
        };

        // Attach gestures to the CONTAINER, not the image
        initProfileGestures(container);

        input.value = "";
    }
}

// 2. Gesture Logic (Attached to Container to Stop Scroll)
function initProfileGestures(zone) {
    // Mouse
    zone.onmousedown = startProfilePan;
    zone.onwheel = (e) => {
        e.preventDefault();
        adjustProfileZoom(e.deltaY * -0.001);
    };

    // Touch - Passive: false is REQUIRED to stop scrolling
    zone.addEventListener('touchstart', startProfilePan, { passive: false });
}

function getClientPos(e) {
    if (e.touches && e.touches.length > 0) {
        return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    return { x: e.clientX, y: e.clientY };
}

function startProfilePan(e) {
    // CRITICAL: Stop the browser from scrolling the page
    if (e.cancelable) e.preventDefault();

    profileEditorState.panning = true;
    const pos = getClientPos(e);

    // Calculate offset based on current image position
    profileEditorState.startX = pos.x - profileEditorState.pointX;
    profileEditorState.startY = pos.y - profileEditorState.pointY;

    // Attach Global Listeners
    document.addEventListener('mousemove', moveProfilePan);
    document.addEventListener('mouseup', endProfilePan);

    // Mobile Listeners (passive: false)
    document.addEventListener('touchmove', moveProfilePan, { passive: false });
    document.addEventListener('touchend', endProfilePan);
}

function moveProfilePan(e) {
    if (!profileEditorState.panning) return;

    // CRITICAL: Stop browser scroll/refresh gestures
    if (e.cancelable) e.preventDefault();

    const pos = getClientPos(e);
    profileEditorState.pointX = pos.x - profileEditorState.startX;
    profileEditorState.pointY = pos.y - profileEditorState.startY;

    updateProfileTransform();
}

function endProfilePan() {
    profileEditorState.panning = false;
    document.removeEventListener('mousemove', moveProfilePan);
    document.removeEventListener('mouseup', endProfilePan);
    document.removeEventListener('touchmove', moveProfilePan);
    document.removeEventListener('touchend', endProfilePan);
}

function adjustProfileZoom(delta) {
    const newScale = profileEditorState.scale + delta;
    profileEditorState.scale = Math.min(Math.max(0.1, newScale), 5);
    updateProfileTransform();
}

function updateProfileTransform() {
    const img = document.getElementById('profileEditorImg');
    if (img) {
        img.style.transform = `translate3d(${profileEditorState.pointX}px, ${profileEditorState.pointY}px, 0) scale(${profileEditorState.scale})`;
    }
}

// 3. Crop & Save (No changes needed here)
async function saveProfileCrop() {
    const btn = document.getElementById('btnSaveProfilePic');
    btn.innerText = "Processing...";
    btn.disabled = true;

    try {
        const croppedBlob = await cropProfileToCanvas();

        if (profileEditorState.mode === 'register') {
            const reader = new FileReader();
            reader.onload = function (e) {
                window.registerProfileBlob = croppedBlob;
                window.registerProfileBase64 = e.target.result;

                // Update text if element exists
                const nameEl = document.getElementById('regFileName');
                if (nameEl) nameEl.innerText = "Photo Ready";

                closeModal('profileUploadModal');
                btn.innerText = "Save Photo";
                btn.disabled = false;
            };
            reader.readAsDataURL(croppedBlob);
        } else {
            btn.innerText = "Uploading...";
            croppedBlob.name = "profile_" + Date.now() + ".jpg";
            const url = await uploadFileToStorage(croppedBlob);

            await db.collection('users').doc(currentUser.uid).update({
                profilePic: url,
                updatedAt: new Date()
            });

            if (window.currentUserData) window.currentUserData.profilePic = url;

            loadProfile();
            updateUserInfo();
            // syncUserProfileToContent(); // Uncomment if you have this function

            closeModal('profileUploadModal');
            showToast("Profile Picture Updated!");
            btn.innerText = "Save Photo";
            btn.disabled = false;
        }
    } catch (e) {
        console.error(e);
        alert("Error saving photo.");
        btn.innerText = "Save Photo";
        btn.disabled = false;
    }
}

function cropProfileToCanvas() {
    return new Promise((resolve) => {
        const img = document.getElementById('profileEditorImg');
        const container = document.getElementById('profileCropperZone');

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        canvas.width = 500;
        canvas.height = 500;

        const imgRect = img.getBoundingClientRect();
        const boxRect = container.getBoundingClientRect();

        const ratio = canvas.width / boxRect.width;

        const drawX = (imgRect.left - boxRect.left) * ratio;
        const drawY = (imgRect.top - boxRect.top) * ratio;
        const drawW = imgRect.width * ratio;
        const drawH = imgRect.height * ratio;

        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        ctx.drawImage(img, drawX, drawY, drawW, drawH);

        canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.9);
    });
}
/* --- NATIVE SHARE FUNCTION --- */
async function sharePost(postId, postTitle) {
    triggerHaptic();
    // 1. Construct a direct link (Mock URL if routing isn't set up yet)
    const shareUrl = `${window.location.origin}?post=${postId}`;

    const shareData = {
        title: 'V-SYNC Post',
        text: postTitle,
        url: shareUrl
    };

    // 2. Try Native Share (Mobile)
    if (navigator.share) {
        try {
            await navigator.share(shareData);
            console.log('Shared successfully');
        } catch (err) {
            console.log('Share closed/cancelled');
        }
    }
    // 3. Fallback: Copy to Clipboard (Desktop)
    else {
        try {
            await navigator.clipboard.writeText(shareUrl);
            // Use your toast function here if you have one, or generic alert
            if (typeof showToast === 'function') {
                showToast('Link copied to clipboard!');
            } else {
                alert('Link copied to clipboard!');
            }
        } catch (err) {
            console.error('Failed to copy', err);
        }
    }
}

// --- GLOBAL STATE ---
// currentUser already declared at the top
let currentUserData = null;

// --- CONSTANTS (Moved to Top) ---
const TAG_DATA = [
    { name: "Technical", class: "tag-technical", hex: "#0079D3" },
    { name: "Academic", class: "tag-academic", hex: "#FF4500" },
    { name: "Council / Committee", class: "tag-council", hex: "#46D160", hasSub: true },
    { name: "Faculty Related", class: "tag-faculty", hex: "#D93A00" },
    { name: "Career Advice", class: "tag-career", hex: "#7193FF" },
    { name: "Placements / Internships", class: "tag-placements", hex: "#FFB000" },
    { name: "Campus / Infrastructure", class: "tag-campus", hex: "#0DD3BB" },
    { name: "Sports", class: "tag-sports", hex: "#CC3600" },
    { name: "Honest Review", class: "tag-review", hex: "#FF585B" },
    { name: "General", class: "tag-general", hex: "#878A8C" },
    { name: "Gossip", class: "tag-gossip", hex: "#A335EE" }
];

const COUNCIL_SUBS = [
    "Technical Council", "Cultural Council", "Sports Council",
    "CESA", "CSI", "GDG", "NSS", "IEEE", "V-Club", "Music Club"
];

// --- FILTERS ---
window.activeFilters = {
    sortBy: 'latest',
    years: [],
    tags: []
};

/* =========================================
   STARTUP & AUTO-LOGIN LOGIC
   ========================================= */

// 1. Reset Global State
currentUser = null;
currentUserData = null;

// 2. Check for Saved Session
const savedUid = localStorage.getItem('vsync_uid');

if (savedUid) {
    // A. User was logged in -> Auto-Login them
    console.log("Restoring session for:", savedUid);
    simulateLogin(savedUid, false);
} else {
    // B. No saved user -> Show Login Screen
    document.getElementById('authScreen').classList.remove('hidden');
    document.getElementById('appScreen').classList.add('hidden');
}

// 3. Define Logout Function (To clear the save)
// 3. Define Logout Function (To clear the save)
window.performLogout = function () {
    // REPLACED NATIVE CONFIRM WITH CUSTOM MODAL
    showConfirm(
        "Log Out?",
        "Are you sure you want to sign out?",
        () => {
            // Clear saved data
            localStorage.removeItem('vsync_uid');

            // Reload page to reset everything cleanly
            window.location.reload();
        }
    );
};
document.getElementById('authScreen').classList.remove('hidden');
document.getElementById('appScreen').classList.add('hidden');


// 2. Force Show Login Screen, Hide App
document.getElementById('authScreen').classList.remove('hidden');
document.getElementById('appScreen').classList.add('hidden');

// --- AUTH LOGIC ---
// --- AUTH: REAL LOGIN HANDLER ---
// --- AUTH: REAL LOGIN HANDLER (FIXED) ---
// --- LIGHTBOX LOGIC (Zoom & Pan) ---
let currentScale = 1;
let isDragging = false;
let startX, startY, translateX = 0, translateY = 0;

function openLightbox(src) {
    const modal = document.getElementById('imageLightbox');
    const img = document.getElementById('lightboxImg');

    // Reset state
    currentScale = 1;
    translateX = 0;
    translateY = 0;
    img.style.transform = `translate(0px, 0px) scale(1)`;

    img.src = src;
    modal.style.display = "flex";

    // Add Scroll Listener
    img.addEventListener('wheel', handleZoom, { passive: false });
    // Add Drag Listeners
    img.addEventListener('mousedown', startDrag);
    window.addEventListener('mousemove', drag);
    window.addEventListener('mouseup', endDrag);
}
// --- UPLOAD HELPER ---
function uploadFileToStorage(file) {
    return new Promise((resolve, reject) => {
        // Create a unique file name
        const fileName = Date.now() + "_" + file.name;
        const storageRef = storage.ref().child('uploads/' + fileName);

        // --- NEW: FORCE DOWNLOAD METADATA ---
        const metadata = {
            contentType: file.type,
            contentDisposition: `attachment; filename="${file.name}"`
        };

        const uploadTask = storageRef.put(file, metadata); // <--- Pass metadata here

        uploadTask.on('state_changed',
            (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                console.log('Upload is ' + progress + '% done');
            },
            (error) => {
                console.error("Upload failed:", error);
                reject(error);
            },
            () => {
                uploadTask.snapshot.ref.getDownloadURL().then((downloadURL) => {
                    resolve(downloadURL);
                });
            }
        );
    });
}
// --- YEAR BADGE HELPER ---
function getYearBadgeHtml(year) {
    if (!year || year === 'undefined') return '';

    let color = '#888'; // Default Gray
    // Twitter/Apple System Colors
    if (year === 'FE') color = '#30D158'; // Green
    if (year === 'SE') color = '#0A84FF'; // Blue
    if (year === 'TE') color = '#BF5AF2'; // Purple
    if (year === 'BE') color = '#FF9F0A'; // Orange

    return `<span style="
        color: ${color}; 
        border: 1px solid ${color}; 
        background: ${color}15; 
        padding: 1px 5px; 
        border-radius: 4px; 
        font-size: 9px; 
        font-weight: 800; 
        margin-left: 6px; 
        vertical-align: middle;
        display: inline-block;
    ">${year}</span>`;
}
function closeLightbox() {
    const modal = document.getElementById('imageLightbox');
    const img = document.getElementById('lightboxImg');
    modal.style.display = "none";

    // Clean up listeners
    img.removeEventListener('wheel', handleZoom);
    img.removeEventListener('mousedown', startDrag);
    window.removeEventListener('mousemove', drag);
    window.removeEventListener('mouseup', endDrag);
}
// --- CUSTOM CONFIRMATION LOGIC ---
function showConfirm(title, message, onConfirmCallback) {
    const modal = document.getElementById('confirmModal');
    document.getElementById('confirmTitle').innerText = title;
    document.getElementById('confirmMessage').innerText = message;

    // Assign the specific action to the Confirm button
    const confirmBtn = document.getElementById('btnConfirmAction');
    confirmBtn.onclick = function () {
        onConfirmCallback(); // Run the passed function
        closeConfirmModal(); // Close modal
    };

    modal.classList.add('active');
}
function showToast(message) {
    const x = document.getElementById("customToast");
    x.innerText = message;
    x.className = "show";
    setTimeout(function () { x.className = x.className.replace("show", ""); }, 3000);
}

function closeConfirmModal() {
    document.getElementById('confirmModal').classList.remove('active');
}

function handleZoom(event) {
    event.preventDefault(); // Stop page scrolling
    const img = document.getElementById('lightboxImg');

    // Determine zoom direction
    const delta = event.deltaY * -0.005; // -0.005 sensitivity
    const newScale = Math.min(Math.max(0.5, currentScale + delta), 5); // Min 0.5x, Max 5x

    currentScale = newScale;
    updateTransform();
}
function deleteMessage(chatId, messageId) {
    if (!confirm("Unsend this message?")) return;

    db.collection('chats').doc(chatId).collection('messages').doc(messageId).delete()
        .then(() => {
            console.log("Message unsent");
            // The onSnapshot listener in openInlineChat will automatically remove it from the UI
        })
        .catch(error => {
            console.error("Error removing message: ", error);
            alert("Could not unsend message.");
        });
}
// --- DRAG / PAN LOGIC ---
function startDrag(e) {
    if (currentScale <= 1) return; // Only drag if zoomed in
    isDragging = true;
    startX = e.clientX - translateX;
    startY = e.clientY - translateY;
    document.getElementById('lightboxImg').style.cursor = 'grabbing';
}

function drag(e) {
    if (!isDragging) return;
    e.preventDefault();
    translateX = e.clientX - startX;
    translateY = e.clientY - startY;
    updateTransform();
}

function endDrag() {
    isDragging = false;
    document.getElementById('lightboxImg').style.cursor = 'grab';
}

function updateTransform() {
    const img = document.getElementById('lightboxImg');
    img.style.transform = `translate(${translateX}px, ${translateY}px) scale(${currentScale})`;
}
function handleLogin(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerText;

    const email = document.getElementById('loginEmail').value.trim().toLowerCase();
    const password = document.getElementById('loginPassword').value.trim();
    const isAnon = document.getElementById('loginAnon').checked;

    if (!email || !password) return showToast("Please enter credentials.");

    btn.innerText = "Verifying...";
    btn.disabled = true;

    // Check DB
    db.collection('users').where('email', '==', email).get()
        .then(snap => {
            if (!snap.empty) {
                const userDoc = snap.docs[0];
                const userData = userDoc.data();

                // --- PASSWORD CHECK ---
                if (userData.password === password) {
                    // Success!
                    simulateLogin(userDoc.id, isAnon);
                } else {
                    // Fail!
                    showToast("❌ Incorrect Password");
                    btn.innerText = originalText;
                    btn.disabled = false;
                }
            } else {
                showToast("❌ Account not found.");
                btn.innerText = originalText;
                btn.disabled = false;
            }
        })
        .catch(err => {
            console.error(err);
            showToast("Login Error.");
            btn.innerText = originalText;
            btn.disabled = false;
        });
}
// --- HELPER: GENERATE BUTTON HTML ---
function generateUserButtonHtml(u) {
    const uid = u.userId || u.uid; // Handle both structures
    const name = (u.name || "Unknown").charAt(0).toUpperCase() + (u.name || "User").slice(1);

    // Visual Logic
    let icon, statusColor, statusText;
    if (u.role === 'mentor') {
        if (u.isVerified) {
            icon = '✔'; statusColor = 'var(--success-color)'; statusText = 'VERIFIED MENTOR';
        } else {
            icon = '⚠️'; statusColor = 'var(--danger-color)'; statusText = 'UNVERIFIED MENTOR';
        }
    } else {
        icon = '🎓'; statusColor = 'var(--text-muted)'; statusText = 'STUDENT';
    }

    const borderColor = u.role === 'mentor' && u.isVerified ? 'var(--success-color)' : 'var(--glass-border)';

    return `
            <button class="btn btn-secondary" onclick="simulateLogin('${uid}')" style="justify-content: flex-start; gap: 12px; border: 1px solid ${borderColor}; padding: 12px; margin-bottom:10px; width:100%; transition: transform 0.2s;">
                <div style="width:30px; height:30px; border-radius:50%; background:${statusColor}; color:black; display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:14px; flex-shrink:0;">
                    ${u.profilePic ? `<img src="${u.profilePic}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">` : icon}
                </div>
                <div style="text-align:left; overflow:hidden;">
                    <div style="font-weight: 700; color: white; font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${name}</div>
                    <div style="font-size: 10px; color: ${statusColor}; font-weight:600;">${statusText}</div>
                </div>
            </button>`;
}
// --- INIT APP ---
// 1. Reset
currentUser = null;
currentUserData = null;

// 2. Show Login
document.getElementById('authScreen').classList.remove('hidden');
document.getElementById('appScreen').classList.add('hidden');



function simulateLogin(uid, isAnonSession) {
    db.collection('users').doc(uid).get().then(doc => {
        if (!doc.exists) {
            console.error("User not found during auto-login");
            localStorage.removeItem('vsync_uid'); // Clean up bad data
            return;
        }

        const realData = doc.data();

        // 1. Create Session Data
        if (isAnonSession) {
            window.currentUserData = {
                ...realData,
                displayNameOverride: "Anonymous",
                roleOverride: "Guest",
                profilePicOverride: "",
                isAnonymousSession: true,
                realYear: realData.year
            };
        } else {
            window.currentUserData = { ...realData, isAnonymousSession: false };

            // --- 🔹 NEW: SAVE SESSION TO BROWSER ---
            localStorage.setItem('vsync_uid', uid);
        }

        window.currentUser = { uid: doc.id };
        currentUser = window.currentUser;
        currentUserData = window.currentUserData;

        // 2. UI Switch
        document.getElementById('authScreen').classList.add('hidden');
        document.getElementById('appScreen').classList.remove('hidden');

        // 3. UI Restrictions & Init
        if (isAnonSession) {
            // Hide Tabs for Anon
            document.querySelectorAll('.tab-button').forEach(t => {
                if (t.innerText === "Messages" || t.innerText === "Explore") t.style.display = 'none';
            });
            document.querySelector('.navbar-right').children[0].children[0].classList.add('hidden');
            document.querySelector('.navbar-right').children[0].children[1].classList.add('hidden');

            updateUserInfo();
            switchTab('community');
        } else {
            // Restore UI for User
            document.querySelectorAll('.tab-button').forEach(t => t.style.display = 'block');
            document.querySelector('.navbar-right').children[0].children[0].classList.remove('hidden');
            document.querySelector('.navbar-right').children[0].children[1].classList.remove('hidden');

            loadActivePoll();
            initMessageBadgeListener();
            updateUserInfo();
            initNotificationListener();
            startPresenceHeartbeat();
            switchTab('community'); // Start at feed
        }
    }).catch(err => {
        console.error("Login failed:", err);
        showToast("Session expired. Please login again.");
    });
}
// --- AUTH: TOGGLE UI ---
function toggleAuthMode(mode) {
    if (mode === 'register') {
        document.getElementById('loginSection').classList.add('hidden');
        document.getElementById('registerSection').classList.remove('hidden');
    } else {
        document.getElementById('registerSection').classList.add('hidden');
        document.getElementById('loginSection').classList.remove('hidden');
    }
}

function applyCardTheme(img) {
    // 1. Safety check
    if (!img.complete || img.naturalWidth === 0) return;

    try {
        // 2. Get Dominant Color
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, 1, 1);
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
        const rgb = `${r},${g},${b}`;

        // 3. Find the parent Card
        const card = img.closest('.card');
        if (card) {
            // 🚨 FIX: Apply SOLID color (with slight gradient for depth), NO image texture
            card.style.background = `linear-gradient(135deg, rgb(${rgb}), rgba(${rgb}, 0.8))`;

            // Match border and shadow to the theme
            card.style.borderColor = `rgba(${rgb}, 0.6)`;
            card.style.boxShadow = `0 15px 40px -10px rgba(${rgb}, 0.4)`;

            // 4. Calculate Contrast (YIQ Formula)
            const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
            const isDarkBg = yiq < 128; // < 128 means the background is dark

            // 5. Apply Text Colors based on contrast
            const titleColor = isDarkBg ? '#ffffff' : '#000000';
            const bodyColor = isDarkBg ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.8)';

            // Apply colors to text elements
            card.querySelectorAll('.card-header, strong').forEach(el => el.style.color = titleColor);
            card.querySelectorAll('p, small').forEach(el => el.style.color = bodyColor);

            // Fix badges to match new contrast
            card.querySelectorAll('.badge').forEach(el => {
                el.style.color = titleColor;
                el.style.borderColor = bodyColor;
                el.style.background = isDarkBg ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)';
            });
        }
    } catch (e) {
        console.log("Could not extract color:", e);
    }
}

// --- AUTH: WORK EXPERIENCE LOGIC ---
function addExperienceField() {
    const container = document.getElementById('workExpContainer');
    const div = document.createElement('div');
    div.className = 'exp-row';
    div.innerHTML = `
                <input type="text" class="exp-input" placeholder="e.g. Intern at Google" style="flex-grow:1;">
                <button type="button" class="btn btn-danger" onclick="this.parentElement.remove()" style="padding: 0 12px;">X</button>
            `;
    container.appendChild(div);
}

// --- AUTH: REGISTER HANDLER ---
// --- AUTH: REGISTER HANDLER (FIXED) ---
// --- AUTH: REGISTER HANDLER (FIXED) ---
async function handleLogin(event) {
    event.preventDefault();

    // Automatically grabs values based on input types, bypassing ID mismatches
    const emailField = document.querySelector('input[type="email"]');
    const passwordField = document.querySelector('input[type="password"]');

    const email = emailField ? emailField.value : '';
    const password = passwordField ? passwordField.value : '';

    console.log("Attempting login with:", email);

    try {
        const response = await fetch('http://127.0.0.1:3000/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            console.log("Login Success:", data);
            alert("Login Successful! Welcome, " + data.user.first_name);

            // Map SQL user_id to id and uid for legacy compatibility
            data.user.id = data.user.user_id;
            data.user.uid = data.user.user_id;
            localStorage.setItem('user_id', data.user.user_id);

            // Critical initializations to fix the UI errors
            document.getElementById('authScreen').classList.add('hidden');
            document.getElementById('appScreen').classList.remove('hidden');

            // Bind global data for the rest of the application
            window.currentUser = data.user;
            currentUser = window.currentUser;
            window.currentUserData = data.user;
            currentUserData = window.currentUserData;

            if (typeof updateUserInfo === 'function') updateUserInfo(data.user);
            if (typeof switchTab === 'function') switchTab('community');
            if (typeof window.forceLoadProfile === 'function') window.forceLoadProfile();
        } else {
            console.error("Login Failed:", data.message);
            alert("Login failed: " + data.message);
        }
    } catch (error) {
        console.error("Network Error:", error);
        alert("Failed to connect to the Node.js server on port 3000.");
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerText;

    submitBtn.disabled = true;
    submitBtn.innerText = "Creating Account...";

    const firstName = document.getElementById('regFirstName').value.trim();
    const lastName = document.getElementById('regLastName').value.trim();
    const email = document.getElementById('regEmail').value.trim().toLowerCase();
    const password = document.getElementById('regPass').value;
    const currentYear = document.querySelector('select[id="regYear"]').value;
    console.log("Extracted currentYear:", currentYear);

    // Work Experience
    const expInputs = document.querySelectorAll('.exp-input');
    const workExperience = Array.from(expInputs).map(i => i.value.trim()).filter(v => v).join(', ');

    // Profile Picture
    let profilePicture = null;
    const fileInput = document.getElementById('regFile');
    if (fileInput && fileInput.files && fileInput.files[0]) {
        profilePicture = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.readAsDataURL(fileInput.files[0]);
        });
    }

    if (!password || password.length < 6) {
        alert("Password must be at least 6 characters.");
        submitBtn.disabled = false;
        submitBtn.innerText = originalText;
        return;
    }

    try {
        const res = await fetch('http://127.0.0.1:3000/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ firstName, lastName, email, password, currentYear, workExperience, profilePicture })
        });
        const data = await res.json();
        
        if (data.success) {
            alert("Account created successfully!");
            toggleAuthMode('login');
        } else {
            alert(data.message || "Registration failed");
        }
    } catch (err) {
        console.error(err);
        alert("Server error during registration.");
    }

    submitBtn.disabled = false;
    submitBtn.innerText = originalText;
}
/* --- TOGGLE PASSWORD VISIBILITY --- */
function togglePasswordVisibility(inputId, iconDiv) {
    const input = document.getElementById(inputId);
    if (!input) return;

    if (input.type === "password") {
        // Show Password
        input.type = "text";
        // Change icon to "Eye Slash" (Hidden)
        iconDiv.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                <line x1="1" y1="1" x2="23" y2="23"></line>
            </svg>`;
    } else {
        // Hide Password
        input.type = "password";
        // Change icon back to "Eye" (Visible)
        iconDiv.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
            </svg>`;
    }
}
// --- NOTIFICATION LOGIC ---
let currentPendingRequestIds = [];

function initNotificationListener() {
    if (!currentUser) return;

    db.collection('connection_requests')
        .where('recipientId', '==', currentUser.uid)
        .where('status', '==', 'pending')
        .onSnapshot(snap => {
            // 1. Get all current pending IDs from DB
            currentPendingRequestIds = snap.docs.map(doc => doc.id);

            // 2. Get list of IDs we have already "seen" (from LocalStorage)
            const viewedIds = JSON.parse(localStorage.getItem('viewedRequests') || '[]');

            // 3. Count how many pending IDs are NOT in the viewed list
            const newCount = currentPendingRequestIds.filter(id => !viewedIds.includes(id)).length;

            // 4. Update UI
            const badge = document.getElementById('requestBadge');
            if (newCount > 0) {
                badge.innerText = newCount > 9 ? '9+' : newCount;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        });
}


async function deleteAccount() {
    if (confirm("Delete Account?\n\n⚠️ This will permanently delete your profile, posts, and chats. This cannot be undone.")) {
        const userId = localStorage.getItem('user_id') || localStorage.getItem('vsync_uid') || window.currentUser?.uid;
        if (!userId) return;
        
        try {
            const res = await fetch('http://127.0.0.1:3000/api/users/' + userId, { method: 'DELETE' });
            const data = await res.json();
            
            if (data.success) {
                alert("Account deleted.");
                localStorage.clear();
                window.location.reload();
            } else {
                alert("Delete failed.");
            }
        } catch (error) {
            console.error("Delete Failed:", error);
            alert("Delete Failed: " + error.message);
        }
    }
}


// --- NAVIGATION LOGIC (FIXED) ---
function switchTab(arg1, arg2) {
    let tabName = typeof arg1 === 'string' ? arg1 : arg2;



    // ... (Keep your existing tab switching logic below) ...
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-button').forEach(el => el.classList.remove('active'));
    document.getElementById(tabName).classList.add('active');

    const btn = document.querySelector(`.tab-button[onclick*="'${tabName}'"]`);
    if (btn) btn.classList.add('active');

    if (tabName === 'community') loadCommunity();
    if (tabName === 'leaderboard') loadLeaderboard();
    if (tabName === 'profile') {
        if (typeof window.forceLoadProfile === 'function') window.forceLoadProfile();
    }
}

// --- BULLETPROOF PROFILE HYDRATION ---
window.forceLoadProfile = async function() {
    try {
        const uid = localStorage.getItem('user_id') || (window.currentUser && (window.currentUser.user_id || window.currentUser.uid)) || '1';
        if (!localStorage.getItem('user_id')) localStorage.setItem('user_id', uid);
        const apiBase = window.location.origin.includes(':3000') ? '' : 'http://127.0.0.1:3000';
        const res = await fetch(`${apiBase}/api/users/${localStorage.getItem('user_id')}`);
        const data = await res.json();
        if (data && data.success && data.profile) {
            const p = data.profile;
            const emailEl = document.getElementById('profileEmail');
            if (emailEl) emailEl.textContent = p.email;
            
            const yearEl = document.getElementById('profileYear');
            if (yearEl) yearEl.textContent = p.current_year || 'Not specified';
            
            const dateEl = document.getElementById('profileDate');
            if (dateEl) dateEl.textContent = p.created_at ? new Date(p.created_at).toLocaleDateString() : 'Recently';
            
            const topNav = document.getElementById('topNavInitial');
            if (topNav && p.first_name) topNav.textContent = p.first_name.charAt(0).toUpperCase();

            const avatarBox = document.getElementById('profileAvatarBox');
            if (avatarBox) {
                if (p.profile_picture && p.profile_picture !== 'null') {
                    avatarBox.innerHTML = `<img src="${p.profile_picture}" style="width:100px;height:100px;border-radius:50%;object-fit:cover;margin:0 auto;">`;
                } else if (p.first_name) {
                    avatarBox.innerHTML = `<div style="width:100px;height:100px;border-radius:50%;background:#333;margin:0 auto;display:flex;align-items:center;justify-content:center;font-size:32px;">${p.first_name.charAt(0).toUpperCase()}</div>`;
                }
            }

            const expEl = document.getElementById('profileExperience');
            if (expEl) expEl.textContent = p.work_experience || 'No experience added.';

            const nameEl = document.getElementById('profileName');
            if (nameEl && p.first_name) nameEl.textContent = p.first_name;
        }
    } catch (e) {
        console.error(e);
    }
};

// --- CONTEXT MENU LOGIC (Dynamic) ---
let contextMenuTarget = { type: null, id1: null, id2: null };
let longPressTimer;

function showContextMenu(e, type, id1, id2 = null) {
    e.preventDefault();
    e.stopPropagation(); // Prevent other clicks

    contextMenuTarget = { type, id1, id2 };

    const menu = document.getElementById('customContextMenu');
    const btnUnsend = document.getElementById('btnUnsend');
    const btnDelete = document.getElementById('btnDeleteChat');

    // 1. Toggle Buttons based on Type
    if (type === 'message') {
        btnUnsend.style.display = 'block';
        btnDelete.style.display = 'none';
    } else if (type === 'chat') {
        btnUnsend.style.display = 'none';
        btnDelete.style.display = 'block';
    }

    // 2. Position Menu
    let x = e.pageX || (e.touches ? e.touches[0].pageX : 0);
    let y = e.pageY || (e.touches ? e.touches[0].pageY : 0);

    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.style.display = 'block';
}

function hideContextMenu() {
    document.getElementById('customContextMenu').style.display = 'none';
}
window.addEventListener('click', hideContextMenu);
window.addEventListener('scroll', hideContextMenu);

// --- ACTIONS ---
function performUnsend() {
    // id1 = chatId, id2 = msgId
    if (contextMenuTarget.type === 'message') {
        deleteMessage(contextMenuTarget.id1, contextMenuTarget.id2);
    }
    hideContextMenu();
}
/* --- BOOKMARK SYSTEM --- */

// 1. Toggle Bookmark (Save/Unsave)
function toggleBookmark(event, postId) {
    triggerHaptic();
    event.stopPropagation(); // Prevent opening post details

    if (!currentUser) return showToast("Login to save posts.");

    const btn = event.currentTarget;
    const isActive = btn.classList.contains('bookmarked');
    const icon = btn.querySelector('svg');

    // Optimistic UI Update (Instant Feedback)
    if (isActive) {
        btn.classList.remove('bookmarked');
        btn.style.color = "var(--text-secondary)";
        icon.style.fill = "none";
        icon.style.stroke = "currentColor";

        // DB Update
        db.collection('users').doc(currentUser.uid).update({
            bookmarks: firebase.firestore.FieldValue.arrayRemove(postId)
        }).catch(e => console.error(e));

        // Local State Update
        if (window.currentUserData.bookmarks) {
            window.currentUserData.bookmarks = window.currentUserData.bookmarks.filter(id => id !== postId);
        }

    } else {
        btn.classList.add('bookmarked');
        btn.style.color = "#FFD700"; // Gold color
        icon.style.fill = "#FFD700";
        icon.style.stroke = "#FFD700";

        // DB Update
        db.collection('users').doc(currentUser.uid).update({
            bookmarks: firebase.firestore.FieldValue.arrayUnion(postId)
        }).then(() => showToast("Post Saved to Profile"))
            .catch(e => console.error(e));

        // Local State Update
        if (!window.currentUserData.bookmarks) window.currentUserData.bookmarks = [];
        window.currentUserData.bookmarks.push(postId);
    }
}

// 2. Open Saved Posts Modal
async function openSavedPosts() {
    lockScroll();
    const modal = document.getElementById('savedPostsModal');
    const listEl = document.getElementById('savedPostsList');

    modal.classList.add('active');
    listEl.innerHTML = '<p style="text-align:center; margin-top:20px; color:#888;">Loading saved items...</p>';

    const bookmarks = window.currentUserData.bookmarks || [];

    if (bookmarks.length === 0) {
        listEl.innerHTML = `
            <div class="empty-state-new" style="margin-top:20px;">
                <div style="font-size:30px; margin-bottom:10px;">🔖</div>
                You haven't saved any posts yet.
            </div>`;
        return;
    }

    try {
        // Fetch all bookmarked posts
        // Note: Firestore doesn't support "where id IN huge_array" well, so we fetch by doc ID in parallel
        const promises = bookmarks.map(id => db.collection('posts').doc(id).get());
        const snapshots = await Promise.all(promises);

        const posts = snapshots
            .filter(doc => doc.exists) // Remove deleted posts
            .map(doc => ({ ...doc.data(), id: doc.id }));

        if (posts.length === 0) {
            listEl.innerHTML = '<p style="text-align:center; margin-top:20px; color:#888;">Saved posts may have been deleted by authors.</p>';
            return;
        }

        // Reuse your existing logic to render posts (Simplified for this view)
        // We'll create a simple render loop here to avoid complexity
        const html = posts.map(p => {
            const timeString = timeAgo(p.createdAt);
            return `
    <div class="card" onclick="viewPost('${p.id}')" style="cursor:pointer; border:1px solid var(--border-color); padding:15px; margin-bottom:15px; transition: opacity 0.3s;">
        <div style="font-size:11px; color:var(--text-secondary); margin-bottom:5px;">
            Saved • Posted by ${p.authorName} • ${timeString}
        </div>
        <div style="font-weight:700; font-size:16px; margin-bottom:5px;">${p.title}</div>
        <div style="font-size:14px; color:#ddd; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
            ${p.body}
        </div>
        <div style="margin-top:10px; display:flex; justify-content:flex-end;">
            <button class="btn btn-sm btn-secondary" 
                    onclick="removeFromSaved(event, '${p.id}')"
                    style="border: 1px solid var(--danger-color); color: var(--danger-color); background: rgba(255, 69, 58, 0.1);">
                Remove
            </button>
        </div>
    </div>`;
        }).join('');

        listEl.innerHTML = html;

    } catch (e) {
        console.error(e);
        listEl.innerHTML = '<p style="color:red; text-align:center;">Error loading bookmarks.</p>';
    }
}

async function deleteConversation(chatId) {
    // 1. Double check the ID (Context menu might pass it, or we get it from the hidden input)
    const activeId = chatId || document.getElementById('selectedChatId').value;
    if (!activeId) return;

    if (!confirm("Are you sure? This will delete the entire chat history for both users.")) return;

    try {
        showToast("Deleting conversation...");

        // 2. DELETE SUBCOLLECTION (Messages)
        // Firestore requires deleting each document in a subcollection individually
        const messagesSnap = await db.collection('chats').doc(activeId).collection('messages').get();
        const batch = db.batch();
        messagesSnap.forEach(doc => {
            batch.delete(doc.ref);
        });
        await batch.commit();

        // 3. DELETE PARENT (The Chat itself)
        await db.collection('chats').doc(activeId).delete();

        // 4. UI CLEANUP (Prevent the 'null' crash)
        // We use the ID 'messagesContainer' which matches your HTML
        const container = document.getElementById('messagesContainer');
        const sendForm = document.getElementById('sendMessageForm');
        const header = document.getElementById('chatHeaderInfo');

        if (container) {
            container.innerHTML = `
                <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; opacity:0.5;">
                    <span style="font-size:40px;">🗑️</span>
                    <p>Conversation Deleted</p>
                </div>`;
        }

        if (sendForm) sendForm.classList.add('hidden');
        if (header) header.innerText = "Select a conversation";

        // 5. REFRESH & EXIT
        showToast("Conversation wiped clean.");
        loadChats(); // Refresh the list

        if (window.innerWidth <= 600) {
            closeChatView(); // Close the mobile view
        }

    } catch (e) {
        console.error("Delete failed:", e);
        alert("Error: " + e.message);
    }
}
/* --- REPORT ACTIONS --- */

// Option 1: Hide (Remove from view completely)
function hidePostLocally(postId) {
    const card = document.getElementById(`post-card-${postId}`);
    if (card) {
        card.style.transition = "opacity 0.3s, transform 0.3s";
        card.style.opacity = "0";
        card.style.transform = "scale(0.9)";
        setTimeout(() => card.remove(), 300); // Remove from DOM
    }
}

// Option 2: Dismiss (Show content temporarily)
function dismissReportWall(postId) {
    const wall = document.getElementById(`wall-${postId}`);
    const content = document.getElementById(`content-${postId}`);

    if (wall && content) {
        wall.style.display = 'none'; // Hide wall
        content.classList.remove('content-hidden'); // Show content
    }
}

// --- LONG PRESS HANDLERS ---
function startLongPress(e, type, id1, id2 = null) {
    longPressTimer = setTimeout(() => {
        showContextMenu(e, type, id1, id2);
    }, 600);
}

function cancelLongPress() {
    clearTimeout(longPressTimer);
}
// --- POST OPTIONS LOGIC ---
function togglePostMenu(event, postId) {
    event.stopPropagation(); // Prevent opening post detail

    // Close all other open menus first
    document.querySelectorAll('.options-menu').forEach(el => {
        if (el.id !== `menu-${postId}`) el.classList.remove('active');
    });

    const menu = document.getElementById(`menu-${postId}`);
    if (menu) menu.classList.toggle('active');
}

// Close menus when clicking anywhere else
window.addEventListener('click', () => {
    document.querySelectorAll('.options-menu').forEach(el => el.classList.remove('active'));
});

function reportPost(event, postId) {
    event.stopPropagation();

    const menu = document.getElementById(`menu-${postId}`);
    if (menu) menu.classList.remove('active');

    if (!currentUser) {
        showToast("Please login to report.");
        return;
    }

    // Check existing reports first
    db.collection('posts').doc(postId).get().then(doc => {
        if (!doc.exists) return;
        const data = doc.data();
        const reports = data.reports || [];

        if (reports.includes(currentUser.uid)) {
            showToast("⚠️ You already reported this.");
            return;
        }

        showConfirm(
            "Report Post?",
            "Are you sure you want to flag this content? It will be hidden from your feed.",
            () => {
                db.collection('posts').doc(postId).update({
                    reports: firebase.firestore.FieldValue.arrayUnion(currentUser.uid),
                    reportCount: firebase.firestore.FieldValue.increment(1)
                }).then(() => {
                    showToast("Report submitted.");
                    // RELOAD FEED TO SHOW WALL IMMEDIATELY
                    loadCommunity();
                }).catch(e => {
                    console.error(e);
                    showToast("Error reporting.");
                });
            }
        );
    });
}

// --- POST FILE HANDLING ---
function handlePostFileSelect() {
    const fileInput = document.getElementById('postFileInput');
    const nameDisplay = document.getElementById('postFileName');
    const removeBtn = document.getElementById('removePostImgBtn');
    if (fileInput.files.length > 0) {
        nameDisplay.innerText = fileInput.files[0].name;
        removeBtn.style.display = 'inline-block';
    }
}

function removePostImage() {
    const fileInput = document.getElementById('postFileInput');
    const nameDisplay = document.getElementById('postFileName');
    const removeBtn = document.getElementById('removePostImgBtn');
    fileInput.value = "";
    nameDisplay.innerText = "No file";
    removeBtn.style.display = 'none';
}



function sendChatFile(base64String, type) {
    // ... existing code ...

    db.collection('chats').doc(chatId).collection('messages').add({
        imageUrl: base64String,
        mediaType: type,
        text: type === 'video' ? "Sent a video" : "Sent an image",
        senderId: currentUser.uid,
        timestamp: new Date()
    });

    // Update Chat Metadata (ADD lastSenderId)
    db.collection('chats').doc(chatId).update({
        lastMessage: type === 'video' ? "🎥 Video" : "📷 Image",
        updatedAt: new Date(),
        lastSenderId: currentUser.uid // <--- ADD THIS LINE
    });
}

function sendChatImage(base64String) {
    const chatId = document.getElementById('selectedChatId').value;
    if (!chatId) return;

    // Send message with imageUrl field
    db.collection('chats').doc(chatId).collection('messages').add({
        imageUrl: base64String,
        text: "Sent an image", // Fallback text for list view
        senderId: currentUser.uid,
        timestamp: new Date()
    });

    // Update last message in chat list
    db.collection('chats').doc(chatId).update({
        lastMessage: "📷 Image",
        updatedAt: new Date()
    });
}
// --- EMOJI LOGIC ---
const commonEmojis = [
    "😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "🥲", "😊",
    "😇", "🙂", "🙃", "😉", "😌", "😍", "🥰", "😘", "😗", "😙",
    "😚", "😋", "😛", "😝", "😜", "🤪", "🤨", "🧐", "🤓", "😎",
    "🥸", "🤩", "🥳", "😏", "😒", "😞", "😔", "😕", "🙁",
    "☹️", "😣", "😖", "😫", "😩", "🥺", "😢", "😭", "😤", "😠",
    "😡", "🤬", "🤯", "😳", "🥵", "🥶", "😱", "🤗", "🤔",
    "🤭", "🤫", "🤥", "😶", "😐", "😑", "😬", "🙄", "😯", "😦",
    "👍", "👎", "👊", "✊", "🤛", "🤜", "🤞", "✌️", "🤟", "🤘",
    "👌", "🤌", "🤏", "👈", "👉", "👆", "👇", "☝️", "✋", "🤚",
    "👋", "🔥", "✨", "❤️", "💯", "🎉", "💀", "💩", "🤡", "👻"
];

// --- ADMIN PANEL LOGIC ---

async function openAdminPanel() {
    // 1. PIN Security Check (First Layer)
    const pin = prompt("Enter Admin PIN:");
    if (pin !== "1234") return alert("Access Denied");

    const modal = document.getElementById('adminPanelModal');
    const listEl = document.getElementById('adminReportsList');
    const badge = document.getElementById('reportCountBadge');

    // 2. SUPER ADMIN CHECK (Second Layer)
    // Only show the Reset button if the user is You or Selva
    const resetBtn = document.getElementById('btnResetScores');
    if (currentUser && ADMIN_UIDS.includes(currentUser.uid)) {
        resetBtn.style.display = 'block'; // Show it
    } else {
        resetBtn.style.display = 'none';  // Keep it hidden
    }

    modal.classList.add('active');
    listEl.innerHTML = '<p style="text-align:center; padding:20px; color:#aaa;">Loading reports...</p>';

    try {
        // Query posts with > 0 reports
        const snap = await db.collection('posts')
            .where('reportCount', '>', 0)
            .orderBy('reportCount', 'desc')
            .get();

        badge.innerText = `${snap.size} Issues`;

        if (snap.empty) {
            listEl.innerHTML = `
                <div style="text-align:center; padding:40px; opacity:0.6;">
                    <div style="font-size:40px;">✅</div>
                    <p style="color:#fff;">All clear! No reported posts.</p>
                </div>`;
            return;
        }

        let html = '';
        snap.forEach(doc => {
            const p = doc.data();
            let urgencyColor = '#ff453a';
            if (p.reportCount > 5) urgencyColor = '#ff0000';
            if (p.reportCount > 10) urgencyColor = '#ff00d4';

            html += `
            <div class="card" style="border: 1px solid ${urgencyColor}; background: #1a0505; margin-bottom: 15px;">
                <div class="card-header" style="color: ${urgencyColor}; font-size:14px; display:flex; align-items:center; gap:8px;">
                    <span><b>${p.reportCount} Reports</b></span>
                    ${p.reportCount > 5 ? '<span class="badge" style="background:red; color:white;">URGENT</span>' : ''}
                </div>
                <div class="card-body" style="color: #ddd;">
                    <div style="font-weight:bold; margin-bottom:5px; font-size:16px;">${p.title}</div>
                    <p style="font-size:13px; opacity:0.8; margin-bottom:10px; border-left:2px solid #555; padding-left:10px;">${p.body}</p>
                    
                    ${p.imageUrl ? `<img src="${p.imageUrl}" style="height:120px; border-radius:8px; border:1px solid #333; margin-top:5px;">` : ''}
                    
                    <div style="margin-top:10px; font-size:11px; color:#888; border-top:1px solid #333; padding-top:8px;">
                        Posted by: <b style="color:#fff;">${p.authorName}</b> (${p.authorRole})<br>
                        Posted: ${p.createdAt ? p.createdAt.toDate().toLocaleString() : 'N/A'}
                    </div>
                </div>
                <div class="card-footer" style="gap: 10px; border-top:1px solid rgba(255, 69, 58, 0.2);">
                    <button class="btn btn-secondary" style="flex:1; font-size:12px;" onclick="adminIgnoreReport('${doc.id}')">
                        ✅ Ignore
                    </button>
                    <button class="btn btn-danger" style="flex:1; font-size:12px;" onclick="adminDeletePost('${doc.id}')">
                         Ban & Delete
                    </button>
                </div>
            </div>`;
        });

        listEl.innerHTML = html;

    } catch (e) {
        console.error(e);
        listEl.innerHTML = `<p style="color:red; text-align:center;">Error: ${e.message}</p>`;
    }
}
// --- FORGOT PASSWORD LOGIC ---
let recoveryState = {
    email: "",
    otp: null,
    userId: null
};

function openForgotModal() {
    resetFpsUI();
    document.getElementById('forgotPasswordModal').classList.add('active');
}

function closeForgotModal() {
    document.getElementById('forgotPasswordModal').classList.remove('active');
}

function resetFpsUI() {
    document.getElementById('fpStep1').classList.remove('hidden');
    document.getElementById('fpStep2').classList.add('hidden');
    document.getElementById('fpStep3').classList.add('hidden');
    document.getElementById('fpEmail').value = "";
    document.getElementById('fpOtpInput').value = "";
    document.getElementById('fpNewPass').value = "";
    document.getElementById('fpConfirmPass').value = "";
    recoveryState = { email: "", otp: null, userId: null };
}

function handleFpsSendOTP() {
    const email = document.getElementById('fpEmail').value.trim().toLowerCase();
    if (!email) return alert("Please enter email.");

    const btn = document.querySelector('#fpStep1 button');
    const originalText = btn.innerText;
    btn.innerText = "Sending...";
    btn.disabled = true;

    // 1. Check if user exists in Firestore
    db.collection('users').where('email', '==', email).get()
        .then(snap => {
            if (snap.empty) {
                alert("No account found with this email.");
                btn.innerText = originalText;
                btn.disabled = false;
                return;
            }

            const doc = snap.docs[0];
            const userData = doc.data();

            // Save state for later steps
            recoveryState.email = email;
            recoveryState.userId = doc.id;

            // 2. Generate Real OTP
            recoveryState.otp = Math.floor(100000 + Math.random() * 900000);

            // 3. SEND REAL EMAIL VIA EMAILJS
            const templateParams = {
                name: userData.name || "Student",
                email_to: email,      // The user's email
                otp: recoveryState.otp // The variable {{otp}} in your template
            };

            // REPLACE THESE WITH YOUR IDs
            const SERVICE_ID = "Sidd@1604";
            const TEMPLATE_ID = "template_f0etwxd"; // e.g., template_9z....

            return emailjs.send(SERVICE_ID, TEMPLATE_ID, templateParams);
        })
        .then((response) => {
            if (!response) return; // Handle case where user wasn't found above

            console.log('SUCCESS!', response.status, response.text);
            showToast("OTP sent to your email!");

            // Switch UI to Step 2
            document.getElementById('fpStep1').classList.add('hidden');
            document.getElementById('fpStep2').classList.remove('hidden');

            btn.innerText = originalText;
            btn.disabled = false;
        })
        .catch((error) => {
            console.error('FAILED...', error);
            alert("Failed to send email. Check console for details.");
            btn.innerText = originalText;
            btn.disabled = false;
        });
}
function getRoleBadgeHtml(rawRole) {
    const role = (rawRole || "student").toLowerCase();

    // 1. MENTOR BADGE (Green/Verified Look)
    if (role === 'mentor') {
        return `<span class="badge badge-verified" style="font-size:9px; padding:1px 6px; margin-left:4px; vertical-align:middle;">MENTOR</span>`;
    }

    // 2. STUDENT BADGE (Default Grey)
    return `<span class="badge" style="font-size:9px; padding:1px 6px; background:rgba(255,255,255,0.1); color:#ccc; border:1px solid var(--border-color); margin-left:4px; vertical-align:middle;">STUDENT</span>`;
}

function handleFpsVerifyOTP() {

    const inputOtp = document.getElementById('fpOtpInput').value;
    if (parseInt(inputOtp) === recoveryState.otp) {
        // Success
        document.getElementById('fpStep2').classList.add('hidden');
        document.getElementById('fpStep3').classList.remove('hidden');
    } else {
        alert("Incorrect OTP. Please try again.");
    }
}

function handleFpsSavePassword() {
    const pass1 = document.getElementById('fpNewPass').value;
    const pass2 = document.getElementById('fpConfirmPass').value;

    if (pass1.length < 6) return alert("Password must be at least 6 characters.");
    if (pass1 !== pass2) return alert("Passwords do not match.");

    // Update Database
    db.collection('users').doc(recoveryState.userId).update({
        password: pass1, // Saving directly as per your demo requirement
        updatedAt: new Date()
    }).then(() => {
        showToast("✅ Password Reset Successfully!");
        closeForgotModal();
        // Optionally autofill the login box
        document.getElementById('loginEmail').value = recoveryState.email;
        document.getElementById('loginPassword').value = "";
    }).catch(e => {
        console.error(e);
        alert("Failed to update password.");
    });
}

// Action: Delete the post permanently
function adminDeletePost(postId) {
    if (!confirm("Permanently delete this post?")) return;

    db.collection('posts').doc(postId).delete().then(() => {
        showToast("Content removed.");
        // Refresh the panel
        openAdminPanel();
    }).catch(e => alert(e.message));
}

// Action: Keep the post (Clear reports)
function adminIgnoreReport(postId) {
    if (!confirm("Clear reports and keep this post?")) return;

    db.collection('posts').doc(postId).update({
        reportCount: 0,
        reports: [] // Clear the array of reporters
    }).then(() => {
        showToast("Reports cleared.");
        openAdminPanel(); // Refresh
    }).catch(e => alert(e.message));
}
function insertEmoji(emoji) {
    const input = document.getElementById('messageText');
    input.value += emoji;
    input.focus();
}
// --- NAVBAR & USER INFO ---
function updateUserInfo(user) {
    if (!user) user = window.currentUser || window.currentUserData;
    const topNav = document.getElementById('topNavInitial');
    if (topNav && user && user.first_name) {
        topNav.textContent = user.first_name.charAt(0).toUpperCase();
    }
}
/* --- OPEN USER PROFILE (Global) --- */
let currentViewedUserId = null;

window.openUserProfile = async function(targetUserId) {
    // 1. Prevent opening if it's me (optional: or redirect to My Profile tab)
    if (currentUser && targetUserId === currentUser.uid) {
        switchTab('profile');
        return;
    }

    currentViewedUserId = targetUserId;
    lockScroll();

    const modal = document.getElementById('viewProfileModal');
    modal.classList.add('active');

    // Reset UI
    document.getElementById('viewProfilePicContainer').innerHTML = '...';
    document.getElementById('viewProfileName').innerText = 'Loading...';
    document.getElementById('viewProfileActions').innerHTML = '<button class="btn btn-secondary" disabled>Checking status...</button>';
    document.getElementById('viewSkillsContainer').innerHTML = '';

    // 2. Fetch User Data
    try {
        const res = await fetch(`http://127.0.0.1:3000/api/users/${targetUserId}`);
        const data = await res.json();
        
        if (!data.success || !data.profile) {
            if (typeof showToast === "function") showToast("User not found.");
            if (typeof closeModal === "function") closeModal('viewProfileModal');
            return;
        }

        const u = data.profile;

        // RENDER HEADER
        document.getElementById('viewProfileName').innerHTML = (u.first_name || 'Unknown') + (u.role === 'mentor' ? ' <span style="color:#30D158">✔</span>' : '');

        // Render Badge
        const badge = document.getElementById('viewProfileBadge');
        if (u.role === 'mentor') {
            badge.innerText = "MENTOR";
            badge.className = "badge badge-verified";
            badge.style.background = "rgba(48, 209, 88, 0.2)";
            badge.style.color = "#30D158";
        } else {
            badge.innerText = "STUDENT";
            badge.className = "badge";
            badge.style.background = "rgba(255,255,255,0.1)";
            badge.style.color = "#ccc";
        }

        // Render Pic
        const picContainer = document.getElementById('viewProfilePicContainer');
        picContainer.innerHTML = `<div style="font-size:40px; color:#888; font-weight:bold;">${(u.first_name || 'U').charAt(0).toUpperCase()}</div>`;

        // Render Info
        document.getElementById('viewInfoCollege').innerText = u.college || "N/A";
        document.getElementById('viewInfoYear').innerText = u.current_year || "N/A";
        if (u.created_at) {
            document.getElementById('viewInfoJoined').innerText = new Date(u.created_at).toLocaleDateString();
        }

        // Render Skills
        const skillsContainer = document.getElementById('viewSkillsContainer');
        skillsContainer.innerHTML = '<span style="color:#666; font-size:13px;">No skills listed.</span>';

        // 3. Fake Stats for now
        document.getElementById('viewStatPosts').innerText = "-";
        document.getElementById('viewStatScore').innerText = "-";
        document.getElementById('viewStatConnections').innerText = "-";

        // 4. DETERMINE CONNECTION STATUS (The Logic)
        const actionsDiv = document.getElementById('viewProfileActions');
        const currentUserId = localStorage.getItem('vsync_uid') || (window.currentUser && window.currentUser.uid) || "1";

        if (currentUserId !== targetUserId) {
            actionsDiv.innerHTML = `<button class="btn btn-primary" style="padding: 10px 30px;" onclick="window.connectUser('${currentUserId}', '${targetUserId}', this)">Connect</button>`;
        } else {
            actionsDiv.innerHTML = `<button class="btn btn-secondary" style="padding: 10px 30px;" disabled>This is you</button>`;
        }

    } catch (e) {
        console.error(e);
        if (typeof closeModal === "function") closeModal('viewProfileModal');
    }
}



// --- CONNECTIONS MODAL ---
window.openNetworkModal = async function(type) {
    const container = document.getElementById('networkModalContainer');
    if (!container) return;
    
    container.style.display = 'flex';
    container.innerHTML = `
        <div style="background: #1e1e24; padding: 24px; border-radius: 12px; width: 90%; max-width: 400px; color: white; position: relative; max-height: 80vh; display: flex; flex-direction: column;">
            <h2 style="font-size:20px; font-weight:bold; margin-bottom:15px; text-transform:capitalize;">${type === 'discover' ? 'Discover People' : 'My Connections'}</h2>
            <button style="position:absolute; top:15px; right:15px; background:none; border:none; color:#ccc; font-size:24px; cursor:pointer;" onclick="document.getElementById('networkModalContainer').style.display = 'none'">&times;</button>
            <div id="networkUsersList" style="overflow-y:auto; flex:1; display:flex; flex-direction:column; gap:10px;">
                <p style="text-align:center; color:#888;">Loading...</p>
            </div>
        </div>
    `;

    try {
        const userId = localStorage.getItem('user_id') || localStorage.getItem('vsync_uid') || window.currentUser?.uid || "1";
        const endpoint = type === 'discover' ? `/api/network/discover/${userId}` : `/api/network/connected/${userId}`;
        const res = await fetch(`http://127.0.0.1:3000${endpoint}`);
        const data = await res.json();
        
        const listEl = document.getElementById('networkUsersList');
        if (data.users && data.users.length > 0) {
            listEl.innerHTML = data.users.map(u => `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:12px; background:var(--bg-card); border-radius:8px; border:1px solid rgba(255,255,255,0.05);">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <div style="width:36px; height:36px; border-radius:50%; background:#333; display:flex; align-items:center; justify-content:center; font-weight:bold; color:white;">
                            ${(u.first_name || 'U').charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <p style="font-weight:bold; font-size:14px; margin:0; color:white;">${u.first_name || 'Unknown'}</p>
                            <p style="color:#888; font-size:11px; margin:0;">${(u.role || 'Student').toUpperCase()}</p>
                        </div>
                    </div>
                    ${type === 'discover' 
                        ? `<button class="btn btn-primary btn-sm" onclick="window.connectUser('${userId}', '${u.user_id}', this)" style="padding:6px 12px; font-size:11px; border-radius:20px;">Request / Undo</button>`
                        : (u.status === 'pending'
                            ? `<button class="btn btn-primary btn-sm" onclick="window.acceptConnection('${u.follower_user}', '${u.following_user}')" style="padding:6px 12px; font-size:11px; border-radius:20px; background:#10b981;">Accept</button>`
                            : `<button class="btn btn-secondary btn-sm" style="padding:6px 12px; font-size:11px; border-radius:20px;" disabled>Connected</button>`
                          )
                    }
                </div>
            `).join('');
        } else {
            listEl.innerHTML = `<p style="text-align:center; color:#888;">No users found.</p>`;
        }
    } catch(err) {
        document.getElementById('networkUsersList').innerHTML = `<p style="text-align:center; color:#ff453a;">Failed to load.</p>`;
    }
};

window.acceptConnection = async function(followerUser, followingUser) {
    try {
        const apiBase = window.location.origin.includes(':3000') ? '' : 'http://127.0.0.1:3000';
        await fetch(`${apiBase}/api/connections/accept`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ follower_user: followerUser, following_user: followingUser })
        });
        window.openNetworkModal('connected');
    } catch (e) {
        console.error('Accept Connection Error:', e);
    }
};

window.connectUser = async function(followerId, followingId, btnElement) {
    if (btnElement) btnElement.disabled = true;
    try {
        const apiBase = window.location.origin.includes(':3000') ? '' : 'http://127.0.0.1:3000';
        await fetch(`${apiBase}/api/connections/follow`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ follower_user: followerId, following_user: followingId })
        });
        if (btnElement) btnElement.disabled = false;
    } catch (e) {
        console.error(e);
        if (btnElement) btnElement.disabled = false;
    }
};

function openConnectionsModal() {
    const modal = document.getElementById('connectionsModal');
    if (modal) modal.classList.add('active');
    if (window.loadConnections) window.loadConnections();
}

function goToChatFromModal(userId, encodedName) {
    const modal = document.getElementById('connectionsModal');
    if(modal) modal.classList.remove('active');
    const userName = decodeURIComponent(encodedName);

    // Open the chat
    goToChat(userId, userName);
}

function goToChat(userId, userName) {
    switchTab('chats');
    const chatId = [currentUser.uid, userId].sort().join('_');
    const chatRef = db.collection('chats').doc(chatId);

    chatRef.get().then(doc => {
        if (!doc.exists) {
            console.log("Creating new blank chat...");
            // Create blank document without system message
            return chatRef.set({
                participants: [currentUser.uid, userId],
                updatedAt: new Date(),
                lastMessage: ""
            }, { merge: true });
        }
    }).then(() => {
        loadChats();
        openInlineChat(chatId, userName);
    }).catch(e => {
        console.error("Error entering chat:", e);
        alert("Could not open chat.");
    });
}

// --- EXPLORE & SEARCH ---


function unfriend(otherId, reqId) {
    showConfirm(
        "Disconnect User?",
        "Are you sure you want to disconnect? Chat history will be deleted.",
        () => {
            const batch = db.batch();
            const chatId = [currentUser.uid, otherId].sort().join('_');

            batch.delete(db.collection('connection_requests').doc(reqId));
            batch.delete(db.collection('chats').doc(chatId));

            batch.commit().then(() => {
                document.getElementById('connectionsModal').classList.remove('active');

                // UI Cleanup
                const currentOpenChat = document.getElementById('selectedChatId').value;
                if (currentOpenChat === chatId) {
                    document.getElementById('chatHeader').textContent = "Select a chat to begin.";
                    document.getElementById('messagesContainer').innerHTML = "";
                    document.getElementById('sendMessageForm').classList.add('hidden');
                    if (msgUnsub) msgUnsub();
                }
                loadMentors();
                loadChats();
            }).catch(e => alert("Error disconnecting: " + e.message));
        }
    );
}

function renderUserResults(snapshot, allRequests = []) {
    const listEl = document.getElementById('searchResultsList');
    const searchTerm = document.getElementById('searchInput').value.toLowerCase().trim();
    let html = '';

    const DEFAULT_PIC = "https://upload.wikimedia.org/wikipedia/commons/7/7c/Profile_avatar_placeholder_large.png";

    // --- STEP 1: PRE-PROCESS REQUESTS ---
    const connectedIds = new Set();
    const requestMap = new Map();

    allRequests.forEach(reqDoc => {
        const d = reqDoc.data();
        const isSender = d.senderId === currentUser.uid;
        const otherId = isSender ? d.recipientId : d.senderId;

        if (d.status === 'accepted') {
            connectedIds.add(otherId);
        } else if (d.status === 'pending') {
            requestMap.set(otherId, { ...d, docId: reqDoc.id });
        }
    });

    // --- STEP 2: RENDER USERS ---
    snapshot.forEach(doc => {
        const user = doc.data();
        const targetUserId = doc.id;

        if (!user || targetUserId === currentUser.uid) return;
        if (connectedIds.has(targetUserId)) return;

        // Search Filter
        let rawName = user.name;
        if (!rawName || rawName === 'undefined') rawName = 'Unknown User';
        if (searchTerm && !rawName.toLowerCase().includes(searchTerm)) return;

        const displayName = rawName.charAt(0).toUpperCase() + rawName.slice(1).replace(/'/g, "\\'");
        const profileSrc = user.profilePic || DEFAULT_PIC;
        const role = (user.role || 'N/A').toUpperCase();

        // 1. Badge Logic
        let badgeHtml = '';
        if (user.role === 'mentor' && user.isVerified) {
            badgeHtml = `<span class="badge badge-verified" style="margin-left:5px;">MENTOR ✔</span>`;
        } else {
            badgeHtml = `<span class="badge" style="margin-left:5px; background:rgba(255,255,255,0.1); color:#999; border:1px solid var(--border-color);">${role}</span>`;
        }

        // 2. Subtext Logic
        let subtextHtml = '';
        if (user.expertise && Array.isArray(user.expertise) && user.expertise.length > 0) {
            const expString = user.expertise.join(' | ');
            subtextHtml = `<p style="font-size:13px; color:var(--text-secondary); margin-top:2px; line-height:1.4;">${expString}</p>`;
        } else {
            const fallbackText = user.role === 'student' ? `Student • ${user.year || 'N/A'}` : 'No experience listed';
            subtextHtml = `<p style="font-size:13px; color:var(--text-secondary); margin-top:2px;">${fallbackText}</p>`;
        }

        // 3. Button Logic
        let buttonHtml;
        const existingRequest = requestMap.get(targetUserId);

        if (existingRequest) {
            if (existingRequest.senderId === currentUser.uid) {
                buttonHtml = `
                <button class="btn btn-disabled" style="width:100%" disabled>Requested</button>
                <button class="btn btn-danger" style="width:100%; margin-top:10px;" onclick="cancelRequest('${existingRequest.docId}')">Cancel</button>`;
            } else {
                buttonHtml = `
                <div style="display:flex; gap:10px; margin-top:10px;">
                    <button class="btn btn-primary" style="flex:1" onclick="updateRequest('${existingRequest.docId}','accepted','${targetUserId}')">Accept</button>
                    <button class="btn btn-danger" style="flex:1" onclick="updateRequest('${existingRequest.docId}','rejected')">Decline</button>
                </div>`;
            }
        } else {
            buttonHtml = `<button class="btn btn-primary" style="width:100%; margin-top:15px;" onclick="sendInstantConnectionRequest('${targetUserId}', this)">Connect</button>`;
        }

        // 4. HTML Generation (Added onclick events to Image and Header)
        html += `
        <div class="card animate-item">
            <div class="card-content-wrapper">
                <img src="${profileSrc}" 
                     loading="lazy" 
                     class="card-avatar" 
                     alt="Profile" 
                     crossorigin="anonymous" 
                     onload="applyCardTheme(this)"
                     onclick="openUserProfile('${targetUserId}')" 
                     style="cursor: pointer;">
                
                <div style="width:100%; text-align:left; padding-left:10px;">
                    <div class="card-header" onclick="openUserProfile('${targetUserId}')" style="cursor:pointer; font-size:18px; margin-bottom:4px; justify-content:flex-start; gap:8px; align-items:center;">
                        ${displayName} 
                        ${badgeHtml}
                    </div>
                    
                    <p style="font-size:14px; color:var(--text-main); margin-bottom:2px; font-weight:500;">
                        ${user.college || 'N/A'}
                    </p>
                    
                    ${subtextHtml}
                </div>
            </div>
            <div class="card-footer" style="gap: 10px; margin-top: 0;">
                ${buttonHtml}
            </div>
        </div>`;
    });

    listEl.innerHTML = html || '<p style="text-align:center; grid-column: 1/-1; color: var(--text-secondary);">No new users found.</p>';
}

function sendInstantConnectionRequest(recipientId, btnElement) {
    // 1. IMMEDIATE VISUAL FEEDBACK (Optimistic UI)
    if (btnElement) {
        btnElement.textContent = "Requested";
        btnElement.disabled = true;
        btnElement.classList.add("btn-disabled");
        btnElement.onclick = null; // Prevent double-clicking
    }

    // 2. Fetch data and save
    const myId = currentUser.uid;

    // We fetch the target's name from DB to ensure no "undefined" or syntax errors
    db.collection('users').doc(recipientId).get().then(snap => {
        const targetData = snap.exists ? snap.data() : {};
        const targetName = targetData.name || "Unknown User";

        // Safe check for my name
        const myName = currentUserData.name || "Unknown User";

        return db.collection('connection_requests').add({
            senderId: myId,
            senderName: myName,
            recipientId: recipientId,
            recipientName: targetName,
            status: 'pending',
            subject: 'General Connection',
            message: "I'd like to connect with you on V-SYNC!",
            createdAt: new Date()
        });
    }).then(() => {
        console.log("Request successfully stored.");
        // 🚨 CRITICAL FIX: Do NOT reload loadMentors() here. 
        // Reloading immediately might fetch stale data and reset the button.
        // The visual update in step 1 is sufficient.
    }).catch(error => {
        console.error("Error sending request:", error);
        alert("Failed to send request.");
        // Revert button if error
        if (btnElement) {
            btnElement.textContent = "Connect";
            btnElement.disabled = false;
            btnElement.classList.remove("btn-disabled");
        }
    });
}

// --- REQUESTS TAB ---
// --- REQUESTS TAB LOGIC ---
function lockScroll() {
    document.body.classList.add('no-scroll');
}

function unlockScroll() {
    document.body.classList.remove('no-scroll');
}
function cancelRequest(requestId) {
    if (!confirm("Cancel this connection request?")) return;
    db.collection('connection_requests').doc(requestId).delete()
        .then(() => {
            loadMentors(); // Refresh UI
        })
        .catch(e => console.error("Error cancelling:", e));
}

function updateRequest(id, status, otherId) {
    // 1. Show immediate feedback (Optional but good UX)
    if (typeof showToast === 'function') showToast(status === 'accepted' ? "Accepting..." : "Declining...");

    const updatePromise = db.collection('connection_requests').doc(id).update({ status: status });

    if (status === 'accepted') {
        updatePromise
            .then(() => createChat(otherId)) // Create the chat logic
            .then(() => {
                // 2. REFRESH ALL TABS
                loadRequests(); // Refresh Requests Tab
                loadChats();    // Refresh Chats Tab
                loadMentors();  // <--- CRITICAL FIX: Refresh Explore Tab

                if (typeof showToast === 'function') showToast("Connection Accepted!");
            })
            .catch(error => {
                console.error(error);
                alert("Failed to finalize connection.");
            });
    } else {
        // Handle Rejection
        updatePromise.then(() => {
            loadRequests();
            loadMentors();  // <--- CRITICAL FIX: Refresh Explore Tab
            if (typeof showToast === 'function') showToast("Request Declined");
        });
    }
}

// --- CHATS ---
function createChat(otherId) {
    const chatId = [currentUser.uid, otherId].sort().join('_');

    // Just create the document logic, NO system message added
    return db.collection('chats').doc(chatId).set({
        participants: [currentUser.uid, otherId],
        lastMessage: "", // Empty start
        updatedAt: new Date()
    }, { merge: true });
}

// --- LOAD CHATS (Connections + Active Conversations) ---
// --- LOAD CHATS (Clean UI - Search Connections + Active Conversations) ---
// --- 3. LOAD CHATS (With Green Dot & Search) ---
/* --- FILE HELPERS --- */
function getFileIcon(fileName) {
    const ext = fileName.split('.').pop().toLowerCase();
    if (ext === 'pdf') {
        return `<div class="file-icon-box pdf"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg></div>`;
    }
    // Default Doc Icon
    return `<div class="file-icon-box doc"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg></div>`;
}

function formatBytes(bytes, decimals = 1) {
    if (!bytes) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
}
// Helper: Extract dominant color from an image file object
function getDominantColor(file) {
    return new Promise((resolve) => {
        const img = new Image();
        img.src = URL.createObjectURL(file);

        img.onload = function () {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = 1;
            canvas.height = 1;

            // Draw image resized to 1x1 pixel to get average color
            ctx.drawImage(img, 0, 0, 1, 1);
            const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;

            // Convert to Hex
            const hex = "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
            resolve(hex);
        };

        img.onerror = () => resolve("#FF5722"); // Fallback color
    });
}
// --- ADMIN: WIPE EVERYTHING ---
async function adminWipeDB() {
    const code = prompt("Type 'CONFIRM' to delete ALL posts, chats, and users from the database.");
    if (code !== 'CONFIRM') return;

    const btn = document.querySelector('button[onclick="adminWipeDB()"]');
    const originalText = btn.innerText;
    btn.innerText = "Wiping Database...";
    btn.disabled = true;

    try {
        // 1. Delete All Users Config
        const users = await db.collection('users').get();
        const userBatch = db.batch();
        users.forEach(doc => userBatch.delete(doc.ref));
        await userBatch.commit();
        console.log("Users wiped.");

        // 2. Delete All Posts
        const posts = await db.collection('posts').get();
        const postBatch = db.batch();
        posts.forEach(doc => postBatch.delete(doc.ref));
        await postBatch.commit();
        console.log("Posts wiped.");

        // 3. Delete All Chats
        const chats = await db.collection('chats').get();
        const chatBatch = db.batch();
        chats.forEach(doc => chatBatch.delete(doc.ref));
        await chatBatch.commit();
        console.log("Chats wiped.");

        // 4. Delete Requests
        const reqs = await db.collection('connection_requests').get();
        const reqBatch = db.batch();
        reqs.forEach(doc => reqBatch.delete(doc.ref));
        await reqBatch.commit();
        console.log("Requests wiped.");

        alert("Database Wiped Clean. You can now register fresh accounts.");
        window.location.reload();

    } catch (e) {
        console.error(e);
        alert("Error wiping DB: " + e.message);
        btn.innerText = originalText;
        btn.disabled = false;
    }
}






/* --- GLOBAL LOADING STATE --- */
let isCommunityLoading = false; // Add this to prevent double clicks

/* --- HELPER: Prevent HTML injection breakage --- */
function escapeHtml(text) {
    if (!text) return "";
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}




/* --- LOAD COMMUNITY (Fixed: Alignment & Spacing) --- */
async function loadCommunity(forceRefresh = false) {
    const listEl = document.getElementById('communityPostsList');
    if (!listEl) return;
    if (!currentUser) return;

    // 1. INSTANT LOAD CHECK
    if (!forceRefresh && listEl.children.length > 0 && !listEl.textContent.includes('No posts')) {
        return;
    }

    // 2. PREVENT DOUBLE NETWORK CALLS
    if (isCommunityLoading) return;
    isCommunityLoading = true;

    // --- SKELETON LOADING STATE ---
    if (listEl.innerHTML.trim() === '') {
        listEl.innerHTML = `
            <div class="card" style="padding: 20px; margin-bottom: 20px;">
                <div style="display:flex; gap:10px; margin-bottom:15px;">
                    <div class="skeleton skeleton-avatar"></div>
                    <div style="flex:1;">
                        <div class="skeleton skeleton-text" style="width: 40%;"></div>
                        <div class="skeleton skeleton-text" style="width: 20%;"></div>
                    </div>
                </div>
                <div class="skeleton skeleton-text"></div>
                <div class="skeleton skeleton-text"></div>
                <div class="skeleton skeleton-img" style="margin-top:10px;"></div>
            </div>`;
    }

    try {
        const userId = localStorage.getItem('vsync_uid') || (window.currentUser && window.currentUser.uid) || "1";
        const res = await fetch(`http://127.0.0.1:3000/api/posts?user_id=${userId}`);
        const data = await res.json();
        const sqlPosts = data.posts;

        if (!Array.isArray(sqlPosts)) {
            console.error("Failed to load posts from API:", data);
            listEl.innerHTML = '<p style="text-align:center;color:var(--danger-color);">Error loading community posts.</p>';
            return;
        }

        if (sqlPosts.length === 0) {
            listEl.innerHTML = '<p style="text-align:center; color:var(--text-secondary); margin-top:30px;">No posts yet. Be the first to post!</p>';
            return;
        }

        let posts = sqlPosts.map(post => ({
            id: post.post_id,
            title: post.title,
            body: post.content,
            createdAt: new Date(post.created_at),
            authorName: post.first_name || "Unknown",
            authorId: post.author_id,
            authorRole: "Student",
            authorYear: "3",
            authorPic: "",
            isAnonymous: false,
            upvotes: post.upvotes || 0,
            downvotes: post.downvotes || 0,
            user_vote: post.user_vote || 0,
            upvoters: new Array(post.upvote_count || 0).fill('dummy'),
            reports: [],
            tags: []
        }));

        // --- FILTERS ---
        if (window.activeFilters && window.activeFilters.years.length > 0) {
            posts = posts.filter(p => window.activeFilters.years.includes(p.authorYear));
        }
        if (window.activeFilters && window.activeFilters.tags.length > 0) {
            posts = posts.filter(p => {
                if (!p.tags) return false;
                return p.tags.some(t => window.activeFilters.tags.includes(t.name));
            });
        }
        if (window.activeFilters && window.activeFilters.sortBy === 'upvotes') {
            posts.sort((a, b) => (b.upvotes || 0) - (a.upvotes || 0));
        } else {
            posts.sort((a, b) => b.createdAt - a.createdAt);
        }

        if (posts.length === 0) {
            listEl.innerHTML = `<p style="text-align:center; color:var(--text-secondary); margin-top:30px;">No posts found.</p>`;
            return;
        }

        if (typeof loadStories === 'function') loadStories();

        const htmlPromises = posts.map(async p => {
            const isAuthor = currentUser && p.authorId === currentUser.uid;
            const isReportedByMe = p.reports && p.reports.includes(currentUser.uid);

            // --- VISUAL VARIABLES ---
            const isAnonPost = p.isAnonymous || p.authorName === "Anonymous" || p.authorRole === "Guest";
            const myData = window.currentUserData || {};

            const displayPic = isAuthor && !myData.isAnonymousSession ? (myData.profilePic || "") : (p.authorPic || "");
            const displayName = isAuthor && !myData.isAnonymousSession ? (myData.name || myData.first_name || p.authorName || "Unknown") : (p.authorName || "Unknown");
            const displayRole = isAuthor && !myData.isAnonymousSession ? (myData.role || "Student") : (p.authorRole || "Student");
            const displayYear = isAuthor && !myData.isAnonymousSession ? (myData.year || "") : (p.authorYear || "");

            const yearBadge = typeof getYearBadgeHtml === 'function' ? getYearBadgeHtml(displayYear) : `<span class="badge">${displayYear}</span>`;
            const timeString = typeof timeAgo === 'function' ? timeAgo(p.createdAt) : 'Just now';

            const clickAction = isAnonPost
                ? `onclick="showToast('This user is posting anonymously.')"`
                : `onclick="openUserProfile('${p.authorId}')"`;

            const cursorStyle = isAnonPost ? "cursor: default" : "cursor: pointer";

            let tagsHtml = '';
            if (p.tags && Array.isArray(p.tags)) {
                p.tags.forEach(tag => {
                    tagsHtml += `<span style="background:${tag.hex || '#555'}; color:white; padding:2px 8px; border-radius:10px; font-size:10px; font-weight:700; margin-right:5px;">${tag.name}</span>`;
                });
            }

            // --- MEDIA HANDLING ---
            let mediaHtml = '';
            if (p.imageUrl) {
                let renderType = 'image';
                if (p.mediaType === 'video') renderType = 'video';
                else if (p.mediaType === 'document') renderType = 'document';
                else {
                    if (p.imageUrl.match(/\.(mp4|webm|mov|mkv)(\?.*)?$/i)) renderType = 'video';
                    else if (p.imageUrl.match(/\.(pdf|doc|docx|ppt|pptx|txt|csv|xls|xlsx|zip|rar)(\?.*)?$/i)) renderType = 'document';
                }

                let displayFileName = p.fileName || "File";
                if (!p.fileName && renderType === 'document') {
                    try {
                        const urlPath = decodeURIComponent(p.imageUrl.split('?')[0]);
                        displayFileName = urlPath.substring(urlPath.lastIndexOf('/') + 1);
                        if (displayFileName.match(/^\d+_/) && displayFileName.includes('_')) {
                            displayFileName = displayFileName.split('_').slice(1).join('_');
                        }
                    } catch (e) { }
                }

                if (renderType === 'video') {
                    mediaHtml = `<video src="${p.imageUrl}" controls class="post-image" onclick="event.stopPropagation()"></video>`;
                }
                else if (renderType === 'document') {
                    const sizeStr = typeof formatBytes === 'function' ? formatBytes(p.fileSize || 0) : '';
                    const iconHtml = typeof getFileIcon === 'function' ? getFileIcon(displayFileName) : '📄';
                    mediaHtml = `
                    <div class="file-attachment-card" onclick="forceDownload(event, '${p.imageUrl}', '${displayFileName}')" style="margin-top:10px; display:flex;">
                        ${iconHtml}
                        <div class="file-info">
                            <span class="file-name">${displayFileName}</span>
                            <div class="file-meta">${sizeStr ? sizeStr + ' • ' : ''}Tap to Download</div>
                        </div>
                    </div>`;
                }
                else {
                    mediaHtml = `<img src="${p.imageUrl}" loading="lazy" class="post-image" onclick="event.stopPropagation(); openLightbox(this.src)">`;
                }
            }

            // --- HTML ESCAPING ---
            const safeBody = typeof escapeHtml === 'function' ? escapeHtml(p.body || "") : (p.body || "");
            const processedBody = safeBody.replace(/(https?:\/\/[^\s]+)/g, (url) => `<a href="${url}" target="_blank" style="color:var(--primary-color); text-decoration:underline;">${url}</a>`);

            // --- POST AVATAR ---
            let avatarHtml = displayPic && displayName !== "Anonymous"
                ? `<img src="${displayPic}" loading="lazy" class="post-avatar-small">`
                : `<div class="post-avatar-small" style="background:#333; display:flex; align-items:center; justify-content:center; color:#ccc; font-weight:bold;">${(displayName || "U").charAt(0)}</div>`;

            // --- TOP COMMENT ---
            let topCommentHtml = '';
            try {
                const cSnap = await db.collection('posts').doc(p.id).collection('comments').orderBy('upvotes', 'desc').limit(1).get();
                if (!cSnap.empty) {
                    const c = cSnap.docs[0].data();
                    const safeAuthor = typeof escapeHtml === 'function' ? escapeHtml(c.authorName) : c.authorName;
                    const safeText = typeof escapeHtml === 'function' ? escapeHtml(c.text) : c.text;

                    const commentAvatar = c.authorPic
                        ? `<img src="${c.authorPic}" style="width:24px; height:24px; border-radius:50%; object-fit:cover; flex-shrink:0;">`
                        : `<div style="width:24px; height:24px; border-radius:50%; background:#333; color:#ccc; font-size:10px; font-weight:bold; display:flex; align-items:center; justify-content:center; flex-shrink:0;">${(c.authorName || 'U').charAt(0)}</div>`;

                    topCommentHtml = `
                    <div class="top-comment-preview" onclick="viewPost('${p.id}')" style="display:flex; align-items:center; gap:10px;">
                        ${commentAvatar}
                        <div style="flex: 1; min-width: 0; overflow:hidden;">
                            <div style="font-weight:bold; color:var(--text-main); font-size:12px; margin-bottom:2px;">
                                ${safeAuthor} <span style="font-weight:normal; color:var(--text-secondary);">commented:</span>
                            </div>
                            <div style="color:#ccc; overflow:hidden; white-space:nowrap; text-overflow:ellipsis;">"${safeText}"</div>
                        </div>
                    </div>`;
                }
            } catch (e) { }

            const myBookmarks = (myData.bookmarks || []);
            const isBookmarked = myBookmarks.includes(p.id);
            const bookmarkColor = isBookmarked ? '#FFD700' : 'currentColor';
            const bookmarkFill = isBookmarked ? '#FFD700' : 'none';
            const bookmarkClass = isBookmarked ? 'bookmarked' : '';

            const wallHtml = `
                <div id="wall-${p.id}" class="report-wall-container">
                    <div class="report-icon-large">⚠️</div>
                    <div class="report-text-large">You've reported this post</div>
                    <div style="display:flex; gap:15px;">
                         <button class="btn btn-secondary" onclick="hidePostLocally('${p.id}')">Hide Post</button>
                         <button class="btn btn-danger" style="background:transparent; border:1px solid #ff453a; color:#ff453a;" onclick="dismissReportWall('${p.id}')">Dismiss</button>
                    </div>
                </div>`;

            // --- BUILD POST CONTENT ---
            const contentHtml = `
                <div id="content-${p.id}" class="${isReportedByMe ? 'content-hidden' : ''}">
                    <div class="post-options-wrapper">
                        <div class="three-dots-btn" onclick="togglePostMenu(event, '${p.id}')">⋮</div>
                        <div id="menu-${p.id}" class="options-menu">
                            ${String(p.authorId) === String(localStorage.getItem('vsync_uid') || window.currentUser?.uid || "1") ? `<div class="menu-item danger" onclick="deletePost('${p.id}')">Delete</div>` : ''}
                        </div>
                    </div>

                    <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px; padding-bottom:12px; border-bottom:1px solid rgba(255,255,255,0.05); padding-right: 30px; ${cursorStyle};" ${clickAction}>
                        ${avatarHtml}
                        <div>
                            <div style="color:var(--text-main); font-weight:700; font-size:15px; line-height:1.2;">
                                ${displayName} <span class="badge badge-verified" style="font-size:9px;">${displayRole}</span>
                            </div>
                            <div style="color:var(--text-secondary); font-size:12px;">${yearBadge} • ${timeString}</div>
                        </div>
                    </div>

                    <div class="post-click-area" style="cursor:pointer; display:block;" onclick="viewPost('${p.id}')">
                        <div style="margin-bottom:8px;">
                            <div style="font-size:17px; font-weight:700; margin-bottom:6px;">${escapeHtml(p.title)}</div>
                            <div>${tagsHtml}</div>
                        </div>
                        <div class="card-body" style="white-space: pre-wrap; margin-top:0;">${processedBody}${mediaHtml}</div>
                        ${topCommentHtml}
                    </div>

                    <div class="card-footer" style="justify-content: space-between; margin-top:15px; align-items:center; display: flex;">
                        
                        <div style="display:flex; gap:10px; align-items: center;">
                            
                            <button class="btn btn-secondary" onclick="triggerHaptic(); sharePost('${p.id}', '${escapeHtml(p.title).replace(/'/g, "\\'")}')" style="padding: 8px 12px; color: var(--text-secondary); display: flex; align-items: center; justify-content: center;">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle>
                                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                                </svg>
                            </button>


                        </div>

                        <div style="display:flex; gap:20px; align-items: center;">
                            
                            <button class="btn btn-secondary" onclick="viewPost('${p.id}')" style="display: flex; align-items: center; gap: 6px;">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
                                </svg>
                                Comment
                            </button>

                            <button class="btn ${p.user_vote === 1 ? 'btn-primary' : 'btn-secondary'}" 
                                    onclick="handleVote('${p.id}', 1)" 
                                    style="display: flex; align-items: center; gap: 6px;">
                                <span>↑</span> <span>${p.upvotes || 0}</span>
                            </button>
                            <button class="btn ${p.user_vote === -1 ? 'btn-primary' : 'btn-secondary'}" 
                                    onclick="handleVote('${p.id}', -1)" 
                                    style="display: flex; align-items: center; gap: 6px;">
                                <span>↓</span> <span>${p.downvotes || 0}</span>
                            </button>

                        </div>
                    </div>
                </div>`;

            // Return wrapper
            return `
            <div id="post-card-${p.id}" class="card animate-item" style="position: relative; display: block; margin-bottom: 20px;">
                ${isReportedByMe ? wallHtml : ''} 
                ${contentHtml}
            </div>`;
        });

        const finalHtml = await Promise.all(htmlPromises);
        listEl.innerHTML = finalHtml.join('');

    } catch (e) {
        console.error(e);
        listEl.innerHTML = '<p style="text-align:center; color:var(--danger-color);">Error loading posts.</p>';
    } finally {
        isCommunityLoading = false; // RELEASE LOCK
    }
}
/* =========================================
   EVENT ADMIN: EDIT & MANAGE LOGIC
   ========================================= */

// State to track the specific event being edited
let editEventState = {
    id: null,
    currentImages: [] // Array of image URLs (strings)
};

// 1. OPEN MODAL & LOAD DATA
function openEditEvent(eventId) {
    console.log("Opening edit for:", eventId); // Debugging check

    // Find the event object in your cache
    if (!window.allEventsCache) {
        console.error("No events cache found");
        return;
    }

    const event = window.allEventsCache.find(e => e.id === eventId);
    if (!event) {
        alert("Event data not found!");
        return;
    }

    // Set State
    editEventState.id = eventId;
    editEventState.currentImages = event.Images || []; // Handles case where Images is undefined

    // Populate Form Fields
    document.getElementById('editEventId').value = eventId;
    document.getElementById('editEventTitle').value = event.Title || '';
    document.getElementById('editEventDesc').value = event.Description || '';

    // Handle Date (Convert "Oct 24, 2025" or Timestamp to "YYYY-MM-DD" for input)
    // If your data is already "YYYY-MM-DD", just use it. Otherwise, simple check:
    let dateVal = event.Date || '';
    if (dateVal && !dateVal.includes('-')) {
        // Try to parse if it's not in ISO format
        const d = new Date(dateVal);
        if (!isNaN(d)) dateVal = d.toISOString().split('T')[0];
    }
    document.getElementById('editEventDate').value = dateVal;

    document.getElementById('editEventTime').value = event.Time || '';
    document.getElementById('editEventLoc').value = event.Location || '';
    document.getElementById('editEventLink').value = event.RegLink || event.Link || '';

    // Clear previous "New File" inputs
    const fileInput = document.getElementById('editEventNewFiles');
    if (fileInput) fileInput.value = "";
    document.getElementById('editEventNewPreview').innerHTML = "";

    // Show Images
    renderEditImages();

    // Show Modal
    const modal = document.getElementById('editEventModal');
    if (modal) modal.classList.add('active');
}

// 2. RENDER EXISTING IMAGE THUMBNAILS
function renderEditImages() {
    const container = document.getElementById('editEventImagesList');
    if (!container) return;

    container.innerHTML = '';

    if (editEventState.currentImages.length === 0) {
        container.innerHTML = `<span style="font-size:12px; color:#666; font-style:italic;">No existing images.</span>`;
        return;
    }

    editEventState.currentImages.forEach((url, index) => {
        const div = document.createElement('div');
        div.style.cssText = "position: relative; width: 70px; height: 70px; border-radius: 8px; overflow: hidden; border:1px solid #333;";

        div.innerHTML = `
            <img src="${url}" style="width: 100%; height: 100%; object-fit: cover;">
            <div onclick="removeEventImage(${index})" 
                 style="position: absolute; top: 2px; right: 2px; background: rgba(0,0,0,0.8); color: white; border-radius: 50%; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; font-size: 10px; cursor: pointer; border: 1px solid rgba(255,255,255,0.3); z-index:5;">
                 ✕
            </div>
        `;
        container.appendChild(div);
    });
}

// 3. REMOVE IMAGE (LOCALLY)
function removeEventImage(index) {
    if (confirm("Remove this image? (Changes will apply when you click Save)")) {
        editEventState.currentImages.splice(index, 1);
        renderEditImages();
    }
}

// 4. PREVIEW NEW UPLOADS
function previewEditEventNewImages(input) {
    const preview = document.getElementById('editEventNewPreview');
    preview.innerHTML = '';

    if (input.files && input.files.length > 0) {
        Array.from(input.files).forEach(file => {
            const url = URL.createObjectURL(file);
            preview.innerHTML += `<img src="${url}" style="width: 50px; height: 50px; border-radius: 6px; object-fit: cover; border: 1px solid #333; margin-right:5px;">`;
        });
    }
}

// 5. SAVE CHANGES TO FIRESTORE

/* --- HANDLE UPVOTE (Fixed: Preserves Layout) --- */
window.handleVote = async function(postId, voteValue) {
    if (typeof triggerHaptic === "function") triggerHaptic();

    if (!window.currentUser) {
        if (typeof showToast === "function") showToast("Please login to vote");
        return;
    }
    
    const userId = localStorage.getItem('vsync_uid') || window.currentUser.uid || window.currentUser.id;

    try {
        const response = await fetch('http://127.0.0.1:3000/api/vote', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, post_id: postId, vote_value: voteValue })
        });
        
        if (response.ok) {
            if (typeof loadCommunity === "function") loadCommunity(true); 
        } else {
            if (typeof showToast === "function") showToast("Vote failed");
        }
    } catch (e) {
        console.error(e);
        if (typeof showToast === "function") showToast("Error voting");
    }
};

function openSortModal() {
    lockScroll();
    const modal = document.getElementById('sortFilterModal');

    // --- ADD CLOSE BUTTON ---
    const header = modal.querySelector('.modal-header');
    if (header && !header.querySelector('.close-modal-btn')) {
        header.style.display = "flex";
        header.style.justifyContent = "space-between";
        header.style.alignItems = "center";
        header.innerHTML = `
                    <span>Sort & Filter</span>
                    <span class="close-modal-btn" onclick="closeModal('sortFilterModal')"style="font-size:24px; cursor:pointer; padding:0 10px;">&times;</span>
                `;
    }
    // ------------------------

    modal.classList.add('active');
    renderFilterTags();
    updateFilterUI();
}
// --- GLOBAL MODAL CLOSER (FIXES SCROLL LOCK) ---
window.closeModal = function (modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    // 1. CLEAR MANUAL TRANSFORMS (Important for Swipe Logic)
    const content = modal.querySelector('.modal-content');
    if (content) {
        content.style.transform = ''; // Remove inline drag styles
    }

    modal.classList.add('closing');

    setTimeout(() => {
        modal.classList.remove('active');
        modal.classList.remove('closing');

        // --- EXTRA CLEANUP ---
        if (content) content.style.transform = '';

        unlockScroll();
    }, 280);
};
// --- SYNC PROFILE CHANGES TO OLD POSTS ---
// --- SYNC PROFILE CHANGES TO OLD POSTS ---
/* --- FIXED SYNC FUNCTION (Protects Anonymous Posts) --- */
async function syncUserProfileToContent() {
    if (!currentUser) return;

    const uData = window.currentUserData;

    // Prepare the up-to-date data object
    const updates = {
        authorName: uData.name,
        authorPic: uData.profilePic || "",
        authorRole: uData.role || "Student",
        authorYear: uData.year || "",
        authorColor: uData.themeColor || "#FF5722"
    };

    console.log("Syncing profile...");

    try {
        const postsSnap = await db.collection('posts').where('authorId', '==', currentUser.uid).get();
        const batch = db.batch();
        let updateCount = 0;

        postsSnap.forEach(doc => {
            const p = doc.data();

            // 🚨 SECURITY CHECK: 
            // If the post was made by "Guest" (Anonymous) or explicitly flagged, DO NOT update it with real name.
            if (p.authorRole === 'Guest' || p.isAnonymous === true) {
                return; // Skip this post
            }

            batch.update(doc.ref, updates);
            updateCount++;
        });

        if (updateCount > 0) {
            await batch.commit();
            console.log(`Updated ${updateCount} public posts.`);
        } else {
            console.log("No public posts to update.");
        }

    } catch (e) {
        console.error("Sync error:", e);
    }
}

// Update uploadProfilePic to close modal on success
const originalUpload = window.uploadProfilePic; // Save ref if exists logic is complex

// Overwrite slightly to close modal
window.uploadProfilePic = function () {
    const fileInput = document.getElementById('fileInput');
    if (fileInput.files.length === 0) return;
    const file = fileInput.files[0];
    if (file.size > 2 * 1024 * 1024) return alert("File too large.");

    const reader = new FileReader();
    reader.onload = function (e) {
        const newPic = e.target.result;
        db.collection('users').doc(currentUser.uid).update({ profilePic: newPic, updatedAt: new Date() })
            .then(() => {
                if (window.currentUserData) window.currentUserData.profilePic = newPic;
                document.getElementById('profilePicModal').classList.remove('active');

                loadProfile();
                updateUserInfo();

                // TRIGGER SYNC
                syncUserProfileToContent();

                showToast("Profile Picture Updated");
            });
    };
    reader.readAsDataURL(file);
};

// Update removeProfilePic to close modal
window.removeProfilePic = function () {
    if (!confirm("Remove current photo?")) return;

    db.collection('users').doc(currentUser.uid).update({ profilePic: "" })
        .then(() => {
            if (window.currentUserData) window.currentUserData.profilePic = "";
            document.getElementById('profilePicModal').classList.remove('active');

            loadProfile();
            updateUserInfo();

            // TRIGGER SYNC
            syncUserProfileToContent();

            showToast("Photo Removed");
        });
};

/* --- FILTER APPLY FIX --- */
function applyFilters() {
    // 1. Close the modal properly (This triggers unlockScroll)
    closeModal('sortFilterModal');

    // 2. Reload the feed with the new filters
    loadCommunity();
}
function applyTheme(color) {
    document.documentElement.style.setProperty('--primary-color', color);
    // Add other variables if needed
}
/* --- MESSAGE NOTIFICATIONS --- */

let msgBadgeUnsub

/* --- FIXED BADGE LISTENER (Prevents Null Crash) --- */
function initMessageBadgeListener() {
    // 1. Initial Safety Check
    if (!currentUser) return;

    // 2. Clear previous listener if it exists
    if (msgBadgeUnsub) msgBadgeUnsub();

    // 3. Start Listener
    msgBadgeUnsub = db.collection('chats')
        .where('participants', 'array-contains', currentUser.uid)
        .onSnapshot(snap => {
            // 🚨 CRITICAL FIX: Check user again INSIDE the listener
            if (!currentUser) return;

            let unreadCount = 0;
            snap.forEach(doc => {
                const data = doc.data();
                // Safety checks for message data
                if (!data.lastMessage) return;
                if (data.lastSenderId === currentUser.uid) return;

                const lastUpdate = data.updatedAt ? data.updatedAt.toDate() : new Date(0);

                // Safe access to read time
                const myReadTime = (data.lastRead && data.lastRead[currentUser.uid])
                    ? data.lastRead[currentUser.uid].toDate()
                    : new Date(0);

                if (lastUpdate > myReadTime) {
                    unreadCount++;
                }
            });

            updateMessageBadgeUI(unreadCount);
        }, error => {
            console.log("Listener stopped:", error.message);
        });
}

function updateMessageBadgeUI(count) {
    const badge = document.getElementById('msgBadge');
    if (!badge) return;

    if (count > 0) {
        badge.innerText = count > 9 ? '9+' : count;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

function clearAllFilters() {
    // 1. Reset the global filter state
    window.activeFilters = { sortBy: 'latest', years: [], tags: [] };

    // 2. Reset the visual "pills" inside the Sort Modal
    // (This ensures next time you open the menu, nothing is highlighted)
    if (typeof updateFilterUI === "function") updateFilterUI();
    if (typeof renderFilterTags === "function") renderFilterTags();

    // 3. IMPORTANT: Actually reload the feed to show posts again
    loadCommunity();
}

function toggleSort(type) {
    window.activeFilters.sortBy = type;
    updateFilterUI();
}
/* --- EXPLORE / MENTOR FILTER LOGIC --- */
window.exploreFilters = {
    roles: [],
    years: [],
    colleges: []
};



function updateExploreFilterUI() {
    // 1. Roles
    ['student', 'mentor'].forEach(r => {
        const btn = document.getElementById(`expRole_${r}`);
        if (btn) btn.className = `filter-pill ${window.exploreFilters.roles.includes(r) ? 'active' : ''}`;
    });

    // 2. Years
    ['FE', 'SE', 'TE', 'BE'].forEach(y => {
        const btn = document.getElementById(`expYear_${y}`);
        if (btn) btn.className = `filter-pill ${window.exploreFilters.years.includes(y) ? 'active' : ''}`;
    });

    // 3. Colleges
    ['VIT', 'VSIT', 'VP'].forEach(c => {
        const btn = document.getElementById(`expCol_${c}`);
        if (btn) btn.className = `filter-pill ${window.exploreFilters.colleges.includes(c) ? 'active' : ''}`;
    });
}



function toggleFilter(type, value) {
    const list = type === 'year' ? window.activeFilters.years : window.activeFilters.tags;
    const index = list.indexOf(value);

    if (index > -1) list.splice(index, 1); // Remove
    else list.push(value); // Add

    updateFilterUI();
    if (type === 'tag') renderFilterTags(); // Re-render tag visuals
}

function updateFilterUI() {
    // 1. Update Sort Buttons
    document.getElementById('sortBtn_latest').className = `filter-pill ${window.activeFilters.sortBy === 'latest' ? 'active' : ''}`;
    document.getElementById('sortBtn_upvotes').className = `filter-pill ${window.activeFilters.sortBy === 'upvotes' ? 'active' : ''}`;

    // 2. Update Year Buttons
    ['FE', 'SE', 'TE', 'BE'].forEach(y => {
        const btn = document.getElementById(`yearBtn_${y}`);
        if (btn) btn.className = `filter-pill ${window.activeFilters.years.includes(y) ? 'active' : ''}`;
    });
}

function renderFilterTags() {
    const container = document.getElementById('filterTagsContainer');
    if (!container) return;

    // Use global TAG_DATA to generate the list
    let html = '';
    TAG_DATA.forEach(tag => {
        const isActive = window.activeFilters.tags.includes(tag.name);
        const style = isActive
            ? `background: ${tag.hex}; color: white; border-color: ${tag.hex};`
            : `border-left: 3px solid ${tag.hex};`; // Visual hint of color when inactive

        html += `
            <div class="filter-pill ${isActive ? 'active' : ''}" 
                 onclick="toggleFilter('tag', '${tag.name}')"
                 style="${style}">
                ${tag.name}
            </div>
        `;
    });
    container.innerHTML = html;
}



window.handleCreatePostSubmit = async function (e) {
    e.preventDefault();
    const submitBtn = document.getElementById('submitPostBtn');
    const originalText = submitBtn.innerText;

    submitBtn.disabled = true;
    submitBtn.innerText = "Publishing...";

    try {
        if (!window.currentUser || !window.currentUserData) {
            throw new Error("You must be logged in to post.");
        }

        const titleEl = document.getElementById('communityPostTitle');
        const bodyEl = document.getElementById('communityPostBody');
        const fileEl = document.getElementById('postFileInput');

        const title = titleEl ? titleEl.value : "Untitled";
        const body = bodyEl ? bodyEl.value : "";

        // --- 🛑 AUTO-MODERATION CHECK START ---
        if (containsSensitiveContent(title) || containsSensitiveContent(body)) {
            // 1. Log it to DB so Admins know who is being naughty (Optional)
            logModerationAttempt(title + " " + body, 'post');

            // 2. Fake a "Report" delay to scare them slightly
            setTimeout(() => {
                alert("🚫 POST REJECTED \n\nYour post contains prohibited language.\n\nThis action has been automatically reported to the Admin Council.");

                // Reset button
                submitBtn.disabled = false;
                submitBtn.innerText = originalText;
            }, 500);

            return; // STOP HERE. Do not upload to Firebase.
        }
        // --- 🛑 AUTO-MODERATION CHECK END ---

        // ... THE REST OF YOUR EXISTING CODE CONTINUES BELOW ...
        // (Prepare Tags, Upload Logic, DB Add, etc.)

        // Prepare Tags
        const safeTags = window.selectedTags || [];
        const finalTags = safeTags.map(t => ({
            name: t.text,
            color: t.colorClass,
            hex: t.hex
        }));

        let fileUrl = "";
        let mediaType = "image";

        if (fileEl && fileEl.files.length > 0) {
            const file = fileEl.files[0];
            mediaType = file.type.startsWith('video/') ? 'video' : 'image';
            submitBtn.innerText = "Uploading Media...";
            fileUrl = await uploadFileToStorage(file);
        }

        const isAnon = window.currentUserData.isAnonymousSession;
        const currentYear = isAnon ? window.currentUserData.realYear : window.currentUserData.year;

        const tagToId = {
            "Technical": 1,
            "Academic": 2,
            "Career": 3,
            "Events": 4,
            "General": 5,
            "Project": 6,
            "Question": 7,
            "Announcement": 8,
            "Social": 9
        };
        const categoryId = (finalTags[0] && tagToId[finalTags[0].name]) || 1;

        const res = await fetch('http://127.0.0.1:3000/api/posts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                author_id: localStorage.getItem('vsync_uid') || window.currentUser?.uid || "1", 
                title: title,
                content: body,
                category_id: categoryId
            })
        });

        if (!res.ok) throw new Error("Failed to create post");

        console.log("Post saved successfully!");

        // Cleanup UI
        closeModal('createPostModal');
        if (titleEl) titleEl.value = "";
        if (bodyEl) bodyEl.value = "";
        if (window.removePostImage) window.removePostImage();
        window.selectedTags = [];
        if (window.renderTagsOnMainForm) window.renderTagsOnMainForm();
        if (window.loadCommunity) window.loadCommunity(true);

        submitBtn.disabled = false;
        submitBtn.innerText = "Post";

    } catch (error) {
        console.error("POST ERROR:", error);
        alert("Failed to post: " + error.message);
        submitBtn.disabled = false;
        submitBtn.innerText = originalText;
    }
};

function deletePost(postId) {
    showConfirm(
        "Delete Post?",
        "This post will be permanently removed from the community.",
        () => {
            // 1. Delete from Database
            const currentUserId = localStorage.getItem('vsync_uid') || window.currentUser?.uid || "1";
            fetch(`http://127.0.0.1:3000/api/posts/${postId}?user_id=${currentUserId}`, {
                method: 'DELETE'
            }).then(res => res.json()).then(data => {
                if (!data.success) throw new Error("Failed to delete post");
                if (typeof showToast === "function") showToast("Post deleted.");
                if (typeof loadCommunity === "function") loadCommunity(true);
                showToast("Post deleted.");

                // 2. IMMEDIATE UI UPDATE: Remove the card from the screen
                const card = document.getElementById(`post-card-${postId}`);
                if (card) {
                    // Add a fade-out animation
                    card.style.transition = "all 0.3s ease";
                    card.style.opacity = "0";
                    card.style.transform = "scale(0.9)";

                    // Remove after animation finishes
                    setTimeout(() => {
                        card.remove();

                        // Optional: If list becomes empty, show the "No posts" message
                        const listEl = document.getElementById('communityPostsList');
                        if (listEl && listEl.children.length === 0) {
                            listEl.innerHTML = '<div class="empty-state-new">No posts found.</div>';
                        }
                    }, 300);
                }
            }).catch(error => {
                console.error("Error removing post: ", error);
                alert("Could not delete post.");
            });
        }
    );
}

window.viewPost = async function(id) {
    document.getElementById('currentPostId').value = id;
    const titleEl = document.getElementById('postDetailTitle');
    const bodyEl = document.getElementById('postDetailBody');
    if (titleEl) titleEl.textContent = "Discussion";
    if (bodyEl) bodyEl.innerHTML = "";
    document.getElementById('postDetailModal').classList.add('active');

    const list = document.getElementById('commentsList');
    if (list) list.innerHTML = '<p style="color:var(--text-secondary);">Loading comments...</p>';

    try {
        const res = await fetch('http://127.0.0.1:3000/api/comments/' + id);
        const data = await res.json();
        
        if (data.success && data.comments && data.comments.length > 0) {
            list.innerHTML = data.comments.map(c => `
                <div style="padding:15px; border-bottom:1px solid rgba(255,255,255,0.05); margin-bottom:10px;">
                    <strong style="color:var(--primary-color)">${c.first_name}</strong>
                    <span style="color:var(--text-secondary); font-size:12px;"> • ${new Date(c.created_at).toLocaleDateString()}</span>
                    <p style="margin-top:8px; font-size:14px; color:var(--text-main);">${c.content}</p>
                </div>
            `).join('');
        } else {
            list.innerHTML = '<p style="text-align:center; color:var(--text-secondary); padding: 20px;">No comments yet. Be the first!</p>';
        }
    } catch (e) {
        console.error(e);
        if (list) list.innerHTML = '<p style="color:var(--danger-color);">Error loading comments.</p>';
    }
}

function loadComments(postId) {
    const list = document.getElementById('commentsList');
    list.innerHTML = '<p style="color:var(--text-secondary);">Loading...</p>';

    // 1. Fetch Post (to get goatedCommentId + authorId) AND Comments
    const postPromise = db.collection('posts').doc(postId).get();
    const commentsPromise = db.collection('posts').doc(postId).collection('comments')
        .orderBy('timestamp', 'asc')
        .get();

    Promise.all([postPromise, commentsPromise]).then(([postSnap, commentsSnap]) => {
        if (!postSnap.exists) {
            list.innerHTML = "<p>Post not found.</p>";
            return;
        }

        const postData = postSnap.data();
        postData.id = postSnap.id; // Ensure ID is attached

        // Map comments
        let comments = commentsSnap.docs.map(d => ({ ...d.data(), id: d.id }));

        // 2. Render with knowledge of the Post (for permissions & pinning)
        renderThreadedComments(comments, list, postData);

    }).catch(err => console.error("Error loading comments:", err));
}

function renderThreadedComments(comments, container, postData) {
    container.innerHTML = '';

    const commentMap = {};
    const roots = [];

    // 1. Map comments
    comments.forEach(c => {
        commentMap[c.id] = c;
        c.children = [];
    });

    // 2. Build Tree
    comments.forEach(c => {
        if (c.parentId && commentMap[c.parentId]) {
            commentMap[c.parentId].children.push(c);
        } else {
            roots.push(c);
        }
    });

    // 3. Sort: GOAT first
    roots.sort((a, b) => {
        if (a.id === postData.goatedCommentId) return -1;
        if (b.id === postData.goatedCommentId) return 1;
        return 0;
    });

    // 4. Recursive Render Function
    // CHANGED: Now accepts 'targetContainer' to know where to put the element
    function createCommentNode(comment, targetContainer, level = 0) {

        // --- LOGIC ---
        const isGoated = (comment.id === postData.goatedCommentId);
        const isPostAuthor = (currentUser && currentUser.uid === postData.authorId);

        // Normalize Role for Logic (force lowercase)
        const rawRole = comment.authorRole || "Student";
        const roleLogic = rawRole.toLowerCase();
        const isMentor = roleLogic === 'mentor';

        // Generate Visual Badge
        const roleBadge = getRoleBadgeHtml(rawRole);

        // Upvote Logic
        const hasUpvoted = (comment.upvoters || []).includes(currentUser.uid);
        const btnClass = hasUpvoted ? 'btn-primary' : 'btn-secondary';

        const wrapper = document.createElement('div');
        wrapper.style.marginLeft = level > 0 ? (level * 10) + 'px' : '0';
        if (level > 0) wrapper.style.borderLeft = "2px solid var(--border-color)";

        // --- BUTTON LOGIC ---
        let goatBtn = '';
        // Only show button if: I am Author AND Target is Mentor AND it's a root comment
        if (isPostAuthor && isMentor && level === 0) {
            const btnText = isGoated ? 'Un-Goat' : '🏆 Mark GOAT';
            goatBtn = `
            <button onclick="toggleGoatStatus('${postData.id}', '${comment.id}', '${roleLogic}')" 
                class="btn btn-sm" 
                style="margin-left:auto; font-size:10px; border:1px solid #FFD700; color:#FFD700; background:transparent;">
                ${btnText}
            </button>`;
        }

        // --- HTML ---
        wrapper.innerHTML = `
            <div id="card-${comment.id}" class="card comment-card ${isGoated ? 'is-goated' : ''}" style="margin-bottom:10px; padding:12px; position:relative;">
                
                <div style="display:flex; gap:10px; align-items:start;">
                    <img src="${comment.authorPic || 'https://upload.wikimedia.org/wikipedia/commons/7/7c/Profile_avatar_placeholder_large.png'}" style="width:32px; height:32px; border-radius:50%; object-fit:cover;">
                    
                    <div style="width:100%;">
                        <div class="goat-badge-container">
                            <svg viewBox="0 0 24 24" fill="currentColor" style="width:12px; height:12px;">
                                <path d="M12,2L14.5,8H19.5L15.5,11L17,16.5L12,13.5L7,16.5L8.5,11L4.5,8H9.5L12,2Z"/> 
                            </svg>
                            <span>GOATED</span>
                        </div>

                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <div style="display:flex; align-items:center;">
                                <strong style="font-size:13px; cursor:pointer;" onclick="openUserProfile('${comment.authorId}')">${comment.authorName}</strong>
                                ${roleBadge}
                            </div>
                            ${goatBtn}
                        </div>
                        
                        <p style="margin:4px 0; font-size:14px; line-height:1.4; padding-right: 20px;">${comment.text}</p>
                        
                        <div style="display:flex; gap:12px; align-items:center; margin-top:5px;">
                            <button class="btn ${btnClass}" style="padding:2px 8px; font-size:11px; height:auto; min-height:0;" 
                                onclick="handleCommentUpvote(event, '${postData.id}', '${comment.id}')">
                                ↑ ${comment.upvotes || 0}
                            </button>
                            
                            <span style="font-size:11px; color:#aaa; cursor:pointer; font-weight:600;" 
                                onclick="openReplyBox('${postData.id}', '${comment.id}')">Reply</span>

                            ${(currentUser && comment.authorId === currentUser.uid) ? `<span style="font-size:11px; color:#ff453a; cursor:pointer;" onclick="deleteComment('${postData.id}', '${comment.id}')">Delete</span>` : ''}
                            
                            ${comment.children.length > 0 ? `<span style="font-size:11px; color:var(--primary-color); cursor:pointer; margin-left:10px;" onclick="toggleChildren('${comment.id}')">▼ View Replies (${comment.children.length})</span>` : ''}
                        </div>

                        <div id="reply-box-${comment.id}" class="reply-input-container"></div>
                    </div>
                </div>
            </div>
            <div id="children-${comment.id}" class="comment-children"></div>
        `;

        targetContainer.appendChild(wrapper);

        if (comment.children.length > 0) {
            const childContainer = wrapper.querySelector(`#children-${comment.id}`);
            comment.children.forEach(child => createCommentNode(child, childContainer, level + 1));
        }
    }

    // 5. Initial Call: Render roots into the main container
    roots.forEach(root => createCommentNode(root, container, 0));
}
/* --- REPLY LOGIC --- */

// 1. Open/Close the Reply Input Box
function openReplyBox(postId, commentId) {
    const container = document.getElementById(`reply-box-${commentId}`);
    if (!container) return;

    // CHECK VISIBILITY STATE
    // If it has content/is visible, close it.
    if (container.style.display === 'block' && container.innerHTML !== '') {
        container.style.display = 'none';
        container.innerHTML = ''; // Clear content
        return;
    }

    // OPEN IT
    container.style.display = 'block'; // <--- THIS WAS MISSING
    container.innerHTML = `
        <div style="margin-top: 10px; margin-left: 20px; padding: 10px; background: rgba(255,255,255,0.05); border-radius: 8px; border: 1px solid var(--border-color);">
            <textarea id="reply-input-${commentId}" 
                      placeholder="Write a reply..." 
                      rows="2" 
                      style="width:100%; resize:none; margin-bottom:10px; font-size:14px; background: transparent; color: var(--text-main); border: none; outline: none;"></textarea>
            
            <div style="display:flex; justify-content:flex-end; gap:10px;">
                <button onclick="openReplyBox('${postId}', '${commentId}')" 
                        class="btn btn-secondary btn-sm" 
                        style="font-size: 11px; padding: 4px 10px;">Cancel</button>
                <button onclick="submitReply('${postId}', '${commentId}')" 
                        class="btn btn-primary btn-sm"
                        style="font-size: 11px; padding: 4px 10px;">Reply</button>
            </div>
        </div>
    `;

    // Auto-focus
    setTimeout(() => {
        const input = document.getElementById(`reply-input-${commentId}`);
        if (input) input.focus();
    }, 50);
}

// 2. Submit the Reply to Firestore
function submitReply(postId, parentId) {
    const input = document.getElementById(`reply-input-${parentId}`);
    const text = input.value.trim();

    if (!text) return;
    if (!currentUser) {
        showToast("Please log in to reply.");
        return;
    }

    const replyData = {
        text: text,
        authorId: currentUser.uid,
        authorName: window.currentUserData.name || "User",
        authorRole: window.currentUserData.role || "Student",
        authorPic: window.currentUserData.profilePic || "",
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        parentId: parentId // <--- CRITICAL: Links this comment to its parent
    };

    // Save to Firestore
    db.collection('posts').doc(postId).collection('comments').add(replyData)
        .then(() => {
            showToast("Reply sent!");
            // Refresh comments to show the new reply
            loadComments(postId);
        })
        .catch(err => {
            console.error("Reply error:", err);
            showToast("Failed to send reply.");
        });
}
/* =========================================
   STORY SYSTEM LOGIC
   ========================================= */

let activeStoryGroup = null; // Currently viewed user's stories
let currentStoryIndex = 0;
let storyTimer = null;

// 1. LOAD STORIES

// 2. UPLOAD LOGIC
function openStoryUploadModal() {
    document.getElementById('storyUploadModal').classList.add('active');
    // Reset State
    resetEditor();
    document.getElementById('btnPostStory').disabled = true;
    document.getElementById('storyFileInput').value = "";
}
function resetEditor() {
    const img = document.getElementById('storyEditorImg');
    const vid = document.getElementById('storyEditorVideo');
    const placeholder = document.getElementById('storyPlaceholder');
    const zoomCtrl = document.getElementById('zoomControls');

    img.style.display = 'none';
    vid.style.display = 'none';
    placeholder.style.display = 'flex';
    zoomCtrl.style.display = 'none';

    editorState = { scale: 1, panning: false, pointX: 0, pointY: 0, startX: 0, startY: 0, imgElement: img, videoElement: vid };
    img.style.transform = `translate(0px, 0px) scale(1)`;
}
function initEditorGestures(el) {
    el.onmousedown = startPan;
    el.ontouchstart = startPan;

    // Zoom on wheel
    el.onwheel = (e) => {
        e.preventDefault();
        const delta = e.deltaY * -0.001;
        adjustZoom(delta);
    };
}

function startPan(e) {
    e.preventDefault();
    editorState.panning = true;
    editorState.startX = (e.clientX || e.touches[0].clientX) - editorState.pointX;
    editorState.startY = (e.clientY || e.touches[0].clientY) - editorState.pointY;

    document.addEventListener('mousemove', movePan);
    document.addEventListener('touchmove', movePan, { passive: false });
    document.addEventListener('mouseup', endPan);
    document.addEventListener('touchend', endPan);
}

function movePan(e) {
    if (!editorState.panning) return;
    e.preventDefault();
    const clientX = e.clientX || e.touches[0].clientX;
    const clientY = e.clientY || e.touches[0].clientY;

    editorState.pointX = clientX - editorState.startX;
    editorState.pointY = clientY - editorState.startY;

    updateEditorTransform();
}

function endPan() {
    editorState.panning = false;
    document.removeEventListener('mousemove', movePan);
    document.removeEventListener('touchmove', movePan);
    document.removeEventListener('mouseup', endPan);
    document.removeEventListener('touchend', endPan);
}

function adjustZoom(delta) {
    editorState.scale = Math.min(Math.max(0.5, editorState.scale + delta), 3); // Limit scale 0.5x to 3x
    updateEditorTransform();
}

function updateEditorTransform() {
    const img = document.getElementById('storyEditorImg');
    if (img) {
        img.style.transform = `translate(${editorState.pointX}px, ${editorState.pointY}px) scale(${editorState.scale})`;
    }
}
let storyFileToUpload = null;
let editorState = {
    scale: 1,
    panning: false,
    pointX: 0,
    pointY: 0,
    startX: 0,
    startY: 0,
    imgElement: null,
    videoElement: null
};


/* --- CANVAS CROPPER UTILITY --- */
/* --- PRECISE CANVAS CROPPER (WYSIWYG) --- */
function cropImageToCanvas() {
    return new Promise((resolve) => {
        const img = document.getElementById('storyEditorImg');
        const cropBox = document.getElementById('storyCropArea');

        // 1. Setup High-Res Canvas (9:16)
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 1080;
        canvas.height = 1920;

        // 2. Get Visual Coordinates (The "Truth")
        const imgRect = img.getBoundingClientRect();
        const cropRect = cropBox.getBoundingClientRect();

        // 3. Calculate Scale Ratio (Canvas Pixels per Screen Pixel)
        // We base this on the width to ensure resolution is consistent
        const scaleFactor = canvas.width / cropRect.width;

        // 4. Calculate Position relative to the Crop Box
        // (imgRect.left - cropRect.left) is the distance from the left edge of the crop box
        const relativeX = (imgRect.left - cropRect.left) * scaleFactor;
        const relativeY = (imgRect.top - cropRect.top) * scaleFactor;

        const relativeWidth = imgRect.width * scaleFactor;
        const relativeHeight = imgRect.height * scaleFactor;

        // 5. Fill Black Background (for any empty space)
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 6. Draw exactly what is visible
        // We draw the image at the calculated offsets with the calculated dimensions
        ctx.drawImage(img, relativeX, relativeY, relativeWidth, relativeHeight);

        // 7. Export
        canvas.toBlob((blob) => {
            blob.name = "story_" + Date.now() + ".jpg";
            resolve(blob);
        }, 'image/jpeg', 0.90);
    });
}

let lastStoryOrigin = null;

/* --- ANIMATED STORY CLOSER (Fixed: No Flicker) --- */

/* --- HELPER: Turn Ring Grey without Reloading --- */
function updateLocalStoryRing() {
    if (!activeStoryGroup || !activeStoryGroup.user) return;

    // Check if we have seen EVERYTHING in this group
    // We check our local data which was updated in renderStoryFrame
    const stillHasUnseen = activeStoryGroup.items.some(item =>
        !item.viewers || !item.viewers.includes(currentUser.uid)
    );

    if (!stillHasUnseen) {
        // Find the specific bubble ID we created in loadStories
        const bubble = document.getElementById(`story-bubble-${activeStoryGroup.user.id}`);
        if (bubble) {
            const ring = bubble.querySelector('.story-ring');
            if (ring) {
                // Remove the blue gradient class
                ring.classList.remove('unseen');
                // It will revert to the default CSS border (grey)
            }
        }
    }
}

function renderStoryFrame() {
    clearTimeout(storyTimer);
    const story = activeStoryGroup.items[currentStoryIndex];
    const contentDiv = document.getElementById('storyViewContent');
    const progressDiv = document.getElementById('storyProgressBars');

    // Header Info
    document.getElementById('viewerName').innerText = activeStoryGroup.user.name;
    document.getElementById('viewerAvatar').src = activeStoryGroup.user.pic || "https://via.placeholder.com/32";
    document.getElementById('viewerTime').innerText = timeAgo(story.createdAt);

    // Show/Hide Delete Button (Only for Me)
    const menuWrapper = document.getElementById('storyMenuWrapper');
    if (story.userId === currentUser.uid) {
        menuWrapper.style.display = 'block';
    } else {
        menuWrapper.style.display = 'none';
    }

    // Close Menu if open from previous slide
    document.getElementById('storyOptionsMenu').classList.remove('active');

    // Progress Bars
    let barsHtml = '';
    activeStoryGroup.items.forEach((_, idx) => {
        let width = '0%';
        if (idx < currentStoryIndex) width = '100%';
        barsHtml += `
        <div class="progress-segment" style="flex:1; height:2px; background:rgba(255,255,255,0.3); margin:0 2px; border-radius:2px; overflow:hidden;">
            <div class="progress-fill" id="bar-${idx}" style="width:${width}; height:100%; background:white;"></div>
        </div>`;
    });
    progressDiv.innerHTML = barsHtml;

    // Render Media
    if (story.mediaType === 'video') {
        contentDiv.innerHTML = `<video src="${story.mediaUrl}" autoplay playsinline class="story-media-fullscreen"></video>`;
        const vid = contentDiv.querySelector('video');
        vid.onended = nextStory;
        vid.ontimeupdate = () => {
            const pct = (vid.currentTime / vid.duration) * 100;
            const bar = document.getElementById(`bar-${currentStoryIndex}`);
            if (bar) {
                bar.style.transition = "width 0.1s linear";
                bar.style.width = `${pct}%`;
            }
        };
    } else {
        contentDiv.innerHTML = `<img src="${story.mediaUrl}" class="story-media-fullscreen">`;
        const bar = document.getElementById(`bar-${currentStoryIndex}`);
        if (bar) {
            bar.style.transition = "none";
            bar.style.width = "0%";
            setTimeout(() => {
                bar.style.transition = "width 5s linear";
                bar.style.width = "100%";
            }, 50);
        }
        storyTimer = setTimeout(nextStory, 5000);
    }

    // Mark as Viewed
    if (!story.viewers || !story.viewers.includes(currentUser.uid)) {
        db.collection('stories').doc(story.id).update({
            viewers: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
        });
        if (!story.viewers) story.viewers = [];
        story.viewers.push(currentUser.uid);
    }
}




function pauseStoryPlayback() {
    clearTimeout(storyTimer);
    const vid = document.querySelector('#storyViewContent video');
    if (vid) vid.pause();
}

function resumeStoryPlayback() {
    const vid = document.querySelector('#storyViewContent video');
    if (vid) {
        vid.play();
    } else {
        storyTimer = setTimeout(nextStory, 3000); // Give 3s buffer
    }
}

/* --- UPDATED RENDER FRAME (Controls Visibility) --- */
function renderStoryFrame() {
    // ... (Your existing header/progress bar code stays the same) ...
    clearTimeout(storyTimer);
    const story = activeStoryGroup.items[currentStoryIndex];
    const contentDiv = document.getElementById('storyViewContent');
    const progressDiv = document.getElementById('storyProgressBars');

    // 1. Header Info (Copy your existing code here)
    document.getElementById('viewerName').innerText = activeStoryGroup.user.name;
    document.getElementById('viewerAvatar').src = activeStoryGroup.user.pic || "https://via.placeholder.com/32";
    document.getElementById('viewerTime').innerText = timeAgo(story.createdAt);

    // 2. Progress Bars (Copy your existing code here)
    let barsHtml = '';
    activeStoryGroup.items.forEach((_, idx) => {
        let width = '0%';
        if (idx < currentStoryIndex) width = '100%';
        barsHtml += `
        <div class="progress-segment" style="flex:1; height:2px; background:rgba(255,255,255,0.3); margin:0 2px; border-radius:2px; overflow:hidden;">
            <div class="progress-fill" id="bar-${idx}" style="width:${width}; height:100%; background:white;"></div>
        </div>`;
    });
    progressDiv.innerHTML = barsHtml;

    // --- NEW: SHOW/HIDE 3-DOTS BUTTON ---
    const menuWrapper = document.getElementById('storyMenuWrapper');
    const menu = document.getElementById('storyOptionsMenu');

    // Always close menu when swiping to new story
    if (menu) menu.classList.remove('active');

    if (story.userId === currentUser.uid) {
        menuWrapper.style.display = 'block';
    } else {
        menuWrapper.style.display = 'none';
    }
    // -------------------------------------

    // 3. Render Media (Existing Logic)
    if (story.mediaType === 'video') {
        contentDiv.innerHTML = `<video src="${story.mediaUrl}" autoplay playsinline class="story-media-fullscreen"></video>`;
        const vid = contentDiv.querySelector('video');
        vid.onended = nextStory;
        vid.ontimeupdate = () => {
            const pct = (vid.currentTime / vid.duration) * 100;
            const bar = document.getElementById(`bar-${currentStoryIndex}`);
            if (bar) {
                bar.style.transition = "width 0.1s linear";
                bar.style.width = `${pct}%`;
            }
        };
    } else {
        contentDiv.innerHTML = `<img src="${story.mediaUrl}" class="story-media-fullscreen">`;
        const bar = document.getElementById(`bar-${currentStoryIndex}`);
        if (bar) {
            bar.style.transition = "none";
            bar.style.width = "0%";
            setTimeout(() => {
                bar.style.transition = "width 5s linear";
                bar.style.width = "100%";
            }, 50);
        }
        storyTimer = setTimeout(nextStory, 5000);
    }

    // 4. Mark as Viewed (Existing Logic)
    if (!story.viewers || !story.viewers.includes(currentUser.uid)) {
        db.collection('stories').doc(story.id).update({
            viewers: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
        });
        if (!story.viewers) story.viewers = [];
        story.viewers.push(currentUser.uid);
    }
}


function buildCommentNode(c, postId) {
    const isAuthor = currentUser && c.authorId === currentUser.uid;

    // --- VISUAL OVERRIDE FOR COMMENTS ---
    const displayPic = isAuthor && !window.currentUserData.isAnonymousSession ? (window.currentUserData.profilePic || "") : (c.authorPic || "");
    const displayName = isAuthor && !window.currentUserData.isAnonymousSession ? window.currentUserData.name : c.authorName;
    const displayRole = isAuthor && !window.currentUserData.isAnonymousSession ? (window.currentUserData.role || "Student") : (c.authorRole || "Student");
    const displayYear = isAuthor && !window.currentUserData.isAnonymousSession ? (window.currentUserData.year || "") : (c.authorYear || "");
    // ------------------------------------

    const yearBadge = getYearBadgeHtml(displayYear);
    const timeString = timeAgo(c.timestamp);

    let avatarHtml = displayPic
        ? `<img src="${displayPic}"; loading="lazy"; class="post-avatar-small" style="width:30px; height:30px; min-width:30px;">`
        : `<div class="post-avatar-small" style="width:30px; height:30px; min-width:30px; background:#333; display:flex; align-items:center; justify-content:center; font-weight:bold; color:#ccc;">${(displayName || "U").charAt(0)}</div>`;

    const hasChildren = c.children && c.children.length > 0;
    const childHtml = hasChildren
        ? `<div id="children-${c.id}" class="comment-children">${c.children.map(child => buildCommentNode(child, postId)).join('')}</div>`
        : `<div id="children-${c.id}" class="comment-children"></div>`;

    const toggleBtn = hasChildren
        ? `<span style="font-size:11px; color:var(--primary-color); cursor:pointer; margin-left:10px;" onclick="toggleChildren('${c.id}')">▼ View Replies (${c.children.length})</span>`
        : '';

    return `
            <div class="comment-thread-container" id="comment-${c.id}">
                ${hasChildren ? '<div class="comment-thread-line"></div>' : ''}

                <div style="display:flex; gap:10px; padding:10px 0;">
                    ${avatarHtml}
                    <div style="flex:1;">
                        <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                            <span style="color:var(--text-main); font-weight:700; font-size:13px;">${displayName}</span>
                            <span class="badge badge-verified" style="font-size:9px; padding:1px 4px;">${displayRole}</span>
                            ${yearBadge}
                            <span style="color:var(--text-secondary); font-size:11px;">• ${timeString}</span>
                        </div>

                        <div style="color:#ddd; font-size:14px; margin:4px 0 6px 0;">${c.text}</div>

                        <div style="display:flex; gap:12px; align-items:center;">
                            <button class="btn btn-secondary" style="padding:2px 8px; font-size:11px; height:auto; min-height:0;" 
                                onclick="handleCommentUpvote(event, '${postId}', '${c.id}')">↑ ${c.upvotes || 0}</button>
                            
                            <span style="font-size:11px; color:#aaa; cursor:pointer; font-weight:600;" 
                                onclick="showReplyBox('${c.id}')">Reply</span>

                            ${isAuthor ? `<span style="font-size:11px; color:#ff453a; cursor:pointer;" onclick="deleteComment('${postId}', '${c.id}')">Delete</span>` : ''}
                            
                            ${toggleBtn}
                        </div>

                        <div id="reply-box-${c.id}" class="reply-input-container">
                            <form onsubmit="handleNewComment(event, '${c.id}')" style="display:flex; gap:8px;">
                                <input id="reply-input-${c.id}" type="text" placeholder="Reply to ${displayName}..." 
                                    style="padding:8px; font-size:13px; border-radius:15px; border:1px solid #444; background:var(--bg-input); color:white; flex:1;">
                                <button type="submit" class="btn btn-primary" style="padding:5px 12px; font-size:12px;">Post</button>
                            </form>
                        </div>
                    </div>
                </div>
                ${childHtml}
            </div>`;
}

// --- HELPER FUNCTIONS FOR COMMENTS ---
function toggleChildren(commentId) {
    const childContainer = document.getElementById(`children-${commentId}`);
    if (childContainer) {
        childContainer.classList.toggle('open');
    }
}

function showReplyBox(commentId) {
    // Close all other reply boxes first (optional UX choice)
    document.querySelectorAll('.reply-input-container').forEach(el => el.style.display = 'none');

    const box = document.getElementById(`reply-box-${commentId}`);
    if (box) {
        box.style.display = 'block';
        // Focus the input
        setTimeout(() => {
            const input = document.getElementById(`reply-input-${commentId}`);
            if (input) input.focus();
        }, 100);
    }
}

function handleCommentUpvote(event, postId, commentId) {
    event.preventDefault();
    const btn = event.currentTarget;
    const isUpvoted = btn.classList.contains('btn-primary');

    // 1. UI Update
    let rawText = btn.innerText; // e.g. "↑ (5)"
    let count = parseInt(rawText.replace(/\D/g, '')) || 0;

    if (isUpvoted) {
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-secondary');
        btn.innerText = `↑ ${Math.max(0, count - 1)}`;
    } else {
        btn.classList.remove('btn-secondary');
        btn.classList.add('btn-primary');
        btn.innerText = `↑ ${count + 1}`;
    }

    // 2. DB Update
    const ref = db.collection('posts').doc(postId).collection('comments').doc(commentId);
    if (isUpvoted) {
        ref.update({
            upvotes: firebase.firestore.FieldValue.increment(-1),
            upvoters: firebase.firestore.FieldValue.arrayRemove(currentUser.uid)
        });
    } else {
        ref.update({
            upvotes: firebase.firestore.FieldValue.increment(1),
            upvoters: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
        }).then(() => {
            // --- NEW: ADD POINT TO AUTHOR ---
            // Fetch comment to get author ID
            ref.get().then(doc => {
                if (doc.exists) updateUserScore(doc.data().authorId, 1); // +1 Point
            });
        });
    }
}

function deleteComment(postId, commentId) {
    showConfirm(
        "Delete Comment?",
        "Are you sure you want to remove this comment?",
        () => {
            db.collection('posts').doc(postId).collection('comments').doc(commentId).delete()
                .then(() => loadComments(postId));
        }
    );
}
/* --- EVENTS TAB LOGIC --- */
/* --- EVENTS FILTER & SORT STATE --- */
window.currentEventFilter = 'all'; // 'all', 'campus', 'outside'
window.currentEventSort = 'soon';  // 'soon', 'late'
window.allEventsCache = []; // Store data here so we don't re-fetch from Firebase on every filter click

/* --- MAIN LOADER --- */
/* --- MANUAL EVENT LOGIC --- */



/* --- RENDERER (Handles Filter/Sort Logic) --- */
function renderEventsList() {
    const listEl = document.getElementById('eventsList');
    // Ensure we have data
    if (!window.allEventsCache) return;

    let events = [...window.allEventsCache]; // Copy array

    // A. FILTERING
    if (window.currentEventFilter === 'campus') {
        events = events.filter(e => {
            const loc = (e.Location || "").toLowerCase();
            const src = (e.sourceName || "").toLowerCase();
            return loc.includes('vit') || loc.includes('campus') || loc.includes('vidyalankar') || src.includes('vit');
        });
    } else if (window.currentEventFilter === 'outside') {
        events = events.filter(e => {
            const loc = (e.Location || "").toLowerCase();
            const src = (e.sourceName || "").toLowerCase();
            return !(loc.includes('vit') || loc.includes('campus') || loc.includes('vidyalankar') || src.includes('vit'));
        });
    }

    // B. SORTING
    if (window.currentEventSort === 'soon') {
        events.sort((a, b) => a.timestamp - b.timestamp);
    } else {
        events.sort((a, b) => b.timestamp - a.timestamp);
    }

    // C. HTML GENERATION
    if (events.length === 0) {
        listEl.innerHTML = '<div class="empty-state-new" style="margin-top:20px;">No events match your filter.</div>';
        return;
    }

    // D. CHECK ADMIN STATUS
    // We check if the current user is an admin to decide if we show the pencil icon
    const isAdmin = currentUser && typeof ADMIN_UIDS !== 'undefined' && ADMIN_UIDS.includes(currentUser.uid);

    let html = '';
    events.forEach(e => {
        // Safe Link Logic
        let finalLink = e.Link;
        if (!finalLink || !finalLink.startsWith('http')) {
            finalLink = e.sourceUrl || "#";
        }

        // Logo Logic
        const logoImg = e.sourceLogo || "https://cdn-icons-png.flaticon.com/512/1005/1005141.png";

        // Date Badge Color logic
        let dateBadgeColor = "var(--primary-color)";

        // --- ADMIN BUTTON HTML ---
        // This creates a small floating circle button in the top-right
        const editBtn = isAdmin ? `
            <button onclick="openEditEvent('${e.id}')" 
                style="position: absolute; top: 10px; right: 10px; z-index: 10; width: 30px; height: 30px; border-radius: 50%; border:none; background: rgba(0,0,0,0.1); color: var(--text-main); display: flex; align-items: center; justify-content: center; cursor: pointer;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
        ` : '';

        // Added 'position: relative' to the main card div so the edit button is positioned correctly
        html += `
        <div class="card" style="padding:0; overflow:hidden; border:1px solid var(--border-color); display:flex; flex-direction:column; position: relative;">
            
            ${editBtn} <div style="display:flex; padding:15px; gap:15px; padding-right: 40px;"> <div style="width:60px; height:60px; flex-shrink:0; background:#fff; border-radius:12px; padding:5px; display:flex; align-items:center; justify-content:center;">
                    <img src="${logoImg}" style="width:100%; height:100%; object-fit:contain;">
                </div>

                <div style="flex:1; min-width:0;">
                    <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:5px;">
                        <div style="font-size:10px; color:var(--text-secondary); text-transform:uppercase; font-weight:700; letter-spacing:0.5px;">
                            ${e.type || 'EVENT'}
                        </div>
                        <div style="background:rgba(10, 132, 255, 0.1); color:${dateBadgeColor}; padding:2px 8px; border-radius:6px; font-size:10px; font-weight:700;">
                            ${e.Date || 'TBA'}
                        </div>
                    </div>
                    
                    <h3 style="font-size:16px; font-weight:800; margin-bottom:5px; line-height:1.3; color:var(--text-main);">
                        ${e.Title}
                    </h3>
                    
                    <div style="display:flex; align-items:center; gap:5px; font-size:12px; color:#aaa; margin-bottom:8px;">
                        <span>📍</span> ${e.Location || 'Online'}
                    </div>
                </div>
            </div>

            <div style="padding:0 15px 15px 15px;">
                <p style="font-size:13px; color:#ccc; line-height:1.5; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">
                    ${e.Description}
                </p>
            </div>

            <a href="${finalLink}" target="_blank" class="btn btn-primary" 
                style="margin:0 15px 15px 15px; border-radius:12px; text-decoration:none; text-align:center; display:flex; align-items:center; justify-content:center; gap:6px;">
                <span>Register Now</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>
            </a>
            
            <div style="background:rgba(255,255,255,0.03); padding:6px 15px; font-size:10px; color:#555; text-align:right;">
                Source: ${e.sourceName || 'V-SYNC Bot'}
            </div>
        </div>`;
    });

    listEl.innerHTML = html;
}

/* --- FILTER MODAL CONTROLS --- */



function updateEventFilterUI() {
    // Update Filter Pills
    ['all', 'campus', 'outside'].forEach(t => {
        const el = document.getElementById(`evFilter_${t}`);
        if (el) el.classList.toggle('active', window.currentEventFilter === t);
    });

    // Update Sort Pills
    ['soon', 'late'].forEach(t => {
        const el = document.getElementById(`evSort_${t}`);
        if (el) el.classList.toggle('active', window.currentEventSort === t);
    });
}


async function upvote(id) {
    if (!currentUser) return alert("You must be logged in to upvote.");
    try {
        const res = await fetch('http://127.0.0.1:3000/api/upvotes/toggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ post_id: id, user_id: 1 }) // Simplified static user ID for migration since full auth is mocked
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        loadCommunity(true);
    } catch (err) {
        console.error("Upvote failed:", err);
    }
}
function upvoteComment(pid, cid) { const ref = db.collection('posts').doc(pid).collection('comments').doc(cid); ref.get().then(doc => { const data = doc.data(); if (data.authorId === currentUser.uid) return; const upvoters = data.upvoters || []; const hasUpvoted = upvoters.includes(currentUser.uid); ref.update({ upvotes: firebase.firestore.FieldValue.increment(hasUpvoted ? -1 : 1), upvoters: hasUpvoted ? upvoters.filter(id => id !== currentUser.uid) : [...upvoters, currentUser.uid] }).then(() => loadComments(pid)); }); }

// --- PROFILE ---
// --- PROFILE ---
function loadProfile() {
    // 1. SAFETY CHECK
    if (!currentUser) return;
    let adminBtnHtml = '';
    if (currentUser && typeof ADMIN_UIDS !== 'undefined' && ADMIN_UIDS.includes(currentUser.uid)) {
        adminBtnHtml = `
    <button class="btn-new" onclick="openAdminPanel()" 
        style="grid-column: 1 / -1; background: rgba(255, 69, 58, 0.15); color: #ff453a; border: 1px solid #ff453a; margin-top: 10px;">
        👮‍♂️ Admin Dashboard
    </button>`;
    }
    const actionContainer = document.getElementById('profileActionButtons');
    if (actionContainer) {
        actionContainer.innerHTML = `
        <button class="btn-new btn-primary-new" onclick="toggleEditMode()">Edit</button>
        <button class="btn-new btn-secondary-new" onclick="openSavedPosts()">Saved</button>
        <button class="btn-new btn-secondary-new" onclick="shareProfile()">Share</button>
        ${adminBtnHtml}
    `;
    }

    // 2. ANONYMOUS CHECK
    if (window.currentUserData && window.currentUserData.isAnonymousSession) {
        const profileTab = document.getElementById('profile');
        const yearHtml = (typeof getYearBadgeHtml === 'function') ? getYearBadgeHtml(window.currentUserData.realYear) : "";

        profileTab.innerHTML = `
                    <div style="max-width: 500px; margin: 60px auto; text-align: center; padding: 40px; background: var(--bg-card); border-radius: 24px; border: 1px dashed var(--border-color);">
                        <div style="width: 120px; height: 120px; border-radius: 50%; background: #333; color: #666; display: flex; align-items: center; justify-content: center; font-size: 60px; font-weight: bold; border: 4px dashed #555; margin: 0 auto 25px;">?</div>
                        <h1 style="color: var(--text-main); margin-bottom: 10px;">Anonymous</h1>
                        <div style="margin-bottom: 20px;">${yearHtml}</div>
                        <p style="color: var(--text-secondary); margin-bottom: 30px; font-size: 14px; line-height: 1.6;">
                            You are in Anonymous mode.<br>Social features and profile editing are disabled.
                        </p>
                        <div style="display: flex; flex-direction: column; gap: 15px; align-items: center;">
                            <div class="sort-btn-style anon-exit-override" onclick="document.getElementById('exitAnonModal').classList.add('active')" style="background-color: var(--primary-color); box-shadow: 0 8px 50px rgba(10, 132, 255, 0.4);"> 
                                <span class="sort-btn-text" style="margin:0; padding:0 20px;">Exit Anonymous mode</span>
                            </div>
                            <div style="display:flex; gap:10px; margin-top:20px;">
                                <button class="btn btn-secondary" onclick="window.performLogout()">Logout</button>
                                <button class="btn btn-danger" onclick="deleteAccount()">Delete Account</button>
                            </div>
                        </div>
                    </div>`;
        return;
    }

    // 3. STANDARD USER LOGIC
    fetch(`http://127.0.0.1:3000/api/users/${localStorage.getItem('vsync_uid') || currentUser.uid || currentUser.id}`)
        .then(res => res.json())
        .then(dataResponse => {
            if (!dataResponse.success) throw new Error("Profile fetch failed");
            const dbData = dataResponse.profile || {};
            const data = { ...window.currentUserData, ...dbData };

            const rawName = data.first_name || data.name || "User";
            const displayName = rawName.charAt(0).toUpperCase() + rawName.slice(1);

            // Update Name
            const nameEl = document.getElementById('profileName');
            if (data.role === 'mentor' && data.isVerified) {
                nameEl.innerHTML = `${displayName} <span style="color:#30D158; font-size:0.8em; vertical-align: middle;">✔</span>`;
            } else {
                nameEl.textContent = displayName;
            }

            // Update Badge
            const badgeEl = document.getElementById('profileBadge');
            let badgeText = (data.role || 'student').toUpperCase();
            let badgeColor = 'var(--primary-color)';
            if (data.role === 'mentor') {
                if (data.isVerified) { badgeText = "VERIFIED MENTOR"; badgeColor = "#30D158"; }
                else { badgeText = "MENTOR"; badgeColor = "#636366"; }
            }
            badgeEl.textContent = badgeText;
            badgeEl.style.background = badgeColor;

            // --- FIXED: HYDRATION FORCE ---
            const topNav = document.getElementById('topNavInitial');
            if (topNav) topNav.textContent = data.first_name ? data.first_name.charAt(0).toUpperCase() : 'U';
            
            const emailEl = document.getElementById('profileEmail');
            if (emailEl) emailEl.textContent = data.email || '';
            
            const yearEl = document.getElementById('profileYear');
            if (yearEl) yearEl.textContent = data.current_year || 'Not specified';
            
            const dateEl = document.getElementById('profileDate');
            if (dateEl && data.created_at) dateEl.textContent = new Date(data.created_at).toLocaleDateString();
            
            const expEl = document.getElementById('profileExperience');
            if (expEl) expEl.textContent = data.work_experience || 'No experience added.';
            
            const avatarBox = document.getElementById('profileAvatarBox');
            if (avatarBox) {
                if (data.profile_picture && data.profile_picture !== 'null') {
                    avatarBox.innerHTML = `<img src="${data.profile_picture}" style="width:100px;height:100px;border-radius:50%;object-fit:cover;margin:0 auto;">`;
                } else {
                    avatarBox.innerHTML = `<div class="profile-initial-large-new">${data.first_name ? data.first_name.charAt(0).toUpperCase() : '?'}</div>`;
                }
            }

            // Populate Edit Form
            const editNameEl = document.getElementById('editName');
            if(editNameEl) editNameEl.value = data.first_name || data.name || '';
            
            const editCollegeEl = document.getElementById('editCollege');
            if(editCollegeEl) editCollegeEl.value = data.college || '';
            
            const editYearEl = document.getElementById('editYear');
            if(editYearEl) editYearEl.value = data.current_year || data.year || 'FE';
            
            const editSkillsEl = document.getElementById('editSkills');
            if(editSkillsEl) editSkillsEl.value = (data.skills || []).join(', ');

        }).catch(e => {
            console.error("Profile load error:", e);
            const nameEl = document.getElementById('profileName');
            if (nameEl) nameEl.textContent = 'Error loading profile';
        });

    // Refresh Stats
    if (typeof updateProfileStats === 'function') updateProfileStats();
}
/* --- MARK CHAT AS READ --- */
function markChatAsRead(chatId) {
    if (!currentUser) return;

    // Update the 'lastRead' map in the chat document
    // We use merge: true logic via update
    const updateData = {};
    updateData[`lastRead.${currentUser.uid}`] = firebase.firestore.FieldValue.serverTimestamp();

    db.collection('chats').doc(chatId).update(updateData).catch(err => {
        // If doc doesn't exist or other error (ignore silently)
        console.log("Read receipt update skipped");
    });
}
// --- MISSING FUNCTION FIX ---
function updateProfileStats() {
    if (!currentUser) return;
    const uid = currentUser.uid;

    // 1. Count My Posts
    db.collection('posts').where('authorId', '==', uid).get()
        .then(snap => {
            const el = document.getElementById('statPosts');
            if (el) el.innerText = snap.size;
        })
        .catch(e => console.log("Error counting posts", e));

    // 2. Count Connections (Sent + Received)
    const sentPromise = db.collection('connection_requests').where('senderId', '==', uid).where('status', '==', 'accepted').get();
    const recPromise = db.collection('connection_requests').where('recipientId', '==', uid).where('status', '==', 'accepted').get();

    Promise.all([sentPromise, recPromise])
        .then(([sentSnap, recSnap]) => {
            const total = sentSnap.size + recSnap.size;

            const elConn = document.getElementById('statConnections');
            if (elConn) elConn.innerText = total;

            // For now, we'll set Mentors to 0 or you can implement specific mentor logic here
            const elMentors = document.getElementById('statMentors');
            if (elMentors) elMentors.innerText = 0;
        })
        .catch(e => console.log("Error counting connections", e));
}

// Function to handle the Exit password check
function confirmExitAnon() {
    const inputPass = document.getElementById('exitAnonPassword').value;

    // We retrieve the real password stored in memory during login
    const realPass = window.currentUserData ? window.currentUserData.password : null;

    if (inputPass === realPass) {
        document.getElementById('exitAnonModal').classList.remove('active');
        showToast("🔓 Exiting Anonymous Mode");

        // Reload session as normal user (Pass 'false' for isAnon)
        simulateLogin(window.currentUser.uid, false);
    } else {
        alert("Incorrect Password. Cannot exit Anonymous mode.");
    }
}

function toggleEditMode() {
    const form = document.getElementById('editForm');
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
}

function saveProfile() {
    const name = document.getElementById('editName').value.trim();
    const college = document.getElementById('editCollege').value.trim();
    const year = document.getElementById('editYear').value;
    const skillsInput = document.getElementById('editSkills').value.trim();
    const skills = skillsInput ? skillsInput.split(',').map(s => s.trim()).filter(s => s) : [];

    if (!name) return alert('Please enter your name');

    db.collection('users').doc(currentUser.uid).update({
        name: name,
        college: college,
        year: year,
        skills: skills,
        updatedAt: new Date()
    }).then(() => {
        // --- FIX: Update Global Memory ---
        if (window.currentUserData) {
            window.currentUserData.name = name;
            window.currentUserData.college = college;
            window.currentUserData.year = year;
            window.currentUserData.skills = skills;
        }
        // ---------------------------------

        alert('Profile updated successfully!');
        toggleEditMode();
        loadProfile();
        updateUserInfo();
        syncUserProfileToContent();
    }).catch(error => {
        console.error('Error saving profile:', error);
        alert('Error saving profile: ' + error.message);
    });
}
function adminResetScores() {
    // 1. Security/Confirmation
    const confirmCode = prompt("Type 'RESET' to set ALL mentor scores to 0.");
    if (confirmCode !== 'RESET') return;

    // 2. Perform Batch Update
    const btn = event.target;
    const oldText = btn.innerText;
    btn.innerText = "Resetting...";
    btn.disabled = true;

    db.collection('users').where('role', '==', 'mentor').get()
        .then(snap => {
            const batch = db.batch();
            snap.forEach(doc => {
                batch.update(doc.ref, { score: 0 });
            });
            return batch.commit();
        })
        .then(() => {
            showToast("✅ Leaderboard Reset");
            btn.innerText = oldText;
            btn.disabled = false;
            // Refresh Leaderboard if looking at it
            if (document.getElementById('leaderboard').classList.contains('active')) {
                loadLeaderboard();
            }
        })
        .catch(err => {
            console.error(err);
            alert("Error resetting scores");
            btn.innerText = oldText;
            btn.disabled = false;
        });
}
function triggerHaptic() {
    // 1. Check if hardware supports it
    if (!window.navigator || !window.navigator.vibrate) {
        console.log("Haptic not supported on this device.");
        return;
    }

    // 2. FORCE VIBRATION (50ms is a solid "tick")
    // Using an array [50] helps bypass some browser restrictions
    const success = window.navigator.vibrate([50]);

    // Debug log to console (Connect phone to PC to see this if needed)
    console.log("Haptic triggered:", success);
}
function shareProfile() {
    const url = window.location.href;
    if (navigator.share) {
        navigator.share({
            title: document.getElementById('profileName').textContent,
            text: `Check out my profile on V-SYNC`,
            url: url
        });
    } else {
        alert('Profile link: ' + url);
    }
}

function downloadResume() {
    alert('Resume download feature coming soon!');
}

function removeProfilePic() {
    showConfirm(
        "Remove Photo?",
        "Are you sure you want to remove your profile picture?",
        () => {
            db.collection('users').doc(currentUser.uid).update({ profilePic: "" })
                .then(() => {
                    // --- FIX: Clear Global Memory Immediately ---
                    if (window.currentUserData) {
                        window.currentUserData.profilePic = "";
                    }
                    // --------------------------------------------
                    loadProfile();
                    updateUserInfo();
                });
        }
    );
}
function handleFileSelect() { const fileInput = document.getElementById('fileInput'); if (fileInput.files.length > 0) document.getElementById('fileNameDisplay').textContent = fileInput.files[0].name; }
function uploadProfilePic() {
    const fileInput = document.getElementById('fileInput');
    if (fileInput.files.length === 0) return alert("Choose photo first.");

    const file = fileInput.files[0];
    if (file.size > 2 * 1024 * 1024) return alert("File too large (Max 2MB)."); // Increased limit slightly

    const reader = new FileReader();
    reader.onload = function (e) {
        const newPic = e.target.result;

        db.collection('users').doc(currentUser.uid).set({ profilePic: newPic }, { merge: true })
            .then(() => {
                // --- FIX: Update Global Memory Immediately ---
                if (window.currentUserData) {
                    window.currentUserData.profilePic = newPic;
                }
                // ---------------------------------------------

                alert("Updated!");
                loadProfile();
                updateUserInfo();
            })
            .catch(err => console.error(err));
    };
    reader.readAsDataURL(file);
}
// --- UNSEND & CHAT FUNCTIONS ---

// 1. Global listener variable (Only declare this ONCE in your code)
let msgUnsub;

// 2. The Delete Function
function deleteMessage(chatId, messageId) {
    showConfirm(
        "Unsend Message?",
        "This message will be removed for everyone in the chat.",
        () => {
            db.collection('chats').doc(chatId).collection('messages').doc(messageId).delete()
                .then(() => console.log("Message unsent"))
                .catch(error => console.error("Error removing message: ", error));
        }
    );
}

// 3. The Chat Function
// --- 4. OPEN CHAT (With "Last Active" Header) ---
// --- GLOBAL VARS (Add this at the top with others) ---
let chatMetaUnsub;

/* --- OPEN CHAT (With Real-Time Seen Status) --- */
/* --- OPEN CHAT (With Profile Pics) --- */
function openInlineChat(chatId, otherUserId, name) {
    if (window.innerWidth <= 600) lockScroll();

    // 1. Cleanup
    if (msgUnsub) msgUnsub();
    if (chatMetaUnsub) chatMetaUnsub();

    document.getElementById('selectedChatId').value = chatId;

    // 2. UI Setup
    document.getElementById('chats').classList.add('mobile-chat-open');
    if (window.innerWidth <= 600) document.querySelector('.tabs').style.display = 'none';

    const headerInfo = document.getElementById('chatHeaderInfo');
    const initial = name.charAt(0).toUpperCase();

    // --- NEW: Store messages and pic to handle async loading ---
    let currentChatPartnerPic = null;
    let currentMessages = [];
    const cont = document.getElementById('messagesContainer');

    // 3. Fetch User Data (Header + Pic for messages)
    db.collection('users').doc(otherUserId).get().then(doc => {
        let picHtml = `<div style="width:38px; height:38px; border-radius:50%; background:#333; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:bold;">${initial}</div>`;
        let statusText = "Connecting...";
        let statusColor = "var(--text-secondary)";

        if (doc.exists) {
            const u = doc.data();

            // SAVE PIC FOR MESSAGES
            currentChatPartnerPic = u.profilePic;

            if (u.profilePic) picHtml = `<img src="${u.profilePic}" style="width:38px; height:38px; border-radius:50%; object-fit:cover;">`;
            statusText = formatLastActive(u.lastSeen);
            if (statusText === 'Active now') statusColor = '#30D158';

            // Re-render messages now that we have the pic
            if (currentMessages.length > 0) {
                renderMessages(currentMessages, cont, chatId, currentChatPartnerPic);
            }
        }

        headerInfo.innerHTML = `
<div style="display: flex; align-items: center; gap: 12px; cursor: pointer;" onclick="openUserProfile('${otherUserId}')">
    ${picHtml}
    <div style="line-height: 1.3;">
        <div style="font-size: 16px; font-weight: 700; color: var(--text-main);">${name}</div>
        <div style="font-size: 12px; color: ${statusColor};">${statusText}</div>
    </div>
</div>`;
    });

    document.getElementById('sendMessageForm').classList.remove('hidden');
    cont.innerHTML = '';

    markChatAsRead(chatId);

    // 4. MESSAGE LISTENER
    msgUnsub = db.collection('chats').doc(chatId).collection('messages')
        .orderBy('timestamp', 'asc')
        .onSnapshot(snap => {
            if (!snap.empty) markChatAsRead(chatId);

            currentMessages = snap.docs.map(d => ({ ...d.data(), id: d.id }));

            // Pass the pic variable here
            renderMessages(currentMessages, cont, chatId, currentChatPartnerPic);

            cont.scrollTop = cont.scrollHeight;
        });

    // 5. SEEN STATUS LISTENER
    chatMetaUnsub = db.collection('chats').doc(chatId).onSnapshot(doc => {
        if (!doc.exists) return;
        const data = doc.data();
        if (data.lastRead && data.lastRead[otherUserId]) {
            updateSeenStatus(currentMessages, data.lastRead[otherUserId], cont);
        }
    });
}

function removeFromSaved(event, postId) {
    event.stopPropagation();

    // 1. Remove from Database
    db.collection('users').doc(currentUser.uid).update({
        bookmarks: firebase.firestore.FieldValue.arrayRemove(postId)
    }).catch(e => console.error(e));

    // 2. Update Local Data (so the bookmark icon updates elsewhere)
    if (window.currentUserData.bookmarks) {
        window.currentUserData.bookmarks = window.currentUserData.bookmarks.filter(id => id !== postId);
    }

    // 3. Remove the Card from the Modal UI
    const card = event.target.closest('.card');
    if (card) {
        card.style.opacity = '0'; // Fade out
        setTimeout(() => {
            card.remove(); // Remove DOM

            // Check if list is empty
            const list = document.getElementById('savedPostsList');
            if (list && list.children.length === 0) {
                list.innerHTML = `
                    <div class="empty-state-new" style="margin-top:20px;">
                        <div style="font-size:30px; margin-bottom:10px;">🔖</div>
                        You haven't saved any posts yet.
                    </div>`;
            }
        }, 300);
    }

    showToast("Removed from Saved");
}
function renderMessages(messages, container, chatId, otherPic) {
    let html = '';

    // Helper to generate avatar HTML
    const getAvatar = (name) => {
        if (otherPic) return `<img src="${otherPic}" class="chat-msg-avatar">`;
        // Fallback placeholder
        return `<div class="chat-msg-placeholder" style="width:28px; height:28px; font-size:10px;">${name ? name.charAt(0) : '?'}</div>`;
    };

    messages.forEach(m => {
        const me = currentUser ? (m.senderId === currentUser.uid) : false;

        let content;

        // --- 1. DOCUMENT / PDF ---
        if (m.mediaType === 'document') {
            const sizeStr = typeof formatBytes === 'function' ? formatBytes(m.fileSize || 0) : 'File';
            // Use the file icon helper or fallback
            const iconHtml = typeof getFileIcon === 'function' ? getFileIcon(m.fileName || 'file.pdf') : '📄';

            content = `
<div class="file-attachment-card" onclick="forceDownload(event, '${m.imageUrl}', '${m.fileName || 'file'}')" style="border:none; background:rgba(0,0,0,0.2);">
    ${iconHtml}
    <div class="file-info">
        <span class="file-name">${m.fileName || 'Document'}</span>
        <div class="file-meta">${sizeStr} • Tap to Download</div>
    </div>
</div>`;
        }
        // --- 2. IMAGE OR VIDEO ---
        else if (m.imageUrl) {
            content = (m.mediaType === 'video')
                ? `<video src="${m.imageUrl}" controls class="chat-image"></video>`
                : `<img src="${m.imageUrl}" class="chat-image" onclick="openLightbox(this.src)">`;
        }
        // --- 3. TEXT ---
        else {
            content = `<span>${m.text}</span>`;
        }

        const msgIdAttr = `id="msg-${m.id}"`;
        let events = me ? `oncontextmenu="showContextMenu(event, 'message', '${chatId}', '${m.id}')"` : '';

        // Insert Avatar ONLY for 'them'
        const avatarHtml = !me ? getAvatar("User") : '';

        html += `
        <div class="chat-message-row ${me ? 'me' : 'them'}" ${msgIdAttr}>
            ${avatarHtml}
            <div class="msg-bubble ${me ? 'msg-me' : 'msg-them'}" ${events}>
                ${content}
            </div>
        </div>
        <div id="seen-${m.id}" class="seen-placeholder" style="width:100%; display:none;"></div>
        `;
    });
    container.innerHTML = html;
}

// --- HELPER: Update Seen Status Dynamically ---
function updateSeenStatus(messages, otherUserReadTime, container) {
    // 1. Clear all existing "Seen" labels
    container.querySelectorAll('.seen-label').forEach(el => el.remove());

    // 2. Find the LAST message sent by ME
    const myMessages = messages.filter(m => m.senderId === currentUser.uid);
    if (myMessages.length === 0) return;

    const lastMyMsg = myMessages[myMessages.length - 1];

    // 3. Compare Timestamps
    // Ensure both are valid Firestore timestamps or Dates
    const msgTime = lastMyMsg.timestamp ? lastMyMsg.timestamp.toDate() : new Date();
    const readTime = otherUserReadTime ? otherUserReadTime.toDate() : new Date(0); // Default to old if null

    if (readTime >= msgTime) {
        // 4. Inject "Seen" Label
        const msgRow = document.getElementById(`msg-${lastMyMsg.id}`);
        if (msgRow) {
            // Check if label already exists to prevent dupes
            if (!msgRow.nextElementSibling || !msgRow.nextElementSibling.classList.contains('seen-label')) {
                const label = document.createElement('div');
                label.className = 'seen-label';
                label.innerText = 'Seen';
                msgRow.after(label); // Insert after the message row
            }
        }
    }
}
// --- ENABLE ENTER TO SEND (Shift+Enter for New Line) ---
function setupEnterKeySubmits() {

    // Helper to handle the logic
    const addEnterListener = (elementId, actionFunction) => {
        const el = document.getElementById(elementId);
        if (el) {
            el.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault(); // Stop default (New Line)
                    actionFunction(e);  // Trigger Send
                }
            });
        }
    };

    // 1. CHAT MESSAGES
    addEnterListener('messageText', handleSendMessage);

    // 2. COMMENTS
    addEnterListener('commentText', handleNewComment);

    // 3. CREATE POST BODY
    // For the post, we trigger the button click to run validation
    const postBody = document.getElementById('communityPostBody');
    if (postBody) {
        postBody.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                document.getElementById('submitPostBtn').click();
            }
        });
    }
}

// --- 1. PRESENCE & TIME UTILS ---

function startPresenceHeartbeat() {
    if (!currentUser) return;
    // Update immediately, then every 2 minutes
    const update = () => db.collection('users').doc(currentUser.uid).update({
        lastSeen: firebase.firestore.FieldValue.serverTimestamp()
    });
    update();
    setInterval(update, 120000);
}

function formatLastActive(timestamp) {
    if (!timestamp) return 'Offline';
    const date = timestamp.toDate();
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);

    if (diffMins < 5) return 'Active now';
    if (diffMins < 60) return `Active ${diffMins}m ago`;
    if (diffHours < 24) return `Active ${diffHours}h ago`;
    return `Last seen ${date.toLocaleDateString()}`;
}


/* =========================================
           FIXED COMMENT HANDLER (Saves Profile Data)
           ========================================= */
window.handleNewComment = function (e, parentId = null) {
    e.preventDefault();

    // Determine logic based on if it's a Reply or a Root comment
    let text, inputId;
    if (parentId) {
        // It's a reply
        inputId = `reply-input-${parentId}`;
        text = document.getElementById(inputId).value.trim();
    } else {
        // It's a main comment
        inputId = 'commentText';
        text = document.getElementById(inputId).value.trim();
    }

    if (!text) return;
    if (containsSensitiveContent(text)) {
        logModerationAttempt(text, 'comment'); // Log it
        showToast("⚠️ Comment blocked: Profanity detected.");
        return; // STOP execution
    }

    // Anon Check
    if (window.currentUserData && window.currentUserData.isAnonymousSession) {
        if (typeof showToast === "function") showToast("Restricted: Cannot comment as Anonymous.");
        else alert("Restricted: Cannot comment as Anonymous.");
        return;
    }

    const postId = document.getElementById('currentPostId').value;
    const uData = window.currentUserData;

    // Save to MySQL
    const authorId = localStorage.getItem('vsync_uid') || (window.currentUser && window.currentUser.uid) || "1";

    fetch('http://127.0.0.1:3000/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: postId, author_id: authorId, content: text })
    }).then(res => res.json()).then(data => {
        if (data.success) {
            document.getElementById(inputId).value = "";
            if (window.viewPost) window.viewPost(postId);
        } else {
            if (typeof showToast === "function") showToast("Failed to post comment");
        }
    }).catch(err => console.error(err));
};
/* --- SCORE HELPER --- */
function updateUserScore(userId, pointsToAdd) {
    if (!userId) return;
    const userRef = db.collection('users').doc(userId);
    userRef.update({
        score: firebase.firestore.FieldValue.increment(pointsToAdd)
    }).catch(err => console.log("Error updating score:", err));
}
function loadLeaderboard() {
    console.log("--- DEBUG LEADERBOARD ---");
    const container = document.getElementById('leaderboard');

    // 1. Ensure the list container exists (Auto-fix HTML)
    let listEl = document.getElementById('leaderboardList');
    if (!listEl) {
        console.log("Rebuilding Leaderboard HTML structure...");
        container.innerHTML = `
            <div class="card" style="margin-bottom: 20px; text-align:center; padding:20px; background: linear-gradient(135deg, #1C1C1E, #2C2C2E);">
                <h2 style="font-size:20px; color:var(--text-main); margin-bottom:5px;">🏆 Top Mentors</h2>
                <p style="font-size:12px; color:var(--text-secondary);">
                    <span style="color:var(--primary-color); font-weight:bold;">+1</span> per Upvote
                </p>
            </div>
            <div id="leaderboardList" class="grid" style="display: flex; flex-direction: column; gap: 10px;"></div>
        `;
        listEl = document.getElementById('leaderboardList');
    }

    listEl.innerHTML = '<p style="text-align:center; color:var(--text-secondary);">Calculating scores...</p>';

    // 2. ADMIN BUTTON INJECTION (Dynamic)
    // First, remove any old buttons to prevent duplicates
    const oldControls = document.getElementById('leaderboardAdminControls');
    if (oldControls) oldControls.remove();

    // Debugging: See exactly who the system thinks you are
    if (currentUser) {
        console.log("My ID:", currentUser.uid);
        console.log("Admin List:", ADMIN_UIDS);
        const isAdmin = ADMIN_UIDS.includes(currentUser.uid);
        console.log("Am I Admin?", isAdmin);

        if (isAdmin) {
            console.log(" injecting Admin Button...");
            const adminDiv = document.createElement('div');
            adminDiv.id = "leaderboardAdminControls";
            adminDiv.style.cssText = "margin-top: 30px; border-top: 1px solid #333; padding-top: 20px; text-align: center;";
            adminDiv.innerHTML = `
                <p style="color: #ff453a; font-size: 10px; margin-bottom: 10px; font-weight: bold;">ADMIN ZONE</p>
                <button class="btn btn-danger" onclick="adminResetScores()" 
                    style="width: 100%; border: 1px dashed #ff453a; background: rgba(255, 69, 58, 0.1); color: #ff453a;">
                    ♻️ Reset All Scores to 0
                </button>
            `;
            // Append to the bottom of the leaderboard tab
            container.appendChild(adminDiv);
        }
    } else {
        console.log("User not logged in yet.");
    }

    // 3. FETCH DATA FROM SQL
    fetch('http://127.0.0.1:3000/api/leaderboard')
        .then(res => res.json())
        .then(data => {
            const sqlUsers = data.leaderboard;
            if (!sqlUsers || sqlUsers.length === 0) {
                listEl.innerHTML = '<p style="text-align:center;">No mentors found yet.</p>';
                return;
            }

            let html = '';
            let rank = 1;

            sqlUsers.forEach(row => {
                // Map SQL row to frontend's expected user object
                const u = {
                    name: row.first_name,
                    score: row.total_score,
                    profilePic: "",
                    skills: ["SQL Data"],
                    college: "Migrated",
                    year: "4",
                    isVerified: true
                };
                const score = u.score || 0;

                let rankClass = 'rank-other';
                if (rank === 1) rankClass = 'rank-1';
                if (rank === 2) rankClass = 'rank-2';
                if (rank === 3) rankClass = 'rank-3';

                const pic = u.profilePic
                    ? `<img src="${u.profilePic}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`
                    : u.name.charAt(0).toUpperCase();

                const skillTxt = (u.skills && u.skills.length > 0)
                    ? u.skills.slice(0, 2).join(' • ')
                    : (u.college || 'No info');

                html += `
              <div class="card" style="padding:15px; display:flex; align-items:center; margin-bottom:0;">
                  <div class="rank-badge ${rankClass}">${rank}</div>
                  <div style="flex:1; display:flex; gap:12px; align-items:center;">
                      <div style="width:50px; height:50px; border-radius:50%; background:#222; display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:20px; border:1px solid #444; overflow:hidden;">
                          ${pic}
                      </div>
                      <div style="min-width:0;">
                          <div style="font-weight:700; font-size:16px; color:white; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                              ${u.name} 
                              ${u.isVerified ? '<span style="color:#30D158;">✔</span>' : ''}
                          </div>
                          <div style="font-size:12px; color:#aaa;">${u.year || ''} • ${skillTxt}</div>
                      </div>
                  </div>
                  <div class="score-display">
                      <span class="score-val">${score}</span>
                      <span class="score-label">Points</span>
                  </div>
              </div>`;
                rank++;
            });

            listEl.innerHTML = html;
        })
        .catch(err => {
            console.error(err);
            listEl.innerHTML = '<p style="color:red; text-align:center;">Error loading leaderboard.</p>';
        });
}
/* =========================================
   GLOBAL SWIPE-TO-CLOSE PHYSICS
   ========================================= */

/* =========================================
   GLOBAL SWIPE-TO-CLOSE (Strict Physics Fix)
   ========================================= */

/* =========================================
   GLOBAL SWIPE-TO-CLOSE (Seamless Drop Fix)
   ========================================= */

function enableSwipeToClose(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    const content = modal.querySelector('.modal-content');
    if (!content) return;

    // (Handlebar injection removed per previous request)

    let startY = 0;
    let currentY = 0;
    let isDragging = false;
    let startTime = 0;

    const onTouchStart = (e) => {
        // Only allow swipe if at top
        if (content.scrollTop > 0) return;

        startY = e.touches[0].clientY;
        startTime = Date.now();
        isDragging = false;

        // Kill any ongoing transitions instantly
        content.style.transition = 'none';
    };

    const onTouchMove = (e) => {
        const touchY = e.touches[0].clientY;
        const deltaY = touchY - startY;

        if (!isDragging) {
            if (deltaY < 0) return; // Scrolling up
            if (deltaY > 0 && content.scrollTop <= 0) {
                isDragging = true;
                content.classList.add('is-dragging');
            }
        }

        if (isDragging) {
            if (e.cancelable) e.preventDefault();
            e.stopPropagation();

            // Direct 1:1 movement (feels most responsive)
            currentY = deltaY;
            content.style.transform = `translateY(${currentY}px)`;
        }
    };

    const onTouchEnd = (e) => {
        if (!isDragging) {
            content.style.transition = '';
            return;
        }

        isDragging = false;
        content.classList.remove('is-dragging');

        const endTime = Date.now();
        const timeDiff = endTime - startTime;
        const velocity = currentY / timeDiff;

        // --- CLOSING LOGIC ---
        // Threshold: Dragged > 120px OR Fast Flick
        if (currentY > 120 || (velocity > 0.5 && currentY > 40)) {

            // 1. ANIMATE CONTENT DROP (Physics)
            content.style.transition = 'transform 0.2s ease-out';
            content.style.transform = 'translateY(100vh)';

            // 2. ANIMATE BACKDROP FADE (The Fix)
            // We fade the parent modal container simultaneously
            modal.style.transition = 'opacity 0.2s ease-out';
            modal.style.opacity = '0';

            // 3. WAIT & RESET
            setTimeout(() => {
                modal.classList.remove('active');

                // Reset ALL styles for next open
                content.style.transform = '';
                content.style.transition = '';

                modal.style.transition = ''; // Remove inline transition
                modal.style.opacity = '';    // Remove inline opacity

                unlockScroll();

            }, 200); // Matches the 0.2s duration

        } else {
            // --- SNAP BACK (Cancel Close) ---
            content.style.transition = 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)';
            content.style.transform = '';
        }

        currentY = 0;
    };

    // Attach Listeners
    content.addEventListener('touchstart', onTouchStart, { passive: true });
    content.addEventListener('touchmove', onTouchMove, { passive: false });
    content.addEventListener('touchend', onTouchEnd, { passive: true });
}

/* --- INITIALIZE ALL MODALS --- */
function initAllSwipeGestures() {
    const allModalIds = [
        'createPostModal',
        'sortFilterModal',
        'eventFilterModal',
        'exploreFilterModal',
        'postDetailModal',
        'storyUploadModal',
        'storyViewerModal',
        'savedPostsModal',
        'connectionsModal',
        'viewProfileModal',
        'addEventModal'
    ];

    allModalIds.forEach(id => enableSwipeToClose(id));
}

// Start the engine
initAllSwipeGestures();

window.openCreatePostModal = function () {
    lockScroll();
    const modal = document.getElementById('createPostModal');
    if (!modal) return;

    // --- ADD CLOSE BUTTON TO HEADER ---
    const header = modal.querySelector('.modal-header');
    if (header && !header.querySelector('.close-modal-btn')) {
        header.style.display = "flex";
        header.style.justifyContent = "space-between";
        header.style.alignItems = "center";
        header.innerHTML = `
                    <span>Create Post</span>
                    <span class="close-modal-btn" onclick="closeModal('createPostModal')" style="font-size:24px; cursor:pointer; padding:0 10px;">&times;</span>
                `;
    }
    // ----------------------------------

    modal.classList.add('active');

    // ... (Rest of your existing reset logic: clearing title, body, file, etc.) ...
    const titleEl = document.getElementById('communityPostTitle');
    if (titleEl) titleEl.value = "";
    const bodyEl = document.getElementById('communityPostBody');
    if (bodyEl) bodyEl.value = "";
    const fileEl = document.getElementById('postFileInput');
    if (fileEl) fileEl.value = "";
    const fileNameEl = document.getElementById('postFileName');
    if (fileNameEl) fileNameEl.innerText = "No file";
    const removeBtn = document.getElementById('removePostImgBtn');
    if (removeBtn) removeBtn.style.display = "none";
    const submitBtn = document.getElementById('submitPostBtn');
    if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerText = "Post";
    }
};

// --- 3. FIX TAG MENU (Global Scope) ---
window.openTagMenu = function () {
    console.log("Opening Tag Menu...");
    const modal = document.getElementById('tagSelectionModal');
    if (modal) {
        modal.classList.add('active');
        const searchInput = document.getElementById('tagSearchInput');
        if (searchInput) searchInput.value = "";

        // Ensure the render function exists before calling
        if (window.renderTagMenu) window.renderTagMenu();
    } else {
        console.error("Tag Modal missing");
    }
};

// --- 4. RE-INIT ENTER KEY LISTENERS (Safe Version) ---
// --- ENABLE ENTER TO SEND (Shift+Enter for New Line) ---
function setupEnterKeySubmits() {

    // 1. CHAT MESSAGES
    const chatInput = document.getElementById('messageText');
    if (chatInput) {
        const newChatInput = chatInput.cloneNode(true);
        chatInput.parentNode.replaceChild(newChatInput, chatInput);

        newChatInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                window.handleSendMessage(e);
            }
        });
    }

    // 2. COMMENTS (The fix you requested)
    const commentInput = document.getElementById('commentText');
    if (commentInput) {
        // Clone to remove old listeners
        const newCommentInput = commentInput.cloneNode(true);
        commentInput.parentNode.replaceChild(newCommentInput, commentInput);

        newCommentInput.addEventListener('keydown', function (e) {
            // IF Enter is pressed AND Shift is NOT held down
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault(); // Stop New Line
                window.handleNewComment(e); // Trigger Submit
            }
            // Else: It does the default (adds a new line)
        });
    }

    // 3. CREATE POST BODY (Trigger Button Click)
    const postBody = document.getElementById('communityPostBody');
    if (postBody) {
        const newPostBody = postBody.cloneNode(true);
        postBody.parentNode.replaceChild(newPostBody, postBody);

        newPostBody.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                document.getElementById('submitPostBtn').click();
            }
        });
    }
}

// Run setup immediately
setupEnterKeySubmits();
/* =========================================
ROBUST TAG SYSTEM (Global Scope Fix)
========================================= */

// 1. Initialize Global Variables
window.selectedTags = window.selectedTags || [];



// 3. Global Open/Close Functions
window.openTagMenu = function () {
    console.log("Opening Tag Menu...");
    const modal = document.getElementById('tagSelectionModal');
    if (modal) {
        modal.classList.add('active');
        // Clear search
        const searchInput = document.getElementById('tagSearchInput');
        if (searchInput) searchInput.value = "";

        // Render
        window.renderTagMenu();
    } else {
        alert("Error: ID 'tagSelectionModal' not found in HTML.");
    }
};

window.closeTagMenu = function () {
    document.getElementById('tagSelectionModal').classList.remove('active');
    window.renderTagsOnMainForm();
};

window.filterTags = function () {
    window.renderTagMenu();
};

// 4. Main Render Function (With Error Catching)
window.renderTagMenu = function () {
    const list = document.getElementById('tagListArea');
    const searchInput = document.getElementById('tagSearchInput');

    if (!list) return;

    const search = searchInput ? searchInput.value.toLowerCase().trim() : "";
    let html = '';

    TAG_DATA.forEach(tag => {
        if (search && !tag.name.toLowerCase().includes(search)) return;

        const isSelected = window.selectedTags.some(t => t.text === tag.name);
        const activeClass = isSelected ? 'selected' : '';
        const checkIcon = isSelected ? '<span style="color:#30D158; font-weight:bold; font-size:16px;">✔</span>' : '';
        const hasSub = tag.hasSub ? 'true' : 'false';

        // Render Main Tag Row
        html += `
            <div>
                <div class="tag-menu-item ${activeClass}" 
                     onclick="window.toggleMainTag('${tag.name}', '${tag.class}', '${tag.hex}', ${hasSub})">
                    <div style="display:flex; align-items:center;">
                        <div class="tag-dot" style="background:${tag.hex};"></div>
                        <span style="font-weight:600; font-size:15px; color:white;">${tag.name}</span>
                    </div>
                    ${checkIcon}
                </div>`;

        // --- CHANGED LOGIC HERE ---
        // Check if ANY sub-tag is currently selected
        const isChildSelected = tag.hasSub && window.selectedTags.some(t => COUNCIL_SUBS.includes(t.text));

        // Show sub-menu if Parent is selected OR a Child is selected
        if (tag.hasSub && (isSelected || isChildSelected)) {
            html += `<div class="sub-tag-container">`;
            COUNCIL_SUBS.forEach(sub => {
                const isSubSelected = window.selectedTags.some(t => t.text === sub);
                const subActive = isSubSelected ? 'selected' : '';
                const subIcon = isSubSelected ? '●' : '○';

                html += `
                    <div class="sub-tag-item ${subActive}" onclick="window.toggleSubTag('${sub}')">
                        <span style="margin-right:10px; font-size:12px;">${subIcon}</span> ${sub}
                    </div>`;
            });
            html += `</div>`;
        }

        html += `</div>`;
    });

    if (html === '') html = `<div style="text-align:center; padding:20px; color:#888;">No tags found.</div>`;
    list.innerHTML = html;
};
function forceDownload(e, url, fileName) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }

    if (typeof showToast === 'function') showToast("Downloading...");

    // Try fetching the blob (Works if CORS is fixed)
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'blob';

    xhr.onload = function () {
        if (xhr.status === 200) {
            const blob = xhr.response;
            const blobUrl = window.URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(blobUrl);
        } else {
            // Fallback if CORS blocks it
            window.open(url, '_blank');
        }
    };

    xhr.onerror = function () {
        // Network error / CORS blocked -> Fallback to opening tab
        console.warn("CORS blocked internal download. Opening in new tab.");
        window.open(url, '_blank');
    };

    xhr.send();
}

// 5. Toggle Logic (Global)
/* --- TAG ALERTS FIX --- */

window.toggleMainTag = function (name, className, hex, hasSub) {
    if (!window.selectedTags) window.selectedTags = [];
    const index = window.selectedTags.findIndex(t => t.text === name);

    if (index > -1) {
        window.selectedTags.splice(index, 1);
        if (hasSub) window.selectedTags = window.selectedTags.filter(t => !COUNCIL_SUBS.includes(t.text));
    } else {
        if (window.selectedTags.length >= 2) return showToast("⚠️ Max 2 tags allowed"); // <--- FIX
        window.selectedTags.push({ text: name, colorClass: className, hex: hex });
    }
    window.renderTagMenu();
};

window.toggleSubTag = function (subName) {
    const index = window.selectedTags.findIndex(t => t.text === subName);
    if (index > -1) {
        window.selectedTags.splice(index, 1);
    } else {
        const councilIndex = window.selectedTags.findIndex(t => t.text === "Council / Committee");
        const currentCount = window.selectedTags.length;

        if (currentCount >= 2 && councilIndex === -1) {
            return showToast("⚠️ Max 2 tags allowed"); // <--- FIX
        }
        if (councilIndex > -1) window.selectedTags.splice(councilIndex, 1);
        window.selectedTags.push({ text: subName, colorClass: 'tag-sub-council', hex: '#24A0ED' });
    }
    window.renderTagMenu();
    window.renderTagsOnMainForm();
};

// 6. Main Form Pill Renderer
window.renderTagsOnMainForm = function () {
    const container = document.getElementById('selectedTagsContainer');
    if (!container) return;

    if (!window.selectedTags || window.selectedTags.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = window.selectedTags.map((tag, i) => `
        <div style="background:${tag.hex || '#555'}; display: inline-flex; align-items: center; padding: 4px 10px; border-radius: 12px; margin-right: 5px; font-size: 12px; font-weight: 600; color: white;">
            ${tag.text}
            <span style="margin-left: 8px; cursor: pointer; opacity: 0.7;" onclick="window.removeTag(${i})">✕</span>
        </div>
    `).join('');
};

window.removeTag = function (index) {
    window.selectedTags.splice(index, 1);
    window.renderTagsOnMainForm();
};
// --- TIME AGO HELPER (Instagram Style) ---
function timeAgo(dateInput) {
    if (!dateInput) return 'Just now';

    // Handle Firestore Timestamp or standard Date object
    const date = dateInput.toDate ? dateInput.toDate() : new Date(dateInput);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    let interval = Math.floor(seconds / 31536000);
    if (interval >= 1) return interval + "y ago";

    interval = Math.floor(seconds / 2592000);
    if (interval >= 1) return interval + "mo ago";

    interval = Math.floor(seconds / 86400);
    if (interval >= 1) return interval + "d ago";

    interval = Math.floor(seconds / 3600);
    if (interval >= 1) return interval + "h ago";

    interval = Math.floor(seconds / 60);
    if (interval >= 1) return interval + "m ago";

    return "Just now";
}
function validateRoleOptions() {
    const yearSelect = document.getElementById('regYear');
    const roleSelect = document.getElementById('regRole');

    if (!yearSelect || !roleSelect) return;

    const selectedYear = yearSelect.value;
    const mentorOption = roleSelect.querySelector('option[value="mentor"]');

    // Logic: If FE is selected, Disable Mentor
    if (selectedYear === 'FE') {
        mentorOption.disabled = true;
        mentorOption.innerText = "Mentor (Available for SE+)"; // Helpful text

        // If they had already selected Mentor, force them back to Student
        if (roleSelect.value === 'mentor') {
            roleSelect.value = 'student';
            // Optional: Alert the user
            if (typeof showToast === 'function') showToast("Mentorship is available from Second Year onwards.");
            else alert("First Year students cannot be mentors yet.");
        }
    } else {
        // Re-enable for SE, TE, BE
        mentorOption.disabled = false;
        mentorOption.innerText = "Mentor";
    }
}
function getYearBadgeHtml(yearCode) {
    if (!yearCode) return '';

    let color = '#888'; // Default Grey
    let label = yearCode;

    switch (yearCode) {
        case 'FE': color = '#30D158'; label = 'FE'; break; // Green
        case 'SE': color = '#0A84FF'; label = 'SE'; break; // Blue
        case 'TE': color = '#BF5AF2'; label = 'TE'; break; // Purple
        case 'BE': color = '#FF9F0A'; label = 'BE'; break; // Orange
    }

    return `<span style="
        background-color: ${color}20; 
        color: ${color}; 
        border: 1px solid ${color}40;
        padding: 2px 6px; 
        border-radius: 4px; 
        font-size: 10px; 
        font-weight: 800; 
        margin-left: 6px;
        vertical-align: middle;
    ">${label}</span>`;
}

// --- CLOSE MODALS ON OUTSIDE CLICK (Animated) ---
window.addEventListener('mousedown', function (e) {
    // Check if the click target is the backdrop itself (has class 'modal')
    if (e.target.classList.contains('modal')) {
        // Use the ID of the modal to trigger the smooth close function
        closeModal(e.target.id);
    }
});
/* --- V-SYNC SPLASH LOGIC --- */
window.addEventListener('load', () => {
    // 2.2 seconds provides enough time for the intro animation to "breath"
    setTimeout(() => {
        const splash = document.getElementById('splashScreen');
        if (splash) {
            splash.classList.add('fade-out');

            // Remove from DOM after fade finishes
            setTimeout(() => {
                splash.remove();
            }, 600);
        }
    }, 2200);
});
function toggleGoatStatus(postId, commentId, authorRole) {
    // 1. STRICT SECURITY CHECK: Only Mentors
    if (!authorRole || authorRole.toLowerCase() !== 'mentor') {
        showToast("🚫 Only Mentors can be GOATed!");
        return;
    }

    const card = document.getElementById(`card-${commentId}`);
    if (!card) return;

    const btn = card.querySelector('button[onclick*="toggleGoatStatus"]');

    // 2. Optimistic Update (Visuals)
    const isCurrentlyGoated = card.classList.contains('is-goated');

    // Reset ALL cards first (Single Winner logic)
    document.querySelectorAll('.comment-card.is-goated').forEach(c => {
        c.classList.remove('is-goated');
        const otherBtn = c.querySelector('button[onclick*="toggleGoatStatus"]');
        if (otherBtn) otherBtn.innerHTML = '🏆 Mark GOAT';
    });

    if (!isCurrentlyGoated) {
        // TURN ON
        card.classList.add('is-goated');
        if (btn) btn.innerHTML = 'Un-Goat';
        if (navigator.vibrate) navigator.vibrate(50);
    } else {
        // TURN OFF (Un-Goat)
        card.classList.remove('is-goated');
        if (btn) btn.innerHTML = '🏆 Mark GOAT';
    }

    // 3. Database Update with Score Logic
    const postRef = db.collection('posts').doc(postId);

    db.runTransaction(async (transaction) => {
        const postDoc = await transaction.get(postRef);
        if (!postDoc.exists) return;

        const currentGoatId = postDoc.data().goatedCommentId;

        if (currentGoatId === commentId) {
            // UN-GOAT: Remove status
            transaction.update(postRef, { goatedCommentId: firebase.firestore.FieldValue.delete() });
            return { action: 'remove', targetId: commentId };
        } else {
            // GOAT: Set status (and return old ID if we are switching)
            transaction.update(postRef, { goatedCommentId: commentId });
            return { action: 'add', targetId: commentId, oldId: currentGoatId };
        }
    }).then((res) => {
        if (!res) return;

        // --- HELPER TO ADJUST SCORE ---
        const adjustScore = (cId, points) => {
            db.collection('posts').doc(postId).collection('comments').doc(cId).get()
                .then(doc => {
                    if (doc.exists) updateUserScore(doc.data().authorId, points);
                });
        };

        if (res.action === 'add') {
            showToast("🏆 Answer marked as GOATED!");
            // 1. Give points to the NEW Goat
            adjustScore(res.targetId, 5);

            // 2. Remove points from the OLD Goat (if we switched winners)
            if (res.oldId) {
                adjustScore(res.oldId, -5);
            }
        } else if (res.action === 'remove') {
            showToast("Tag removed. Points deducted.");
            // 3. Remove points from the Un-Goated user
            adjustScore(res.targetId, -5);
        }

    }).catch(error => {
        console.error("Goat error:", error);
        // Revert UI on failure
        if (isCurrentlyGoated) {
            card.classList.add('is-goated');
            if (btn) btn.innerHTML = 'Un-Goat';
        } else {
            card.classList.remove('is-goated');
            if (btn) btn.innerHTML = '🏆 Mark GOAT';
        }
        showToast("Action failed.");
    });
}
/* =========================================
   PWA NATIVE INSTALL LOGIC
   ========================================= */
let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
    // 1. Prevent the mini-infobar from appearing on mobile
    e.preventDefault();

    // 2. Stash the event so it can be triggered later
    deferredPrompt = e;

    // 3. Show your custom "Install App" button
    const installBtn = document.getElementById('pwaInstallBtn');
    if (installBtn) {
        installBtn.style.display = 'block';

        installBtn.addEventListener('click', async () => {
            // Hide the button immediately
            installBtn.style.display = 'none';

            // Show the native install prompt
            deferredPrompt.prompt();

            // Wait for the user to respond to the prompt
            const { outcome } = await deferredPrompt.userChoice;
            console.log(`User response to the install prompt: ${outcome}`);

            // We've used the prompt, and can't use it again, discard it
            deferredPrompt = null;
        });
    }
});

// Optional: Detect if already installed
window.addEventListener('appinstalled', () => {
    showToast(" V-SYNC Installed!");
    // Hide the button if it's still visible
    const installBtn = document.getElementById('pwaInstallBtn');
    if (installBtn) installBtn.style.display = 'none';
});

window.addEventListener('DOMContentLoaded', () => {
    const topNav = document.getElementById('topNavInitial');
    if (topNav) {
        topNav.addEventListener('click', () => {
            if (typeof window.forceLoadProfile === 'function') window.forceLoadProfile();
        });
    }
    const shareBtn = document.getElementById('shareBtn');
    if (shareBtn && typeof shareProfile === 'function') {
        shareBtn.addEventListener('click', shareProfile);
    }
});