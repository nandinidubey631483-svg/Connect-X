import React from "react";
import styled from "styled-components";
import { theme } from "../../styles/theme";
import Button from "./Button";

export default function EmptyState({
  icon,
  title = "No Conversations Selected",
  description = "Choose a contact from the sidebar to begin messaging in real time.",
  actionLabel,
  onAction,
  className,
}) {
  return (
    <Container className={className}>
      {icon && <IconWrapper>{icon}</IconWrapper>}
      <Title>{title}</Title>
      <Description>{description}</Description>
      {actionLabel && onAction && (
        <Button variant="primary" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </Container>
  );
}

const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 3rem 2rem;
  height: 100%;
  color: ${theme.colors.textPrimary};
`;

const IconWrapper = styled.div`
  font-size: 4rem;
  color: ${theme.colors.primaryLight};
  margin-bottom: 1.25rem;
  opacity: 0.85;
`;

const Title = styled.h2`
  font-size: 1.5rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
  color: ${theme.colors.textPrimary};
`;

const Description = styled.p`
  font-size: 0.95rem;
  color: ${theme.colors.textSecondary};
  max-width: 24rem;
  margin-bottom: 1.5rem;
  line-height: 1.5;
`;
