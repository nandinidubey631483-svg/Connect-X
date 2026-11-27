import React from "react";
import styled from "styled-components";
import { theme } from "../../styles/theme";

export default function Input({
  label,
  error,
  icon,
  type = "text",
  placeholder,
  value,
  onChange,
  disabled = false,
  className,
  ...props
}) {
  return (
    <InputGroup className={className}>
      {label && <Label>{label}</Label>}
      <FieldWrapper hasIcon={!!icon} hasError={!!error}>
        {icon && <IconSlot>{icon}</IconSlot>}
        <StyledInput
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          disabled={disabled}
          hasIcon={!!icon}
          {...props}
        />
      </FieldWrapper>
      {error && <ErrorText>{error}</ErrorText>}
    </InputGroup>
  );
}

const InputGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  width: 100%;
`;

const Label = styled.label`
  font-size: 0.875rem;
  font-weight: 500;
  color: ${theme.colors.textSecondary};
  letter-spacing: 0.02em;
`;

const FieldWrapper = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  border: 1px solid ${(props) => (props.hasError ? theme.colors.danger : theme.colors.border)};
  border-radius: ${theme.borderRadius.md};
  background-color: ${theme.colors.bgInput};
  transition: ${theme.transitions.default};

  &:focus-within {
    border-color: ${(props) => (props.hasError ? theme.colors.danger : theme.colors.borderFocus)};
    box-shadow: 0 0 0 2px ${(props) => (props.hasError ? "rgba(239,68,68,0.2)" : "rgba(217, 139, 112,0.2)")};
  }
`;

const IconSlot = styled.div`
  position: absolute;
  left: 0.85rem;
  display: flex;
  align-items: center;
  color: ${theme.colors.textMuted};
  pointer-events: none;
  font-size: 1.1rem;
`;

const StyledInput = styled.input`
  width: 100%;
  padding: 0.65rem 0.85rem;
  padding-left: ${(props) => (props.hasIcon ? "2.6rem" : "0.85rem")};
  background: transparent;
  border: none;
  color: ${theme.colors.textPrimary};
  font-family: ${theme.typography.fontFamily};
  font-size: 0.95rem;
  outline: none;

  &::placeholder {
    color: ${theme.colors.textMuted};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const ErrorText = styled.span`
  font-size: 0.775rem;
  color: ${theme.colors.danger};
`;
