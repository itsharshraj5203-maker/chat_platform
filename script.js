// DOM Elements
const lobbyView = document.getElementById('lobby-view');
const chatView = document.getElementById('chat-view');

// Lobby Elements
const usernameInput = document.getElementById('username');
const roomcodeInput = document.getElementById('roomcode');
const joinBtn = document.getElementById('join-btn');
const createBtn = document.getElementById('create-btn');
const lobbyError = document.getElementById('lobby-error');

// Chat Elements
const displayRoomcode = document.getElementById('display-roomcode');
const displayUsername = document.getElementById('display-username');
const copyBtn = document.getElementById('copy-btn');
const leaveBtn = document.getElementById('leave-btn');
const messagesContainer = document.getElementById('messages-container');
const chatForm = document.getElementById('chat-form');
const messageInput = document.getElementById('message-input');
const toast = document.getElementById('toast');

let currentUser = "";
let currentRoom = "";

// WebRTC State Variables
let isHost = false;
let peer = null;
let hostConn = null;
let clientConns = [];
const CHAT_PREFIX = 'nexus-chat-room-';

// Utility functions
const generateCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
};

const showError = (msg) => {
    lobbyError.textContent = msg;
    setTimeout(() => lobbyError.textContent = '', 4000);
};

// Global Event for Ambient Mouse Glow
document.addEventListener('mousemove', (e) => {
    document.documentElement.style.setProperty('--mouse-x', `${e.clientX}px`);
    document.documentElement.style.setProperty('--mouse-y', `${e.clientY}px`);
});

// UI Transitions
const showChat = () => {
    lobbyView.classList.remove('active');
    lobbyView.classList.add('hidden');

    chatView.classList.remove('hidden');
    chatView.classList.add('active');

    displayRoomcode.textContent = currentRoom;
    displayUsername.textContent = currentUser;
};

const showLobby = () => {
    chatView.classList.remove('active');
    chatView.classList.add('hidden');

    lobbyView.classList.remove('hidden');
    lobbyView.classList.add('active');

    messagesContainer.innerHTML = '';
};

// PeerJS Networking Logic
const connectToRoom = (user, room, hosting) => {
    currentUser = user;
    currentRoom = room;
    isHost = hosting;

    if (peer) { peer.destroy(); }

    if (isHost) {
        // We act as the central Server for this room
        peer = new Peer(CHAT_PREFIX + room);

        peer.on('open', () => {
            showChat();
            appendSystemMessage("Room created. Waiting for team members to join...");
        });

        peer.on('connection', (conn) => {
            clientConns.push(conn);
            conn.on('data', (data) => handleIncomingData(data, conn));
            conn.on('close', () => {
                clientConns = clientConns.filter(c => c !== conn);
            });
        });

        peer.on('error', (err) => {
            showError("Couldn't create room. Error: " + err.type);
            console.error(err);
        });

    } else {
        // We act as a Client connecting to the Host
        peer = new Peer();
        peer.on('open', () => {
            hostConn = peer.connect(CHAT_PREFIX + room);

            hostConn.on('open', () => {
                showChat();
                // Tell everyone we arrived
                hostConn.send({ type: 'system', text: `${currentUser} has joined the room.` });
                appendSystemMessage("Connected to room successfully!");

                hostConn.on('data', (data) => handleIncomingData(data, hostConn));
            });

            hostConn.on('close', () => {
                appendSystemMessage("The Host disconnected. Room closed.");
            });

            hostConn.on('error', () => {
                showError("Lost connection to Host.");
                showLobby();
            });
        });

        peer.on('error', (err) => {
            showError("Couldn't join room. Error: " + err.type);
            console.error(err);
        });
    }
};

const handleIncomingData = (data, sourceConn) => {
    if (data.type === 'chat') {
        appendMessage(data.user, data.text, 'other');
    } else if (data.type === 'system') {
        appendSystemMessage(data.text);
    } else if (data.type === 'typing') {
        showTyping(data.user);
    }

    // If I am Host, relay to other clients (Star Topology)
    if (isHost) {
        clientConns.forEach(c => {
            if (c !== sourceConn) {
                c.send(data);
            }
        });
    }
};

const broadcastMessage = (data) => {
    if (isHost) {
        clientConns.forEach(c => c.send(data));
    } else if (hostConn && hostConn.open) {
        hostConn.send(data);
    }
};

// UI Appending
const appendMessage = (sender, text, type) => {
    const wrapper = document.createElement('div');
    wrapper.classList.add('message-wrapper', type);

    const nameEl = document.createElement('div');
    nameEl.classList.add('sender-name');
    nameEl.textContent = sender;

    const bubbleEl = document.createElement('div');
    bubbleEl.classList.add('message-bubble');
    bubbleEl.textContent = text;

    wrapper.appendChild(nameEl);
    wrapper.appendChild(bubbleEl);

    messagesContainer.appendChild(wrapper);
    scrollToBottom();
};

const appendSystemMessage = (text) => {
    const sysEl = document.createElement('div');
    sysEl.classList.add('sys-message');
    sysEl.textContent = text;
    messagesContainer.appendChild(sysEl);
    scrollToBottom();
};

const scrollToBottom = () => {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
};

// Typing Animation
let typingTimeout;
messageInput.addEventListener('input', () => {
    messageInput.classList.add('is-typing');

    broadcastMessage({ type: 'typing', user: currentUser });

    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        messageInput.classList.remove('is-typing');
    }, 400);
});

let indicatorTimeout;
let indicatorEl = null;

const showTyping = (user) => {
    if (!indicatorEl) {
        indicatorEl = document.createElement('div');
        indicatorEl.className = 'sys-message typing-indicator';
        messagesContainer.appendChild(indicatorEl);
    }
    indicatorEl.innerHTML = `<strong class="accent">${user}</strong> is typing<span class="typing-dots">...</span>`;
    indicatorEl.style.display = 'block';
    scrollToBottom();

    clearTimeout(indicatorTimeout);
    indicatorTimeout = setTimeout(() => {
        indicatorEl.style.display = 'none';
    }, 1500);
};

// Event Listeners
createBtn.addEventListener('click', () => {
    const user = usernameInput.value.trim();
    if (!user) return showError("Please enter a display name");

    const newRoom = generateCode();
    connectToRoom(user, newRoom, true); // true = hosting
});

joinBtn.addEventListener('click', () => {
    const user = usernameInput.value.trim();
    const room = roomcodeInput.value.trim().toUpperCase();

    if (!user) return showError("Please enter a display name");
    if (!room) return showError("Please enter a Room Access Code");

    connectToRoom(user, room, false); // false = client
});

chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = messageInput.value.trim();
    if (!text) return;

    appendMessage(currentUser, text, 'mine');
    broadcastMessage({ type: 'chat', user: currentUser, text: text });

    messageInput.value = '';
    messageInput.classList.remove('is-typing');
});

leaveBtn.addEventListener('click', () => {
    broadcastMessage({ type: 'system', text: `${currentUser} has left the room.` });

    setTimeout(() => {
        if (peer) peer.destroy();
        peer = null;
        hostConn = null;
        clientConns = [];
        showLobby();
    }, 200);
});

copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(currentRoom).then(() => {
        toast.classList.remove('hidden');
        setTimeout(() => toast.classList.add('hidden'), 2000);
    });
});
