import React, { useState, useEffect, useCallback } from "react";
import styled from "styled-components";
import {
  FiArrowLeft,
  FiSearch,
  FiUserPlus,
  FiInbox,
  FiUsers,
  FiCheck,
  FiX,
  FiMessageSquare,
  FiClock,
} from "react-icons/fi";
import Avatar from "../common/Avatar";
import apiClient from "../../services/apiClient";
import {
  v1SearchUsersRoute,
  v1ContactRequestsRoute,
  v1SendContactRequestRoute,
  v1AcceptContactRequestRoute,
  v1RejectContactRequestRoute,
  v1CancelContactRequestRoute,
} from "../../services/apiRoutes";
import { toast } from "react-toastify";

export default function ContactsView({
  onBack,
  onSelectChat,
  onContactsUpdated,
  contacts = [],
}) {
  const [activeTab, setActiveTab] = useState("discover"); // "discover" | "requests" | "contacts"
  const [searchQuery, setSearchQuery] = useState("");
  const [users, setUsers] = useState([]);
  const [requests, setRequests] = useState({ incoming: [], outgoing: [] });
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1, limit: 10 });
  const [isLoading, setIsLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  // Fetch users for discovery
  const fetchUsers = useCallback(async (targetPage = 1, query = "") => {
    setIsLoading(true);
    try {
      const res = await apiClient.get(v1SearchUsersRoute, {
        params: { q: query, page: targetPage, limit: 12 },
      });
      if (res.data && res.data.success) {
        setUsers(res.data.users || []);
        setPagination(res.data.pagination || { total: 0, totalPages: 1, limit: 12 });
        setPage(targetPage);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to search users");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch incoming & outgoing contact requests
  const fetchRequests = useCallback(async () => {
    try {
      const res = await apiClient.get(v1ContactRequestsRoute);
      if (res.data && res.data.success) {
        setRequests({
          incoming: res.data.incoming || [],
          outgoing: res.data.outgoing || [],
        });
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    if (activeTab === "discover") {
      fetchUsers(1, searchQuery);
    }
    fetchRequests();
  }, [activeTab, fetchUsers, fetchRequests, searchQuery]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchUsers(1, searchQuery);
  };

  const handleSendRequest = async (targetUserId) => {
    setActionLoadingId(targetUserId);
    try {
      const res = await apiClient.post(v1SendContactRequestRoute, { recipientId: targetUserId });
      if (res.data && res.data.success) {
        toast.success("Contact request sent");
        setUsers((prev) =>
          prev.map((u) =>
            u._id === targetUserId
              ? { ...u, relationship: "PENDING_SENT", requestId: res.data.request?._id }
              : u
          )
        );
        if (onContactsUpdated) onContactsUpdated();
      }
    } catch (err) {
      const msg =
        err.response?.data?.error?.message ||
        err.response?.data?.message ||
        err.message ||
        "Failed to send request";
      toast.error(msg);
      console.error("[ContactsView] Error sending contact request:", err);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleAcceptRequest = async (requestId, requesterId) => {
    setActionLoadingId(requestId);
    try {
      const res = await apiClient.post(v1AcceptContactRequestRoute(requestId));
      if (res.data && res.data.success) {
        toast.success("Contact request accepted!");
        setRequests((prev) => ({
          ...prev,
          incoming: prev.incoming.filter((r) => r._id !== requestId),
        }));
        setUsers((prev) =>
          prev.map((u) =>
            u._id === requesterId ? { ...u, relationship: "CONTACT" } : u
          )
        );
        if (onContactsUpdated) onContactsUpdated();
      }
    } catch (err) {
      const msg =
        err.response?.data?.error?.message ||
        err.response?.data?.message ||
        err.message ||
        "Failed to accept request";
      toast.error(msg);
      console.error("[ContactsView] Error accepting contact request:", err);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRejectRequest = async (requestId) => {
    setActionLoadingId(requestId);
    try {
      const res = await apiClient.post(v1RejectContactRequestRoute(requestId));
      if (res.data && res.data.success) {
        toast.info("Request rejected");
        setRequests((prev) => ({
          ...prev,
          incoming: prev.incoming.filter((r) => r._id !== requestId),
        }));
      }
    } catch (err) {
      const msg =
        err.response?.data?.error?.message ||
        err.response?.data?.message ||
        err.message ||
        "Failed to reject request";
      toast.error(msg);
      console.error("[ContactsView] Error rejecting contact request:", err);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleCancelRequest = async (requestId, recipientId) => {
    setActionLoadingId(requestId);
    try {
      const res = await apiClient.delete(v1CancelContactRequestRoute(requestId));
      if (res.data && res.data.success) {
        toast.info("Request canceled");
        setRequests((prev) => ({
          ...prev,
          outgoing: prev.outgoing.filter((r) => r._id !== requestId),
        }));
        setUsers((prev) =>
          prev.map((u) =>
            u._id === recipientId ? { ...u, relationship: "NONE", requestId: null } : u
          )
        );
      }
    } catch (err) {
      const msg =
        err.response?.data?.error?.message ||
        err.response?.data?.message ||
        err.message ||
        "Failed to cancel request";
      toast.error(msg);
      console.error("[ContactsView] Error canceling contact request:", err);
    } finally {
      setActionLoadingId(null);
    }
  };

  const incomingCount = requests.incoming?.length || 0;

  return (
    <PageContainer>
      {/* Top Header */}
      <HeaderBar>
        <BackButton onClick={onBack} title="Back to conversations">
          <FiArrowLeft size={18} />
          <span>Back to Chats</span>
        </BackButton>
        <HeaderTitleGroup>
          <h2>People & Contacts</h2>
          <p>Find teammates, manage incoming requests, and connect directly</p>
        </HeaderTitleGroup>
      </HeaderBar>

      {/* Tabs Bar */}
      <TabBarContainer>
        <TabButton
          type="button"
          className={activeTab === "discover" ? "active" : ""}
          onClick={() => setActiveTab("discover")}
        >
          <FiSearch size={16} />
          <span>Discover People</span>
        </TabButton>

        <TabButton
          type="button"
          className={activeTab === "requests" ? "active" : ""}
          onClick={() => setActiveTab("requests")}
        >
          <FiInbox size={16} />
          <span>Contact Requests</span>
          {incomingCount > 0 && <TabBadge>{incomingCount}</TabBadge>}
        </TabButton>

        <TabButton
          type="button"
          className={activeTab === "contacts" ? "active" : ""}
          onClick={() => setActiveTab("contacts")}
        >
          <FiUsers size={16} />
          <span>My Contacts ({contacts.length})</span>
        </TabButton>
      </TabBarContainer>

      {/* Main Content Area */}
      <ContentScroll>
        <ContentWrapper>
          {/* TAB 1: DISCOVER PEOPLE */}
          {activeTab === "discover" && (
            <SectionArea>
              {/* Search Bar */}
              <SearchForm onSubmit={handleSearchSubmit}>
                <SearchInputWrapper>
                  <FiSearch size={18} className="search-icon" />
                  <SearchInput
                    type="text"
                    placeholder="Search people by username or name..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  {searchQuery && (
                    <ClearButton
                      type="button"
                      onClick={() => {
                        setSearchQuery("");
                        fetchUsers(1, "");
                      }}
                    >
                      <FiX size={16} />
                    </ClearButton>
                  )}
                </SearchInputWrapper>
                <SearchSubmitBtn type="submit" disabled={isLoading}>
                  Search
                </SearchSubmitBtn>
              </SearchForm>

              {/* Grid of Discovered Users */}
              {isLoading ? (
                <EmptyBox>Searching ConnectX network...</EmptyBox>
              ) : users.length === 0 ? (
                <EmptyBox>
                  <FiUsers size={32} />
                  <h4>No people found</h4>
                  <p>Try searching with another username or name</p>
                </EmptyBox>
              ) : (
                <UsersGrid>
                  {users.map((u) => {
                    const isActionLoading = actionLoadingId === u._id || actionLoadingId === u.requestId;
                    return (
                      <UserCard key={u._id}>
                        <Avatar
                          image={u.avatarImage}
                          name={u.displayName || u.username}
                          size="lg"
                          isOnline={u.isOnline}
                          showStatus={true}
                        />
                        <UserInfo>
                          <UserName>{u.displayName || u.username}</UserName>
                          <UserHandle>@{u.username}</UserHandle>
                          {u.bio && <UserBio>{u.bio}</UserBio>}
                        </UserInfo>

                        <CardActions>
                          {u.relationship === "CONTACT" ? (
                            <ConnectedButton
                              type="button"
                              onClick={() => {
                                if (onSelectChat) onSelectChat(u);
                                onBack();
                              }}
                            >
                              <FiMessageSquare size={14} /> Message
                            </ConnectedButton>
                          ) : u.relationship === "PENDING_SENT" ? (
                            <PendingButton
                              type="button"
                              disabled={isActionLoading}
                              onClick={() => handleCancelRequest(u.requestId, u._id)}
                            >
                              <FiClock size={14} /> Pending (Cancel)
                            </PendingButton>
                          ) : u.relationship === "PENDING_RECEIVED" ? (
                            <AcceptButton
                              type="button"
                              disabled={isActionLoading}
                              onClick={() => handleAcceptRequest(u.requestId, u._id)}
                            >
                              <FiCheck size={14} /> {isActionLoading ? "Accepting..." : "Accept Request"}
                            </AcceptButton>
                          ) : (
                            <ConnectButton
                              type="button"
                              disabled={isActionLoading}
                              onClick={() => handleSendRequest(u._id)}
                            >
                              <FiUserPlus size={14} /> {isActionLoading ? "Connecting..." : "Connect"}
                            </ConnectButton>
                          )}
                        </CardActions>
                      </UserCard>
                    );
                  })}
                </UsersGrid>
              )}

              {/* Pagination controls */}
              {pagination.totalPages > 1 && (
                <PaginationBar>
                  <PageBtn
                    disabled={page <= 1 || isLoading}
                    onClick={() => fetchUsers(page - 1, searchQuery)}
                  >
                    Previous
                  </PageBtn>
                  <PageText>
                    Page {page} of {pagination.totalPages}
                  </PageText>
                  <PageBtn
                    disabled={page >= pagination.totalPages || isLoading}
                    onClick={() => fetchUsers(page + 1, searchQuery)}
                  >
                    Next
                  </PageBtn>
                </PaginationBar>
              )}
            </SectionArea>
          )}

          {/* TAB 2: CONTACT REQUESTS */}
          {activeTab === "requests" && (
            <SectionArea>
              {/* Incoming Requests */}
              <SubSection>
                <SubSectionTitle>
                  Incoming Invitations ({requests.incoming?.length || 0})
                </SubSectionTitle>
                {requests.incoming?.length === 0 ? (
                  <EmptyNote>No pending invitations at this moment.</EmptyNote>
                ) : (
                  <RequestsList>
                    {requests.incoming.map((r) => {
                      const sender = r.requester || {};
                      const isActing = actionLoadingId === r._id;
                      return (
                        <RequestCard key={r._id}>
                          <Avatar
                            image={sender.avatarImage}
                            name={sender.displayName || sender.username}
                            size="md"
                          />
                          <ReqDetails>
                            <ReqName>{sender.displayName || sender.username}</ReqName>
                            <ReqHandle>@{sender.username}</ReqHandle>
                          </ReqDetails>
                          <ReqActions>
                            <AcceptMiniBtn
                              disabled={isActing}
                              onClick={() => handleAcceptRequest(r._id, sender._id)}
                            >
                              <FiCheck size={16} /> Accept
                            </AcceptMiniBtn>
                            <RejectMiniBtn
                              disabled={isActing}
                              onClick={() => handleRejectRequest(r._id)}
                            >
                              <FiX size={16} /> Decline
                            </RejectMiniBtn>
                          </ReqActions>
                        </RequestCard>
                      );
                    })}
                  </RequestsList>
                )}
              </SubSection>

              {/* Outgoing Requests */}
              <SubSection>
                <SubSectionTitle>
                  Sent Requests ({requests.outgoing?.length || 0})
                </SubSectionTitle>
                {requests.outgoing?.length === 0 ? (
                  <EmptyNote>You haven't sent any pending invitations.</EmptyNote>
                ) : (
                  <RequestsList>
                    {requests.outgoing.map((r) => {
                      const recipient = r.recipient || {};
                      const isActing = actionLoadingId === r._id;
                      return (
                        <RequestCard key={r._id}>
                          <Avatar
                            image={recipient.avatarImage}
                            name={recipient.displayName || recipient.username}
                            size="md"
                          />
                          <ReqDetails>
                            <ReqName>{recipient.displayName || recipient.username}</ReqName>
                            <ReqHandle>@{recipient.username}</ReqHandle>
                          </ReqDetails>
                          <ReqActions>
                            <CancelMiniBtn
                              disabled={isActing}
                              onClick={() => handleCancelRequest(r._id, recipient._id)}
                            >
                              Cancel Request
                            </CancelMiniBtn>
                          </ReqActions>
                        </RequestCard>
                      );
                    })}
                  </RequestsList>
                )}
              </SubSection>
            </SectionArea>
          )}

          {/* TAB 3: MY CONTACTS */}
          {activeTab === "contacts" && (
            <SectionArea>
              {contacts.length === 0 ? (
                <EmptyBox>
                  <FiUsers size={32} />
                  <h4>No contacts added yet</h4>
                  <p>Discover people in ConnectX and send them a connection invite!</p>
                </EmptyBox>
              ) : (
                <UsersGrid>
                  {contacts.map((c) => (
                    <UserCard key={c._id || c.id}>
                      <Avatar
                        image={c.avatarImage}
                        name={c.displayName || c.username}
                        size="lg"
                        isOnline={c.isOnline}
                        showStatus={true}
                      />
                      <UserInfo>
                        <UserName>{c.displayName || c.username}</UserName>
                        <UserHandle>@{c.username}</UserHandle>
                        {c.statusMessage && <UserBio>{c.statusMessage}</UserBio>}
                      </UserInfo>
                      <CardActions>
                        <ConnectedButton
                          type="button"
                          onClick={() => {
                            if (onSelectChat) onSelectChat(c);
                            onBack();
                          }}
                        >
                          <FiMessageSquare size={14} /> Send Message
                        </ConnectedButton>
                      </CardActions>
                    </UserCard>
                  ))}
                </UsersGrid>
              )}
            </SectionArea>
          )}
        </ContentWrapper>
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

const TabBarContainer = styled.div`
  display: flex;
  gap: 0.75rem;
  padding: 0.85rem 2rem;
  background: var(--surf, #FFFFFF);
  border-bottom: 1px solid var(--line, rgba(0, 0, 0, 0.08));
  overflow-x: auto;
`;

const TabButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.55rem 1.1rem;
  border-radius: 10px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--mut, #64748B);
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: var(--s2, #FAF9F6);
    color: var(--ink, #0F172A);
  }

  &.active {
    background: var(--acc2, #EEEDFD);
    color: var(--acc, #4F46E5);
    border-color: rgba(79, 70, 229, 0.2);
  }
`;

const TabBadge = styled.span`
  background: var(--acc, #4F46E5);
  color: white;
  font-size: 0.7rem;
  font-weight: 700;
  padding: 0.1rem 0.45rem;
  border-radius: 12px;
`;

const ContentScroll = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 2rem;

  @media (max-width: 768px) {
    padding: 1rem;
  }
`;

const ContentWrapper = styled.div`
  max-width: 1080px;
  margin: 0 auto;
`;

const SectionArea = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
`;

const SearchForm = styled.form`
  display: flex;
  gap: 0.75rem;
  max-width: 600px;
  width: 100%;
`;

const SearchInputWrapper = styled.div`
  flex: 1;
  position: relative;
  display: flex;
  align-items: center;

  .search-icon {
    position: absolute;
    left: 14px;
    color: var(--mut, #64748B);
  }
`;

const SearchInput = styled.input`
  width: 100%;
  background: var(--surf, #FFFFFF);
  border: 1px solid var(--line, rgba(0, 0, 0, 0.12));
  border-radius: 12px;
  padding: 0.75rem 2.5rem 0.75rem 2.75rem;
  font-size: 0.92rem;
  color: var(--ink, #0F172A);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.02);

  &:focus {
    border-color: var(--acc, #4F46E5);
    outline: none;
    box-shadow: 0 0 0 2px rgba(79, 70, 229, 0.15);
  }
`;

const ClearButton = styled.button`
  position: absolute;
  right: 12px;
  background: transparent;
  border: none;
  color: var(--mut, #64748B);
  cursor: pointer;
  display: flex;
  align-items: center;
`;

const SearchSubmitBtn = styled.button`
  background: var(--acc, #4F46E5);
  color: white;
  border: none;
  padding: 0 1.4rem;
  border-radius: 12px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover:not(:disabled) {
    background: #4338CA;
  }
`;

const UsersGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 1.25rem;
`;

const UserCard = styled.div`
  background: var(--surf, #FFFFFF);
  border: 1px solid var(--line, rgba(0, 0, 0, 0.08));
  border-radius: 16px;
  padding: 1.5rem 1.25rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);
  transition: transform 0.15s ease, box-shadow 0.15s ease;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.04);
  }
`;

const UserInfo = styled.div`
  margin: 0.85rem 0 1.25rem 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.2rem;
  width: 100%;
`;

const UserName = styled.div`
  font-size: 1rem;
  font-weight: 700;
  color: var(--ink, #0F172A);
`;

const UserHandle = styled.div`
  font-size: 0.8rem;
  color: var(--mut, #64748B);
`;

const UserBio = styled.div`
  font-size: 0.78rem;
  color: var(--mut, #64748B);
  margin-top: 0.4rem;
  max-width: 90%;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

const CardActions = styled.div`
  width: 100%;
  margin-top: auto;
`;

const ConnectButton = styled.button`
  width: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  padding: 0.55rem;
  border-radius: 10px;
  background: var(--acc, #4F46E5);
  color: white;
  border: none;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: #4338CA;
  }
`;

const PendingButton = styled.button`
  width: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  padding: 0.55rem;
  border-radius: 10px;
  background: var(--s2, #FAF9F6);
  color: var(--mut, #64748B);
  border: 1px solid var(--line, rgba(0, 0, 0, 0.08));
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;

  &:hover:not(:disabled) {
    color: #DC2626;
    border-color: #DC2626;
  }
`;

const ConnectedButton = styled.button`
  width: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  padding: 0.55rem;
  border-radius: 10px;
  background: var(--acc2, #EEEDFD);
  color: var(--acc, #4F46E5);
  border: 1px solid transparent;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;

  &:hover {
    background: #E0E0FC;
  }
`;

const AcceptButton = styled.button`
  width: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  padding: 0.55rem;
  border-radius: 10px;
  background: var(--ok, #15803D);
  color: white;
  border: none;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
`;

const SubSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
`;

const SubSectionTitle = styled.h3`
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--ink, #0F172A);
  margin: 0;
`;

const EmptyNote = styled.div`
  padding: 1.25rem;
  background: var(--surf, #FFFFFF);
  border: 1px dashed var(--line, rgba(0, 0, 0, 0.12));
  border-radius: 12px;
  color: var(--mut, #64748B);
  font-size: 0.88rem;
  text-align: center;
`;

const RequestsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
`;

const RequestCard = styled.div`
  background: var(--surf, #FFFFFF);
  border: 1px solid var(--line, rgba(0, 0, 0, 0.08));
  border-radius: 14px;
  padding: 1rem 1.25rem;
  display: flex;
  align-items: center;
  gap: 1rem;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.02);
`;

const ReqDetails = styled.div`
  flex: 1;
`;

const ReqName = styled.div`
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--ink, #0F172A);
`;

const ReqHandle = styled.div`
  font-size: 0.8rem;
  color: var(--mut, #64748B);
`;

const ReqActions = styled.div`
  display: flex;
  gap: 0.5rem;
`;

const AcceptMiniBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  background: var(--ok, #15803D);
  color: white;
  border: none;
  padding: 0.45rem 0.85rem;
  border-radius: 8px;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
`;

const RejectMiniBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  background: var(--s2, #FAF9F6);
  color: var(--mut, #64748B);
  border: 1px solid var(--line, rgba(0, 0, 0, 0.08));
  padding: 0.45rem 0.85rem;
  border-radius: 8px;
  font-size: 0.82rem;
  font-weight: 500;
  cursor: pointer;

  &:hover {
    color: #DC2626;
    border-color: #DC2626;
  }
`;

const CancelMiniBtn = styled.button`
  background: transparent;
  color: var(--mut, #64748B);
  border: 1px solid var(--line, rgba(0, 0, 0, 0.08));
  padding: 0.45rem 0.85rem;
  border-radius: 8px;
  font-size: 0.82rem;
  cursor: pointer;

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

  h4 {
    margin: 0;
    color: var(--ink, #0F172A);
  }
  p {
    margin: 0;
    font-size: 0.88rem;
  }
`;

const PaginationBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  margin-top: 1.5rem;
`;

const PageBtn = styled.button`
  padding: 0.45rem 0.95rem;
  border-radius: 8px;
  border: 1px solid var(--line, rgba(0, 0, 0, 0.08));
  background: var(--surf, #FFFFFF);
  color: var(--ink, #0F172A);
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const PageText = styled.span`
  font-size: 0.85rem;
  color: var(--mut, #64748B);
`;
