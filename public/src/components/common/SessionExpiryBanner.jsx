import React from "react";
import styled from "styled-components";
import { useAuth } from "../../hooks/useAuth";

export default function SessionExpiryBanner() {
  const { error, logout } = useAuth();

  if (!error || !error.includes("expired")) {
    return null;
  }

  return (
    <BannerContainer data-testid="session-expiry-banner">
      <MessageText>{error}</MessageText>
      <DismissButton onClick={() => logout()}>Log in again</DismissButton>
    </BannerContainer>
  );
}

const BannerContainer = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  background: linear-gradient(90deg, #ff4d4f 0%, #d9363e 100%);
  color: white;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 1.5rem;
  padding: 0.75rem 1rem;
  z-index: 9999;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
`;

const MessageText = styled.span`
  font-size: 0.95rem;
  font-weight: 600;
`;

const DismissButton = styled.button`
  background: white;
  color: #d9363e;
  border: none;
  border-radius: 4px;
  padding: 0.3rem 0.8rem;
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s ease-in-out;

  &:hover {
    background: #f0f0f0;
    transform: scale(1.02);
  }
`;
