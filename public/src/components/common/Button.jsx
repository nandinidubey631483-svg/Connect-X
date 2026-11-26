import React from "react";
import styled, { css } from "styled-components";
import { theme } from "../../styles/theme";

export default function Button({
  children,
  variant = "primary",
  size = "md",
  isLoading = false,
  disabled = false,
  onClick,
  type = "button",
  icon = null,
  fullWidth = false,
  className,
  ...props
}) {
  return (
    <StyledButton
      type={type}
      variant={variant}
      size={size}
      disabled={disabled || isLoading}
      onClick={onClick}
      fullWidth={fullWidth}
      className={className}
      {...props}
    >
      {isLoading ? (
        <ButtonSpinner />
      ) : (
        <>
          {icon && <span className="btn-icon">{icon}</span>}
          <span>{children}</span>
        </>
      )}
    </StyledButton>
  );
}

const ButtonSpinner = styled.div`
  width: 1.1rem;
  height: 1.1rem;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
`;

const StyledButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  font-family: ${theme.typography.fontFamily};
  font-weight: 600;
  border-radius: ${theme.borderRadius.md};
  cursor: pointer;
  transition: ${theme.transitions.default};
  border: 1px solid transparent;
  outline: none;
  width: ${(props) => (props.fullWidth ? "100%" : "auto")};

  ${(props) =>
    props.size === "sm" &&
    css`
      padding: 0.4rem 0.8rem;
      font-size: 0.85rem;
    `}

  ${(props) =>
    props.size === "md" &&
    css`
      padding: 0.65rem 1.25rem;
      font-size: 0.95rem;
    `}

  ${(props) =>
    props.size === "lg" &&
    css`
      padding: 0.85rem 1.75rem;
      font-size: 1.05rem;
    `}

  /* Variants */
  ${(props) =>
    props.variant === "primary" &&
    css`
      background-color: ${theme.colors.primary};
      color: #fff;
      &:hover:not(:disabled) {
        background-color: ${theme.colors.primaryHover};
        box-shadow: ${theme.shadows.glow};
      }
    `}

  ${(props) =>
    props.variant === "secondary" &&
    css`
      background-color: ${theme.colors.bgCard};
      color: ${theme.colors.textPrimary};
      border-color: ${theme.colors.border};
      &:hover:not(:disabled) {
        background-color: ${theme.colors.bgCardHover};
        border-color: ${theme.colors.borderLight};
      }
    `}

  ${(props) =>
    props.variant === "ghost" &&
    css`
      background-color: transparent;
      color: ${theme.colors.textSecondary};
      &:hover:not(:disabled) {
        color: ${theme.colors.textPrimary};
        background-color: rgba(255, 255, 255, 0.06);
      }
    `}

  ${(props) =>
    props.variant === "danger" &&
    css`
      background-color: ${theme.colors.danger};
      color: #fff;
      &:hover:not(:disabled) {
        background-color: ${theme.colors.dangerHover};
      }
    `}

  ${(props) =>
    props.variant === "icon" &&
    css`
      padding: 0.6rem;
      border-radius: ${theme.borderRadius.full};
      background-color: transparent;
      color: ${theme.colors.textSecondary};
      &:hover:not(:disabled) {
        color: ${theme.colors.textPrimary};
        background-color: rgba(255, 255, 255, 0.08);
      }
    `}

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .btn-icon {
    display: inline-flex;
    align-items: center;
    font-size: 1.15em;
  }
`;
