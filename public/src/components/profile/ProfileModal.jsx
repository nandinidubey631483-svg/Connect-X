import React, { useState, useEffect, useRef } from "react";
import styled from "styled-components";
import Modal from "../common/Modal";
import Avatar from "../common/Avatar";
import { useAuth } from "../../hooks/useAuth";
import apiClient from "../../services/apiClient";
import { v1MyProfileRoute, v1UpdateAvatarRoute } from "../../services/apiRoutes";
import { toast } from "react-toastify";
import {
  MODERN_AVATARS,
  resizeImageToSquare,
} from "../../utils/avatarUtils";

export default function ProfileModal({ isOpen, onClose }) {
  const { user, updateUser } = useAuth();
  const fileInputRef = useRef(null);

  const [formData, setFormData] = useState({
    displayName: "",
    username: "",
    bio: "",
    phoneNumber: "",
    statusMessage: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isAvatarUpdating, setIsAvatarUpdating] = useState(false);
  const [showPresets, setShowPresets] = useState(false);

  useEffect(() => {
    async function loadProfile() {
      if (!isOpen) return;
      setIsLoading(true);
      setShowPresets(false);
      try {
        const res = await apiClient.get(v1MyProfileRoute);
        if (res.data && res.data.profile) {
          const p = res.data.profile;
          setFormData({
            displayName: p.displayName || "",
            username: p.username || "",
            bio: p.bio || "",
            phoneNumber: p.phoneNumber || "",
            statusMessage: p.statusMessage || "",
          });
        }
      } catch (err) {
        // Fallback to local user context if profile endpoint is pending
        if (user) {
          setFormData({
            displayName: user.displayName || "",
            username: user.username || "",
            bio: user.bio || "",
            phoneNumber: user.phoneNumber || "",
            statusMessage: user.statusMessage || "",
          });
        }
      } finally {
        setIsLoading(false);
      }
    }
    loadProfile();
  }, [isOpen, user]);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  // Upload custom profile picture from file system
  const handlePhotoUpload = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    // Reset file input value so same file can be re-selected if desired
    e.target.value = "";

    try {
      setIsAvatarUpdating(true);
      const compressedDataUrl = await resizeImageToSquare(file, 256, 0.9);

      const res = await apiClient.post(v1UpdateAvatarRoute, {
        image: compressedDataUrl,
      });

      if (res.data && res.data.success) {
        if (updateUser) {
          updateUser({
            ...user,
            avatarImage: compressedDataUrl,
            isAvatarImageSet: true,
          });
        }
        toast.success("Profile photo updated successfully!");
      } else {
        toast.error("Failed to update profile photo.");
      }
    } catch (err) {
      const msg =
        err.response?.data?.error?.message ||
        err.message ||
        "Failed to upload photo";
      toast.error(msg);
    } finally {
      setIsAvatarUpdating(false);
    }
  };

  // Select a modern designer avatar preset
  const handleSelectPreset = async (presetData) => {
    try {
      setIsAvatarUpdating(true);
      const res = await apiClient.post(v1UpdateAvatarRoute, {
        image: presetData,
      });

      if (res.data && res.data.success) {
        if (updateUser) {
          updateUser({
            ...user,
            avatarImage: presetData,
            isAvatarImageSet: true,
          });
        }
        toast.success("Avatar updated!");
        setShowPresets(false);
      } else {
        toast.error("Failed to set avatar.");
      }
    } catch (err) {
      const msg =
        err.response?.data?.error?.message ||
        err.message ||
        "Failed to set avatar";
      toast.error(msg);
    } finally {
      setIsAvatarUpdating(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (isSaving) return;
    setIsSaving(true);

    try {
      const res = await apiClient.put(v1MyProfileRoute, formData);
      if (res.data && res.data.success) {
        if (updateUser) {
          updateUser({
            ...user,
            ...res.data.profile,
          });
        }
        toast.success("Profile updated successfully!");
        onClose();
      }
    } catch (err) {
      const msg =
        err.response?.data?.error?.message ||
        err.message ||
        "Failed to update profile";
      toast.error(msg);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="User Profile">
      {isLoading ? (
        <LoadingState data-testid="profile-loading">Loading profile...</LoadingState>
      ) : (
        <Form onSubmit={handleSave} data-testid="profile-form">
          {/* Avatar & Photo Management Section */}
          <AvatarSection>
            <AvatarWrapper>
              <Avatar
                image={user?.avatarImage}
                name={formData.displayName || formData.username || user?.username}
                size="xl"
                shape="rounded"
              />
              <CameraBadge
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isAvatarUpdating}
                title="Upload profile photo"
                aria-label="Upload photo"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              </CameraBadge>
            </AvatarWrapper>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handlePhotoUpload}
              accept="image/png,image/jpeg,image/webp,image/gif"
              style={{ display: "none" }}
              data-testid="profile-photo-input"
            />

            <AvatarActions>
              <ActionButton
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isAvatarUpdating}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                {isAvatarUpdating ? "Updating..." : "Upload Photo"}
              </ActionButton>

              <ActionButton
                type="button"
                onClick={() => setShowPresets(!showPresets)}
                disabled={isAvatarUpdating}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                  <line x1="9" y1="9" x2="9.01" y2="9" />
                  <line x1="15" y1="9" x2="15.01" y2="9" />
                </svg>
                {showPresets ? "Hide Avatars" : "Choose Avatar"}
              </ActionButton>
            </AvatarActions>

            {/* Modern Avatar Presets Grid */}
            {showPresets && (
              <PresetsGrid>
                <PresetsTitle>Select a designer avatar:</PresetsTitle>
                <PresetsRow>
                  {MODERN_AVATARS.map((preset) => (
                    <PresetCard
                      key={preset.id}
                      type="button"
                      onClick={() => handleSelectPreset(preset.data)}
                      disabled={isAvatarUpdating}
                      title={preset.label}
                    >
                      <img src={preset.data} alt={preset.label} />
                    </PresetCard>
                  ))}
                </PresetsRow>
              </PresetsGrid>
            )}
          </AvatarSection>

          <FormGroup>
            <Label htmlFor="displayName">Display Name</Label>
            <Input
              id="displayName"
              name="displayName"
              type="text"
              placeholder="e.g. Alice Wonderland"
              value={formData.displayName}
              onChange={handleChange}
              maxLength={50}
            />
          </FormGroup>

          <FormGroup>
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              name="username"
              type="text"
              placeholder="Username"
              value={formData.username}
              onChange={handleChange}
              minLength={3}
              maxLength={20}
              required
            />
          </FormGroup>

          <FormGroup>
            <Label htmlFor="statusMessage">Status Message</Label>
            <Input
              id="statusMessage"
              name="statusMessage"
              type="text"
              placeholder="e.g. Available / Working remotely"
              value={formData.statusMessage}
              onChange={handleChange}
              maxLength={100}
            />
          </FormGroup>

          <FormGroup>
            <Label htmlFor="bio">About / Bio</Label>
            <TextArea
              id="bio"
              name="bio"
              rows={3}
              placeholder="Tell others a bit about yourself..."
              value={formData.bio}
              onChange={handleChange}
              maxLength={250}
            />
          </FormGroup>

          <FormGroup>
            <Label htmlFor="phoneNumber">Phone Number</Label>
            <Input
              id="phoneNumber"
              name="phoneNumber"
              type="tel"
              placeholder="+1 234 567 8900"
              value={formData.phoneNumber}
              onChange={handleChange}
              maxLength={20}
            />
          </FormGroup>

          <ButtonGroup>
            <CancelButton type="button" onClick={onClose} disabled={isSaving || isAvatarUpdating}>
              Cancel
            </CancelButton>
            <SaveButton type="submit" disabled={isSaving || isAvatarUpdating} data-testid="save-profile-btn">
              {isSaving ? "Saving..." : "Save Changes"}
            </SaveButton>
          </ButtonGroup>
        </Form>
      )}
    </Modal>
  );
}

