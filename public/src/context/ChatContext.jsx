/**
 * ConnectX Centralized Chat State Management (ChatContext)
 * 
 * Manages:
 * - Authoritative active chat (`currentChat`)
 * - Live message collection for the active conversation (`messages`)
 * - Contacts & conversations list with real-time lastMessage sync (`contacts`)
 * - Centralized Socket.IO lifecycle & connection status
 * - Real-time incoming message deduplication and instant broadcast
 * - Presence & online status synchronization
 * - Unread message & notification counters
 */
import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { io } from "socket.io-client";
import { v4 as uuidv4 } from "uuid";
import axios from "axios";
import { host } from "../utils/APIRoutes";
import {
  v1ContactsRoute,
  v1ConversationsRoute,
  v1CreateConversationRoute,
  v1ConversationMessagesRoute,
  v1MessagesRoute,
  v1ConversationReadMessagesRoute,
  v1UnreadNotificationsCountRoute,
} from "../services/apiRoutes";
import { sendMessageRoute, recieveMessageRoute } from "../utils/APIRoutes";
import apiClient from "../services/apiClient";
import { getAccessToken } from "../services/tokenManager";
import { useAuth } from "./AuthContext";

const ChatContext = createContext(null);

export function ChatProvider({ children }) {
  const { user: currentUser } = useAuth();
  const socketRef = useRef(null);
  const [socketInstance, setSocketInstance] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  // Core Chat State
  const [contacts, setContacts] = useState([]);
  const [currentChat, setCurrentChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  // ---------------------------------------------------------------------------
  // 1. Socket.IO Lifecycle Management
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!currentUser) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setSocketInstance(null);
        setIsConnected(false);
      }
      return;
    }

    const uId = String(currentUser._id || currentUser.id || "");
    if (!uId) return;

    const sock = io(host, {
      auth: (cb) => {
        const freshToken = getAccessToken() || currentUser.accessToken;
        cb({
          token: freshToken ? `Bearer ${freshToken}` : "",
          userId: uId,
        });
      },
      withCredentials: true,
      transports: ["websocket", "polling"],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socketRef.current = sock;
    setSocketInstance(sock);

    sock.on("connect", () => {
      setIsConnected(true);
      sock.emit("add-user", uId);
    });

    sock.on("disconnect", () => {
      setIsConnected(false);
    });

    // Heartbeat pulse to keep presence active
    const hbInterval = setInterval(() => {
      if (sock && sock.connected) {
        sock.emit("presence:heartbeat");
      }
    }, 15000);

    return () => {
      clearInterval(hbInterval);
      sock.disconnect();
      socketRef.current = null;
      setSocketInstance(null);
      setIsConnected(false);
    };
  }, [currentUser]);

  // ---------------------------------------------------------------------------
  // 2. Load Contacts & Enrich with Active Conversation Metadata
  // ---------------------------------------------------------------------------
  const loadContacts = useCallback(async () => {
    if (!currentUser || !currentUser.isAvatarImageSet) return;

    let contactList = [];
    try {
      const res = await apiClient.get(v1ContactsRoute);
      if (res.data && res.data.success && Array.isArray(res.data.contacts)) {
        contactList = res.data.contacts;
      }
    } catch (_) {}

    try {
      const convRes = await apiClient.get(v1ConversationsRoute);
      if (convRes.data && convRes.data.success && convRes.data.conversations) {
        const convMap = new Map();
        const existingContactIds = new Set(
          contactList.map((c) => (c._id ? c._id.toString() : ""))
        );

        for (const conv of convRes.data.conversations) {
          if (conv.otherParticipant && conv.otherParticipant._id) {
            const otherId = conv.otherParticipant._id.toString();
            convMap.set(otherId, conv);

            if (!existingContactIds.has(otherId) && conv.lastMessage?.text) {
              contactList.push({
                ...conv.otherParticipant,
                conversationId: conv._id,
                lastMessage: conv.lastMessage,
                updatedAt: conv.updatedAt,
              });
              existingContactIds.add(otherId);
            }
          }
        }

        contactList = contactList.map((c) => {
          const matchedConv = convMap.get(c._id ? c._id.toString() : "");
          if (matchedConv) {
            return {
              ...c,
              conversationId: matchedConv._id,
              lastMessage: matchedConv.lastMessage,
              updatedAt: matchedConv.updatedAt,
            };
          }
          return c;
        });
      }
    } catch (_) {}

    setContacts(contactList);
  }, [currentUser]);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  // Load unread notification count
  useEffect(() => {
    if (!currentUser) return;
    let isMounted = true;
    async function fetchUnread() {
      try {
        const res = await apiClient.get(v1UnreadNotificationsCountRoute);
        if (isMounted && res.data?.success) {
          setUnreadNotificationsCount(res.data.unreadCount || 0);
        }
      } catch (_) {}
    }
    fetchUnread();
    return () => {
      isMounted = false;
    };
  }, [currentUser]);

  // ---------------------------------------------------------------------------
  // 3. Load Messages for Active Conversation
  // ---------------------------------------------------------------------------
  const loadMessagesForChat = useCallback(async (chat) => {
    if (!chat || !currentUser) {
      setMessages([]);
      return;
    }

    setIsLoadingMessages(true);
    const myId = String(currentUser._id || currentUser.id || "");
    const targetId = String(chat._id || chat.id || "");

    // Path 1: Load via conversationId if available
    if (chat.conversationId) {
      try {
        const res = await apiClient.get(v1ConversationMessagesRoute(chat.conversationId));
        if (res.data && res.data.success && Array.isArray(res.data.messages)) {
          setMessages(res.data.messages);
          setIsLoadingMessages(false);

          // Mark read
          try {
            await apiClient.put(v1ConversationReadMessagesRoute(chat.conversationId));
            if (socketRef.current) {
              socketRef.current.emit("message:read", { conversationId: chat.conversationId });
            }
          } catch (_) {}
          return;
        }
      } catch (_) {}
    }

    // Path 2: Fallback to direct messages endpoint
    try {
      const response = await axios.post(recieveMessageRoute, {
        from: myId,
        to: targetId,
      });
      if (response.data && Array.isArray(response.data)) {
        setMessages(response.data);
      } else {
        setMessages([]);
      }
    } catch (_) {
      setMessages([]);
    } finally {
      setIsLoadingMessages(false);
    }
  }, [currentUser]);

  // ---------------------------------------------------------------------------
  // 4. Select / Close Chat Actions
  // ---------------------------------------------------------------------------
  const selectChat = useCallback(async (chat) => {
    if (!chat) {
      setCurrentChat(null);
      setMessages([]);
      return;
    }

    let activeChat = { ...chat };
    setCurrentChat(activeChat);

    // If conversationId is not yet linked, ensure it is created on backend
    const targetId = chat._id || chat.id;
    if (targetId) {
      try {
        const convRes = await apiClient.post(v1CreateConversationRoute, { participantId: targetId });
        if (convRes.data?.conversation?._id) {
          const linkedId = convRes.data.conversation._id;
          activeChat = { ...activeChat, conversationId: linkedId };
          setCurrentChat((prev) => (prev ? { ...prev, conversationId: linkedId } : prev));
        }
      } catch (_) {}
    }

    loadMessagesForChat(activeChat);
  }, [loadMessagesForChat]);

  const closeChat = useCallback(() => {
    setCurrentChat(null);
    setMessages([]);
    setIsDetailsOpen(false);
  }, []);

  // ---------------------------------------------------------------------------
  // 5. Send Message Action
  // ---------------------------------------------------------------------------
  const sendMessage = useCallback(async (textContent, mediaPayload = null) => {
    if (!currentUser || !currentChat) return;

    const trimmed = (textContent || "").trim();
    if (!trimmed && !mediaPayload) return;

    const myUserId = String(currentUser._id || currentUser.id || "");
    const targetUserId = String(currentChat._id || currentChat.id || "");
    const clientTempId = uuidv4();

    const optimisticMessage = {
      _id: clientTempId,
      fromSelf: true,
      message: trimmed,
      messageType: mediaPayload ? (mediaPayload.mimeType?.startsWith("image/") ? "IMAGE" : "FILE") : "TEXT",
      media: mediaPayload,
      status: "SENT",
      createdAt: new Date().toISOString(),
    };

    // 1. Optimistically append message to current active conversation
    setMessages((prev) => [...prev, optimisticMessage]);

    // 2. Optimistically update contacts sidebar preview
    const previewText = trimmed || (mediaPayload ? (mediaPayload.mimeType?.startsWith("image/") ? "📷 Photo" : `📎 ${mediaPayload.filename}`) : "");
    setContacts((prev) =>
      prev.map((c) => {
        const cId = String(c._id || c.id || "");
        if (cId === targetUserId) {
          return {
            ...c,
            lastMessage: {
              text: previewText,
              sender: myUserId,
              createdAt: optimisticMessage.createdAt,
            },
            updatedAt: optimisticMessage.createdAt,
          };
        }
        return c;
      })
    );

    // 3. Emit via Socket.IO real-time channel
    const activeSock = socketRef.current;
    if (activeSock && typeof activeSock.emit === "function") {
      activeSock.emit("message:send", {
        conversationId: currentChat.conversationId,
        to: targetUserId,
        from: myUserId,
        text: trimmed,
        media: mediaPayload,
        clientTempId,
      });

      if (trimmed) {
        activeSock.emit("send-msg", {
          to: targetUserId,
          from: myUserId,
          msg: trimmed,
        });
      }
    }

    // 4. Persist to backend database via HTTP API
    try {
      if (currentChat.conversationId) {
        await apiClient.post(v1MessagesRoute, {
          conversationId: currentChat.conversationId,
          to: targetUserId,
          text: trimmed,
          media: mediaPayload,
        });
      } else {
        await axios.post(sendMessageRoute, {
          from: myUserId,
          to: targetUserId,
          message: trimmed || (mediaPayload ? `[File] ${mediaPayload.filename}` : ""),
        });
      }
    } catch (_) {}
  }, [currentUser, currentChat]);

  // ---------------------------------------------------------------------------
  // 6. Global Real-Time Socket Event Subscribers
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const sock = socketRef.current;
    if (!sock) return;

    // Incoming v1 message handler
    const handleReceiveV1 = (payload) => {
      if (!payload) return;

      const senderId = String(
        payload?.sender?._id || payload?.sender?.id || payload?.sender || payload?.from || ""
      );
      const incomingText = payload.message || payload.text || "";
      const textPreview =
        incomingText || (payload.media ? (payload.media.mimeType?.startsWith("image/") ? "📷 Photo" : `📎 ${payload.media.filename}`) : "");

      // A. Update contacts list sidebar in real time!
      setContacts((prev) =>
        prev.map((c) => {
          const cId = String(c._id || c.id || "");
          if (cId === senderId) {
            return {
              ...c,
              lastMessage: {
                text: textPreview,
                sender: senderId,
                createdAt: payload.createdAt || new Date().toISOString(),
              },
              updatedAt: payload.createdAt || new Date().toISOString(),
            };
          }
          return c;
        })
      );

      // B. If the incoming message belongs to the current open chat, append to messages!
      const activeChatTarget = String(currentChat?._id || currentChat?.id || "");
      const activeConvId = String(currentChat?.conversationId || "");
      const incomingConvId = String(payload?.conversationId || "");
      const chatUsername = String(currentChat?.username || "").toLowerCase();
      const senderUsername = String(payload?.sender?.username || payload?.username || "").toLowerCase();

      const belongsToActiveChat =
        (activeConvId && incomingConvId && activeConvId === incomingConvId) ||
        (senderId && activeChatTarget && senderId === activeChatTarget) ||
        (senderUsername && chatUsername && senderUsername === chatUsername) ||
        (!senderId && !incomingConvId);

      if (belongsToActiveChat) {
        const newMsgId = payload._id || uuidv4();
        const newArrival = {
          _id: newMsgId,
          fromSelf: false,
          message: incomingText,
          messageType: payload.messageType || (payload.media?.mimeType?.startsWith("image/") ? "IMAGE" : "TEXT"),
          media: payload.media || null,
          createdAt: payload.createdAt || new Date().toISOString(),
        };

        setMessages((prev) => {
          const alreadyExists = prev.some((m) => m._id === newMsgId);
          if (alreadyExists) return prev;
          return [...prev, newArrival];
        });

        // Acknowledge read/delivered
        const convId = currentChat?.conversationId || payload.conversationId;
        if (payload._id && convId) {
          sock.emit("message:delivered", { messageId: payload._id, conversationId: convId });
          sock.emit("message:read", { messageId: payload._id, conversationId: convId });
        }
      }
    };

    // Incoming legacy message handler
    const handleReceiveLegacy = (msg) => {
      const textMsg = typeof msg === "object" ? (msg.msg || msg.message || msg.text) : msg;
      const sender = typeof msg === "object" ? String(msg.from || msg.sender || "") : "";
      handleReceiveV1({ from: sender, text: textMsg });
    };

    // Presence updates
    const handlePresenceUpdate = (presenceData) => {
      if (!presenceData || !presenceData.userId) return;
      const targetId = String(presenceData.userId);

      setContacts((prev) =>
        prev.map((c) => {
          const cId = String(c._id || c.id || "");
          if (cId === targetId) {
            return {
              ...c,
              isOnline: !!presenceData.isOnline,
              lastSeen: presenceData.lastSeen || c.lastSeen,
            };
          }
          return c;
        })
      );

      setCurrentChat((prev) => {
        if (!prev) return prev;
        const prevId = String(prev._id || prev.id || "");
        if (prevId === targetId) {
          return {
            ...prev,
            isOnline: !!presenceData.isOnline,
            lastSeen: presenceData.lastSeen || prev.lastSeen,
          };
        }
        return prev;
      });
    };

    // Message status receipts (Sent -> Delivered -> Read)
    const STATUS_WEIGHT = { SENT: 1, DELIVERED: 2, READ: 3 };
    const handleStatusReceipt = (update) => {
      if (!update) return;
      const { messageId, messageIds, status, deliveredAt, readAt } = update;
      const targetIds = new Set(messageIds || (messageId ? [messageId] : []));

      setMessages((prev) =>
        prev.map((m) => {
          if (targetIds.has(m._id) || (m.clientTempId && targetIds.has(m.clientTempId))) {
            const currentWeight = STATUS_WEIGHT[m.status] || 1;
            const newWeight = STATUS_WEIGHT[status] || 1;
            if (newWeight < currentWeight) return m;
            return {
              ...m,
              status,
              deliveredAt: deliveredAt || m.deliveredAt,
              readAt: readAt || m.readAt,
            };
          }
          return m;
        })
      );
    };

    // Notifications counter
    const handleNewNotification = () => setUnreadNotificationsCount((prev) => prev + 1);
    const handleNotificationCount = (data) => {
      if (typeof data?.unreadCount === "number") {
        setUnreadNotificationsCount(data.unreadCount);
      }
    };

    sock.on("message:receive", handleReceiveV1);
    sock.on("msg-recieve", handleReceiveLegacy);
    sock.on("presence:update", handlePresenceUpdate);
    sock.on("message:status_update", handleStatusReceipt);
    sock.on("message:delivered", handleStatusReceipt);
    sock.on("message:read", handleStatusReceipt);
    sock.on("notification:new", handleNewNotification);
    sock.on("notification:count", handleNotificationCount);

    return () => {
      sock.off("message:receive", handleReceiveV1);
      sock.off("msg-recieve", handleReceiveLegacy);
      sock.off("presence:update", handlePresenceUpdate);
      sock.off("message:status_update", handleStatusReceipt);
      sock.off("message:delivered", handleStatusReceipt);
      sock.off("message:read", handleStatusReceipt);
      sock.off("notification:new", handleNewNotification);
      sock.off("notification:count", handleNotificationCount);
    };
  }, [socketInstance, currentChat]);

  const value = {
    socket: socketRef,
    socketInstance,
    isConnected,
    contacts,
    currentChat,
    messages,
    isLoadingMessages,
    unreadNotificationsCount,
    isDetailsOpen,
    setIsDetailsOpen,
    selectChat,
    closeChat,
    sendMessage,
    loadContacts,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return context;
}

export default ChatContext;
