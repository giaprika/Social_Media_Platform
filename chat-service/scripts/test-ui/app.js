const state = {
    socket: null,
    connected: false,
    wsPort: 8081,
    apiPort: 8080,
    selectedFile: null
};

// DOM Elements
const elServerIp = document.getElementById('server-ip');
const elUserId = document.getElementById('user-id');
const elBtnConnect = document.getElementById('btn-connect');
const elBtnConnectText = document.getElementById('btn-connect-text');
const elStatusBadge = document.getElementById('status-badge');
const elStatusText = document.getElementById('status-text');
const elMessages = document.getElementById('messages');
const elBtnSend = document.getElementById('btn-send');
const elConvId = document.getElementById('conv-id');
const elReceiverIds = document.getElementById('receiver-ids');
const elMsgContent = document.getElementById('msg-content');
const elBtnClear = document.getElementById('btn-clear');

// New Media Elements
const elImageInput = document.getElementById('image-input');
const elBtnSelectImage = document.getElementById('btn-select-image');
const elImagePreviewContainer = document.getElementById('image-preview-container');
const elImagePreview = document.getElementById('image-preview');
const elBtnRemoveImage = document.getElementById('btn-remove-image');
const elUploadStatus = document.getElementById('upload-status');

// --- Helpers ---

function addLog(msg, type = 'system', sender = '', mediaUrl = '') {
    const item = document.createElement('div');
    item.className = `message-item msg-${type}`;

    let content = '';
    if (sender) {
        content += `<div class="msg-info"><span class="msg-sender">${sender}</span></div>`;
    }

    if (mediaUrl) {
        content += `<img src="${mediaUrl}" alt="Sent image" onclick="window.open('${mediaUrl}', '_blank')">`;
    }

    if (msg) {
        content += `<div>${msg}</div>`;
    }

    content += `<div class="msg-info" style="justify-content: flex-end"><span>${new Date().toLocaleTimeString()}</span></div>`;

    item.innerHTML = content;
    elMessages.appendChild(item);
    elMessages.scrollTop = elMessages.scrollHeight;
}

function updateStatus(status) {
    elStatusBadge.className = `status-badge status-${status}`;
    elStatusText.textContent = status.charAt(0).toUpperCase() + status.slice(1);

    if (status === 'connected') {
        elBtnConnectText.textContent = 'Disconnect';
        elBtnSend.disabled = false;
        state.connected = true;
    } else if (status === 'disconnected') {
        elBtnConnectText.textContent = 'Connect WebSocket';
        elBtnSend.disabled = true;
        state.connected = false;
    } else {
        elBtnConnectText.textContent = 'Connecting...';
        elBtnSend.disabled = true;
    }
}

// --- WebSocket Logic ---

function connect() {
    const host = elServerIp.value.trim() || 'localhost';
    const userId = elUserId.value.trim();

    if (!userId) {
        alert('Please enter a User ID');
        return;
    }

    const wsUrl = `ws://${host}:${state.wsPort}/ws?user_id=${userId}`;

    addLog(`Connecting to ${wsUrl}...`, 'system');
    updateStatus('connecting');

    try {
        state.socket = new WebSocket(wsUrl);

        state.socket.onopen = () => {
            addLog('WebSocket connection established', 'system');
            updateStatus('connected');
        };

        state.socket.onmessage = (event) => {
            console.log('Received:', event.data);
            try {
                const data = JSON.parse(event.data);
                handleWsEvent(data);
            } catch (err) {
                addLog(`Received raw: ${event.data}`, 'received');
            }
        };

        state.socket.onclose = (event) => {
            addLog(`WebSocket connection closed (code: ${event.code}, reason: ${event.reason || 'none'})`, 'system');
            updateStatus('disconnected');
            state.socket = null;
        };

        state.socket.onerror = (err) => {
            addLog(`WebSocket error: Check console or verify server is running on ${host}:${state.wsPort}`, 'system');
            console.error('WS Error:', err);
        };

    } catch (err) {
        addLog(`Failed to create WebSocket: ${err.message}`, 'system');
        updateStatus('disconnected');
    }
}

function disconnect() {
    if (state.socket) {
        state.socket.close();
    }
}

function handleWsEvent(data) {
    if (data.type === 'welcome') {
        addLog(`Welcome! Server time: ${new Date(data.server_time).toLocaleString()}. Instance: ${data.instance_id}`, 'system');
        return;
    }

    if (data.type === 'reconnected') {
        addLog(`Reconnected! Gap: ${data.gap_duration_ms}ms. Server time: ${new Date(data.server_time).toLocaleString()}`, 'system');
        return;
    }

    if (data.aggregate_type === 'message') {
        const payload = data.payload;
        const sender = payload.sender_id === elUserId.value ? 'Me' : payload.sender_id;
        addLog(payload.content, 'received', sender, payload.media_url);
        return;
    }

    addLog(`Unknown event type: ${JSON.stringify(data)}`, 'received');
}

