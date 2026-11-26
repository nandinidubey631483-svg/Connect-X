/**
 * ConnectX WebRTC Calling Service (Module 11)
 * 
 * Manages RTCPeerConnection lifecycle, SDP Offer/Answer negotiation,
 * ICE candidate discovery, and local MediaStream tracks.
 */
import apiClient from "./apiClient";
import { v1CallIceServersRoute } from "./apiRoutes";

const DEFAULT_ICE_SERVERS = [
  {
    urls: [
      "stun:stun.l.google.com:19302",
      "stun:stun1.l.google.com:19302",
      "stun:stun2.l.google.com:19302",
    ],
  },
];

class WebRTCService {
  constructor() {
    this.peerConnection = null;
    this.localStream = null;
    this.remoteStream = null;
    this.currentFacingMode = "user";
    this.iceServers = DEFAULT_ICE_SERVERS;
    this.onRemoteStreamCallback = null;
    this.onConnectionStateChangeCallback = null;
    this.onIceCandidateCallback = null;
    this.pendingIceCandidates = [];
  }

  /**
   * Initializes ICE server configuration from backend
   */
  async loadIceServers() {
    try {
      const res = await apiClient.get(v1CallIceServersRoute);
      if (res.data?.success && res.data?.data?.iceServers?.length > 0) {
        this.iceServers = res.data.data.iceServers;
      }
    } catch (_) {
      this.iceServers = DEFAULT_ICE_SERVERS;
    }
  }

  /**
   * Acquires local media stream with appropriate constraints
   */
  async getLocalMedia({ callType = "VOICE", facingMode = "user" } = {}) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("MEDIA_NOT_SUPPORTED: WebRTC media devices not supported in this browser");
    }

    const isVideo = callType.toUpperCase() === "VIDEO";
    this.currentFacingMode = facingMode;

    const constraints = {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: isVideo
        ? {
            facingMode: { ideal: facingMode },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          }
        : false,
    };

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.localStream = stream;
      return stream;
    } catch (err) {
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        throw new Error("PERMISSION_DENIED: Microphone or camera access was denied by user");
      }
      if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        throw new Error("DEVICE_NOT_FOUND: No microphone or camera device detected");
      }
      if (err.name === "NotReadableError" || err.name === "TrackStartError") {
        throw new Error("DEVICE_BUSY: Microphone or camera is already in use by another application");
      }
      throw new Error(`MEDIA_ACQUISITION_FAILED: ${err.message}`);
    }
  }

  /**
   * Creates a new RTCPeerConnection with configured ICE servers
   */
  createPeerConnection({ onRemoteStream, onConnectionStateChange, onIceCandidate } = {}) {
    this.cleanupPeerConnection();

    this.onRemoteStreamCallback = onRemoteStream;
    this.onConnectionStateChangeCallback = onConnectionStateChange;
    this.onIceCandidateCallback = onIceCandidate;

    const pc = new (window.RTCPeerConnection || window.webkitRTCPeerConnection)({
      iceServers: this.iceServers,
    });

    this.peerConnection = pc;

    // Attach local tracks if stream already acquired
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localStream);
      });
    }

    // Handle incoming remote media tracks
    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        this.remoteStream = event.streams[0];
        if (typeof this.onRemoteStreamCallback === "function") {
          this.onRemoteStreamCallback(event.streams[0]);
        }
      }
    };

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && typeof this.onIceCandidateCallback === "function") {
        this.onIceCandidateCallback(event.candidate);
      }
    };

    // Connection state listeners
    pc.onconnectionstatechange = () => {
      if (typeof this.onConnectionStateChangeCallback === "function") {
        this.onConnectionStateChangeCallback(pc.connectionState);
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (typeof this.onConnectionStateChangeCallback === "function") {
        this.onConnectionStateChangeCallback(pc.iceConnectionState);
      }
    };

    return pc;
  }

  /**
   * Caller initiates WebRTC offer
   */
  async createOffer() {
    if (!this.peerConnection) {
      throw new Error("PeerConnection not initialized");
    }
    const offer = await this.peerConnection.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true,
    });
    await this.peerConnection.setLocalDescription(offer);
    return offer;
  }

  /**
   * Receiver handles incoming offer and creates SDP answer
   */
  async handleOfferAndCreateAnswer(offer) {
    if (!this.peerConnection) {
      throw new Error("PeerConnection not initialized");
    }
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    this.drainPendingIceCandidates();

    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);
    return answer;
  }

  /**
   * Caller receives remote answer
   */
  async handleAnswer(answer) {
    if (!this.peerConnection) return;
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    this.drainPendingIceCandidates();
  }

  /**
   * Adds an ICE candidate, queuing if remote description is not yet set
   */
  async addIceCandidate(candidate) {
    if (!this.peerConnection || !this.peerConnection.remoteDescription) {
      this.pendingIceCandidates.push(candidate);
      return;
    }
    try {
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (_) {}
  }

  drainPendingIceCandidates() {
    if (!this.peerConnection || !this.peerConnection.remoteDescription) return;
    while (this.pendingIceCandidates.length > 0) {
      const candidate = this.pendingIceCandidates.shift();
      try {
        this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (_) {}
    }
  }

  /**
   * Toggles microphone audio track
   */
  toggleMicrophone() {
    if (!this.localStream) return false;
    const audioTrack = this.localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      return !audioTrack.enabled; // true if muted
    }
    return false;
  }

  /**
   * Toggles camera video track
   */
  toggleCamera() {
    if (!this.localStream) return false;
    const videoTrack = this.localStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      return !videoTrack.enabled; // true if camera off
    }
    return false;
  }

  /**
   * Switches camera facing mode (front/back on mobile or multi-camera devices)
   */
  async switchCamera() {
    if (!this.localStream) return null;
    const oldVideoTrack = this.localStream.getVideoTracks()[0];
    if (!oldVideoTrack) return null;

    const newFacingMode = this.currentFacingMode === "user" ? "environment" : "user";

    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { exact: newFacingMode } },
      });
      const newVideoTrack = newStream.getVideoTracks()[0];

      // Replace track on local stream
      this.localStream.removeTrack(oldVideoTrack);
      oldVideoTrack.stop();
      this.localStream.addTrack(newVideoTrack);

      // Replace track on peer connection
      if (this.peerConnection) {
        const sender = this.peerConnection.getSenders().find((s) => s.track && s.track.kind === "video");
        if (sender) {
          sender.replaceTrack(newVideoTrack);
        }
      }

      this.currentFacingMode = newFacingMode;
      return newFacingMode;
    } catch (_) {
      return null;
    }
  }

  /**
   * Cleans up peer connection only
   */
  cleanupPeerConnection() {
    if (this.peerConnection) {
      try {
        this.peerConnection.ontrack = null;
        this.peerConnection.onicecandidate = null;
        this.peerConnection.onconnectionstatechange = null;
        this.peerConnection.oniceconnectionstatechange = null;
        this.peerConnection.close();
      } catch (_) {}
      this.peerConnection = null;
    }
    this.pendingIceCandidates = [];
    this.remoteStream = null;
  }

  /**
   * Complete teardown of all media tracks and connection
   */
  cleanup() {
    this.cleanupPeerConnection();

    if (this.localStream) {
      try {
        this.localStream.getTracks().forEach((track) => {
          track.stop();
        });
      } catch (_) {}
      this.localStream = null;
    }

    this.onRemoteStreamCallback = null;
    this.onConnectionStateChangeCallback = null;
    this.onIceCandidateCallback = null;
  }
}

const webrtcService = new WebRTCService();
export default webrtcService;
