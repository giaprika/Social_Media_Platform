/**
 * WebRTC Client for SRS Server
 * Supports WHIP (publish) and WHEP (play) protocols
 */

class SRSWebRTCClient {
    constructor() {
        this.publishPC = null;
        this.playPC = null;
        this.localStream = null;
    }

    /**
     * Get server configuration from form
     */
    getConfig() {
        return {
            serverIP: document.getElementById('serverIP').value.trim(),
            streamId: document.getElementById('streamId')?.value.trim() || '',
            streamKey: document.getElementById('streamKey').value.trim()
        };
    }

    /**
     * Cached ICE servers from API (includes time-limited TURN credentials)
     */
    cachedIceServers = null;

    /**
     * Fetch ICE servers from API (includes TURN with time-limited credentials)
     * Falls back to Google STUN if API fails
     */
    async fetchIceServers(streamId) {
        const config = this.getConfig();
        
        // Default STUN servers (fallback)
        const defaultServers = [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ];

        if (!streamId) {
            return defaultServers;
        }

        try {
            // Fetch WebRTC info from API (includes ICE servers with TURN credentials)
            const apiUrl = `/api/v1/live/${streamId}/webrtc`;
            const response = await fetch(apiUrl);
            
            if (!response.ok) {
                log('warn', `Failed to fetch ICE servers: ${response.status}`);
                return defaultServers;
            }

            const data = await response.json();
            
            if (data.ice_servers && data.ice_servers.length > 0) {
                this.cachedIceServers = data.ice_servers;
                const hasTurn = data.ice_servers.some(s => 
                    s.urls && s.urls.some(u => u.startsWith('turn'))
                );
                if (hasTurn) {
                    log('info', '✅ TURN server configured (time-limited credentials)');
                }
                return data.ice_servers;
            }
        } catch (e) {
            log('warn', `ICE servers fetch error: ${e.message}`);
        }

        return defaultServers;
    }

    /**
     * Get ICE servers (use cached or default)
     */
    getIceServers() {
        if (this.cachedIceServers) {
            return this.cachedIceServers;
        }
        // Default STUN servers
        return [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ];
    }

    /**
     * Validate configuration for publishing (needs stream ID + token)
     */
    validatePublishConfig() {
        const config = this.getConfig();
        if (!config.serverIP) {
            throw new Error('Server IP is required');
        }
        if (!config.streamId) {
            throw new Error('Stream ID is required');
        }
        if (!config.streamKey) {
            throw new Error('Stream Key (token) is required');
        }
        return config;
    }

    /**
     * Validate configuration for playing (only needs stream ID)
     */
    validatePlayConfig() {
        const config = this.getConfig();
        if (!config.serverIP) {
            throw new Error('Server IP is required');
        }
        if (!config.streamId) {
            throw new Error('Stream ID is required');
        }
        return config;
    }

