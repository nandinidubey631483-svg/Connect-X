import React, { useState } from "react";
import styled from "styled-components";
import { FiPlus, FiMessageSquare } from "react-icons/fi";

export default function Sidebar({
  contacts = [],
  currentChat,
  onSelectChat,
  onOpenDiscovery,
  className,
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all"); // 'all' | 'unread' | 'online'

  const filteredContacts = contacts.filter((c) => {
    const q = searchQuery.toLowerCase();
    const username = (c.username || "").toLowerCase();
    const displayName = (c.displayName || "").toLowerCase();
    const matchesQuery = username.includes(q) || displayName.includes(q);

    if (!matchesQuery) return false;

    if (activeTab === "online") {
      return !!c.isOnline;
    }
    if (activeTab === "unread") {
      return (c.unreadCount || 0) > 0;
    }
    return true;
  });

  const formatTimestamp = (dateStr) => {
    if (!dateStr) return "";
    try {
      const date = new Date(dateStr);
      const now = new Date();
      if (date.toDateString() === now.toDateString()) {
        return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      }
      return date.toLocaleDateString([], { month: "short", day: "numeric" });
    } catch (_) {
      return "";
    }
  };

  const getInitials = (name) => {
    if (!name) return "U";
    return name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <aside className={`list lp ${className || ""}`} style={{ width: "330px", background: "var(--surf)", display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div className="lh" style={{ padding: "16px 18px 10px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h3 className="serif" style={{ fontSize: "20px", fontWeight: "600", letterSpacing: "-0.02em" }}>
          Messages
        </h3>
        {onOpenDiscovery && (
          <button
            type="button"
            className="btn ic"
            onClick={onOpenDiscovery}
            title="Discover new contacts"
            style={{ width: "32px", height: "32px", borderRadius: "8px", border: "1px solid var(--line)", display: "grid", placeItems: "center" }}
          >
            <FiPlus size={16} />
          </button>
        )}
      </div>

      {/* Search Input with / shortcut badge */}
      <div style={{ padding: "0 16px 12px", position: "relative" }}>
        <input
          type="text"
          className="in"
          placeholder="Search conversations..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          data-testid="sidebar-search-input"
          style={{ height: "38px", fontSize: "13px", paddingRight: "30px", borderRadius: "10px" }}
        />
        <span
          style={{
            position: "absolute",
            right: "26px",
            top: "50%",
            transform: "translateY(-50%)",
            fontSize: "11px",
            color: "var(--mut)",
            background: "var(--s2)",
            border: "1px solid var(--line)",
            borderRadius: "4px",
            padding: "1px 5px",
            pointerEvents: "none",
          }}
        >
          /
        </span>
      </div>

      {/* Filter Tabs: All, Unread, Online */}
      <div className="tabs" style={{ display: "flex", gap: "6px", padding: "0 16px 12px", borderBottom: "1px solid var(--line)" }}>
        <TabButton
          active={activeTab === "all"}
          onClick={() => setActiveTab("all")}
        >
          All
        </TabButton>
        <TabButton
          active={activeTab === "unread"}
          onClick={() => setActiveTab("unread")}
        >
          Unread
        </TabButton>
        <TabButton
          active={activeTab === "online"}
          onClick={() => setActiveTab("online")}
        >
          Online
        </TabButton>
      </div>

      {/* Contacts List */}
      <div className="sec" style={{ flex: 1, overflowY: "auto", padding: "10px 10px" }}>
        <div
          className="sh2"
          style={{
            fontSize: "11px",
            fontWeight: "600",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "var(--mut)",
            padding: "6px 8px 10px",
          }}
        >
          DIRECT MESSAGES ({filteredContacts.length})
        </div>

        {filteredContacts.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 16px", color: "var(--mut)" }}>
            <FiMessageSquare size={32} style={{ opacity: 0.4, marginBottom: "8px" }} />
            <p style={{ fontSize: "13px" }}>No other users registered yet.</p>
          </div>
        ) : (
          filteredContacts.map((contact) => {
            const isSelected = currentChat && currentChat._id === contact._id;
            const timeText = formatTimestamp(contact.updatedAt || contact.lastMessage?.createdAt);
            const lastMsg = contact.lastMessage?.text;
            const initials = getInitials(contact.displayName || contact.username);

            return (
              <div
                key={contact._id}
                className={`row ${isSelected ? "on" : ""}`}
                onClick={() => onSelectChat(contact)}
                data-testid={`contact-card-${contact.username || contact._id}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "11px",
                  padding: "9px 10px",
                  borderRadius: "12px",
                  cursor: "pointer",
                  background: isSelected ? "var(--acc2, #EEEDFD)" : "transparent",
                  marginBottom: "3px",
                  position: "relative",
                  transition: "background 0.12s, transform 0.15s",
                }}
              >
                {/* Avatar with Presence Ring */}
                <div
                  className="av"
                  style={{
                    width: "42px",
                    height: "42px",
                    borderRadius: "14px",
                    background: contact.avatarImage ? "transparent" : "linear-gradient(135deg, #4F46E5, #7C3AED)",
                    color: "#fff",
                    display: "grid",
                    placeItems: "center",
                    fontWeight: "600",
                    fontSize: "14px",
                    flex: "none",
                    position: "relative",
                  }}
                >
                  {contact.avatarImage ? (
                    <img
                      src={contact.avatarImage.startsWith("data:") ? contact.avatarImage : `data:image/svg+xml;base64,${contact.avatarImage}`}
                      alt={contact.username}
                      style={{ width: "100%", height: "100%", borderRadius: "14px", objectFit: "cover" }}
                    />
                  ) : (
                    initials
                  )}

                  <span
                    className={`pr ${contact.isOnline ? "online" : "off"}`}
                    style={{
                      position: "absolute",
                      bottom: "-1px",
                      right: "-1px",
                      width: "11px",
                      height: "11px",
                      borderRadius: "50%",
                      border: "2px solid var(--surf)",
                      background: contact.isOnline ? "var(--ok, #15803D)" : "var(--mut, #6C6E78)",
                    }}
                  />
                </div>

                {/* Contact text details */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    className="r1"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: "2px",
                    }}
                  >
                    <b
                      style={{
                        fontSize: "13.5px",
                        fontWeight: isSelected ? "600" : "500",
                        color: isSelected ? "var(--acc)" : "var(--ink)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {contact.displayName || contact.username}
                    </b>
                    {timeText && (
                      <span className="tm" style={{ fontSize: "11px", color: "var(--mut)", flex: "none", marginLeft: "6px" }}>
                        {timeText}
                      </span>
                    )}
                  </div>

                  <div
                    className="r2"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      fontSize: "12px",
                      color: "var(--mut)",
                      gap: "6px",
                    }}
                  >
                    <span
                      style={{
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        flex: 1,
                      }}
                    >
                      {lastMsg || contact.statusMessage || contact.email || "Active on ConnectX"}
                    </span>

                    {(contact.unreadCount || 0) > 0 && (
                      <span
                        className="cnt"
                        style={{
                          background: "var(--acc)",
                          color: "#fff",
                          fontSize: "11px",
                          fontWeight: "600",
                          borderRadius: "99px",
                          padding: "1px 6px",
                          minWidth: "18px",
                          textAlign: "center",
                          flex: "none",
                        }}
                      >
                        {contact.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}

const TabButton = styled.button`
  flex: 1;
  padding: 6px 10px;
  font-size: 12.5px;
  font-weight: 500;
  border-radius: 8px;
  border: 1px solid ${(props) => (props.active ? "var(--line)" : "transparent")};
  background: ${(props) => (props.active ? "var(--s2)" : "transparent")};
  color: ${(props) => (props.active ? "var(--ink)" : "var(--mut)")};
  transition: all 0.15s ease;

  &:hover {
    color: var(--ink);
  }
`;
