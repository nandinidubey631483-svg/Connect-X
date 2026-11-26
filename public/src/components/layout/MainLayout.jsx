import React, { useState, useEffect, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Sidebar from "./Sidebar";
import ContactsView from "../contacts/ContactsView";
import SettingsView from "../settings/SettingsView";
import ProfileView from "../profile/ProfileView";
import NotificationsView from "../notifications/NotificationsView";
import Logout from "../Logout";
import useMediaQuery from "../../hooks/useMediaQuery";
import { useTheme } from "../../context/ThemeContext";
import apiClient from "../../services/apiClient";
import { v1UnreadNotificationsCountRoute } from "../../services/apiRoutes";
import LogoImg from "../../assets/connectx-logo.png";
import DoodleBg from "../../assets/doodle_pattern.svg";
import {
  FiMessageSquare,
  FiUserPlus,
  FiBell,
  FiSettings,
  FiMoon,
  FiSun,
} from "react-icons/fi";

export default function MainLayout({
  currentUser,
  currentChat,
  contacts,
  onSelectChat,
  onBackToSidebar,
  onContactsUpdated,
  socket,
  initialTab,
  children,
}) {
  const { isMobile } = useMediaQuery();
  const { themeMode, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();

  const [unreadCount, setUnreadCount] = useState(0);

  // Load unread count on mount
  useEffect(() => {
    let isMounted = true;
    async function fetchCount() {
      try {
        const res = await apiClient.get(v1UnreadNotificationsCountRoute);
        if (isMounted && res.data && res.data.success) {
          setUnreadCount(res.data.unreadCount || 0);
        }
      } catch (_) {}
    }
    fetchCount();
    return () => {
      isMounted = false;
    };
  }, []);

  // Listen to Socket.IO notification live count events
  useEffect(() => {
    if (!socket || !socket.current) return;
    const s = socket.current;

    const handleNew = () => setUnreadCount((prev) => prev + 1);
    const handleCount = (data) => {
      if (typeof data?.unreadCount === "number") {
        setUnreadCount(data.unreadCount);
      }
    };

    s.on("notification:new", handleNew);
    s.on("notification:count", handleCount);

    return () => {
      s.off("notification:new", handleNew);
      s.off("notification:count", handleCount);
    };
  }, [socket]);

  // Determine active rail tab from prop or URL route
  const getTabFromPath = useCallback(() => {
    const path = location.pathname;
    if (path === "/contacts" || path === "/people") return "people";
    if (path === "/notifications") return "notifications";
    if (path === "/settings") return "settings";
    if (path === "/profile") return "profile";
    return initialTab || "chats";
  }, [location.pathname, initialTab]);

  const [activeRailTab, setActiveRailTab] = useState(getTabFromPath);

  useEffect(() => {
    setActiveRailTab(getTabFromPath());
  }, [getTabFromPath]);

  const handleTabChange = (tab) => {
    setActiveRailTab(tab);
    if (tab === "chats") navigate("/");
    else if (tab === "people") navigate("/contacts");
    else if (tab === "notifications") navigate("/notifications");
    else if (tab === "settings") navigate("/settings");
    else if (tab === "profile") navigate("/profile");
  };

  const handleSelectChat = (chat) => {
    handleTabChange("chats");
    onSelectChat(chat);
  };

  const handleBackToSidebar = () => {
    if (onBackToSidebar) onBackToSidebar();
  };

  const userInitial = (currentUser?.displayName || currentUser?.username || "U")[0].toUpperCase();

  const isPageMode = activeRailTab !== "chats";

  return (
    <div
      id="app"
      className={`tr ${isMobile && currentChat ? "in" : ""}`}
      style={{
        display: "flex",
        height: "100vh",
        width: "100vw",
        overflow: "hidden",
        backgroundColor: "var(--bg-wallpaper, #E1EDE0)",
        backgroundImage: `url(${DoodleBg})`,
        backgroundRepeat: "repeat",
        backgroundSize: "380px 380px",
        color: "var(--wallpaper-tint, #355639)",
      }}
    >
      {/* DESKTOP FLOATING LEFT PANEL (Rail + Sidebar in Chat mode, or Rail in Page mode) */}
      {!isMobile && (
        <div
          style={{
            margin: "12px 0 12px 12px",
            height: "calc(100vh - 24px)",
            borderRadius: "20px",
            background: "var(--surf, #FFFFFF)",
            border: "1px solid rgba(0, 0, 0, 0.08)",
            boxShadow: "0 8px 30px rgba(0, 0, 0, 0.07)",
            display: "flex",
            overflow: "hidden",
            width: isPageMode ? "68px" : "398px", // 68px rail + 330px sidebar
            flexShrink: 0,
            zIndex: 10,
            transition: "width 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)",
          }}
        >
          {/* Navigation Rail (68px) */}
          <aside
            className="rail"
            style={{
              width: "68px",
              height: "100%",
              background: "var(--surf, #FFFFFF)",
              borderRight: "1px solid var(--line, #E7E5DF)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              padding: "16px 0",
              zIndex: 10,
              gap: "8px",
              flexShrink: 0,
            }}
          >
            {/* Logo */}
            <div
              style={{ marginBottom: "12px", cursor: "pointer" }}
              onClick={() => handleTabChange("chats")}
              title="ConnectX Home"
            >
              <img
                src={LogoImg}
                alt="ConnectX Logo"
                className="logo"
                style={{ width: "42px", height: "auto" }}
              />
            </div>

            {/* Chats Navigation */}
            <button
              type="button"
              className={`nb ${activeRailTab === "chats" ? "on" : ""}`}
              onClick={() => handleTabChange("chats")}
              title="Conversations"
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "12px",
                display: "grid",
                placeItems: "center",
                background: activeRailTab === "chats" ? "var(--acc2, #EEEDFD)" : "transparent",
                color: activeRailTab === "chats" ? "var(--acc, #4F46E5)" : "var(--mut, #6C6E78)",
                position: "relative",
                transition: "0.15s",
                border: "none",
                cursor: "pointer",
              }}
            >
              <FiMessageSquare size={20} />
              {activeRailTab === "chats" && (
                <span
                  className="pip"
                  style={{
                    position: "absolute",
                    left: "-12px",
                    width: "4px",
                    height: "20px",
                    borderRadius: "0 4px 4px 0",
                    background: "var(--acc, #4F46E5)",
                  }}
                />
              )}
            </button>

            {/* People & Contacts Navigation */}
            <button
              type="button"
              className={`nb ${activeRailTab === "people" ? "on" : ""}`}
              onClick={() => handleTabChange("people")}
              title="People & Contacts"
              data-testid="header-discovery-btn"
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "12px",
                display: "grid",
                placeItems: "center",
                background: activeRailTab === "people" ? "var(--acc2, #EEEDFD)" : "transparent",
                color: activeRailTab === "people" ? "var(--acc, #4F46E5)" : "var(--mut, #6C6E78)",
                position: "relative",
                transition: "0.15s",
                border: "none",
                cursor: "pointer",
              }}
            >
              <FiUserPlus size={20} />
              {activeRailTab === "people" && (
                <span
                  className="pip"
                  style={{
                    position: "absolute",
                    left: "-12px",
                    width: "4px",
                    height: "20px",
                    borderRadius: "0 4px 4px 0",
                    background: "var(--acc, #4F46E5)",
                  }}
                />
              )}
            </button>

            {/* Notifications Navigation Button */}
            <button
              type="button"
              className={`nb ${activeRailTab === "notifications" ? "on" : ""}`}
              onClick={() => handleTabChange("notifications")}
              title="Notifications"
              data-testid="header-notifications-btn"
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "12px",
                display: "grid",
                placeItems: "center",
                background: activeRailTab === "notifications" ? "var(--acc2, #EEEDFD)" : "transparent",
                color: activeRailTab === "notifications" ? "var(--acc, #4F46E5)" : "var(--mut, #6C6E78)",
                position: "relative",
                transition: "0.15s",
                border: "none",
                cursor: "pointer",
              }}
            >
              <FiBell size={20} />
              {unreadCount > 0 && (
                <span
                  data-testid="notification-badge"
                  style={{
                    position: "absolute",
                    top: "4px",
                    right: "4px",
                    background: "var(--acc, #4F46E5)",
                    color: "#fff",
                    fontSize: "10px",
                    fontWeight: "700",
                    padding: "0 5px",
                    borderRadius: "10px",
                    minWidth: "16px",
                    height: "16px",
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
              {activeRailTab === "notifications" && (
                <span
                  className="pip"
                  style={{
                    position: "absolute",
                    left: "-12px",
                    width: "4px",
                    height: "20px",
                    borderRadius: "0 4px 4px 0",
                    background: "var(--acc, #4F46E5)",
                  }}
                />
              )}
            </button>

            {/* Settings Navigation */}
            <button
              type="button"
              className={`nb ${activeRailTab === "settings" ? "on" : ""}`}
              onClick={() => handleTabChange("settings")}
              title="Settings & Preferences"
              data-testid="header-settings-btn"
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "12px",
                display: "grid",
                placeItems: "center",
                background: activeRailTab === "settings" ? "var(--acc2, #EEEDFD)" : "transparent",
                color: activeRailTab === "settings" ? "var(--acc, #4F46E5)" : "var(--mut, #6C6E78)",
                position: "relative",
                transition: "0.15s",
                border: "none",
                cursor: "pointer",
              }}
            >
              <FiSettings size={20} />
              {activeRailTab === "settings" && (
                <span
                  className="pip"
                  style={{
                    position: "absolute",
                    left: "-12px",
                    width: "4px",
                    height: "20px",
                    borderRadius: "0 4px 4px 0",
                    background: "var(--acc, #4F46E5)",
                  }}
                />
              )}
            </button>

            {/* Bottom Actions: Theme Toggle, Profile Avatar, Logout */}
            <div
              style={{
                marginTop: "auto",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "12px",
              }}
            >
              {/* Theme Toggle */}
              <button
                type="button"
                className="nb"
                onClick={toggleTheme}
                title="Toggle Theme"
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "12px",
                  display: "grid",
                  placeItems: "center",
                  color: "var(--mut, #6C6E78)",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                {themeMode === "dark" ? <FiSun size={18} /> : <FiMoon size={18} />}
              </button>

              {/* User Avatar with Profile Tab Selection */}
              <button
                type="button"
                className={`av ${activeRailTab === "profile" ? "on" : ""}`}
                onClick={() => handleTabChange("profile")}
                title="Profile & Account"
                data-testid="header-user-badge"
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "14px",
                  background: currentUser?.avatarImage ? "transparent" : "var(--acc, #4F46E5)",
                  color: "#fff",
                  display: "grid",
                  placeItems: "center",
                  fontWeight: "600",
                  position: "relative",
                  border: activeRailTab === "profile" ? "2px solid var(--acc, #4F46E5)" : "none",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                {currentUser?.avatarImage ? (
                  <img
                    src={
                      currentUser.avatarImage.startsWith("data:")
                        ? currentUser.avatarImage
                        : `data:image/svg+xml;base64,${currentUser.avatarImage}`
                    }
                    alt={currentUser.username}
                    style={{ width: "100%", height: "100%", borderRadius: "12px", objectFit: "cover" }}
                  />
                ) : (
                  userInitial
                )}
                <span
                  className="pr online"
                  style={{
                    position: "absolute",
                    bottom: "-1px",
                    right: "-1px",
                    width: "11px",
                    height: "11px",
                    borderRadius: "50%",
                    background: "var(--ok, #15803D)",
                    border: "2px solid var(--surf, #FFFFFF)",
                  }}
                />
              </button>

              {/* Logout button */}
              <Logout />
            </div>
          </aside>

          {/* Conversation Sidebar (330px) - Visible only in chat mode */}
          {!isPageMode && (
            <Sidebar
              contacts={contacts}
              currentChat={currentChat}
              onSelectChat={handleSelectChat}
              onOpenDiscovery={() => handleTabChange("people")}
            />
          )}
        </div>
      )}

      {/* MOBILE HEADER/SIDEBAR (When on mobile) */}
      {isMobile && !currentChat && !isPageMode && (
        <Sidebar
          contacts={contacts}
          currentChat={currentChat}
          onSelectChat={handleSelectChat}
          onOpenDiscovery={() => handleTabChange("people")}
        />
      )}

      {/* MAIN RIGHT CONTAINER */}
      {/* 1. DEDICATED FULL-PAGE VIEWS (when activeRailTab !== 'chats') */}
      {isPageMode && (
        <div
          style={{
            margin: isMobile ? 0 : "12px 12px 12px 12px",
            height: isMobile ? "100vh" : "calc(100vh - 24px)",
            borderRadius: isMobile ? 0 : "20px",
            background: "var(--surf, #FFFFFF)",
            border: isMobile ? "none" : "1px solid rgba(0, 0, 0, 0.08)",
            boxShadow: isMobile ? "none" : "0 8px 30px rgba(0, 0, 0, 0.07)",
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            display: "flex",
          }}
        >
          {activeRailTab === "people" && (
            <ContactsView
              onBack={() => handleTabChange("chats")}
              onSelectChat={handleSelectChat}
              onContactsUpdated={onContactsUpdated}
              contacts={contacts}
            />
          )}

          {activeRailTab === "notifications" && (
            <NotificationsView
              onBack={() => handleTabChange("chats")}
              socket={socket}
              onSelectChat={handleSelectChat}
            />
          )}

          {activeRailTab === "settings" && (
            <SettingsView onBack={() => handleTabChange("chats")} />
          )}

          {activeRailTab === "profile" && (
            <ProfileView onBack={() => handleTabChange("chats")} />
          )}
        </div>
      )}

      {/* 2. CHATS VIEW (Welcome Banner or Active Chat Container) */}
      {!isPageMode && (!isMobile || currentChat) && (
        <div
          style={{
            flex: 1,
            minWidth: 0,
            height: "100%",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {React.isValidElement(children)
            ? React.cloneElement(children, { onBackToSidebar: handleBackToSidebar })
            : children}
        </div>
      )}

      {/* Mobile Bottom Navigation Bar */}
      {isMobile && !currentChat && (
        <nav
          className="bn"
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            height: "56px",
            background: "var(--surf)",
            borderTop: "1px solid var(--line)",
            display: "flex",
            justifyContent: "space-around",
            alignItems: "center",
            zIndex: 20,
          }}
        >
          <button
            type="button"
            className={`nb ${activeRailTab === "chats" ? "on" : ""}`}
            onClick={() => handleTabChange("chats")}
            title="Chats"
          >
            <FiMessageSquare size={20} />
          </button>
          <button
            type="button"
            className={`nb ${activeRailTab === "people" ? "on" : ""}`}
            onClick={() => handleTabChange("people")}
            title="People"
          >
            <FiUserPlus size={20} />
          </button>
          <button
            type="button"
            className={`nb ${activeRailTab === "notifications" ? "on" : ""}`}
            onClick={() => handleTabChange("notifications")}
            title="Notifications"
          >
            <FiBell size={20} />
          </button>
          <button
            type="button"
            className={`nb ${activeRailTab === "settings" ? "on" : ""}`}
            onClick={() => handleTabChange("settings")}
            title="Settings"
          >
            <FiSettings size={20} />
          </button>
          <button
            type="button"
            className={`nb ${activeRailTab === "profile" ? "on" : ""}`}
            onClick={() => handleTabChange("profile")}
            title="Profile"
          >
            <div
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "50%",
                background: "var(--acc)",
                color: "#fff",
                display: "grid",
                placeItems: "center",
                fontSize: "12px",
              }}
            >
              {userInitial}
            </div>
          </button>
        </nav>
      )}
    </div>
  );
}
