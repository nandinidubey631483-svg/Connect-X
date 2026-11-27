import React, { useState, useEffect } from "react";
import styled from "styled-components";
import Modal from "../common/Modal";
import apiClient from "../../services/apiClient";
import { v1SettingsRoute, v1ResetSettingsRoute } from "../../services/apiRoutes";
import { toast } from "react-toastify";

export default function SettingsModal({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState("notifications");
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

  useEffect(() => {
    async function fetchSettings() {
      if (!isOpen) return;
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
        if (err.response?.status !== 401 && err.message !== "Session expired. Please log in again.") {
          toast.error("Failed to load settings");
        }
      } finally {
        setIsLoading(false);
      }
    }
    fetchSettings();
  }, [isOpen]);

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
        onClose();
      }
    } catch (err) {
      toast.error(err.response?.data?.error?.message || "Failed to update settings");
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const res = await apiClient.post(v1ResetSettingsRoute);
      if (res.data && res.data.success) {
        setSettings(res.data.settings);
        toast.info("Settings reset to defaults");
      }
    } catch (err) {
      toast.error("Failed to reset settings");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Settings & Preferences">
      <TabHeader>
        <TabButton
          active={activeTab === "notifications"}
          onClick={() => setActiveTab("notifications")}
          data-testid="tab-notifications"
        >
          Notifications
        </TabButton>
        <TabButton
          active={activeTab === "privacy"}
          onClick={() => setActiveTab("privacy")}
          data-testid="tab-privacy"
        >
          Privacy
        </TabButton>
        <TabButton
          active={activeTab === "chat"}
          onClick={() => setActiveTab("chat")}
          data-testid="tab-chat"
        >
          Chat Preferences
        </TabButton>
      </TabHeader>

      {isLoading ? (
        <LoadingState data-testid="settings-loading">Loading preferences...</LoadingState>
      ) : (
        <Content data-testid="settings-content">
          {/* Notifications Tab */}
          {activeTab === "notifications" && (
            <TabPanel>
              <SettingRow>
                <SettingInfo>
                  <SettingTitle>Email Notifications</SettingTitle>
                  <SettingDesc>Receive email summaries when offline</SettingDesc>
                </SettingInfo>
                <ToggleSwitch>
                  <input
                    type="checkbox"
                    checked={!!settings.notifications.emailNotifications}
                    onChange={() => handleToggle("notifications", "emailNotifications")}
                    data-testid="toggle-emailNotifications"
                  />
                  <span className="slider" />
                </ToggleSwitch>
              </SettingRow>

              <SettingRow>
                <SettingInfo>
                  <SettingTitle>Push Notifications</SettingTitle>
                  <SettingDesc>Get instant mobile and web push alerts</SettingDesc>
                </SettingInfo>
                <ToggleSwitch>
                  <input
                    type="checkbox"
                    checked={!!settings.notifications.pushNotifications}
                    onChange={() => handleToggle("notifications", "pushNotifications")}
                    data-testid="toggle-pushNotifications"
                  />
                  <span className="slider" />
                </ToggleSwitch>
              </SettingRow>

              <SettingRow>
                <SettingInfo>
                  <SettingTitle>Message Sounds</SettingTitle>
                  <SettingDesc>Play sound effects for incoming and sent messages</SettingDesc>
                </SettingInfo>
                <ToggleSwitch>
                  <input
                    type="checkbox"
                    checked={!!settings.notifications.soundEnabled}
                    onChange={() => handleToggle("notifications", "soundEnabled")}
                    data-testid="toggle-soundEnabled"
                  />
                  <span className="slider" />
                </ToggleSwitch>
              </SettingRow>

              <SettingRow>
                <SettingInfo>
                  <SettingTitle>Desktop Alerts</SettingTitle>
                  <SettingDesc>Show system banner notifications on desktop</SettingDesc>
                </SettingInfo>
                <ToggleSwitch>
                  <input
                    type="checkbox"
                    checked={!!settings.notifications.desktopAlerts}
                    onChange={() => handleToggle("notifications", "desktopAlerts")}
                    data-testid="toggle-desktopAlerts"
                  />
                  <span className="slider" />
                </ToggleSwitch>
              </SettingRow>
            </TabPanel>
          )}

          {/* Privacy Tab */}
          {activeTab === "privacy" && (
            <TabPanel>
              <SettingRow>
                <SettingInfo>
                  <SettingTitle>Last Seen Visibility</SettingTitle>
                  <SettingDesc>Choose who can see when you were last online</SettingDesc>
                </SettingInfo>
                <Select
                  value={settings.privacy.lastSeenVisibility}
                  onChange={(e) => handleSelectChange("privacy", "lastSeenVisibility", e.target.value)}
                  data-testid="select-lastSeenVisibility"
                >
                  <option value="everyone">Everyone</option>
                  <option value="contacts">My Contacts Only</option>
                  <option value="nobody">Nobody</option>
                </Select>
              </SettingRow>

              <SettingRow>
                <SettingInfo>
                  <SettingTitle>Read Receipts</SettingTitle>
                  <SettingDesc>Let conversation partners know when you've read their messages</SettingDesc>
                </SettingInfo>
                <ToggleSwitch>
                  <input
                    type="checkbox"
                    checked={!!settings.privacy.readReceiptsEnabled}
                    onChange={() => handleToggle("privacy", "readReceiptsEnabled")}
                    data-testid="toggle-readReceiptsEnabled"
                  />
                  <span className="slider" />
                </ToggleSwitch>
              </SettingRow>

              <SettingRow>
                <SettingInfo>
                  <SettingTitle>Typing Indicators</SettingTitle>
                  <SettingDesc>Show when you are actively composing a message</SettingDesc>
                </SettingInfo>
                <ToggleSwitch>
                  <input
                    type="checkbox"
                    checked={!!settings.privacy.typingIndicatorVisibility}
                    onChange={() => handleToggle("privacy", "typingIndicatorVisibility")}
                    data-testid="toggle-typingIndicatorVisibility"
                  />
                  <span className="slider" />
                </ToggleSwitch>
              </SettingRow>
            </TabPanel>
          )}

          {/* Chat Preferences Tab */}
          {activeTab === "chat" && (
            <TabPanel>
              <SettingRow>
                <SettingInfo>
                  <SettingTitle>Enter to Send</SettingTitle>
                  <SettingDesc>Pressing Enter will immediately dispatch message</SettingDesc>
                </SettingInfo>
                <ToggleSwitch>
                  <input
                    type="checkbox"
                    checked={!!settings.chat.enterToSend}
                    onChange={() => handleToggle("chat", "enterToSend")}
                    data-testid="toggle-enterToSend"
                  />
                  <span className="slider" />
                </ToggleSwitch>
              </SettingRow>

              <SettingRow>
                <SettingInfo>
                  <SettingTitle>Chat Font Size</SettingTitle>
                  <SettingDesc>Adjust message reading size across chats</SettingDesc>
                </SettingInfo>
                <Select
                  value={settings.chat.fontSize}
                  onChange={(e) => handleSelectChange("chat", "fontSize", e.target.value)}
                  data-testid="select-fontSize"
                >
                  <option value="small">Small</option>
                  <option value="medium">Medium</option>
                  <option value="large">Large</option>
                </Select>
              </SettingRow>

              <SettingRow>
                <SettingInfo>
                  <SettingTitle>Auto-Download Media</SettingTitle>
                  <SettingDesc>Automatically fetch incoming images and media</SettingDesc>
                </SettingInfo>
                <ToggleSwitch>
                  <input
                    type="checkbox"
                    checked={!!settings.chat.mediaAutoDownload}
                    onChange={() => handleToggle("chat", "mediaAutoDownload")}
                    data-testid="toggle-mediaAutoDownload"
                  />
                  <span className="slider" />
                </ToggleSwitch>
              </SettingRow>

              <SettingRow>
                <SettingInfo>
                  <SettingTitle>Sound Theme</SettingTitle>
                  <SettingDesc>Auditory theme for incoming events</SettingDesc>
                </SettingInfo>
                <Select
                  value={settings.chat.soundTheme}
                  onChange={(e) => handleSelectChange("chat", "soundTheme", e.target.value)}
                  data-testid="select-soundTheme"
                >
                  <option value="default">Default</option>
                  <option value="subtle">Subtle</option>
                  <option value="none">Mute (None)</option>
                </Select>
              </SettingRow>
            </TabPanel>
          )}

          <Footer>
            <ResetButton onClick={handleReset} disabled={isSaving} data-testid="reset-settings-btn">
              Reset Defaults
            </ResetButton>
            <RightButtons>
              <CancelButton onClick={onClose} disabled={isSaving}>
                Cancel
              </CancelButton>
              <SaveButton onClick={handleSave} disabled={isSaving} data-testid="save-settings-btn">
                {isSaving ? "Saving..." : "Save Settings"}
              </SaveButton>
            </RightButtons>
          </Footer>
        </Content>
      )}
    </Modal>
  );
}

