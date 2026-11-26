import React, { useEffect, useState, useRef, useCallback } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { io } from "socket.io-client";
import { allUsersRoute, host } from "../utils/APIRoutes";
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

      socket.current = io(host, {
        auth: (cb) => {
          const freshToken = getAccessToken() || currentUser.accessToken;
          cb({
            token: freshToken ? `Bearer ${freshToken}` : "",
            userId: uId,
          });
        },
        withCredentials: true,
      });

      if (uId) {
        socket.current.emit("add-user", uId);
      }

      // Heartbeat pulse to keep presence active
      const hbInterval = setInterval(() => {
        if (socket.current && socket.current.connected) {
          socket.current.emit("presence:heartbeat");
        }
      }, 15000);

      // Listen for presence updates from other users in real time
      socket.current.on("presence:update", (presenceData) => {
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

      socket.current.on("message:receive", handleGlobalReceive);

      return () => {
        clearInterval(hbInterval);
        if (socket.current) {
          socket.current.disconnect();
        }
      };
    }
  }, [currentUser]);

  const loadContacts = useCallback(async () => {
    if (currentUser) {
      if (currentUser.isAvatarImageSet) {
        let contactList = [];
        try {
          const res = await apiClient.get(v1ContactsRoute);
          if (res.data && res.data.success && res.data.contacts) {
            contactList = res.data.contacts;
          }
        } catch (_) {}

        if (contactList.length === 0) {
          try {
            const { data } = await axios.get(`${allUsersRoute}/${currentUser._id}`);
            contactList = data || [];
          } catch (_) {}
        }

        // Enrich contacts with conversation metadata (lastMessage, timestamps)
        try {
          const convRes = await apiClient.get(v1ConversationsRoute);
          if (convRes.data && convRes.data.success && convRes.data.conversations) {
            const convMap = new Map();
            for (const conv of convRes.data.conversations) {
              if (conv.otherParticipant && conv.otherParticipant._id) {
                convMap.set(conv.otherParticipant._id.toString(), conv);
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
    if (chat && chat._id) {
      try {
        await apiClient.post(v1CreateConversationRoute, { participantId: chat._id });
      } catch (_) {}
    }
  };

  const handleBackToSidebar = () => {
    setCurrentChat(undefined);
  };

  return (
    <CallProvider currentSocket={socket}>
      <MainLayout
        currentUser={currentUser}
        currentChat={currentChat}
        contacts={contacts}
        onSelectChat={handleChatChange}
        onBackToSidebar={handleBackToSidebar}
        onContactsUpdated={loadContacts}
        socket={socket}
        initialTab={initialTab}
      >
        {currentChat === undefined ? (
          <Welcome />
        ) : (
          <ChatContainer currentChat={currentChat} socket={socket} />
        )}
      </MainLayout>
      <CallModal socket={socket} />
    </CallProvider>
  );
}
