import React from "react";
import { useNavigate } from "react-router-dom";
import { BiPowerOff } from "react-icons/bi";
import styled from "styled-components";
import { useAuth } from "../hooks/useAuth";
import { theme } from "../styles/theme";

export default function Logout() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const handleClick = async () => {
    try {
      await logout();
    } finally {
      navigate("/login");
    }
  };

  return (
    <Button onClick={handleClick} title="Log Out" data-testid="logout-button">
      <BiPowerOff />
    </Button>
  );
}

const Button = styled.button`
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 0.5rem;
  border-radius: ${theme.borderRadius.md};
  background-color: transparent;
  border: 1px solid transparent;
  color: ${theme.colors.textSecondary};
  cursor: pointer;
  transition: ${theme.transitions.default};

  &:hover {
    background-color: rgba(239, 68, 68, 0.15);
    border-color: rgba(239, 68, 68, 0.3);
    color: ${theme.colors.danger};
  }

  svg {
    font-size: 1.25rem;
  }
`;
