import React, { useState, useEffect, useRef } from "react";
import styled from "styled-components";
import { BiBell, BiCheckDouble, BiTrash, BiEnvelope } from "react-icons/bi";
import apiClient from "../../services/apiClient";
import {
  v1NotificationsRoute,
  v1UnreadNotificationsCountRoute,
  v1MarkAllNotificationsReadRoute,
  v1MarkNotificationReadRoute,
  v1DeleteNotificationRoute,
} from "../../services/apiRoutes";
import { theme } from "../../styles/theme";

export default function NotificationDropdown({ socket, onSelectChat }) {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef(null);

  // Load unread count on mount
  useEffect(() => {
    let isMounted = true;

    async function fetchUnreadCount() {
      try {
        const res = await apiClient.get(v1UnreadNotificationsCountRoute);
        if (isMounted && res.data && res.data.success) {
          setUnreadCount(res.data.unreadCount || 0);
        }
      } catch (_) {}
    }

    fetchUnreadCount();

    return () => {
      isMounted = false;
    };
  }, []);

  // Listen to Socket.IO notification events
  useEffect(() => {
    if (!socket || !socket.current) return;
    const s = socket.current;

    const handleNewNotification = (notification) => {
      setNotifications((prev) => [notification, ...prev]);
      setUnreadCount((prev) => prev + 1);
    };

    const handleCountUpdate = (data) => {
      if (typeof data?.unreadCount === "number") {
        setUnreadCount(data.unreadCount);
      }
    };

    s.on("notification:new", handleNewNotification);
    s.on("notification:count", handleCountUpdate);

    return () => {
      s.off("notification:new", handleNewNotification);
      s.off("notification:count", handleCountUpdate);
    };
  }, [socket]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const loadNotifications = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get(v1NotificationsRoute);
      if (res.data && res.data.success) {
        setNotifications(res.data.notifications || []);
        setUnreadCount(res.data.unreadCount || 0);
      }
    } catch (_) {
    } finally {
      setLoading(false);
    }
  };

  const toggleDropdown = () => {
    const nextState = !isOpen;
    setIsOpen(nextState);
    if (nextState) {
      loadNotifications();
    }
  };

  const handleMarkAsRead = async (notification, e) => {
    if (e) e.stopPropagation();
    if (notification.isRead) return;

    try {
      await apiClient.put(v1MarkNotificationReadRoute(notification._id));
      setNotifications((prev) =>
        prev.map((n) =>
          n._id === notification._id ? { ...n, isRead: true } : n
        )
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));

      if (socket && socket.current) {
        socket.current.emit("notification:mark_read", { notificationId: notification._id });
      }
    } catch (_) {}
  };

  const handleMarkAllAsRead = async () => {
    try {
      await apiClient.put(v1MarkAllNotificationsReadRoute);
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);

      if (socket && socket.current) {
        socket.current.emit("notification:mark_read", { markAll: true });
      }
    } catch (_) {}
  };

  const handleDelete = async (id, e) => {
    if (e) e.stopPropagation();
    try {
      await apiClient.delete(v1DeleteNotificationRoute(id));
      const target = notifications.find((n) => n._id === id);
      if (target && !target.isRead) {
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
      setNotifications((prev) => prev.filter((n) => n._id !== id));
    } catch (_) {}
  };

  const handleNotificationClick = (n) => {
    handleMarkAsRead(n);
    if (n.conversationId && onSelectChat) {
      onSelectChat({ _id: n.sender?._id || n.sender, conversationId: n.conversationId });
      setIsOpen(false);
    }
  };

  return (
    <Container ref={dropdownRef}>
      <BellButton
        onClick={toggleDropdown}
        title="Notifications"
        data-testid="header-notifications-btn"
        aria-label="Notifications"
      >
        <BiBell />
        {unreadCount > 0 && (
          <Badge data-testid="notification-badge">
            {unreadCount > 99 ? "99+" : unreadCount}
          </Badge>
        )}
      </BellButton>

      {isOpen && (
        <DropdownPanel data-testid="notification-dropdown">
          <PanelHeader>
            <HeaderTitle>Notifications</HeaderTitle>
            {unreadCount > 0 && (
              <MarkAllButton onClick={handleMarkAllAsRead} data-testid="mark-all-read-btn">
                <BiCheckDouble /> Mark all read
              </MarkAllButton>
            )}
          </PanelHeader>

          <ListBody>
            {loading ? (
              <EmptyText>Loading notifications...</EmptyText>
            ) : notifications.length === 0 ? (
              <EmptyState>
                <BiEnvelope size={32} />
                <EmptyText>No notifications yet</EmptyText>
              </EmptyState>
            ) : (
              notifications.map((n) => (
                <NotificationItem
                  key={n._id}
                  isRead={n.isRead}
                  onClick={() => handleNotificationClick(n)}
                  data-testid="notification-item"
                >
                  <ItemContent>
                    <ItemTitle>{n.title}</ItemTitle>
                    <ItemBody>{n.body}</ItemBody>
                    <ItemTime>
                      {n.createdAt ? new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ""}
                    </ItemTime>
                  </ItemContent>
                  <ItemActions>
                    {!n.isRead && (
                      <ActionBtn
                        title="Mark as read"
                        onClick={(e) => handleMarkAsRead(n, e)}
                        data-testid="mark-read-item-btn"
                      >
                        <BiCheckDouble />
                      </ActionBtn>
                    )}
                    <ActionBtn
                      title="Delete"
                      onClick={(e) => handleDelete(n._id, e)}
                      data-testid="delete-notification-btn"
                    >
                      <BiTrash />
                    </ActionBtn>
                  </ItemActions>
                </NotificationItem>
              ))
            )}
          </ListBody>
        </DropdownPanel>
      )}
    </Container>
  );
}