const TabHeader = styled.div`
  display: flex;
  gap: 0.5rem;
  border-bottom: 1px solid #2b2b4d;
  padding-bottom: 0.5rem;
  margin-bottom: 1rem;
`;

const TabButton = styled.button`
  background: transparent;
  border: none;
  color: ${(props) => (props.active ? "#D98B70" : "#9a9a9a")};
  font-weight: ${(props) => (props.active ? "600" : "500")};
  font-size: 0.9rem;
  padding: 0.5rem 0.8rem;
  cursor: pointer;
  border-bottom: 2px solid ${(props) => (props.active ? "#D98B70" : "transparent")};
  transition: all 0.2s ease-in-out;

  &:hover {
    color: #ebe7ff;
  }
`;

const LoadingState = styled.div`
  color: #c4c4de;
  text-align: center;
  padding: 2.5rem;
  font-size: 1rem;
`;

const Content = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const TabPanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const SettingRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 0;
  border-bottom: 1px solid #1f1f38;
`;

const SettingInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  max-width: 70%;
`;

const SettingTitle = styled.span`
  color: #ebe7ff;
  font-size: 0.95rem;
  font-weight: 500;
`;

const SettingDesc = styled.span`
  color: #9a9a9a;
  font-size: 0.8rem;
`;