const LoadingState = styled.div`
  color: var(--muted, #64748B);
  text-align: center;
  padding: 2rem;
  font-size: 0.95rem;
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
`;

const AvatarSection = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0 1rem;
  border-bottom: 1px solid var(--line, rgba(0, 0, 0, 0.08));
  margin-bottom: 0.25rem;
`;

const AvatarWrapper = styled.div`
  position: relative;
  display: inline-block;
`;

const CameraBadge = styled.button`
  position: absolute;
  bottom: -4px;
  right: -4px;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--acc, #6366F1);
  color: white;
  border: 2px solid var(--surf, #FFFFFF);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(99, 102, 241, 0.35);
  transition: all 0.15s ease-in-out;

  &:hover:not(:disabled) {
    background: var(--acc2, #4F46E5);
    transform: scale(1.08);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const AvatarActions = styled.div`
  display: flex;
  align-items: center;
  gap: 0.6rem;
`;

const ActionButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.8rem;
  border-radius: 8px;
  font-size: 0.8rem;
  font-weight: 500;
  background: var(--s2, #FAF9F6);
  color: var(--ink, #0F172A);
  border: 1px solid var(--line, rgba(0, 0, 0, 0.08));
  cursor: pointer;
  transition: all 0.15s ease-in-out;

  &:hover:not(:disabled) {
    background: var(--surf, #FFFFFF);
    border-color: var(--acc, #6366F1);
    color: var(--acc, #6366F1);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const PresetsGrid = styled.div`
  width: 100%;
  background: var(--s2, #FAF9F6);
  border-radius: 12px;
  padding: 0.8rem;
  border: 1px solid var(--line, rgba(0, 0, 0, 0.08));
  animation: fadeIn 0.2s ease-out;

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
`;

const PresetsTitle = styled.div`
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--muted, #64748B);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 0.6rem;
  text-align: center;
`;

const PresetsRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  flex-wrap: wrap;
`;

const PresetCard = styled.button`
  width: 46px;
  height: 46px;
  border-radius: 12px;
  padding: 2px;
  background: transparent;
  border: 2px solid transparent;
  cursor: pointer;
  transition: all 0.15s ease-in-out;
  display: flex;
  align-items: center;
  justify-content: center;

  img {
    width: 100%;
    height: 100%;
    border-radius: 10px;
    object-fit: cover;
  }

  &:hover:not(:disabled) {
    transform: scale(1.12);
    border-color: var(--acc, #6366F1);
    box-shadow: 0 4px 10px rgba(99, 102, 241, 0.25);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
`;

const Label = styled.label`
  color: var(--ink, #0F172A);
  font-size: 0.85rem;
  font-weight: 500;
`;

const Input = styled.input`
  background-color: var(--s2, #FAF9F6);
  border: 1px solid var(--line, rgba(0, 0, 0, 0.08));
  border-radius: 8px;
  color: var(--ink, #0F172A);
  padding: 0.65rem 0.85rem;
  font-size: 0.9rem;
  transition: border-color 0.15s ease;

  &:focus {
    border-color: var(--acc, #6366F1);
    outline: none;
    box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.15);
  }
`;

const TextArea = styled.textarea`
  background-color: var(--s2, #FAF9F6);
  border: 1px solid var(--line, rgba(0, 0, 0, 0.08));
  border-radius: 8px;
  color: var(--ink, #0F172A);
  padding: 0.65rem 0.85rem;
  font-size: 0.9rem;
  resize: vertical;
  transition: border-color 0.15s ease;

  &:focus {
    border-color: var(--acc, #6366F1);
    outline: none;
    box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.15);
  }
`;

const ButtonGroup = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 0.8rem;
  margin-top: 0.5rem;
`;

const CancelButton = styled.button`
  background-color: transparent;
  color: var(--muted, #64748B);
  border: 1px solid var(--line, rgba(0, 0, 0, 0.08));
  padding: 0.55rem 1.1rem;
  border-radius: 8px;
  font-weight: 500;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.15s ease-in-out;

  &:hover:not(:disabled) {
    background-color: var(--s2, #FAF9F6);
    color: var(--ink, #0F172A);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const SaveButton = styled.button`
  background: var(--acc, #6366F1);
  color: white;
  border: none;
  padding: 0.55rem 1.3rem;
  border-radius: 8px;
  font-weight: 500;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.15s ease-in-out;

  &:hover:not(:disabled) {
    background: var(--acc2, #4F46E5);
    box-shadow: 0 2px 8px rgba(99, 102, 241, 0.35);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;
