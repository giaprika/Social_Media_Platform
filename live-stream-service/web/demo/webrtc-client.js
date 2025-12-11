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
            streamKey: document.getElementById('streamKey').value.trim(),
            apiPort: parseInt(document.getElementById('apiPort').value) || 1985
        };
    }

    /**
     * Validate configuration
     */
    validateConfig() {
        const config = this.getConfig();
        if (!config.serverIP) {
            throw new Error('Server IP is required');
        }
        if (!config.streamKey) {
            throw new Error('Stream Key is required');
        }
        return config;
    }

    /**
     * Start publishing stream via WHIP
     */
    async startPublish() {
        const config = this.validateConfig();
        log('info', `Starting publish to ${config.serverIP}...`);
        updateStatus('publish', 'connecting', 'Requesting camera access...');

        try {
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

            // Create peer connection
            this.publishPC = new RTCPeerConnection({
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' }
                ]
            });

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

            // Send offer via WHIP
            const whipUrl = `http://${config.serverIP}:${config.apiPort}/rtc/v1/whip/?app=live&stream=${config.streamKey}`;
            log('info', `WHIP endpoint: ${whipUrl}`);

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
     */
    async startPlay() {
        const config = this.validateConfig();
        log('info', `Starting playback from ${config.serverIP}...`);
        updateStatus('play', 'connecting', 'Connecting to stream...');

        try {
            // Create peer connection
            this.playPC = new RTCPeerConnection({
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' }
                ]
            });

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

            // Send offer via WHEP
            const whepUrl = `http://${config.serverIP}:${config.apiPort}/rtc/v1/whep/?app=live&stream=${config.streamKey}`;
            log('info', `WHEP endpoint: ${whepUrl}`);

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
    document.getElementById('btnStartPublish').onclick = () => client.startPublish();
    document.getElementById('btnStopPublish').onclick = () => client.stopPublish();
    document.getElementById('btnStartPlay').onclick = () => client.startPlay();
    document.getElementById('btnStopPlay').onclick = () => client.stopPlay();

    log('info', 'WebRTC Demo initialized');
    log('info', 'Enter SRS server IP and stream key to begin');
});
