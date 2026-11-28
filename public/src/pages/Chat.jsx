import React, { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { io } from "socket.io-client";
import { host } from "../utils/APIRoutes";
import {
  v1ContactsRoute,
  v1ConversationsRoute,
  v1CreateConversationRoute,
} from "../services/apiRoutes";
import apiClient from "../services/apiClient";
import { getAccessToken, setAccessToken } from "../services/tokenManager";
import ChatContainer from "../components/ChatContainer";
import Welcome from "../components/Welcome";
import MainLayout from "../components/layout/MainLayout";
import { CallProvider } from "../context/CallContext";
import CallModal from "../components/calling/CallModal";

export default function Chat({ initialTab }) {
  const navigate = useNavigate();
  const socket = useRef();
  const [socketInstance, setSocketInstance] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [currentChat, setCurrentChat] = useState(undefined);
  const [currentUser, setCurrentUser] = useState(undefined);

  useEffect(() => {
    async function loadUser() {
      const stored = localStorage.getItem(process.env.REACT_APP_LOCALHOST_KEY);
      if (!stored) {
        navigate("/login");
      } else {
        const parsed = JSON.parse(stored);
        if (parsed) {
          if (!parsed._id && parsed.id) parsed._id = parsed.id;
          if (!parsed.id && parsed._id) parsed.id = parsed._id;
          if (parsed.accessToken && !getAccessToken()) {
            setAccessToken(parsed.accessToken);
          }
        }
        setCurrentUser(parsed);
      }
    }
    loadUser();
  }, [navigate]);

  useEffect(() => {
    if (currentUser) {
      const uId = String(currentUser._id || currentUser.id || "");

      const sock = io(host, {
        auth: (cb) => {
          const freshToken = getAccessToken() || currentUser.accessToken;
          cb({
            token: freshToken ? `Bearer ${freshToken}` : "",
            userId: uId,
          });
        },
        withCredentials: true,
      });

      socket.current = sock;
      setSocketInstance(sock);

      if (uId) {
        sock.emit("add-user", uId);
      }

      // Heartbeat pulse to keep presence active
      const hbInterval = setInterval(() => {
        if (sock && sock.connected) {
          sock.emit("presence:heartbeat");
        }
      }, 15000);

      // Listen for presence updates from other users in real time
      sock.on("presence:update", (presenceData) => {
        if (!presenceData || !presenceData.userId) return;
        const targetId = String(presenceData.userId);

        setContacts((prevContacts) =>
          prevContacts.map((c) => {
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

        setCurrentChat((prevChat) => {
          if (!prevChat) return prevChat;
          const prevId = String(prevChat._id || prevChat.id || "");
          if (prevId === targetId) {
            return {
              ...prevChat,
              isOnline: !!presenceData.isOnline,
              lastSeen: presenceData.lastSeen || prevChat.lastSeen,
            };
          }
          return prevChat;
        });
      });

      // Listen for message updates to update lastMessage in sidebar in real time!
      const handleGlobalReceive = (payload) => {
        if (!payload) return;
        const senderId = String(payload.sender || payload.from || "");
        const textPreview =
          payload.message || payload.text || (payload.media ? `[File] ${payload.media.filename}` : "");

        setContacts((prevContacts) =>
          prevContacts.map((c) => {
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
      };

      sock.on("message:receive", handleGlobalReceive);
      sock.on("msg-recieve", (msg) => {
        const text = typeof msg === "object" ? (msg.msg || msg.message || msg.text) : msg;
        const sender = typeof msg === "object" ? String(msg.from || msg.sender || "") : "";
        if (text) {
          handleGlobalReceive({ sender, message: text });
        }
      });

      return () => {
        clearInterval(hbInterval);
        if (sock) {
          sock.disconnect();
        }
        socket.current = null;
        setSocketInstance(null);
      };
    }
  }, [currentUser]);

  const loadContacts = useCallback(async () => {
    if (currentUser) {
      if (currentUser.isAvatarImageSet) {
        let contactList = [];
        try {
          const res = await apiClient.get(v1ContactsRoute);
          if (res.data && res.data.success && Array.isArray(res.data.contacts)) {
            contactList = res.data.contacts;
          }
        } catch (_) { }

        // Enrich contacts with conversation metadata (lastMessage, timestamps)
        // Also include conversations with non-contact users if an active conversation exists
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

                // If user has an active conversation with messages with someone not yet in contactList, include them
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
        } catch (_) { }

        setContacts(contactList);
      } else {
        navigate("/setAvatar");
      }
    }
  }, [currentUser, navigate]);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  const handleChatChange = async (chat) => {
    setCurrentChat(chat);
    if (chat && (chat._id || chat.id)) {
      try {
        const targetId = chat._id || chat.id;
        const convRes = await apiClient.post(v1CreateConversationRoute, { participantId: targetId });
        if (convRes.data?.conversation?._id) {
          const convId = convRes.data.conversation._id;
          setCurrentChat((prev) => (prev ? { ...prev, conversationId: convId } : prev));
        }
      } catch (_) { }
    }
  };

  const handleBackToSidebar = () => {
    setCurrentChat(undefined);
  };

  return (
    <CallProvider currentSocket={socketInstance || socket}>
      <MainLayout
        currentUser={currentUser}
        currentChat={currentChat}
        contacts={contacts}
        onSelectChat={handleChatChange}
        onBackToSidebar={handleBackToSidebar}
        onContactsUpdated={loadContacts}
        socket={socketInstance || socket}
        initialTab={initialTab}
      >
        {currentChat === undefined ? (
          <Welcome />
        ) : (
          <ChatContainer currentChat={currentChat} socket={socketInstance || socket} />
        )}
      </MainLayout>
      <CallModal socket={socketInstance || socket} />
    </CallProvider>
  );
}
