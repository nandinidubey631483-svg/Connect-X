import React, { Component } from "react";
import styled from "styled-components";
import { theme } from "../../styles/theme";
import Button from "./Button";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ConnectX Caught Component Error:", error, errorInfo);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <ErrorOverlay>
          <ErrorCard>
            <h2>Something went wrong</h2>
            <p>
              ConnectX encountered an unexpected client error. Please reload the application.
            </p>
            {this.state.error && (
              <pre
                style={{
                  background: "rgba(0,0,0,0.06)",
                  padding: "10px",
                  borderRadius: "8px",
                  fontSize: "12px",
                  maxWidth: "500px",
                  maxHeight: "150px",
                  overflow: "auto",
                  textAlign: "left",
                  color: "#d93838",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  margin: "12px 0",
                }}
              >
                {this.state.error.toString()}
                {"\n"}
                {this.state.error.stack}
              </pre>
            )}
            <Button variant="primary" onClick={this.handleReload}>
              Reload Application
            </Button>
          </ErrorCard>
        </ErrorOverlay>
      );
    }

    return this.props.children;
  }
}

const ErrorOverlay = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
  width: 100vw;
  background-color: ${theme.colors.bgDark};
  padding: 1.5rem;
  font-family: ${theme.typography.fontFamily};
`;

const ErrorCard = styled.div`
  background-color: ${theme.colors.bgCard};
  border: 1px solid ${theme.colors.border};
  border-radius: ${theme.borderRadius.lg};
  padding: 2.5rem;
  text-align: center;
  max-width: 28rem;
  box-shadow: ${theme.shadows.lg};

  h2 {
    color: ${theme.colors.danger};
    margin-bottom: 0.75rem;
  }

  p {
    color: ${theme.colors.textSecondary};
    font-size: 0.95rem;
    margin-bottom: 1.5rem;
    line-height: 1.5;
  }
`;
