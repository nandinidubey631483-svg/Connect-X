import React, { useState, useEffect } from "react";
import styled from "styled-components";
import LogoImg from "../assets/connectx-logo.png";
import DoodleBg from "../assets/doodle_pattern.svg";
import { FiLock } from "react-icons/fi";

export default function Welcome() {
  const [userName, setUserName] = useState("");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(process.env.REACT_APP_LOCALHOST_KEY);
      if (stored) {
        const user = JSON.parse(stored);
        setUserName(user.displayName || user.username || "");
      }
    } catch (_) {}
  }, []);

  return (
    <WallpaperContainer>
      <BannerCard>
        <LogoCircle>
          <img src={LogoImg} alt="ConnectX" />
        </LogoCircle>

        <BannerTitle>
          Welcome to Connect<span className="accent">X</span>{userName ? `, ${userName}` : ""}!
        </BannerTitle>

        <BannerSubtitle>
          Select a conversation from the left to start chatting, or search contacts with <kbd>/</kbd>.
        </BannerSubtitle>

        <SecurityPill>
          <FiLock size={12} />
          <span>End-to-end encrypted &bull; Verified sessions</span>
        </SecurityPill>
      </BannerCard>
    </WallpaperContainer>
  );
}

const WallpaperContainer = styled.div`
  width: 100%;
  height: 100%;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  background-color: var(--bg-wallpaper, #E4ECE1);
  background-image: url(${DoodleBg});
  background-repeat: repeat;
  background-size: 380px 380px;
  color: var(--wallpaper-tint, #335436);
  position: relative;
  overflow: hidden;
`;

const BannerCard = styled.div`
  background: var(--surf, rgba(255, 255, 255, 0.92));
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid var(--line, rgba(0, 0, 0, 0.08));
  border-radius: 28px;
  padding: 2.75rem 3.5rem;
  max-width: 520px;
  width: 100%;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.25rem;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.08), 0 2px 8px rgba(0, 0, 0, 0.03);
  animation: popIn 0.35s cubic-bezier(0.16, 1, 0.3, 1);

  @keyframes popIn {
    from {
      opacity: 0;
      transform: scale(0.94) translateY(12px);
    }
    to {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }

  @media (max-width: 600px) {
    padding: 2rem 1.5rem;
    border-radius: 22px;
  }
`;

const LogoCircle = styled.div`
  width: 76px;
  height: 76px;
  border-radius: 24px;
  background: var(--surf, #FFFFFF);
  border: 1px solid var(--line, rgba(0, 0, 0, 0.08));
  box-shadow: 0 8px 24px rgba(79, 70, 229, 0.15), 0 2px 6px rgba(0, 0, 0, 0.04);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.25s ease;

  img {
    width: 44px;
    height: auto;
  }

  &:hover {
    transform: scale(1.08) rotate(-4deg);
  }
`;

const BannerTitle = styled.h2`
  font-size: 1.65rem;
  font-weight: 700;
  letter-spacing: -0.4px;
  color: var(--ink, #0F172A);
  margin: 0;

  .accent {
    color: var(--acc, #4F46E5);
  }
`;

const BannerSubtitle = styled.p`
  font-size: 0.95rem;
  color: var(--mut, #64748B);
  line-height: 1.55;
  margin: 0;
  max-width: 420px;

  kbd {
    background: var(--s2, #FAF9F6);
    border: 1px solid var(--line, rgba(0, 0, 0, 0.12));
    border-radius: 5px;
    padding: 2px 7px;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--ink, #0F172A);
  }
`;

const SecurityPill = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--mut, #64748B);
  background: var(--s2, #FAF9F6);
  border: 1px solid var(--line, rgba(0, 0, 0, 0.08));
  padding: 0.35rem 0.85rem;
  border-radius: 9999px;
  margin-top: 0.25rem;
`;