    /**
     * Start publishing stream via WHIP
     * Uses token authentication: stream={id}&token={stream_key}
     */
    async startPublish() {
        const config = this.validatePublishConfig();
        log('info', `Starting publish to ${config.serverIP}...`);
        updateStatus('publish', 'connecting', 'Fetching ICE servers...');

        try {
            // Fetch ICE servers from API (includes TURN with time-limited credentials)
            const iceServers = await this.fetchIceServers(config.streamId);

            updateStatus('publish', 'connecting', 'Requesting camera access...');

            // Get user media
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    frameRate: { ideal: 30 }
                },
                audio: true
            });

            // Show local preview
            const localVideo = document.getElementById('localVideo');
            localVideo.srcObject = this.localStream;
            log('info', 'Camera/Mic access granted');

            // Create peer connection with STUN/TURN servers
            this.publishPC = new RTCPeerConnection({ iceServers });

            // Add tracks
            this.localStream.getTracks().forEach(track => {
                this.publishPC.addTrack(track, this.localStream);
                log('info', `Added ${track.kind} track`);
            });

            // ICE connection state
            this.publishPC.oniceconnectionstatechange = () => {
                const state = this.publishPC.iceConnectionState;
                log('info', `ICE state: ${state}`);
                if (state === 'connected') {
                    updateStatus('publish', 'connected', '🟢 Live! Streaming...');
                } else if (state === 'failed' || state === 'disconnected') {
                    updateStatus('publish', 'error', `Connection ${state}`);
                }
            };

            // Create offer
            const offer = await this.publishPC.createOffer();
            await this.publishPC.setLocalDescription(offer);
            log('info', 'Created SDP offer');

            // Wait for ICE gathering
            await this.waitForICEGathering(this.publishPC);

            // Send offer via WHIP with token authentication
            // Format: stream={id}&token={stream_key}
            // Use relative URL to go through Caddy proxy (handles HTTPS)
            const whipUrl = `/rtc/v1/whip/?app=live&stream=${config.streamId}&token=${config.streamKey}`;
            log('info', `WHIP endpoint: /rtc/v1/whip/?app=live&stream=${config.streamId}&token=***`);

            const response = await fetch(whipUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/sdp' },
                body: this.publishPC.localDescription.sdp
            });

            if (!response.ok) {
                throw new Error(`WHIP failed: ${response.status} ${response.statusText}`);
            }

            const answerSDP = await response.text();
            await this.publishPC.setRemoteDescription({
                type: 'answer',
                sdp: answerSDP
            });

            log('info', '✅ Publish started successfully');
            updateStatus('publish', 'connected', '🟢 Live! Streaming...');
            
            document.getElementById('btnStartPublish').disabled = true;
            document.getElementById('btnStopPublish').disabled = false;

        } catch (error) {
            log('error', `Publish error: ${error.message}`);
            updateStatus('publish', 'error', `Error: ${error.message}`);
            this.stopPublish();
        }
    }

    /**
     * Stop publishing
     */
    stopPublish() {
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
        if (this.publishPC) {
            this.publishPC.close();
            this.publishPC = null;
        }
        document.getElementById('localVideo').srcObject = null;
        document.getElementById('btnStartPublish').disabled = false;
        document.getElementById('btnStopPublish').disabled = true;
        updateStatus('publish', 'idle', 'Status: Stopped');
        log('info', 'Publish stopped');
    }

    /**
     * Start playing stream via WHEP
     * Uses stream ID only (no token needed for viewing)
     */
    async startPlay() {
        const config = this.validatePlayConfig();
        log('info', `Starting playback from ${config.serverIP}...`);
        updateStatus('play', 'connecting', 'Fetching ICE servers...');

        try {
            // Fetch ICE servers from API (includes TURN with time-limited credentials)
            const iceServers = await this.fetchIceServers(config.streamId);

            updateStatus('play', 'connecting', 'Connecting to stream...');

            // Create peer connection with STUN/TURN servers
            this.playPC = new RTCPeerConnection({ iceServers });

            // Handle incoming tracks
            this.playPC.ontrack = (event) => {
                log('info', `Received ${event.track.kind} track`);
                const remoteVideo = document.getElementById('remoteVideo');
                if (event.streams && event.streams[0]) {
                    remoteVideo.srcObject = event.streams[0];
                }
            };

            // ICE connection state
            this.playPC.oniceconnectionstatechange = () => {
                const state = this.playPC.iceConnectionState;
                log('info', `Play ICE state: ${state}`);
                if (state === 'connected') {
                    updateStatus('play', 'connected', '🟢 Playing...');
                } else if (state === 'failed' || state === 'disconnected') {
                    updateStatus('play', 'error', `Connection ${state}`);
                }
            };

            // Add transceivers for receiving
            this.playPC.addTransceiver('video', { direction: 'recvonly' });
            this.playPC.addTransceiver('audio', { direction: 'recvonly' });

            // Create offer
            const offer = await this.playPC.createOffer();
            await this.playPC.setLocalDescription(offer);
            log('info', 'Created play offer');

            // Wait for ICE gathering
            await this.waitForICEGathering(this.playPC);

            // Send offer via WHEP (uses stream ID only, no token)
            // Use relative URL to go through Caddy proxy (handles HTTPS)
            const whepUrl = `/rtc/v1/whep/?app=live&stream=${config.streamId}`;
            log('info', `WHEP endpoint: /rtc/v1/whep/?app=live&stream=${config.streamId}`);

            const response = await fetch(whepUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/sdp' },
                body: this.playPC.localDescription.sdp
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`WHEP failed: ${response.status} - ${errorText}`);
            }

            const answerSDP = await response.text();
            await this.playPC.setRemoteDescription({
                type: 'answer',
                sdp: answerSDP
            });

            log('info', '✅ Play started successfully');
            
            document.getElementById('btnStartPlay').disabled = true;
            document.getElementById('btnStopPlay').disabled = false;

        } catch (error) {
            log('error', `Play error: ${error.message}`);
            updateStatus('play', 'error', `Error: ${error.message}`);
            this.stopPlay();
        }
    }

    /**
     * Stop playing
     */
    stopPlay() {
        if (this.playPC) {
            this.playPC.close();
            this.playPC = null;
        }
        document.getElementById('remoteVideo').srcObject = null;
        document.getElementById('btnStartPlay').disabled = false;
        document.getElementById('btnStopPlay').disabled = true;
        updateStatus('play', 'idle', 'Status: Stopped');
        log('info', 'Playback stopped');
    }

    /**
     * Wait for ICE gathering to complete
     */
    waitForICEGathering(pc) {
        return new Promise((resolve) => {
            if (pc.iceGatheringState === 'complete') {
                resolve();
                return;
            }
            
            const checkState = () => {
                if (pc.iceGatheringState === 'complete') {
                    pc.removeEventListener('icegatheringstatechange', checkState);
                    resolve();
                }
            };
            
            pc.addEventListener('icegatheringstatechange', checkState);
            
            // Timeout after 5 seconds
            setTimeout(() => {
                pc.removeEventListener('icegatheringstatechange', checkState);
                resolve();
            }, 5000);
        });
    }
}