const Select = styled.select`
  background-color: #131324;
  border: 1px solid #D98B70;
  border-radius: 0.4rem;
  color: white;
  padding: 0.4rem 0.8rem;
  font-size: 0.85rem;

  &:focus {
    border-color: #C4775D;
    outline: none;
  }
`;

const ToggleSwitch = styled.label`
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;

  input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .slider {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: #2b2b4d;
    transition: 0.3s;
    border-radius: 24px;
  }

  .slider:before {
    position: absolute;
    content: "";
    height: 18px;
    width: 18px;
    left: 3px;
    bottom: 3px;
    background-color: white;
    transition: 0.3s;
    border-radius: 50%;
  }

  input:checked + .slider {
    background-color: #D98B70;
  }

  input:checked + .slider:before {
    transform: translateX(20px);
  }
`;

const Footer = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid #2b2b4d;
`;

const RightButtons = styled.div`
  display: flex;
  gap: 0.8rem;
`;

const ResetButton = styled.button`
  background-color: transparent;
  color: #ff6b6b;
  border: none;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  text-decoration: underline;

  &:hover:not(:disabled) {
    color: #ff8787;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const CancelButton = styled.button`
  background-color: transparent;
  color: #c4c4de;
  border: 1px solid #3d3d6b;
  padding: 0.5rem 1rem;
  border-radius: 0.4rem;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;

  &:hover:not(:disabled) {
    background-color: #2b2b4d;
  }
`;

const SaveButton = styled.button`
  background-color: #D98B70;
  color: white;
  border: none;
  padding: 0.5rem 1.2rem;
  border-radius: 0.4rem;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;

  &:hover:not(:disabled) {
    background-color: #C4775D;
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;
