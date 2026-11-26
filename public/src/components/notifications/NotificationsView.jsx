import React, { useState, useEffect, useCallback } from "react";
import styled from "styled-components";
import {
  FiArrowLeft,
  FiBell,
  FiCheck,
  FiCheckCircle,
  FiTrash2,
  FiMessageSquare,
  FiUserPlus,
  FiInbox,
  FiClock,
} from "react-icons/fi";
import apiClient from "../../services/apiClient";
import {
  v1NotificationsRoute,
  v1MarkAllNotificationsReadRoute,
  v1MarkNotificationReadRoute,
  v1DeleteNotificationRoute,
} from "../../services/apiRoutes";
import { toast } from "react-toastify";

export default function NotificationsView({ onBack, socket, onSelectChat }) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filter, setFilter] = useState("all"); // "all" | "unread" | "history"
  const [isLoading, setIsLoading] = useState(false);
  const [isMarkingAll, setIsMarkingAll] = useState(false);

  const fetchNotifications = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiClient.get(v1NotificationsRoute);
      if (res.data && res.data.success) {
        setNotifications(res.data.notifications || []);
        setUnreadCount(res.data.unreadCount || 0);
      }
    } catch (_) {
      toast.error("Failed to load notifications");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Listen to Socket.IO live notifications
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
    if (unreadCount === 0 || isMarkingAll) return;
    setIsMarkingAll(true);
    try {
      await apiClient.put(v1MarkAllNotificationsReadRoute);
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
      toast.success("All notifications marked as read and moved to history");

      if (socket && socket.current) {
        socket.current.emit("notification:mark_read", { markAll: true });
      }
    } catch (_) {
      toast.error("Failed to mark notifications read");
    } finally {
      setIsMarkingAll(false);
    }
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
      toast.info("Notification removed");
    } catch (_) {
      toast.error("Failed to delete notification");
    }
  };

  const handleNotificationClick = (n) => {
    handleMarkAsRead(n);
    if (n.conversationId && onSelectChat) {
      onSelectChat({
        _id: n.sender?._id || n.sender,
        conversationId: n.conversationId,
      });
      onBack();
    }
  };

  const unreadNotifications = notifications.filter((n) => !n.isRead);
  const historyNotifications = notifications.filter((n) => n.isRead);

  const formatTimestamp = (dateStr) => {
    if (!dateStr) return "";
    try {
      const d = new Date(dateStr);
      const now = new Date();
      if (d.toDateString() === now.toDateString()) {
        return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      }
      return d.toLocaleDateString([], { month: "short", day: "numeric" });
    } catch (_) {
      return "";
    }
  };

  const renderNotificationCard = (n) => {
    const isMsg = (n.title || "").toLowerCase().includes("message");
    const isContact = (n.title || "").toLowerCase().includes("contact");
    return (
      <NotificationCard
        key={n._id}
        className={!n.isRead ? "unread" : "read"}
        onClick={() => handleNotificationClick(n)}
      >
        <IconBadge className={isMsg ? "msg" : isContact ? "contact" : "system"}>
          {isMsg ? (
            <FiMessageSquare size={18} />
          ) : isContact ? (
            <FiUserPlus size={18} />
          ) : (
            <FiBell size={18} />
          )}
        </IconBadge>

        <CardContent>
          <CardHeader>
            <CardTitle>{n.title}</CardTitle>
            <TimeBadge>{formatTimestamp(n.createdAt)}</TimeBadge>
          </CardHeader>
          <CardBody>{n.body}</CardBody>
        </CardContent>

        <CardActions onClick={(e) => e.stopPropagation()}>
          {!n.isRead && (
            <MarkReadMiniBtn
              type="button"
              onClick={(e) => handleMarkAsRead(n, e)}
              title="Mark as read"
            >
              <FiCheck size={16} />
            </MarkReadMiniBtn>
          )}
          <DeleteMiniBtn
            type="button"
            onClick={(e) => handleDelete(n._id, e)}
            title="Remove notification"
          >
            <FiTrash2 size={16} />
          </DeleteMiniBtn>
        </CardActions>
      </NotificationCard>
    );
  };

  return (
    <PageContainer>
      <HeaderBar>
        <BackButton onClick={onBack} title="Back to conversations">
          <FiArrowLeft size={18} />
          <span>Back to Chats</span>
        </BackButton>
        <HeaderTitleGroup>
          <h2>Notifications</h2>
          <p>Stay up to date with direct messages, mentions, and invitations</p>
        </HeaderTitleGroup>
      </HeaderBar>

      <ActionBarContainer>
        <TabsRow>
          <FilterTab
            type="button"
            className={filter === "all" ? "active" : ""}
            onClick={() => setFilter("all")}
          >
            All Alerts ({notifications.length})
          </FilterTab>
          <FilterTab
            type="button"
            className={filter === "unread" ? "active" : ""}
            onClick={() => setFilter("unread")}
          >
            Unread ({unreadNotifications.length})
          </FilterTab>
          <FilterTab
            type="button"
            className={filter === "history" ? "active" : ""}
            onClick={() => setFilter("history")}
          >
            <FiClock size={14} style={{ marginRight: "4px" }} />
            History ({historyNotifications.length})
          </FilterTab>
        </TabsRow>

        {unreadNotifications.length > 0 && (
          <MarkAllBtn type="button" onClick={handleMarkAllAsRead} disabled={isMarkingAll}>
            <FiCheckCircle size={15} />
            <span>Mark all as read</span>
          </MarkAllBtn>
        )}
      </ActionBarContainer>

      <ContentScroll>
        <ListWrapper>
          {isLoading ? (
            <EmptyBox>Loading notifications...</EmptyBox>
          ) : notifications.length === 0 ? (
            <EmptyBox>
              <EmptyIconBox>
                <FiInbox size={36} />
              </EmptyIconBox>
              <h3>You're all caught up!</h3>
              <p>No notifications found in your account.</p>
            </EmptyBox>
          ) : (
            <>
              {/* FILTER: UNREAD ONLY */}
              {filter === "unread" && (
                <>
                  <SectionTitleBar>
                    <FiBell size={16} color="var(--acc)" />
                    <h4>Unread Notifications ({unreadNotifications.length})</h4>
                  </SectionTitleBar>
                  {unreadNotifications.length === 0 ? (
                    <EmptyBox>
                      <EmptyIconBox>
                        <FiCheckCircle size={36} color="var(--ok)" />
                      </EmptyIconBox>
                      <h3>No unread notifications</h3>
                      <p>All notifications have been marked as read and moved to History.</p>
                    </EmptyBox>
                  ) : (
                    <NotificationsList>
                      {unreadNotifications.map(renderNotificationCard)}
                    </NotificationsList>
                  )}
                </>
              )}

              {/* FILTER: HISTORY ONLY */}
              {filter === "history" && (
                <>
                  <SectionTitleBar>
                    <FiClock size={16} color="var(--mut)" />
                    <h4>Notification History ({historyNotifications.length})</h4>
                  </SectionTitleBar>
                  {historyNotifications.length === 0 ? (
                    <EmptyBox>
                      <EmptyIconBox>
                        <FiClock size={36} />
                      </EmptyIconBox>
                      <h3>No notification history</h3>
                      <p>Read notifications will be archived here.</p>
                    </EmptyBox>
                  ) : (
                    <NotificationsList>
                      {historyNotifications.map(renderNotificationCard)}
                    </NotificationsList>
                  )}
                </>
              )}

              {/* FILTER: ALL (SHOWS UNREAD SECTION + DEDICATED HISTORY SECTION) */}
              {filter === "all" && (
                <>
                  {/* UNREAD SECTION (If any exist) */}
                  {unreadNotifications.length > 0 && (
                    <SectionGroup>
                      <SectionTitleBar>
                        <FiBell size={16} color="var(--acc)" />
                        <h4>New &amp; Unread ({unreadNotifications.length})</h4>
                      </SectionTitleBar>
                      <NotificationsList>
                        {unreadNotifications.map(renderNotificationCard)}
                      </NotificationsList>
                    </SectionGroup>
                  )}

                  {/* CAUGHT UP BANNER (When all are read) */}
                  {unreadNotifications.length === 0 && historyNotifications.length > 0 && (
                    <CaughtUpBanner>
                      <FiCheckCircle size={18} color="var(--ok, #15803D)" />
                      <span>All notifications are read and archived in your History below.</span>
                    </CaughtUpBanner>
                  )}

                  {/* DEDICATED HISTORY SECTION */}
                  <SectionGroup>
                    <SectionTitleBar>
                      <FiClock size={16} color="var(--mut)" />
                      <h4>Notification History ({historyNotifications.length})</h4>
                    </SectionTitleBar>
                    {historyNotifications.length === 0 ? (
                      <EmptyHistoryNote>
                        No past notifications in history yet. When you mark notifications as read, they will appear here.
                      </EmptyHistoryNote>
                    ) : (
                      <NotificationsList>
                        {historyNotifications.map(renderNotificationCard)}
                      </NotificationsList>
                    )}
                  </SectionGroup>
                </>
              )}
            </>
          )}
        </ListWrapper>
      </ContentScroll>
    </PageContainer>
  );
}

const PageContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  background: var(--bg, #F5F4F0);
  overflow: hidden;
`;

const HeaderBar = styled.div`
  padding: 1.25rem 2rem;
  background: var(--surf, #FFFFFF);
  border-bottom: 1px solid var(--line, rgba(0, 0, 0, 0.08));
  display: flex;
  align-items: center;
  gap: 1.5rem;
  flex-shrink: 0;
`;

const BackButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border-radius: 10px;
  background: var(--s2, #FAF9F6);
  border: 1px solid var(--line, rgba(0, 0, 0, 0.08));
  color: var(--ink, #0F172A);
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease-in-out;

  &:hover {
    background: var(--acc2, #EEEDFD);
    color: var(--acc, #4F46E5);
    border-color: var(--acc, #4F46E5);
  }
`;

const HeaderTitleGroup = styled.div`
  h2 {
    font-size: 1.35rem;
    font-weight: 700;
    color: var(--ink, #0F172A);
    margin: 0;
    letter-spacing: -0.3px;
  }
  p {
    font-size: 0.85rem;
    color: var(--mut, #64748B);
    margin: 2px 0 0 0;
  }
`;

const ActionBarContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.85rem 2rem;
  background: var(--surf, #FFFFFF);
  border-bottom: 1px solid var(--line, rgba(0, 0, 0, 0.08));
  flex-wrap: wrap;
  gap: 0.75rem;
`;

const TabsRow = styled.div`
  display: flex;
  gap: 0.5rem;
`;

const FilterTab = styled.button`
  display: inline-flex;
  align-items: center;
  padding: 0.45rem 1rem;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 600;
  border: 1px solid transparent;
  background: transparent;
  color: var(--mut, #64748B);
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: var(--s2, #FAF9F6);
    color: var(--ink, #0F172A);
  }

  &.active {
    background: var(--acc2, #EEEDFD);
    color: var(--acc, #4F46E5);
    border-color: rgba(79, 70, 229, 0.15);
  }
`;

const MarkAllBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.45rem 0.95rem;
  border-radius: 8px;
  font-size: 0.82rem;
  font-weight: 600;
  background: var(--s2, #FAF9F6);
  border: 1px solid var(--line, rgba(0, 0, 0, 0.08));
  color: var(--acc, #4F46E5);
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover:not(:disabled) {
    background: var(--acc2, #EEEDFD);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const ContentScroll = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 2rem;

  @media (max-width: 768px) {
    padding: 1rem;
  }
`;

const ListWrapper = styled.div`
  max-width: 860px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 1.75rem;
`;

const SectionGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
`;

const SectionTitleBar = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.25rem;

  h4 {
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--ink, #0F172A);
    margin: 0;
  }
`;

const CaughtUpBanner = styled.div`
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.85rem 1.25rem;
  background: rgba(21, 128, 61, 0.08);
  border: 1px solid rgba(21, 128, 61, 0.18);
  border-radius: 12px;
  color: var(--ok, #15803D);
  font-size: 0.88rem;
  font-weight: 500;
`;

const EmptyHistoryNote = styled.div`
  padding: 1.5rem;
  background: var(--surf, #FFFFFF);
  border: 1px dashed var(--line, rgba(0, 0, 0, 0.12));
  border-radius: 12px;
  color: var(--mut, #64748B);
  font-size: 0.85rem;
  text-align: center;
`;

const NotificationsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
`;

const NotificationCard = styled.div`
  background: var(--surf, #FFFFFF);
  border: 1px solid var(--line, rgba(0, 0, 0, 0.08));
  border-radius: 14px;
  padding: 1.15rem 1.35rem;
  display: flex;
  align-items: center;
  gap: 1.15rem;
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.02);
  transition: all 0.15s ease-in-out;
  position: relative;

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.04);
    border-color: var(--line, rgba(0, 0, 0, 0.15));
  }

  &.unread {
    background: #FAFAFE;
    border-left: 4px solid var(--acc, #4F46E5);

    &::after {
      content: "";
      position: absolute;
      top: 14px;
      right: 14px;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--acc, #4F46E5);
    }
  }

  &.read {
    opacity: 0.88;

    &:hover {
      opacity: 1;
    }
  }
`;

const IconBadge = styled.div`
  width: 42px;
  height: 42px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  &.msg {
    background: var(--acc2, #EEEDFD);
    color: var(--acc, #4F46E5);
  }
  &.contact {
    background: rgba(16, 185, 129, 0.1);
    color: #10B981;
  }
  &.system {
    background: rgba(245, 158, 11, 0.1);
    color: #F59E0B;
  }
`;

const CardContent = styled.div`
  flex: 1;
  min-width: 0;
`;

const CardHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.25rem;
`;

const CardTitle = styled.h4`
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--ink, #0F172A);
  margin: 0;
`;

const TimeBadge = styled.span`
  font-size: 0.75rem;
  color: var(--mut, #64748B);
`;

const CardBody = styled.p`
  font-size: 0.85rem;
  color: var(--mut, #64748B);
  margin: 0;
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const CardActions = styled.div`
  display: flex;
  align-items: center;
  gap: 0.4rem;
`;

const MarkReadMiniBtn = styled.button`
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--s2, #FAF9F6);
  border: 1px solid var(--line, rgba(0, 0, 0, 0.08));
  color: var(--mut, #64748B);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    color: var(--acc, #4F46E5);
    border-color: var(--acc, #4F46E5);
  }
`;

const DeleteMiniBtn = styled.button`
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--s2, #FAF9F6);
  border: 1px solid var(--line, rgba(0, 0, 0, 0.08));
  color: var(--mut, #64748B);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    color: #DC2626;
    border-color: #DC2626;
  }
`;

const EmptyBox = styled.div`
  padding: 4rem 2rem;
  text-align: center;
  color: var(--mut, #64748B);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;

  h3 {
    margin: 0;
    color: var(--ink, #0F172A);
    font-size: 1.2rem;
  }
  p {
    margin: 0;
    font-size: 0.9rem;
  }
`;

const EmptyIconBox = styled.div`
  width: 64px;
  height: 64px;
  border-radius: 20px;
  background: var(--surf, #FFFFFF);
  border: 1px solid var(--line, rgba(0, 0, 0, 0.08));
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--acc, #4F46E5);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
  margin-bottom: 0.5rem;
`;
