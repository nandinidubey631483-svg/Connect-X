import React from "react";
import styled from "styled-components";
import { theme } from "../../styles/theme";

export default function Spinner({ size = "md", color = theme.colors.primary, className }) {
  return <StyledSpinner size={size} color={color} className={className} />;
}

const sizeMap = {
  sm: "1rem",
  md: "1.75rem",
  lg: "2.75rem",
};

const StyledSpinner = styled.div`
  width: ${(props) => sizeMap[props.size] || sizeMap.md};
  height: ${(props) => sizeMap[props.size] || sizeMap.md};
  border: 3px solid rgba(255, 255, 255, 0.15);
  border-top-color: ${(props) => props.color};
  border-radius: 50%;
  animation: spin 0.8s linear infinite;

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
`;
