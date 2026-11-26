import React, { useState } from "react";
import styled from "styled-components";
import { theme } from "../../styles/theme";
import Avatar from "../common/Avatar";
import Logout from "../Logout";
import ProfileModal from "../profile/ProfileModal";
import SettingsModal from "../settings/SettingsModal";
import ContactDiscoveryModal from "../contacts/ContactDiscoveryModal";
import NotificationDropdown from "../notifications/NotificationDropdown";
import { BiMenu, BiArrowBack } from "react-icons/bi";
import { FiUserPlus, FiSettings } from "react-icons/fi";
import Logo from "../../assets/logo.svg";

export default function Header({
  currentUser,
  currentChat,
  isMobile,
  showMobileSidebar,
  onToggleMobileSidebar,
  onBackToSidebar,
  onContactsUpdated,
  socket,
  onSelectChat,
}) {
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDiscoveryOpen, setIsDiscoveryOpen] = useState(false);

  return (
    <>
      <HeaderContainer>
        <LeftSection>
          {isMobile && currentChat && (
            <IconButton onClick={onBackToSidebar} title="Back to Contacts">
              <BiArrowBack />
            </IconButton>
          )}
          {isMobile && !currentChat && (
            <IconButton onClick={onToggleMobileSidebar} title="Toggle Menu">
              <BiMenu />
            </IconButton>
          )}
          <BrandWrapper>
            <img src={Logo} alt="ConnectX Logo" className="logo" />
            <BrandTitle>Connect<span>X</span></BrandTitle>
          </BrandWrapper>
        </LeftSection>

        <RightSection>
          {currentUser && (
            <>
              <UserBadge
                onClick={() => setIsProfileOpen(true)}
                title="View & Edit Profile"
                data-testid="header-user-badge"
              >
                <Avatar
                  image={currentUser.avatarImage}
                  name={currentUser.displayName || currentUser.username}
                  size="sm"
                  isOnline={true}
                  showStatus={true}
                />
                <UsernameText>{currentUser.displayName || currentUser.username}</UsernameText>
              </UserBadge>

              <IconButton
                onClick={() => setIsDiscoveryOpen(true)}
                title="Discover Contacts & Requests"
                data-testid="header-discovery-btn"
              >
                <FiUserPlus />
              </IconButton>

              <NotificationDropdown
                socket={socket}
                onSelectChat={onSelectChat}
              />

              <IconButton
                onClick={() => setIsSettingsOpen(true)}
                title="Settings & Preferences"
                data-testid="header-settings-btn"
              >
                <FiSettings />
              </IconButton>
            </>
          )}
          <Logout />
        </RightSection>
      </HeaderContainer>

      {isProfileOpen && (
        <ProfileModal
          isOpen={isProfileOpen}
          onClose={() => setIsProfileOpen(false)}
        />
      )}

      {isSettingsOpen && (
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}

      {isDiscoveryOpen && (
        <ContactDiscoveryModal
          isOpen={isDiscoveryOpen}
          onClose={() => setIsDiscoveryOpen(false)}
          onContactsUpdated={onContactsUpdated}
        />
      )}
    </>
  );
}

const HeaderContainer = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 4.25rem;
  padding: 0 1.5rem;
  background-color: ${theme.colors.bgHeader};
  border-bottom: 1px solid ${theme.colors.border};
  z-index: 20;
`;

const LeftSection = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
`;

const BrandWrapper = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  user-select: none;

  .logo {
    height: 2rem;
  }
`;

const BrandTitle = styled.h1`
  font-size: 1.35rem;
  font-weight: 700;
  color: ${theme.colors.textPrimary};
  letter-spacing: -0.02em;
  margin: 0;

  span {
    color: ${theme.colors.primaryLight};
  }
`;

const RightSection = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
`;

const UserBadge = styled.div`
  display: flex;
  align-items: center;
  gap: 0.65rem;
  cursor: pointer;
  padding: 0.35rem 0.65rem;
  border-radius: ${theme.borderRadius.full};
  background-color: ${theme.colors.bgCard};
  border: 1px solid ${theme.colors.border};
  transition: ${theme.transitions.default};

  &:hover {
    background-color: ${theme.colors.bgCardHover};
    border-color: ${theme.colors.borderLight};
  }
`;

const UsernameText = styled.span`
  color: ${theme.colors.textPrimary};
  font-weight: 600;
  font-size: 0.9rem;

  @media (max-width: 640px) {
    display: none;
  }
`;

const IconButton = styled.button`
  background: transparent;
  border: none;
  color: ${theme.colors.textSecondary};
  font-size: 1.25rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.5rem;
  border-radius: ${theme.borderRadius.md};
  transition: ${theme.transitions.default};

  &:hover {
    background: ${theme.colors.bgCardHover};
    color: ${theme.colors.textPrimary};
  }
`;
