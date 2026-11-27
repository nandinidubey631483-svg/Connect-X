import React, { useState, useEffect, useCallback } from "react";
import styled from "styled-components";
import Modal from "../common/Modal";
import Button from "../common/Button";
import Input from "../common/Input";
import Avatar from "../common/Avatar";
import { theme } from "../../styles/theme";
import apiClient from "../../services/apiClient";
import {
  v1SearchUsersRoute,
  v1ContactRequestsRoute,
  v1SendContactRequestRoute,
  v1AcceptContactRequestRoute,
  v1RejectContactRequestRoute,
  v1CancelContactRequestRoute,
  v1RemoveContactRoute,
} from "../../services/apiRoutes";
import { BiSearch, BiUserPlus, BiCheck, BiX, BiTime, BiTrash } from "react-icons/bi";
import { toast } from "react-toastify";

export default function ContactDiscoveryModal({ isOpen, onClose, onContactsUpdated }) {
  const [activeTab, setActiveTab] = useState("discover"); // "discover" | "requests"
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1, limit: 10 });
  const [users, setUsers] = useState([]);
  const [requests, setRequests] = useState({ incoming: [], outgoing: [] });
  const [isLoading, setIsLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  // Fetch discovered users
  const fetchUsers = useCallback(async (targetPage = 1, query = "") => {
    setIsLoading(true);
    try {
      const res = await apiClient.get(v1SearchUsersRoute, {
        params: { q: query, page: targetPage, limit: 10 },
      });
      if (res.data && res.data.success) {
        setUsers(res.data.users || []);
        setPagination(res.data.pagination || { total: 0, totalPages: 1, limit: 10 });
        setPage(targetPage);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to search users");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch incoming & outgoing requests
  const fetchRequests = useCallback(async () => {
    try {
      const res = await apiClient.get(v1ContactRequestsRoute);
      if (res.data && res.data.success) {
        setRequests({
          incoming: res.data.incoming || [],
          outgoing: res.data.outgoing || [],
        });
      }
    } catch (_) {
      // Background fetch error silenced
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      if (activeTab === "discover") {
        fetchUsers(1, searchQuery);
      }
      fetchRequests();
    }
  }, [isOpen, activeTab, fetchUsers, fetchRequests]);

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
        // Update user relationship locally
        setUsers((prev) =>
          prev.map((u) =>
            u._id === targetUserId
              ? { ...u, relationship: "PENDING_SENT", requestId: res.data.request?._id }
              : u
          )
        );
        fetchRequests();
      }
    } catch (err) {
      const msg =
        err.response?.data?.error?.message ||
        err.response?.data?.message ||
        err.message ||
        "Failed to send request";
      toast.error(msg);
      console.error("[ContactDiscoveryModal] Error sending request:", err);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleAcceptRequest = async (requestId, targetUserId) => {
    setActionLoadingId(requestId);
    try {
      const res = await apiClient.post(v1AcceptContactRequestRoute(requestId));
      if (res.data && res.data.success) {
        toast.success("Contact request accepted");
        setUsers((prev) =>
          prev.map((u) => (u._id === targetUserId ? { ...u, relationship: "CONTACT" } : u))
        );
        fetchRequests();
        if (onContactsUpdated) onContactsUpdated();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to accept request");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRejectRequest = async (requestId, targetUserId) => {
    setActionLoadingId(requestId);
    try {
      const res = await apiClient.post(v1RejectContactRequestRoute(requestId));
      if (res.data && res.data.success) {
        toast.info("Contact request rejected");
        setUsers((prev) =>
          prev.map((u) => (u._id === targetUserId ? { ...u, relationship: "NONE", requestId: null } : u))
        );
        fetchRequests();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to reject request");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleCancelRequest = async (requestId, targetUserId) => {
    setActionLoadingId(requestId);
    try {
      const res = await apiClient.post(v1CancelContactRequestRoute(requestId));
      if (res.data && res.data.success) {
        toast.info("Contact request cancelled");
        setUsers((prev) =>
          prev.map((u) => (u._id === targetUserId ? { ...u, relationship: "NONE", requestId: null } : u))
        );
        fetchRequests();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to cancel request");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRemoveContact = async (contactId) => {
    if (!window.confirm("Are you sure you want to remove this contact?")) return;
    setActionLoadingId(contactId);
    try {
      const res = await apiClient.delete(v1RemoveContactRoute(contactId));
      if (res.data && res.data.success) {
        toast.success("Contact removed");
        setUsers((prev) =>
          prev.map((u) => (u._id === contactId ? { ...u, relationship: "NONE" } : u))
        );
        if (onContactsUpdated) onContactsUpdated();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to remove contact");
    } finally {
      setActionLoadingId(null);
    }
  };

  const incomingCount = requests.incoming.length;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Contacts & Discovery" maxWidth="40rem">
      <TabHeader>
        <TabButton
          active={activeTab === "discover"}
          onClick={() => setActiveTab("discover")}
          data-testid="tab-discover"
        >
          Discover Users
        </TabButton>
        <TabButton
          active={activeTab === "requests"}
          onClick={() => setActiveTab("requests")}
          data-testid="tab-requests"
        >
          Requests
          {incomingCount > 0 && <RequestBadge>{incomingCount}</RequestBadge>}
        </TabButton>
      </TabHeader>

      {activeTab === "discover" && (
        <ContentWrapper>
          <SearchForm onSubmit={handleSearchSubmit}>
            <Input
              placeholder="Search by username or display name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              icon={<BiSearch />}
              data-testid="search-users-input"
            />
            <Button type="submit" variant="secondary" size="md">
              Search
            </Button>
          </SearchForm>

          {isLoading ? (
            <LoadingState>Searching ConnectX network...</LoadingState>
          ) : users.length === 0 ? (
            <EmptyState>No users found matching your search.</EmptyState>
          ) : (
            <UserList>
              {users.map((u) => (
                <UserCard key={u._id} data-testid={`user-card-${u.username}`}>
                  <UserInfo>
                    <Avatar
                      image={u.avatarImage}
                      name={u.displayName || u.username}
                      size="md"
                      isOnline={u.isOnline}
                      showStatus={true}
                    />
                    <UserDetails>
                      <NameWrapper>
                        <DisplayName>{u.displayName || u.username}</DisplayName>
                        {u.displayName && <UsernameTag>@{u.username}</UsernameTag>}
                      </NameWrapper>
                      <StatusText>{u.statusMessage || u.bio || "Active on ConnectX"}</StatusText>
                    </UserDetails>
                  </UserInfo>

                  <ActionWrapper>
                    {u.relationship === "NONE" && (
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => handleSendRequest(u._id)}
                        disabled={Boolean(actionLoadingId) && actionLoadingId === u._id}
                        data-testid={`btn-add-${u.username}`}
                      >
                        <BiUserPlus style={{ marginRight: "0.25rem" }} />
                        {Boolean(actionLoadingId) && actionLoadingId === u._id ? "Connecting..." : "Add"}
                      </Button>
                    )}

                    {u.relationship === "PENDING_SENT" && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleCancelRequest(u.requestId, u._id)}
                        disabled={Boolean(actionLoadingId) && Boolean(u.requestId) && actionLoadingId === u.requestId}
                        data-testid={`btn-cancel-${u.username}`}
                      >
                        <BiTime style={{ marginRight: "0.25rem" }} />
                        {Boolean(actionLoadingId) && Boolean(u.requestId) && actionLoadingId === u.requestId ? "Withdrawing..." : "Withdraw"}
                      </Button>
                    )}

                    {u.relationship === "PENDING_RECEIVED" && (
                      <ButtonGroup>
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => handleAcceptRequest(u.requestId, u._id)}
                          disabled={actionLoadingId === u.requestId}
                          data-testid={`btn-accept-${u.username}`}
                        >
                          <BiCheck />
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => handleRejectRequest(u.requestId, u._id)}
                          disabled={actionLoadingId === u.requestId}
                          data-testid={`btn-reject-${u.username}`}
                        >
                          <BiX />
                        </Button>
                      </ButtonGroup>
                    )}

                    {u.relationship === "CONTACT" && (
                      <ButtonGroup>
                        <ConnectedBadge>
                          <BiCheck /> Connected
                        </ConnectedBadge>
                        <RemoveButton
                          onClick={() => handleRemoveContact(u._id)}
                          title="Remove Contact"
                          data-testid={`btn-remove-${u.username}`}
                        >
                          <BiTrash />
                        </RemoveButton>
                      </ButtonGroup>
                    )}
                  </ActionWrapper>
                </UserCard>
              ))}
            </UserList>
          )}

          {pagination.totalPages > 1 && (
            <PaginationBar>
              <Button
                size="sm"
                variant="secondary"
                disabled={page <= 1 || isLoading}
                onClick={() => fetchUsers(page - 1, searchQuery)}
              >
                Previous
              </Button>
              <PageIndicator>
                Page {page} of {pagination.totalPages}
              </PageIndicator>
              <Button
                size="sm"
                variant="secondary"
                disabled={page >= pagination.totalPages || isLoading}
                onClick={() => fetchUsers(page + 1, searchQuery)}
              >
                Next
              </Button>
            </PaginationBar>
          )}
        </ContentWrapper>
      )}

      {activeTab === "requests" && (
        <ContentWrapper>
          <SectionTitle>Incoming Requests ({requests.incoming.length})</SectionTitle>
          {requests.incoming.length === 0 ? (
            <SubEmptyState>No pending incoming requests</SubEmptyState>
          ) : (
            <RequestList>
              {requests.incoming.map((reqItem) => {
                const reqUser = reqItem.requester || {};
                return (
                  <UserCard key={reqItem._id}>
                    <UserInfo>
                      <Avatar
                        image={reqUser.avatarImage}
                        name={reqUser.displayName || reqUser.username}
                        size="md"
                      />
                      <UserDetails>
                        <DisplayName>{reqUser.displayName || reqUser.username}</DisplayName>
                        {reqUser.displayName && <UsernameTag>@{reqUser.username}</UsernameTag>}
                      </UserDetails>
                    </UserInfo>
                    <ButtonGroup>
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => handleAcceptRequest(reqItem._id, reqUser._id)}
                        disabled={actionLoadingId === reqItem._id}
                      >
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleRejectRequest(reqItem._id, reqUser._id)}
                        disabled={actionLoadingId === reqItem._id}
                      >
                        Decline
                      </Button>
                    </ButtonGroup>
                  </UserCard>
                );
              })}
            </RequestList>
          )}

          <SectionTitle style={{ marginTop: "1.5rem" }}>
            Outgoing Requests ({requests.outgoing.length})
          </SectionTitle>
          {requests.outgoing.length === 0 ? (
            <SubEmptyState>No outgoing requests pending</SubEmptyState>
          ) : (
            <RequestList>
              {requests.outgoing.map((reqItem) => {
                const targetUser = reqItem.recipient || {};
                return (
                  <UserCard key={reqItem._id}>
                    <UserInfo>
                      <Avatar
                        image={targetUser.avatarImage}
                        name={targetUser.displayName || targetUser.username}
                        size="md"
                      />
                      <UserDetails>
                        <DisplayName>{targetUser.displayName || targetUser.username}</DisplayName>
                        {targetUser.displayName && <UsernameTag>@{targetUser.username}</UsernameTag>}
                      </UserDetails>
                    </UserInfo>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleCancelRequest(reqItem._id, targetUser._id)}
                      disabled={Boolean(actionLoadingId) && actionLoadingId === reqItem._id}
                    >
                      Cancel
                    </Button>
                  </UserCard>
                );
              })}
            </RequestList>
          )}
        </ContentWrapper>
      )}
    </Modal>
  );
}

const TabHeader = styled.div`
  display: flex;
  border-bottom: 1px solid ${theme.colors.border};
  margin-bottom: 1rem;
`;

const TabButton = styled.button`
  flex: 1;
  padding: 0.75rem 1rem;
  background: none;
  border: none;
  border-bottom: 2px solid
    ${({ active }) => (active ? theme.colors.primary : "transparent")};
  color: ${({ active }) => (active ? theme.colors.textPrimary : theme.colors.textMuted)};
  font-weight: ${({ active }) => (active ? "600" : "400")};
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  transition: all 0.2s ease;

  &:hover {
    color: ${theme.colors.textPrimary};
  }
`;

const RequestBadge = styled.span`
  background-color: ${theme.colors.primary};
  color: white;
  font-size: 0.7rem;
  font-weight: 700;
  padding: 0.15rem 0.45rem;
  border-radius: 9999px;
`;

const ContentWrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-height: 22rem;
`;

const SearchForm = styled.form`
  display: flex;
  gap: 0.5rem;
  align-items: center;
`;

const LoadingState = styled.div`
  text-align: center;
  color: ${theme.colors.textMuted};
  padding: 3rem 1rem;
  font-size: 0.9rem;
`;

const EmptyState = styled.div`
  text-align: center;
  color: ${theme.colors.textMuted};
  padding: 3rem 1rem;
  font-size: 0.9rem;
`;

const SubEmptyState = styled.div`
  color: ${theme.colors.textMuted};
  font-size: 0.85rem;
  padding: 0.75rem 0;
  font-style: italic;
`;

const SectionTitle = styled.h4`
  color: ${theme.colors.textSecondary};
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0;
`;

const UserList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: 20rem;
  overflow-y: auto;
  padding-right: 0.25rem;
`;

const RequestList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: 12rem;
  overflow-y: auto;
`;

const UserCard = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  background-color: ${theme.colors.bgSurface};
  border: 1px solid ${theme.colors.border};
  border-radius: ${theme.borderRadius.md};
  transition: border-color 0.2s ease;

  &:hover {
    border-color: ${theme.colors.borderFocus};
  }
`;

const UserInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
`;

const UserDetails = styled.div`
  display: flex;
  flex-direction: column;
`;

const NameWrapper = styled.div`
  display: flex;
  align-items: center;
  gap: 0.35rem;
`;

const DisplayName = styled.span`
  color: ${theme.colors.textPrimary};
  font-weight: 600;
  font-size: 0.9rem;
`;

const UsernameTag = styled.span`
  color: ${theme.colors.textMuted};
  font-size: 0.75rem;
`;

const StatusText = styled.span`
  color: ${theme.colors.textSecondary};
  font-size: 0.75rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 14rem;
`;

const ActionWrapper = styled.div`
  display: flex;
  align-items: center;
`;

const ButtonGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const ConnectedBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.75rem;
  color: #10b981;
  background-color: rgba(16, 185, 129, 0.1);
  padding: 0.25rem 0.5rem;
  border-radius: ${theme.borderRadius.sm};
  font-weight: 500;
`;

const RemoveButton = styled.button`
  background: none;
  border: none;
  color: ${theme.colors.textMuted};
  cursor: pointer;
  padding: 0.35rem;
  display: flex;
  align-items: center;
  border-radius: ${theme.borderRadius.sm};
  transition: color 0.2s ease;

  &:hover {
    color: #ef4444;
  }
`;

const PaginationBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 0.5rem;
  border-top: 1px solid ${theme.colors.border};
`;

const PageIndicator = styled.span`
  color: ${theme.colors.textMuted};
  font-size: 0.8rem;
`;
