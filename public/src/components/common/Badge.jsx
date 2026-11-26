import React from "react";
import styled, { css } from "styled-components";
import { theme } from "../../styles/theme";

export default function Badge({
  count,
  variant = "primary",
  children,
  className,
}) {
  const content = count !== undefined ? (count > 99 ? "99+" : count) : children;

  if (count === 0) return null;

  return (
    <StyledBadge variant={variant} className={className}>
      {content}
    </StyledBadge>
  );
}

const StyledBadge = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.3rem;
  height: 1.3rem;
  padding: 0 0.4rem;
  font-size: 0.725rem;
  font-weight: 700;
  line-height: 1;
  border-radius: ${theme.borderRadius.full};

  ${(props) =>
    props.variant === "primary" &&
    css`
      background-color: ${theme.colors.primary};
      color: #fff;
    `}

  ${(props) =>
    props.variant === "success" &&
    css`
      background-color: ${theme.colors.success};
      color: #fff;
    `}

  ${(props) =>
    props.variant === "danger" &&
    css`
      background-color: ${theme.colors.danger};
      color: #fff;
    `}
`;
