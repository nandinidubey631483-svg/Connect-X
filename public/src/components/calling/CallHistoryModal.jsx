/**
 * ConnectX Call History Modal (Module 11)
 * 
 * Displays paginated call logs with:
 * - Direction indicators (Incoming, Outgoing, Missed)
 * - Call type badges (Voice, Video)
 * - Duration and timestamp
 * - One-click callback action buttons
 */
import React, { useState, useEffect, useCallback } from "react";
import styled from "styled-components";
import apiClient from "../../services/apiClient";
import { v1CallsRoute } from "../../services/apiRoutes";
import { useCall } from "../../context/CallContext";
import Avatar from "../common/Avatar";
import Modal from "../common/Modal";
import {
  FiPhone,
  FiPhoneIncoming,
  FiPhoneOutgoing,
  FiPhoneMissed,
  FiVideo,
  FiClock,
} from "react-icons/fi";

export default function CallHistoryModal({ isOpen, onClose, socket }) {
  const { startVoiceCall, startVideoCall } = useCall();
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterType, setFilterType] = useState("ALL"); // ALL, MISSED, VOICE, VIDEO

  const fetchHistory = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiClient.get(v1CallsRoute, {
        params: {
          limit: 30,
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
    if (isOpen) {
      fetchHistory();
    }
  }, [isOpen, fetchHistory]);

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

  const getCallIcon = (c) => {
    if (c.isMissed) {
      return <FiPhoneMissed size={16} color="var(--bad, #EF4444)" />;
    }
    if (c.direction === "OUTGOING") {
      return <FiPhoneOutgoing size={16} color="var(--acc, #D98B70)" />;
    }
    return <FiPhoneIncoming size={16} color="#10B981" />;
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Call History"
      data-testid="call-history-modal"
    >
      <Container>
        {/* Filter Tabs */}
        <FilterTabs>
          {["ALL", "MISSED", "VOICE", "VIDEO"].map((tab) => (
            <TabButton
              key={tab}
              active={filterType === tab}
              onClick={() => setFilterType(tab)}
              data-testid={`call-filter-${tab.toLowerCase()}`}
            >
              {tab === "ALL" && "All Calls"}
              {tab === "MISSED" && "Missed"}
              {tab === "VOICE" && "Voice"}
              {tab === "VIDEO" && "Video"}
            </TabButton>
          ))}
        </FilterTabs>

        {/* Calls List */}
        <CallList>
          {loading ? (
            <EmptyState>Loading calls...</EmptyState>
          ) : calls.length === 0 ? (
            <EmptyState data-testid="no-calls-state">
              <FiClock size={32} style={{ marginBottom: "8px", opacity: 0.5 }} />
              <p style={{ margin: 0 }}>No call history found.</p>
            </EmptyState>
          ) : (
            calls.map((c) => {
              const party = c.otherParty || {};
              const name = party.displayName || party.username || "ConnectX User";

              return (
                <CallItem key={c._id} data-testid="call-history-item">
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1, minWidth: 0 }}>
                    <Avatar image={party.avatarImage} name={name} size="md" showStatus={false} />

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span style={{ fontWeight: "600", fontSize: "14px", color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {name}
                        </span>
                        {c.callType === "VIDEO" ? (
                          <TypeBadge title="Video Call"><FiVideo size={11} /></TypeBadge>
                        ) : (
                          <TypeBadge title="Voice Call"><FiPhone size={11} /></TypeBadge>
                        )}
                      </div>

                      <MetaRow>
                        {getCallIcon(c)}
                        <span style={{ fontSize: "12px", color: c.isMissed ? "var(--bad, #EF4444)" : "var(--mut)" }}>
                          {c.isMissed ? "Missed" : c.direction === "OUTGOING" ? "Outgoing" : "Incoming"}
                        </span>
                        <span>•</span>
                        <span style={{ fontSize: "12px", color: "var(--mut)" }}>
                          {c.duration > 0 ? formatDuration(c.duration) : formatTime(c.createdAt || c.startedAt)}
                        </span>
                      </MetaRow>
                    </div>
                  </div>

                  {/* Callback Action Buttons */}
                  <ActionButtons>
                    <ActionButton
                      title="Voice Call"
                      onClick={() => {
                        onClose();
                        startVoiceCall(party, c.conversationId, socket);
                      }}
                      data-testid="callback-voice-btn"
                    >
                      <FiPhone size={14} />
                    </ActionButton>
                    <ActionButton
                      title="Video Call"
                      onClick={() => {
                        onClose();
                        startVideoCall(party, c.conversationId, socket);
                      }}
                      data-testid="callback-video-btn"
                    >
                      <FiVideo size={14} />
                    </ActionButton>
                  </ActionButtons>
                </CallItem>
              );
            })
          )}
        </CallList>
      </Container>
    </Modal>
  );
}

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-height: 480px;
`;

const FilterTabs = styled.div`
  display: flex;
  gap: 6px;
  background: var(--bg, #F3F4F6);
  padding: 4px;
  border-radius: 12px;
  border: 1px solid var(--line, #E5E7EB);
`;

const TabButton = styled.button`
  flex: 1;
  padding: 6px 12px;
  border-radius: 8px;
  border: none;
  background: ${(props) => (props.active ? "var(--surf, #FFFFFF)" : "transparent")};
  color: ${(props) => (props.active ? "var(--ink, #111827)" : "var(--mut, #6B7280)")};
  font-weight: ${(props) => (props.active ? "600" : "500")};
  font-size: 12.5px;
  cursor: pointer;
  box-shadow: ${(props) => (props.active ? "0 1px 3px rgba(0,0,0,0.06)" : "none")};
  transition: all 0.15s ease;
`;

const CallList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  padding-right: 4px;
  max-height: 380px;
`;

const CallItem = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: var(--bg, #F9FAFB);
  border: 1px solid var(--line, #E5E7EB);
  border-radius: 14px;
  transition: background 0.15s ease;

  &:hover {
    background: var(--surf, #FFFFFF);
  }
`;

const MetaRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
`;

const TypeBadge = styled.span`
  display: inline-grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border-radius: 4px;
  background: var(--acc2, #FBF3EF);
  color: var(--acc, #D98B70);
`;

const ActionButtons = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: 10px;
`;

const ActionButton = styled.button`
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid var(--line, #E5E7EB);
  background: var(--surf, #FFFFFF);
  color: var(--ink, #111827);
  display: grid;
  place-items: center;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: var(--acc2, #FBF3EF);
    color: var(--acc, #D98B70);
    border-color: var(--acc, #D98B70);
  }
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 32px 16px;
  color: var(--mut, #6B7280);
  font-size: 13.5px;
  display: flex;
  flex-direction: column;
  align-items: center;
`;