const Container = styled.div`
  position: relative;
  display: inline-block;
`;

const BellButton = styled.button`
  position: relative;
  background: transparent;
  border: none;
  color: ${theme.colors.textSecondary};
  font-size: 1.25rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.5rem;
  border-radius: ${theme.borderRadius.md};
  transition: ${theme.transitions.default};

  &:hover {
    background: ${theme.colors.bgCardHover};
    color: ${theme.colors.textPrimary};
  }
`;

const Badge = styled.span`
  position: absolute;
  top: 0.2rem;
  right: 0.2rem;
  background: ${theme.colors.primary};
  color: #ffffff;
  font-size: 0.65rem;
  font-weight: 700;
  padding: 0.1rem 0.35rem;
  border-radius: 9999px;
  min-width: 1rem;
  text-align: center;
  line-height: 1.2;
`;

const DropdownPanel = styled.div`
  position: absolute;
  top: 0;
  left: calc(100% + 14px);
  width: 22rem;
  max-height: 26rem;
  background-color: var(--surf, #FFFFFF);
  border: 1px solid var(--line, #E7E5DF);
  border-radius: 16px;
  box-shadow: var(--sh, 0 10px 25px rgba(0, 0, 0, 0.2));
  display: flex;
  flex-direction: column;
  z-index: 100;
  overflow: hidden;
  animation: popin 0.2s cubic-bezier(0.2, 0.9, 0.3, 1.1);

  @media (max-width: 860px) {
    position: fixed;
    top: 60px;
    left: 12px;
    right: 12px;
    width: auto;
  }
`;

const PanelHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.85rem 1.15rem;
  border-bottom: 1px solid ${theme.colors.border};
  background: ${theme.colors.bgHeader};
`;

const HeaderTitle = styled.h4`
  color: ${theme.colors.textPrimary};
  font-size: 0.95rem;
  font-weight: 600;
  margin: 0;
`;

const MarkAllButton = styled.button`
  background: transparent;
  border: none;
  color: ${theme.colors.primaryLight};
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  border-radius: ${theme.borderRadius.sm};
  transition: ${theme.transitions.default};

  &:hover {
    color: #ffffff;
    background: rgba(255, 255, 255, 0.08);
  }
`;

const ListBody = styled.div`
  flex: 1;
  overflow-y: auto;
  max-height: 20rem;
`;

const NotificationItem = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid ${theme.colors.border};
  background-color: ${(props) => (props.isRead ? "transparent" : "rgba(217, 139, 112, 0.1)")};
  cursor: pointer;
  transition: ${theme.transitions.default};

  &:hover {
    background-color: ${theme.colors.bgCardHover};
  }
`;

const ItemContent = styled.div`
  flex: 1;
  min-width: 0;
`;

const ItemTitle = styled.div`
  color: ${theme.colors.textPrimary};
  font-size: 0.85rem;
  font-weight: 600;
  margin-bottom: 0.15rem;
`;

const ItemBody = styled.div`
  color: ${theme.colors.textSecondary};
  font-size: 0.78rem;
  line-height: 1.35;
  word-break: break-word;
  white-space: pre-wrap;
`;

const ItemTime = styled.div`
  color: ${theme.colors.textMuted};
  font-size: 0.68rem;
  margin-top: 0.3rem;
`;

const ItemActions = styled.div`
  display: flex;
  align-items: center;
  gap: 0.25rem;
  margin-left: 0.5rem;
`;

const ActionBtn = styled.button`
  background: transparent;
  border: none;
  color: ${theme.colors.textMuted};
  font-size: 1rem;
  cursor: pointer;
  padding: 0.25rem;
  border-radius: ${theme.borderRadius.sm};
  display: flex;
  align-items: center;
  transition: ${theme.transitions.default};

  &:hover {
    color: ${theme.colors.textPrimary};
    background: ${theme.colors.bgCardHover};
  }
`;

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2.5rem 1rem;
  color: ${theme.colors.textMuted};
  gap: 0.5rem;
`;

const EmptyText = styled.p`
  color: ${theme.colors.textMuted};
  font-size: 0.85rem;
  text-align: center;
  margin: 0;
`;
