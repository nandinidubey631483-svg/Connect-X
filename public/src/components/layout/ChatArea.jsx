import React from "react";
import styled from "styled-components";
import { theme } from "../../styles/theme";

export default function ChatArea({ children, className }) {
  return <AreaContainer className={className}>{children}</AreaContainer>;
}

const AreaContainer = styled.main`
  display: flex;
  flex-direction: column;
  flex: 1;
  height: 100%;
  background-color: ${theme.colors.bgDark};
  overflow: hidden;
  position: relative;
`;
