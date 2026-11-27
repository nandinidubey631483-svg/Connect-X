import React, { useState, useEffect } from "react";
import styled from "styled-components";
import {
  FiArrowLeft,
  FiBell,
  FiLock,
  FiMessageSquare,
  FiSliders,
  FiCheck,
  FiRotateCcw,
} from "react-icons/fi";
import apiClient from "../../services/apiClient";
import { v1SettingsRoute, v1ResetSettingsRoute } from "../../services/apiRoutes";
import { toast } from "react-toastify";
import { useTheme } from "../../context/ThemeContext";

export default function SettingsView({ onBack }) {
  const { themeMode, toggleTheme } = useTheme();
  const [activeCategory, setActiveCategory] = useState("notifications");

  const [settings, setSettings] = useState({
    notifications: {
      emailNotifications: true,
      pushNotifications: true,
      soundEnabled: true,
      desktopAlerts: true,
    },
    privacy: {
      lastSeenVisibility: "everyone",
      readReceiptsEnabled: true,
      typingIndicatorVisibility: true,
    },
    chat: {
      enterToSend: true,
      fontSize: "medium",
      mediaAutoDownload: true,
      soundTheme: "default",
    },
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  useEffect(() => {
    async function fetchSettings() {
      setIsLoading(true);
      try {
        const res = await apiClient.get(v1SettingsRoute);
        if (res.data && res.data.settings) {
          setSettings((prev) => ({
            notifications: {
              ...prev.notifications,
              ...(res.data.settings.notifications || {}),
            },
            privacy: {
              ...prev.privacy,
              ...(res.data.settings.privacy || {}),
            },
            chat: {
              ...prev.chat,
              ...(res.data.settings.chat || {}),
            },
          }));
        }
      } catch (err) {
        toast.error("Failed to load settings");
      } finally {
        setIsLoading(false);
      }
    }
    fetchSettings();
  }, []);

  const handleToggle = (category, field) => {
    setSettings((prev) => ({
      ...prev,
      [category]: {
        ...prev[category],
        [field]: !prev[category][field],
      },
    }));
  };

  const handleSelectChange = (category, field, value) => {
    setSettings((prev) => ({
      ...prev,
      [category]: {
        ...prev[category],
        [field]: value,
      },
    }));
  };

  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const res = await apiClient.put(v1SettingsRoute, settings);
      if (res.data && res.data.success) {
        setSettings((prev) => ({
          notifications: {
            ...prev.notifications,
            ...(res.data.settings?.notifications || {}),
          },
          privacy: {
            ...prev.privacy,
            ...(res.data.settings?.privacy || {}),
          },
          chat: {
            ...prev.chat,
            ...(res.data.settings?.chat || {}),
          },
        }));
        toast.success("Settings saved successfully!");
      }
    } catch (err) {
      toast.error(err.response?.data?.error?.message || "Failed to save settings");
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    if (isResetting) return;
    if (!window.confirm("Are you sure you want to reset all preferences to defaults?")) {
      return;
    }
    setIsResetting(true);
    try {
      const res = await apiClient.post(v1ResetSettingsRoute);
      if (res.data && res.data.success) {
        setSettings(res.data.settings);
        toast.success("Settings reset to defaults");
      }
    } catch (err) {
      toast.error("Failed to reset settings");
    } finally {
      setIsResetting(false);
    }
  };

  const navItems = [
    { id: "notifications", label: "Notifications", icon: FiBell, desc: "Alerts, sounds & notifications" },
    { id: "privacy", label: "Privacy & Security", icon: FiLock, desc: "Last seen, read receipts & security" },
    { id: "chat", label: "Chat & Media", icon: FiMessageSquare, desc: "Input habits, font size & media" },
    { id: "appearance", label: "Appearance", icon: FiSliders, desc: "Theme mode & interface styling" },
  ];

  return (
    <PageContainer>
      <HeaderBar>
        <BackButton onClick={onBack} title="Back to conversations">
          <FiArrowLeft size={18} />
          <span>Back to Chats</span>
        </BackButton>
        <HeaderTitleGroup>
          <h2>Settings & Preferences</h2>
          <p>Customize notifications, privacy, appearance, and chat behavior</p>
        </HeaderTitleGroup>
      </HeaderBar>

      <ContentScroll>
        <LayoutWrapper>
          {/* Side Navigation Menu */}
          <NavSidebar>
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeCategory === item.id;
              return (
                <NavItem
                  key={item.id}
                  type="button"
                  className={isActive ? "active" : ""}
                  onClick={() => setActiveCategory(item.id)}
                >
                  <IconContainer className={isActive ? "active" : ""}>
                    <Icon size={18} />
                  </IconContainer>
                  <NavTextGroup>
                    <NavLabel>{item.label}</NavLabel>
                    <NavDesc>{item.desc}</NavDesc>
                  </NavTextGroup>
                </NavItem>
              );
            })}
          </NavSidebar>

          {/* Category Content Panel */}
          <SettingsPanel>
            {isLoading ? (
              <LoadingBox>Loading settings...</LoadingBox>
            ) : (
              <>
                {/* 1. NOTIFICATIONS */}
                {activeCategory === "notifications" && (
                  <CategorySection>
                    <SectionTitle>Notification Preferences</SectionTitle>
                    <SectionSubtitle>Control how and when you receive message alerts</SectionSubtitle>

                    <SettingRow>
                      <SettingInfo>
                        <SettingLabel>Push Notifications</SettingLabel>
                        <SettingDesc>Receive instant notifications for incoming direct messages</SettingDesc>
                      </SettingInfo>
                      <ToggleSwitch
                        type="checkbox"
                        checked={settings.notifications.pushNotifications}
                        onChange={() => handleToggle("notifications", "pushNotifications")}
                      />
                    </SettingRow>

                    <SettingRow>
                      <SettingInfo>
                        <SettingLabel>Email Notifications</SettingLabel>
                        <SettingDesc>Receive email digests for unread messages and friend requests</SettingDesc>
                      </SettingInfo>
                      <ToggleSwitch
                        type="checkbox"
                        checked={settings.notifications.emailNotifications}
                        onChange={() => handleToggle("notifications", "emailNotifications")}
                      />
                    </SettingRow>

                    <SettingRow>
                      <SettingInfo>
                        <SettingLabel>Sound Effects</SettingLabel>
                        <SettingDesc>Play sound chime when sending and receiving messages</SettingDesc>
                      </SettingInfo>
                      <ToggleSwitch
                        type="checkbox"
                        checked={settings.notifications.soundEnabled}
                        onChange={() => handleToggle("notifications", "soundEnabled")}
                      />
                    </SettingRow>

                    <SettingRow>
                      <SettingInfo>
                        <SettingLabel>Desktop Alerts</SettingLabel>
                        <SettingDesc>Show system desktop popups when ConnectX is running in the background</SettingDesc>
                      </SettingInfo>
                      <ToggleSwitch
                        type="checkbox"
                        checked={settings.notifications.desktopAlerts}
                        onChange={() => handleToggle("notifications", "desktopAlerts")}
                      />
                    </SettingRow>
                  </CategorySection>
                )}

                {/* 2. PRIVACY & SECURITY */}
                {activeCategory === "privacy" && (
                  <CategorySection>
                    <SectionTitle>Privacy & Visibility</SectionTitle>
                    <SectionSubtitle>Manage who can see your presence and reading activity</SectionSubtitle>

                    <SettingRow>
                      <SettingInfo>
                        <SettingLabel>Last Seen Visibility</SettingLabel>
                        <SettingDesc>Choose who can see when you were last active</SettingDesc>
                      </SettingInfo>
                      <SelectInput
                        value={settings.privacy.lastSeenVisibility}
                        onChange={(e) => handleSelectChange("privacy", "lastSeenVisibility", e.target.value)}
                      >
                        <option value="everyone">Everyone</option>
                        <option value="contacts">My Contacts Only</option>
                        <option value="nobody">Nobody</option>
                      </SelectInput>
                    </SettingRow>

                    <SettingRow>
                      <SettingInfo>
                        <SettingLabel>Read Receipts</SettingLabel>
                        <SettingDesc>Show double blue checkmarks when you have read messages</SettingDesc>
                      </SettingInfo>
                      <ToggleSwitch
                        type="checkbox"
                        checked={settings.privacy.readReceiptsEnabled}
                        onChange={() => handleToggle("privacy", "readReceiptsEnabled")}
                      />
                    </SettingRow>

                    <SettingRow>
                      <SettingInfo>
                        <SettingLabel>Typing Indicators</SettingLabel>
                        <SettingDesc>Show typing bubble animation when composing a message</SettingDesc>
                      </SettingInfo>
                      <ToggleSwitch
                        type="checkbox"
                        checked={settings.privacy.typingIndicatorVisibility}
                        onChange={() => handleToggle("privacy", "typingIndicatorVisibility")}
                      />
                    </SettingRow>
                  </CategorySection>
                )}

                {/* 3. CHAT & MEDIA */}
                {activeCategory === "chat" && (
                  <CategorySection>
                    <SectionTitle>Chat Behavior & Media</SectionTitle>
                    <SectionSubtitle>Customize message input, text sizing, and media attachments</SectionSubtitle>

                    <SettingRow>
                      <SettingInfo>
                        <SettingLabel>Press Enter to Send</SettingLabel>
                        <SettingDesc>Pressing Enter will send message (Shift + Enter for new line)</SettingDesc>
                      </SettingInfo>
                      <ToggleSwitch
                        type="checkbox"
                        checked={settings.chat.enterToSend}
                        onChange={() => handleToggle("chat", "enterToSend")}
                      />
                    </SettingRow>

                    <SettingRow>
                      <SettingInfo>
                        <SettingLabel>Font Size</SettingLabel>
                        <SettingDesc>Adjust message bubble font size for easier reading</SettingDesc>
                      </SettingInfo>
                      <SelectInput
                        value={settings.chat.fontSize}
                        onChange={(e) => handleSelectChange("chat", "fontSize", e.target.value)}
                      >
                        <option value="small">Compact (Small)</option>
                        <option value="medium">Default (Medium)</option>
                        <option value="large">Spacious (Large)</option>
                      </SelectInput>
                    </SettingRow>

                    <SettingRow>
                      <SettingInfo>
                        <SettingLabel>Media Auto-Download</SettingLabel>
                        <SettingDesc>Automatically preload image and document attachments in active chats</SettingDesc>
                      </SettingInfo>
                      <ToggleSwitch
                        type="checkbox"
                        checked={settings.chat.mediaAutoDownload}
                        onChange={() => handleToggle("chat", "mediaAutoDownload")}
                      />
                    </SettingRow>
                  </CategorySection>
                )}

                {/* 4. APPEARANCE */}
                {activeCategory === "appearance" && (
                  <CategorySection>
                    <SectionTitle>Interface Appearance</SectionTitle>
                    <SectionSubtitle>Switch between light and dark display modes</SectionSubtitle>

                    <ThemeGrid>
                      <ThemeCard
                        type="button"
                        className={themeMode === "light" ? "selected" : ""}
                        onClick={() => themeMode !== "light" && toggleTheme()}
                      >
                        <ThemePreview className="light">
                          <div className="bar" />
                          <div className="bubble me" />
                          <div className="bubble them" />
                        </ThemePreview>
                        <ThemeTitle>Light Theme</ThemeTitle>
                        <ThemeDesc>Clean warm off-white palette</ThemeDesc>
                      </ThemeCard>

                      <ThemeCard
                        type="button"
                        className={themeMode === "dark" ? "selected" : ""}
                        onClick={() => themeMode !== "dark" && toggleTheme()}
                      >
                        <ThemePreview className="dark">
                          <div className="bar" />
                          <div className="bubble me" />
                          <div className="bubble them" />
                        </ThemePreview>
                        <ThemeTitle>Dark Theme</ThemeTitle>
                        <ThemeDesc>Sleek high-contrast dark palette</ThemeDesc>
                      </ThemeCard>
                    </ThemeGrid>
                  </CategorySection>
                )}

                {/* Footer Actions */}
                <ActionBar>
                  <ResetButton
                    type="button"
                    onClick={handleReset}
                    disabled={isResetting || isSaving}
                  >
                    <FiRotateCcw size={15} />
                    {isResetting ? "Resetting..." : "Reset Defaults"}
                  </ResetButton>

                  <SaveButton
                    type="button"
                    onClick={handleSave}
                    disabled={isSaving || isResetting}
                  >
                    <FiCheck size={16} />
                    {isSaving ? "Saving..." : "Save Preferences"}
                  </SaveButton>
                </ActionBar>
              </>
            )}
          </SettingsPanel>
        </LayoutWrapper>
      </ContentScroll>
    </PageContainer>
  );
}

const PageContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  background: var(--bg, #F5F4F0);
  overflow: hidden;
`;

const HeaderBar = styled.div`
  padding: 1.25rem 2rem;
  background: var(--surf, #FFFFFF);
  border-bottom: 1px solid var(--line, rgba(0, 0, 0, 0.08));
  display: flex;
  align-items: center;
  gap: 1.5rem;
  flex-shrink: 0;
`;

const BackButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border-radius: 10px;
  background: var(--s2, #FAF9F6);
  border: 1px solid var(--line, rgba(0, 0, 0, 0.08));
  color: var(--ink, #0F172A);
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease-in-out;

  &:hover {
    background: var(--acc2, #FBF3EF);
    color: var(--acc, #D98B70);
    border-color: var(--acc, #D98B70);
  }
`;

const HeaderTitleGroup = styled.div`
  h2 {
    font-size: 1.35rem;
    font-weight: 700;
    color: var(--ink, #0F172A);
    margin: 0;
    letter-spacing: -0.3px;
  }
  p {
    font-size: 0.85rem;
    color: var(--mut, #64748B);
    margin: 2px 0 0 0;
  }
`;

const ContentScroll = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 2rem;

  @media (max-width: 768px) {
    padding: 1rem;
  }
`;

const LayoutWrapper = styled.div`
  max-width: 1000px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 1.5rem;
  align-items: start;

  @media (max-width: 850px) {
    grid-template-columns: 1fr;
  }
`;

const NavSidebar = styled.div`
  background: var(--surf, #FFFFFF);
  border: 1px solid var(--line, rgba(0, 0, 0, 0.08));
  border-radius: 16px;
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.02);
`;

const NavItem = styled.button`
  display: flex;
  align-items: center;
  gap: 0.85rem;
  padding: 0.85rem 1rem;
  border-radius: 12px;
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: all 0.15s ease-in-out;

  &:hover {
    background: var(--s2, #FAF9F6);
  }

  &.active {
    background: var(--acc2, #FBF3EF);

    ${() => NavLabel} {
      color: var(--acc, #D98B70);
    }
  }
`;

const IconContainer = styled.div`
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--s2, #FAF9F6);
  color: var(--mut, #64748B);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.15s ease;

  &.active {
    background: var(--acc, #D98B70);
    color: white;
  }
`;

const NavTextGroup = styled.div`
  display: flex;
  flex-direction: column;
`;

const NavLabel = styled.div`
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--ink, #0F172A);
`;

const NavDesc = styled.div`
  font-size: 0.75rem;
  color: var(--mut, #64748B);
`;

const SettingsPanel = styled.div`
  background: var(--surf, #FFFFFF);
  border: 1px solid var(--line, rgba(0, 0, 0, 0.08));
  border-radius: 16px;
  padding: 2rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.02);
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
`;

const LoadingBox = styled.div`
  padding: 3rem;
  text-align: center;
  color: var(--mut, #64748B);
`;

const CategorySection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
`;

const SectionTitle = styled.h3`
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--ink, #0F172A);
  margin: 0;
`;

const SectionSubtitle = styled.p`
  font-size: 0.85rem;
  color: var(--mut, #64748B);
  margin: -0.5rem 0 0.5rem 0;
`;

const SettingRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 0;
  border-bottom: 1px solid var(--line, rgba(0, 0, 0, 0.06));

  &:last-child {
    border-bottom: none;
  }
`;

const SettingInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  max-width: 80%;
`;

const SettingLabel = styled.div`
  font-size: 0.92rem;
  font-weight: 600;
  color: var(--ink, #0F172A);
`;

const SettingDesc = styled.div`
  font-size: 0.8rem;
  color: var(--mut, #64748B);
`;

const ToggleSwitch = styled.input`
  appearance: none;
  width: 44px;
  height: 24px;
  border-radius: 14px;
  background: var(--s2, #E2E8F0);
  border: 1px solid var(--line, rgba(0, 0, 0, 0.1));
  position: relative;
  cursor: pointer;
  outline: none;
  transition: all 0.2s ease;

  &::before {
    content: "";
    position: absolute;
    top: 2px;
    left: 2px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: white;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
    transition: all 0.2s ease;
  }

  &:checked {
    background: var(--acc, #D98B70);
    border-color: var(--acc, #D98B70);

    &::before {
      transform: translateX(20px);
    }
  }
`;

const SelectInput = styled.select`
  background: var(--s2, #FAF9F6);
  border: 1px solid var(--line, rgba(0, 0, 0, 0.08));
  border-radius: 8px;
  color: var(--ink, #0F172A);
  padding: 0.5rem 0.85rem;
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;

  &:focus {
    border-color: var(--acc, #D98B70);
    outline: none;
  }
`;

const ThemeGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  margin-top: 0.5rem;

  @media (max-width: 600px) {
    grid-template-columns: 1fr;
  }
`;

const ThemeCard = styled.button`
  border: 2px solid var(--line, rgba(0, 0, 0, 0.08));
  border-radius: 14px;
  padding: 1rem;
  background: var(--surf, #FFFFFF);
  cursor: pointer;
  text-align: left;
  transition: all 0.2s ease;

  &.selected {
    border-color: var(--acc, #D98B70);
    background: var(--acc2, #FBF3EF);
  }

  &:hover {
    border-color: var(--acc, #D98B70);
  }
`;

const ThemePreview = styled.div`
  height: 80px;
  border-radius: 8px;
  margin-bottom: 0.85rem;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;

  &.light {
    background: #F5F4F0;
    .bar { background: #FFFFFF; height: 14px; border-radius: 4px; }
    .bubble.me { align-self: flex-end; width: 60%; height: 16px; background: #D98B70; border-radius: 6px; }
    .bubble.them { width: 50%; height: 16px; background: #FFFFFF; border-radius: 6px; }
  }

  &.dark {
    background: #0C0D14;
    .bar { background: #181A28; height: 14px; border-radius: 4px; }
    .bubble.me { align-self: flex-end; width: 60%; height: 16px; background: #D98B70; border-radius: 6px; }
    .bubble.them { width: 50%; height: 16px; background: #1E2030; border-radius: 6px; }
  }
`;

const ThemeTitle = styled.div`
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--ink, #0F172A);
`;

const ThemeDesc = styled.div`
  font-size: 0.8rem;
  color: var(--mut, #64748B);
`;

const ActionBar = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 1.5rem;
  border-top: 1px solid var(--line, rgba(0, 0, 0, 0.08));
  margin-top: 1rem;
`;

const ResetButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  background: transparent;
  color: var(--mut, #64748B);
  border: 1px solid var(--line, rgba(0, 0, 0, 0.08));
  padding: 0.6rem 1.1rem;
  border-radius: 10px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: var(--s2, #FAF9F6);
    color: var(--ink, #0F172A);
  }
`;

const SaveButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  background: var(--acc, #D98B70);
  color: white;
  border: none;
  padding: 0.65rem 1.6rem;
  border-radius: 10px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(217, 139, 112, 0.3);
  transition: all 0.15s ease-in-out;

  &:hover:not(:disabled) {
    background: #C4775D;
    transform: translateY(-1px);
  }
`;
