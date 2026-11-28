import React from "react";
import ChatContainer from "../components/ChatContainer";
import Welcome from "../components/Welcome";
import MainLayout from "../components/layout/MainLayout";
import { CallProvider } from "../context/CallContext";
import CallModal from "../components/calling/CallModal";
import { useChat } from "../context/ChatContext";

export default function Chat({ initialTab }) {
  const {
    currentUser,
    currentChat,
    contacts,
    selectChat,
    closeChat,
    loadContacts,
    socket,
  } = useChat();

  return (
    <CallProvider currentSocket={socket}>
      <MainLayout
        currentUser={currentUser}
        currentChat={currentChat}
        contacts={contacts}
        onSelectChat={selectChat}
        onBackToSidebar={closeChat}
        onContactsUpdated={loadContacts}
        socket={socket}
        initialTab={initialTab}
      >
        {currentChat === undefined || currentChat === null ? (
          <Welcome />
        ) : (
          <ChatContainer />
        )}
      </MainLayout>
      <CallModal socket={socket} />
    </CallProvider>
  );
}