// UI Helper functions
function updateStatus(panel, state, message) {
    const statusEl = document.getElementById(`${panel}Status`);
    statusEl.className = `status ${state}`;
    statusEl.textContent = message;
}

function log(level, message) {
    const logOutput = document.getElementById('logOutput');
    const time = new Date().toLocaleTimeString();
    const entry = document.createElement('div');
    entry.className = `log-entry ${level}`;
    entry.textContent = `[${time}] ${message}`;
    logOutput.appendChild(entry);
    logOutput.scrollTop = logOutput.scrollHeight;
    console.log(`[${level}] ${message}`);
}

/**
 * Create a new stream via API
 */
async function createStream() {
    const serverIP = document.getElementById('serverIP').value.trim();
    const userId = document.getElementById('userId').value.trim();
    const title = document.getElementById('streamTitle').value.trim() || 'Test Stream';
    const resultEl = document.getElementById('createStreamResult');

    if (!serverIP) {
        resultEl.innerHTML = '<span style="color: #ff6b6b;">❌ Enter Server IP first</span>';
        return;
    }
    if (!userId) {
        resultEl.innerHTML = '<span style="color: #ff6b6b;">❌ Enter User ID (UUID)</span>';
        return;
    }
    // Basic UUID validation (backend will also validate)
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRe.test(userId)) {
        resultEl.innerHTML = '<span style="color: #ff6b6b;">❌ User ID must be a valid UUID</span>';
        return;
    }

    resultEl.innerHTML = '⏳ Creating stream...';
    log('info', `Creating stream for user ${userId}...`);

    try {
        // Try HTTPS first, fallback to HTTP
        let apiUrl = `https://${serverIP}/api/v1/live/create`;
        let response;
        
        try {
            response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-User-ID': userId
                },
                body: JSON.stringify({ title })
            });
        } catch (e) {
            // Fallback to HTTP (for local testing)
            apiUrl = `http://${serverIP}:8081/api/v1/live/create`;
            log('warn', 'HTTPS failed, trying HTTP...');
            response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-User-ID': userId
                },
                body: JSON.stringify({ title })
            });
        }

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.message || `HTTP ${response.status}`);
        }

        const data = await response.json();
        
        // Auto-fill stream ID and key
        document.getElementById('streamId').value = data.id;
        document.getElementById('streamKey').value = data.stream_key;
        
        resultEl.innerHTML = `
            <span style="color: #4ecdc4;">✅ Stream created!</span><br>
            <small>ID: ${data.id} | Key: ${data.stream_key.substring(0, 8)}...</small>
        `;
        
        log('info', `Stream created: ID=${data.id}`);
        log('info', `RTMP URL: ${data.rtmp_url}`);

    } catch (error) {
        resultEl.innerHTML = `<span style="color: #ff6b6b;">❌ ${error.message}</span>`;
        log('error', `Create stream failed: ${error.message}`);
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    const client = new SRSWebRTCClient();

    // Check HTTPS
    const protocol = window.location.protocol;
    document.getElementById('currentProtocol').textContent = protocol;
    if (protocol !== 'https:' && window.location.hostname !== 'localhost') {
        document.getElementById('httpsWarning').classList.add('show');
        log('warn', 'HTTPS required for camera/mic access!');
    }

    // Auto-fill server IP from URL if on same server
    if (window.location.hostname && window.location.hostname !== 'localhost') {
        document.getElementById('serverIP').value = window.location.hostname;
    }

    // Button handlers
    document.getElementById('btnCreateStream').onclick = createStream;
    document.getElementById('btnStartPublish').onclick = () => client.startPublish();
    document.getElementById('btnStopPublish').onclick = () => client.stopPublish();
    document.getElementById('btnStartPlay').onclick = () => client.startPlay();
    document.getElementById('btnStopPlay').onclick = () => client.stopPlay();

    log('info', 'WebRTC Demo initialized');
    log('info', 'Click "Create Stream" to get a stream key, then start streaming');
});
