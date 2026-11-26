import React from "react";
import styled, { keyframes } from "styled-components";

export default function LoadingScreen({ message = "Loading ConnectX..." }) {
  return (
    <Container data-testid="loading-screen">
      <Spinner />
      <LoadingText>{message}</LoadingText>
    </Container>
  );
}

const spin = keyframes`
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
`;

const Container = styled.div`
  height: 100vh;
  width: 100vw;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  background-color: #131324;
  gap: 1.5rem;
`;

const Spinner = styled.div`
  width: 50px;
  height: 50px;
  border: 5px solid rgba(255, 255, 255, 0.1);
  border-top: 5px solid #4e0eff;
  border-radius: 50%;
  animation: ${spin} 1s linear infinite;
`;

const LoadingText = styled.h2`
  color: white;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-weight: 500;
  font-size: 1.1rem;
  letter-spacing: 0.5px;
`;
