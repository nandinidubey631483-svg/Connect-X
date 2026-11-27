import React, { useState, useEffect, useRef } from "react";
import styled from "styled-components";
import { FiArrowLeft, FiCamera, FiCheck, FiSmile } from "react-icons/fi";
import Avatar from "../common/Avatar";
import { useAuth } from "../../hooks/useAuth";
import apiClient from "../../services/apiClient";
import { v1MyProfileRoute, v1UpdateAvatarRoute } from "../../services/apiRoutes";
import { toast } from "react-toastify";
import { MODERN_AVATARS, resizeImageToSquare } from "../../utils/avatarUtils";
import { validateUsername, PHONE_REGEX } from "../../utils/validators";

export default function ProfileView({ onBack }) {
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
  const [showPresets, setShowPresets] = useState(true);

  useEffect(() => {
    async function loadProfile() {
      setIsLoading(true);
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
  }, [user]);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    e.target.value = "";

    if (!file.type || !file.type.startsWith("image/")) {
      toast.error("Selected file must be an image (JPEG, PNG, WebP, GIF)");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error("Selected image exceeds 10MB limit");
      return;
    }

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
      toast.error(err.message || "Failed to upload photo");
    } finally {
      setIsAvatarUpdating(false);
    }
  };

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
      } else {
        toast.error("Failed to set avatar.");
      }
    } catch (err) {
      toast.error(err.message || "Failed to set avatar");
    } finally {
      setIsAvatarUpdating(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (isSaving) return;

    if (formData.displayName && formData.displayName.length > 50) {
      toast.error("Display name must be 50 characters or less");
      return;
    }
    if (formData.bio && formData.bio.length > 250) {
      toast.error("Bio must be 250 characters or less");
      return;
    }
    if (formData.phoneNumber && !PHONE_REGEX.test(formData.phoneNumber.trim())) {
      toast.error("Please provide a valid phone number");
      return;
    }
    if (formData.statusMessage && formData.statusMessage.length > 100) {
      toast.error("Status message must be 100 characters or less");
      return;
    }
    if (formData.username && formData.username !== user?.username) {
      const uVal = validateUsername(formData.username);
      if (!uVal.isValid) {
        toast.error(uVal.error);
        return;
      }
    }

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
        toast.success("Profile saved successfully!");
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
    <PageContainer>
      {/* Top Header */}
      <HeaderBar>
        <BackButton onClick={onBack} title="Back to conversations">
          <FiArrowLeft size={18} />
          <span>Back to Chats</span>
        </BackButton>
        <HeaderTitleGroup>
          <h2>Profile & Account</h2>
          <p>Manage your public identity, custom avatar, and personal details</p>
        </HeaderTitleGroup>
      </HeaderBar>

      {/* Main Content Area */}
      <ContentScroll>
        <ContentWrapper>
          {isLoading ? (
            <LoadingBox>Loading profile information...</LoadingBox>
          ) : (
            <Form onSubmit={handleSave} data-testid="profile-page-form">
              {/* Left Column: Avatar & Photo Management */}
              <AvatarCard>
                <CardTitle>Profile Picture</CardTitle>
                <AvatarPreviewSection>
                  <AvatarWrapper>
                    <Avatar
                      image={user?.avatarImage}
                      name={formData.displayName || formData.username || user?.username}
                      size="2xl"
                      shape="rounded"
                    />
                    <CameraBadge
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isAvatarUpdating}
                      title="Upload custom photo"
                    >
                      <FiCamera size={18} />
                    </CameraBadge>
                  </AvatarWrapper>

                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handlePhotoUpload}
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    style={{ display: "none" }}
                  />

                  <AvatarButtonRow>
                    <UploadButton
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isAvatarUpdating}
                    >
                      <FiCamera size={14} />
                      {isAvatarUpdating ? "Updating..." : "Upload New Photo"}
                    </UploadButton>
                    <PresetToggleButton
                      type="button"
                      onClick={() => setShowPresets(!showPresets)}
                    >
                      <FiSmile size={14} />
                      {showPresets ? "Hide Avatars" : "Choose Preset"}
                    </PresetToggleButton>
                  </AvatarButtonRow>
                </AvatarPreviewSection>

                {showPresets && (
                  <PresetSection>
                    <PresetLabel>Designer Avatars:</PresetLabel>
                    <PresetGrid>
                      {MODERN_AVATARS.map((preset) => (
                        <PresetOption
                          key={preset.id}
                          type="button"
                          onClick={() => handleSelectPreset(preset.data)}
                          disabled={isAvatarUpdating}
                          title={preset.label}
                        >
                          <img src={preset.data} alt={preset.label} />
                        </PresetOption>
                      ))}
                    </PresetGrid>
                  </PresetSection>
                )}

                <IdentityMeta>
                  <MetaItem>
                    <MetaLabel>Username</MetaLabel>
                    <MetaValue>@{formData.username || user?.username}</MetaValue>
                  </MetaItem>
                  <MetaItem>
                    <MetaLabel>Status</MetaLabel>
                    <StatusPill>
                      <span className="dot" /> Active Now
                    </StatusPill>
                  </MetaItem>
                </IdentityMeta>
              </AvatarCard>

              {/* Right Column: Personal Information Form */}
              <DetailsCard>
                <CardTitle>Personal Details</CardTitle>

                <FormRow>
                  <FormGroup>
                    <Label htmlFor="displayName">Display Name</Label>
                    <Input
                      id="displayName"
                      name="displayName"
                      type="text"
                      placeholder="e.g. Aarav Mehta"
                      value={formData.displayName}
                      onChange={handleChange}
                      maxLength={50}
                    />
                    <FieldHint>This name appears in chats and discovery.</FieldHint>
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
                    <FieldHint>Unique identifier used for searching contacts.</FieldHint>
                  </FormGroup>
                </FormRow>

                <FormGroup>
                  <Label htmlFor="statusMessage">Status Message</Label>
                  <Input
                    id="statusMessage"
                    name="statusMessage"
                    type="text"
                    placeholder="e.g. In a meeting / Available for quick sync"
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
                    rows={4}
                    placeholder="Write a few words about what you work on or your interests..."
                    value={formData.bio}
                    onChange={handleChange}
                    maxLength={250}
                  />
                  <CharCount>{(formData.bio || "").length}/250 characters</CharCount>
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

                {/* Submit Bar */}
                <ActionBar>
                  <DiscardButton type="button" onClick={onBack} disabled={isSaving}>
                    Cancel
                  </DiscardButton>
                  <SaveButton type="submit" disabled={isSaving || isAvatarUpdating}>
                    <FiCheck size={16} />
                    {isSaving ? "Saving..." : "Save Changes"}
                  </SaveButton>
                </ActionBar>
              </DetailsCard>
            </Form>
          )}
        </ContentWrapper>
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
    background: var(--acc2, #EEEDFD);
    color: var(--acc, #4F46E5);
    border-color: var(--acc, #4F46E5);
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

const ContentWrapper = styled.div`
  max-width: 1000px;
  margin: 0 auto;
`;

const LoadingBox = styled.div`
  padding: 3rem;
  text-align: center;
  color: var(--mut, #64748B);
  font-size: 1rem;
`;

const Form = styled.form`
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 1.5rem;
  align-items: start;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`;

const AvatarCard = styled.div`
  background: var(--surf, #FFFFFF);
  border: 1px solid var(--line, rgba(0, 0, 0, 0.08));
  border-radius: 16px;
  padding: 1.5rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.02);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.25rem;
`;

const DetailsCard = styled.div`
  background: var(--surf, #FFFFFF);
  border: 1px solid var(--line, rgba(0, 0, 0, 0.08));
  border-radius: 16px;
  padding: 1.75rem 2rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.02);
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
`;

const CardTitle = styled.h3`
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--ink, #0F172A);
  margin: 0;
  width: 100%;
  border-bottom: 1px solid var(--line, rgba(0, 0, 0, 0.06));
  padding-bottom: 0.75rem;
`;

const AvatarPreviewSection = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  width: 100%;
`;

const AvatarWrapper = styled.div`
  position: relative;
  display: inline-block;
`;

const CameraBadge = styled.button`
  position: absolute;
  bottom: 0px;
  right: 0px;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--acc, #4F46E5);
  color: white;
  border: 3px solid var(--surf, #FFFFFF);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 3px 8px rgba(79, 70, 229, 0.35);
  transition: all 0.15s ease-in-out;

  &:hover:not(:disabled) {
    transform: scale(1.08);
    background: #4338CA;
  }
`;

const AvatarButtonRow = styled.div`
  display: flex;
  gap: 0.5rem;
  width: 100%;
`;

const UploadButton = styled.button`
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  padding: 0.55rem 0.8rem;
  background: var(--acc2, #EEEDFD);
  color: var(--acc, #4F46E5);
  border: 1px solid transparent;
  border-radius: 8px;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease-in-out;

  &:hover:not(:disabled) {
    background: #E0E0FC;
  }
`;

const PresetToggleButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  padding: 0.55rem 0.8rem;
  background: var(--s2, #FAF9F6);
  color: var(--ink, #0F172A);
  border: 1px solid var(--line, rgba(0, 0, 0, 0.08));
  border-radius: 8px;
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;

  &:hover {
    background: var(--surf, #FFFFFF);
    border-color: var(--acc, #4F46E5);
  }
`;

const PresetSection = styled.div`
  width: 100%;
  background: var(--s2, #FAF9F6);
  border: 1px solid var(--line, rgba(0, 0, 0, 0.08));
  border-radius: 12px;
  padding: 0.85rem;
`;

const PresetLabel = styled.div`
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--mut, #64748B);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 0.5rem;
  text-align: center;
`;

const PresetGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.5rem;
`;

const PresetOption = styled.button`
  width: 100%;
  aspect-ratio: 1;
  border-radius: 10px;
  padding: 2px;
  background: transparent;
  border: 2px solid transparent;
  cursor: pointer;
  transition: all 0.15s ease;

  img {
    width: 100%;
    height: 100%;
    border-radius: 8px;
    object-fit: cover;
  }

  &:hover:not(:disabled) {
    transform: scale(1.08);
    border-color: var(--acc, #4F46E5);
  }
`;

const IdentityMeta = styled.div`
  width: 100%;
  border-top: 1px solid var(--line, rgba(0, 0, 0, 0.06));
  padding-top: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
`;

const MetaItem = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const MetaLabel = styled.span`
  font-size: 0.8rem;
  color: var(--mut, #64748B);
`;

const MetaValue = styled.span`
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--ink, #0F172A);
`;

const StatusPill = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--ok, #15803D);
  background: rgba(21, 128, 61, 0.08);
  padding: 0.2rem 0.5rem;
  border-radius: 12px;

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--ok, #15803D);
  }
`;

const FormRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.25rem;

  @media (max-width: 600px) {
    grid-template-columns: 1fr;
  }
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
`;

const Label = styled.label`
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--ink, #0F172A);
`;

const FieldHint = styled.span`
  font-size: 0.75rem;
  color: var(--mut, #64748B);
`;

const CharCount = styled.span`
  font-size: 0.75rem;
  color: var(--mut, #64748B);
  text-align: right;
`;

const Input = styled.input`
  background: var(--s2, #FAF9F6);
  border: 1px solid var(--line, rgba(0, 0, 0, 0.08));
  border-radius: 10px;
  color: var(--ink, #0F172A);
  padding: 0.75rem 1rem;
  font-size: 0.9rem;
  transition: border-color 0.15s ease;

  &:focus {
    border-color: var(--acc, #4F46E5);
    outline: none;
    background: var(--surf, #FFFFFF);
    box-shadow: 0 0 0 2px rgba(79, 70, 229, 0.12);
  }
`;

const TextArea = styled.textarea`
  background: var(--s2, #FAF9F6);
  border: 1px solid var(--line, rgba(0, 0, 0, 0.08));
  border-radius: 10px;
  color: var(--ink, #0F172A);
  padding: 0.75rem 1rem;
  font-size: 0.9rem;
  resize: vertical;
  transition: border-color 0.15s ease;

  &:focus {
    border-color: var(--acc, #4F46E5);
    outline: none;
    background: var(--surf, #FFFFFF);
    box-shadow: 0 0 0 2px rgba(79, 70, 229, 0.12);
  }
`;

const ActionBar = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
  margin-top: 0.75rem;
  padding-top: 1.25rem;
  border-top: 1px solid var(--line, rgba(0, 0, 0, 0.06));
`;

const DiscardButton = styled.button`
  background: transparent;
  color: var(--mut, #64748B);
  border: 1px solid var(--line, rgba(0, 0, 0, 0.08));
  padding: 0.65rem 1.25rem;
  border-radius: 10px;
  font-weight: 600;
  font-size: 0.9rem;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: var(--s2, #FAF9F6);
    color: var(--ink, #0F172A);
  }
`;

const SaveButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  background: var(--acc, #4F46E5);
  color: white;
  border: none;
  padding: 0.65rem 1.6rem;
  border-radius: 10px;
  font-weight: 600;
  font-size: 0.9rem;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(79, 70, 229, 0.3);
  transition: all 0.15s ease-in-out;

  &:hover:not(:disabled) {
    background: #4338CA;
    transform: translateY(-1px);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;
