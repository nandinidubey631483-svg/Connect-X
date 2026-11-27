import React from "react";
import styled, { keyframes } from "styled-components";
import LogoImg from "../../assets/connectx-logo.png";

export default function LoadingScreen({ message = "Loading, please wait..." }) {
  return (
    <Container data-testid="loading-screen">
      <LogoWrapper>
        <HaloRing />
        <LogoImage src={LogoImg} alt="ConnectX Logo" />
      </LogoWrapper>

      <BrandTitle>
        Connect<i>X</i>
      </BrandTitle>

      <LoadingText>{message}</LoadingText>

      <DotProgress>
        <span />
        <span />
        <span />
      </DotProgress>
    </Container>
  );
}

const pulse = keyframes`
  0%, 100% {
    transform: scale(1);
    opacity: 0.45;
  }
  50% {
    transform: scale(1.15);
    opacity: 0.85;
  }
`;

const spin = keyframes`
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
`;

const bounce = keyframes`
  0%, 80%, 100% {
    transform: translateY(0);
    opacity: 0.35;
  }
  40% {
    transform: translateY(-6px);
    opacity: 1;
  }
`;

const Container = styled.div`
  min-height: 100vh;
  min-height: 100dvh;
  width: 100vw;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  background-color: var(--bg-wallpaper, var(--bg, #F5F2ED));
  color: var(--ink, #252321);
  padding: 24px;
  box-sizing: border-box;
  text-align: center;
  transition: background-color 0.3s ease;
`;

const LogoWrapper = styled.div`
  position: relative;
  width: 80px;
  height: 80px;
  display: grid;
  place-items: center;
  margin-bottom: 20px;
`;

const HaloRing = styled.div`
  position: absolute;
  inset: -6px;
  border-radius: 50%;
  border: 2.5px solid transparent;
  border-top-color: var(--acc, #D98B70);
  border-right-color: var(--acc, #D98B70);
  animation: ${spin} 1.2s cubic-bezier(0.5, 0.1, 0.4, 0.9) infinite;

  &::before {
    content: "";
    position: absolute;
    inset: -4px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(217, 139, 112, 0.25) 0%, transparent 70%);
    animation: ${pulse} 2s ease-in-out infinite;
  }
`;

const LogoImage = styled.img`
  width: 48px;
  height: 48px;
  object-fit: contain;
  border-radius: 12px;
  position: relative;
  z-index: 1;
`;

const BrandTitle = styled.h1`
  font-family: var(--font-serif, "Playfair Display", Georgia, serif);
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--ink, #252321);
  margin: 0 0 8px 0;

  i {
    font-style: italic;
    color: var(--acc, #D98B70);
  }
`;

const LoadingText = styled.p`
  color: var(--mut, #7A756F);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 13.5px;
  font-weight: 500;
  letter-spacing: 0.01em;
  margin: 0 0 16px 0;
`;

const DotProgress = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;

  span {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background-color: var(--acc, #D98B70);
    display: inline-block;
    animation: ${bounce} 1.4s infinite ease-in-out both;

    &:nth-child(1) {
      animation-delay: -0.32s;
    }
    &:nth-child(2) {
      animation-delay: -0.16s;
    }
    &:nth-child(3) {
      animation-delay: 0s;
    }
  }
`;
