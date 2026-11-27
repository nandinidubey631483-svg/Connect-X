import React, { useState, useEffect, useCallback } from "react";
import styled from "styled-components";
import {
  FiArrowLeft,
  FiPhone,
  FiPhoneIncoming,
  FiPhoneOutgoing,
  FiPhoneMissed,
  FiVideo,
  FiClock,
  FiSearch,
} from "react-icons/fi";
import Avatar from "../common/Avatar";
import apiClient from "../../services/apiClient";
import { v1CallsRoute } from "../../services/apiRoutes";
import { useCall } from "../../context/CallContext";

export default function CallsView({ onBack, socket }) {
  const { startVoiceCall, startVideoCall } = useCall();
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterType, setFilterType] = useState("ALL"); // ALL, MISSED, VOICE, VIDEO
  const [searchQuery, setSearchQuery] = useState("");

  const fetchCalls = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiClient.get(v1CallsRoute, {
        params: {
          limit: 50,
          status: filterType === "MISSED" ? "MISSED" : undefined,
          type: ["VOICE", "VIDEO"].includes(filterType) ? filterType : undefined,
        },
      });
      if (res.data?.success && Array.isArray(res.data.data)) {
        setCalls(res.data.data);
      }
    } catch (_) {
      setCalls([]);
    } finally {
      setLoading(false);
    }
  }, [filterType]);

  useEffect(() => {
    fetchCalls();
  }, [fetchCalls]);

  const formatDuration = (totalSec) => {
    if (!totalSec || totalSec <= 0) return "0s";
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) {
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    return `${date.toLocaleDateString([], { month: "short", day: "numeric" })} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  };

  const getCallIcon = (call) => {
    if (call.isMissed || call.status === "MISSED") {
      return <FiPhoneMissed size={16} style={{ color: "var(--bad, #EF4444)" }} />;
    }
    if (call.direction === "OUTGOING") {
      return <FiPhoneOutgoing size={16} style={{ color: "var(--acc, #D98B70)" }} />;
    }
    return <FiPhoneIncoming size={16} style={{ color: "var(--ok, #10B981)" }} />;
  };

  const filteredCalls = calls.filter((c) => {
    if (!searchQuery.trim()) return true;
    const party = c.otherParty || {};
    const name = (party.displayName || party.username || "").toLowerCase();
    return name.includes(searchQuery.toLowerCase());
  });

  return (
    <Container data-testid="calls-view-page">
      {/* Page Header */}
      <Header>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <BackButton onClick={onBack} title="Back to Chats">
            <FiArrowLeft size={18} />
          </BackButton>
          <div>
            <Title>Call History</Title>
            <Subtitle>View recent voice and video call logs and return missed calls</Subtitle>
          </div>
        </div>
      </Header>

      {/* Toolbar: Search & Filter Tabs */}
      <Toolbar>
        <SearchWrapper>
          <FiSearch size={16} color="var(--mut)" />
          <SearchInput
            placeholder="Search call logs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </SearchWrapper>

        <FilterTabs>
          {[
            { id: "ALL", label: "All Calls" },
            { id: "MISSED", label: "Missed" },
            { id: "VOICE", label: "Voice" },
            { id: "VIDEO", label: "Video" },
          ].map((tab) => (
            <TabButton
              key={tab.id}
              active={filterType === tab.id}
              onClick={() => setFilterType(tab.id)}
              data-testid={`call-filter-${tab.id.toLowerCase()}`}
            >
              {tab.label}
            </TabButton>
          ))}
        </FilterTabs>
      </Toolbar>

      {/* Main Content Area */}
      <ContentBody>
        {loading ? (
          <EmptyState>Loading calls...</EmptyState>
        ) : filteredCalls.length === 0 ? (
          <EmptyState data-testid="no-calls-state">
            <FiClock size={40} style={{ opacity: 0.4, marginBottom: "12px" }} />
            <EmptyTitle>No calls found</EmptyTitle>
            <EmptySubtitle>
              {searchQuery
                ? "No call logs matched your search query."
                : "Your incoming and outgoing voice and video calls will appear here."}
            </EmptySubtitle>
          </EmptyState>
        ) : (
          <CallsGrid>
            {filteredCalls.map((c) => {
              const party = c.otherParty || {};
              const name = party.displayName || party.username || "ConnectX User";
              const isMissed = c.isMissed || c.status === "MISSED";

              return (
                <CallCard key={c._id} data-testid="call-record-card">
                  <CardLeft>
                    <Avatar image={party.avatarImage} name={name} size="lg" showStatus={false} />
                    <CallDetails>
                      <NameRow>
                        <UserName>{name}</UserName>
                        {c.callType === "VIDEO" ? (
                          <TypeBadge title="Video Call">
                            <FiVideo size={12} /> Video
                          </TypeBadge>
                        ) : (
                          <TypeBadge title="Voice Call">
                            <FiPhone size={12} /> Voice
                          </TypeBadge>
                        )}
                      </NameRow>

                      <MetaRow>
                        {getCallIcon(c)}
                        <StatusLabel isMissed={isMissed}>
                          {isMissed ? "Missed" : c.direction === "OUTGOING" ? "Outgoing" : "Incoming"}
                        </StatusLabel>
                        <span>•</span>
                        <TimestampText>
                          {c.duration > 0 ? formatDuration(c.duration) : formatTime(c.createdAt || c.startedAt)}
                        </TimestampText>
                        {c.duration > 0 && (
                          <>
                            <span>•</span>
                            <TimestampText>{formatTime(c.createdAt || c.startedAt)}</TimestampText>
                          </>
                        )}
                      </MetaRow>
                    </CallDetails>
                  </CardLeft>

                  {/* One-click Callback Actions */}
                  <ActionButtons>
                    <ActionButton
                      title="Voice Call"
                      onClick={() => startVoiceCall(party, c.conversationId, socket)}
                      data-testid="callback-voice-btn"
                    >
                      <FiPhone size={16} />
                    </ActionButton>
                    <ActionButton
                      title="Video Call"
                      onClick={() => startVideoCall(party, c.conversationId, socket)}
                      data-testid="callback-video-btn"
                    >
                      <FiVideo size={16} />
                    </ActionButton>
                  </ActionButtons>
                </CallCard>
              );
            })}
          </CallsGrid>
        )}
      </ContentBody>
    </Container>
  );
}

const Container = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: var(--surf, #ffffff);
  overflow: hidden;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24px 32px 18px;
  border-bottom: 1px solid var(--line, #e5e7eb);
  background: var(--surf, #ffffff);
`;

const BackButton = styled.button`
  background: var(--bg, #f3f4f6);
  border: 1px solid var(--line, #e5e7eb);
  border-radius: 12px;
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  color: var(--ink, #111827);
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: var(--line, #e5e7eb);
  }
`;

const Title = styled.h2`
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  color: var(--ink, #111827);
`;

const Subtitle = styled.p`
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--mut, #6b7280);
`;

const Toolbar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 32px;
  border-bottom: 1px solid var(--line, #e5e7eb);
  background: var(--surf, #ffffff);
  flex-wrap: wrap;
`;

const SearchWrapper = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  border-radius: 12px;
  background: var(--bg, #f3f4f6);
  border: 1px solid var(--line, #e5e7eb);
  width: 320px;
  max-width: 100%;
`;

const SearchInput = styled.input`
  border: none;
  background: transparent;
  outline: none;
  font-size: 14px;
  color: var(--ink, #111827);
  width: 100%;

  &::placeholder {
    color: var(--mut, #9ca3af);
  }
`;

const FilterTabs = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const TabButton = styled.button`
  padding: 8px 18px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
  border: none;
  cursor: pointer;
  transition: all 0.15s ease;
  background: ${(props) => (props.active ? "var(--acc, #D98B70)" : "var(--bg, #F3F4F6)")};
  color: ${(props) => (props.active ? "#ffffff" : "var(--mut, #4B5563)")};

  &:hover {
    opacity: 0.9;
  }
`;

const ContentBody = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 24px 32px;
  background: var(--bg-alt, #f9fafb);
`;

const CallsGrid = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 860px;
`;

const CallCard = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-radius: 16px;
  background: var(--surf, #ffffff);
  border: 1px solid var(--line, #e5e7eb);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.02);
  transition: transform 0.15s ease, box-shadow 0.15s ease;

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 14px rgba(0, 0, 0, 0.05);
  }
`;

const CardLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  flex: 1;
  min-width: 0;
`;

const CallDetails = styled.div`
  flex: 1;
  min-width: 0;
`;

const NameRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 4px;
`;

const UserName = styled.span`
  font-size: 16px;
  font-weight: 700;
  color: var(--ink, #111827);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const TypeBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 99px;
  background: var(--bg, #f3f4f6);
  color: var(--mut, #4b5563);
`;

const MetaRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
`;

const StatusLabel = styled.span`
  font-weight: 500;
  color: ${(props) => (props.isMissed ? "var(--bad, #EF4444)" : "var(--mut, #6B7280)")};
`;

const TimestampText = styled.span`
  color: var(--mut, #6b7280);
`;

const ActionButtons = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const ActionButton = styled.button`
  width: 40px;
  height: 40px;
  border-radius: 12px;
  border: 1px solid var(--line, #e5e7eb);
  background: var(--bg, #f3f4f6);
  color: var(--ink, #111827);
  display: grid;
  place-items: center;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: var(--acc, #D98B70);
    color: #ffffff;
    border-color: var(--acc, #D98B70);
    transform: scale(1.05);
  }
`;

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 360px;
  text-align: center;
  color: var(--mut, #6b7280);
`;

const EmptyTitle = styled.h3`
  margin: 0 0 6px;
  font-size: 17px;
  font-weight: 600;
  color: var(--ink, #111827);
`;

const EmptySubtitle = styled.p`
  margin: 0;
  font-size: 14px;
  color: var(--mut, #6b7280);
  max-width: 320px;
`;
