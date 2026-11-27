import React, { Component } from "react";
import styled from "styled-components";
import LogoImg from "../../assets/connectx-logo.png";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, showDetails: false };
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

  handleGoHome = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = "/";
  };

  toggleDetails = () => {
    this.setState((prev) => ({ showDetails: !prev.showDetails }));
  };

  render() {
    if (this.state.hasError) {
      return (
        <ErrorOverlay>
          <ErrorCard>
            <BrandHeader>
              <img src={LogoImg} alt="ConnectX Logo" />
              <span>
                Connect<i>X</i>
              </span>
            </BrandHeader>

            <ErrorHeading>Something went wrong</ErrorHeading>
            <ErrorDescription>
              ConnectX encountered an unexpected client error. Don't worry, your data and messages remain secure.
            </ErrorDescription>

            <ButtonGroup>
              <PrimaryButton onClick={this.handleReload} type="button">
                Reload Application
              </PrimaryButton>
              <SecondaryButton onClick={this.handleGoHome} type="button">
                Back to Home
              </SecondaryButton>
            </ButtonGroup>

            {this.state.error && (
              <DetailsContainer>
                <DetailsToggle onClick={this.toggleDetails} type="button">
                  {this.state.showDetails ? "Hide error details ▲" : "Show technical details ▼"}
                </DetailsToggle>
                {this.state.showDetails && (
                  <StackTraceBox>
                    {this.state.error.toString()}
                    {"\n"}
                    {this.state.error.stack}
                  </StackTraceBox>
                )}
              </DetailsContainer>
            )}
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
  min-height: 100vh;
  min-height: 100dvh;
  width: 100vw;
  background-color: var(--bg-wallpaper, var(--bg, #F5F2ED));
  padding: 24px;
  box-sizing: border-box;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
`;

const ErrorCard = styled.div`
  background-color: var(--surf, #FFFFFF);
  border: 1px solid var(--line, rgba(0, 0, 0, 0.08));
  border-radius: 20px;
  padding: 36px 32px;
  text-align: center;
  max-width: 480px;
  width: 100%;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.08);
  box-sizing: border-box;
`;

const BrandHeader = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 24px;

  img {
    width: 28px;
    height: 28px;
    object-fit: contain;
    border-radius: 8px;
  }

  span {
    font-family: var(--font-serif, "Playfair Display", Georgia, serif);
    font-size: 18px;
    font-weight: 700;
    color: var(--ink, #252321);

    i {
      font-style: italic;
      color: var(--acc, #D98B70);
    }
  }
`;

const ErrorHeading = styled.h2`
  font-family: var(--font-serif, "Playfair Display", Georgia, serif);
  font-size: 22px;
  color: var(--ink, #252321);
  margin: 0 0 10px 0;
  font-weight: 700;
`;

const ErrorDescription = styled.p`
  color: var(--mut, #7A756F);
  font-size: 13.5px;
  line-height: 1.5;
  margin: 0 0 24px 0;
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 10px;
  justify-content: center;
  flex-wrap: wrap;
`;

const PrimaryButton = styled.button`
  background-color: var(--acc, #D98B70);
  color: #FFFFFF;
  border: none;
  padding: 10px 20px;
  border-radius: 10px;
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s ease, transform 0.1s ease;

  &:hover {
    opacity: 0.92;
  }
  &:active {
    transform: scale(0.98);
  }
`;

const SecondaryButton = styled.button`
  background: transparent;
  color: var(--ink, #252321);
  border: 1px solid var(--line, rgba(0, 0, 0, 0.15));
  padding: 10px 18px;
  border-radius: 10px;
  font-size: 13.5px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s ease;

  &:hover {
    background: var(--s2, rgba(0, 0, 0, 0.04));
  }
`;

const DetailsContainer = styled.div`
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px dashed var(--line, rgba(0, 0, 0, 0.1));
`;

const DetailsToggle = styled.button`
  background: none;
  border: none;
  color: var(--mut, #7A756F);
  font-size: 11.5px;
  cursor: pointer;
  padding: 4px;

  &:hover {
    color: var(--acc, #D98B70);
  }
`;

const StackTraceBox = styled.pre`
  background: rgba(0, 0, 0, 0.04);
  padding: 10px;
  border-radius: 8px;
  font-size: 11px;
  max-height: 120px;
  overflow: auto;
  text-align: left;
  color: #DC2626;
  white-space: pre-wrap;
  word-break: break-word;
  margin-top: 8px;
  border: 1px solid rgba(220, 38, 38, 0.2);
`;