// --- Cloudinary logic ---

async function getCloudinaryCredentials() {
    const host = elServerIp.value.trim() || 'localhost';
    const userId = elUserId.value.trim();
    const apiUrl = `http://${host}:${state.apiPort}/v1/upload-credentials`;

    const response = await fetch(apiUrl, {
        headers: { 'x-user-id': userId }
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || 'Failed to get upload credentials');
    }

    return await response.json();
}

async function uploadToCloudinary(file, creds) {
    const formData = new FormData();
    // Support both snake_case and camelCase from server
    const cloudName = creds.cloud_name || creds.cloudName;
    const apiKey = creds.api_key || creds.apiKey;
    const timestamp = creds.timestamp;
    const signature = creds.signature;
    const folder = creds.folder;

    if (!cloudName) {
        console.error('Credentials received:', creds);
        throw new Error('Cloud Name is missing in credentials from server');
    }

    formData.append('file', file);
    formData.append('api_key', apiKey);
    formData.append('timestamp', timestamp);
    formData.append('signature', signature);
    formData.append('folder', folder);

    const url = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;
    console.log('Uploading to Cloudinary URL:', url);

    const response = await fetch(url, {
        method: 'POST',
        body: formData
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || 'Cloudinary upload failed');
    }

    const data = await response.json();
    return data.secure_url;
}

// --- API Logic ---

async function sendMessage() {
    const host = elServerIp.value.trim() || 'localhost';
    const userId = elUserId.value.trim();
    const convId = elConvId.value.trim();
    const receivers = elReceiverIds.value.split(',').map(s => s.trim()).filter(s => s);
    const content = elMsgContent.value.trim();

    if (!content && !state.selectedFile) return;

    elBtnSend.disabled = true;
    let mediaUrl = '';
    let messageType = 'MESSAGE_TYPE_TEXT';

    try {
        // Step 1: Handle File Upload if exists
        if (state.selectedFile) {
            elUploadStatus.style.display = 'block';
            elUploadStatus.textContent = 'Getting credentials...';

            const creds = await getCloudinaryCredentials();

            elUploadStatus.textContent = 'Uploading to Cloudinary...';
            mediaUrl = await uploadToCloudinary(state.selectedFile, creds);
            messageType = 'MESSAGE_TYPE_IMAGE';

            elUploadStatus.textContent = 'Upload complete!';
            setTimeout(() => elUploadStatus.style.display = 'none', 2000);
        }

        // Step 2: Send Message to API
        const apiUrl = `http://${host}:${state.apiPort}/v1/messages`;
        const body = {
            conversation_id: convId,
            content: content,
            receiver_ids: receivers,
            idempotency_key: crypto.randomUUID(),
            type: messageType,
            media_url: mediaUrl
        };

        addLog(`Sending ${messageType} via API...`, 'system');

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-user-id': userId
            },
            body: JSON.stringify(body)
        });

        const result = await response.json();

        if (response.ok) {
            addLog(content, 'sent', 'Me', mediaUrl);
            clearMessage();
            console.log('API Success:', result);
        } else {
            const errorMsg = result.error?.message || response.statusText;
            addLog(`API Error: ${errorMsg}`, 'system');
        }
    } catch (err) {
        addLog(`Error: ${err.message}`, 'system');
        console.error(err);
    } finally {
        elBtnSend.disabled = false;
        elUploadStatus.style.display = 'none';
    }
}

function clearMessage() {
    elMsgContent.value = '';
    state.selectedFile = null;
    elImageInput.value = '';
    elImagePreviewContainer.style.display = 'none';
    elImagePreview.src = '';
}

// --- Event Listeners ---

elBtnConnect.addEventListener('click', () => {
    if (state.connected) {
        disconnect();
    } else {
        connect();
    }
});

elBtnSend.addEventListener('click', sendMessage);

elMsgContent.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

elBtnClear.addEventListener('click', () => {
    elMessages.innerHTML = '<div class="message-item msg-system">Log cleared. Ready to connect...</div>';
});

// Media Listeners
elBtnSelectImage.addEventListener('click', () => elImageInput.click());

elImageInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        state.selectedFile = file;
        const reader = new FileReader();
        reader.onload = (event) => {
            elImagePreview.src = event.target.result;
            elImagePreviewContainer.style.display = 'block';
        };
        reader.readAsDataURL(file);
    }
});

elBtnRemoveImage.addEventListener('click', () => {
    state.selectedFile = null;
    elImageInput.value = '';
    elImagePreviewContainer.style.display = 'none';
    elImagePreview.src = '';
});
