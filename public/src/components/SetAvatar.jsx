import React, { useEffect, useState, useRef } from "react";
import styled from "styled-components";
import loader from "../assets/loader.gif";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import apiClient from "../services/apiClient";
import { v1UpdateAvatarRoute } from "../services/apiRoutes";
import { MODERN_AVATARS, resizeImageToSquare } from "../utils/avatarUtils";

export default function SetAvatar() {
  const navigate = useNavigate();
  const { user, updateUser } = useAuth();
  const fileInputRef = useRef(null);

  const [avatars, setAvatars] = useState([]);
  const [customPhoto, setCustomPhoto] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedAvatar, setSelectedAvatar] = useState(0); // default to first modern avatar

  const toastOptions = {
    position: "bottom-right",
    autoClose: 4000,
    pauseOnHover: true,
    draggable: true,
    theme: "light",
  };

  useEffect(() => {
    // Populate with curated modern designer avatars
    const presets = MODERN_AVATARS.map((a) => a.data);
    setAvatars(presets);
    setIsLoading(false);
  }, []);

  const handleCustomFileUpload = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    try {
      const compressedDataUrl = await resizeImageToSquare(file, 256, 0.9);
      setCustomPhoto(compressedDataUrl);
      // Select the custom photo (represented as "custom")
      setSelectedAvatar("custom");
      toast.success("Photo loaded! Click 'Set as Profile Picture' to confirm.", toastOptions);
    } catch (err) {
      toast.error(err.message || "Failed to process photo", toastOptions);
    }
  };

  const setProfilePicture = async () => {
    if (selectedAvatar === undefined) {
      toast.error("Please select an avatar or upload a photo", toastOptions);
      return;
    }

    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      const selectedImage =
        selectedAvatar === "custom" ? customPhoto : avatars[selectedAvatar];

      if (!selectedImage) {
        toast.error("No valid avatar selected", toastOptions);
        setIsSubmitting(false);
        return;
      }

      const res = await apiClient.post(v1UpdateAvatarRoute, {
        image: selectedImage,
      });

      if (res.data && res.data.success) {
        if (user && updateUser) {
          updateUser({
            ...user,
            isAvatarImageSet: true,
            avatarImage: selectedImage,
          });
        }
        toast.success("Profile avatar updated!", toastOptions);
        setTimeout(() => {
          navigate("/");
        }, 800);
      } else {
        toast.error("Error setting avatar. Please try again.", toastOptions);
      }
    } catch (err) {
      const msg =
        err.response?.data?.error?.message ||
        err.message ||
        "Failed to update avatar";
      toast.error(msg, toastOptions);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {isLoading ? (
        <Container data-testid="avatar-loader">
          <img src={loader} alt="loader" className="loader" />
        </Container>
      ) : (
        <Container>
          <Card>
            <BrandHeader>
              <BrandLogo viewBox="0 0 40 40">
                <defs>
                  <linearGradient id="logo-g" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#4F46E5" />
                    <stop offset="100%" stopColor="#7C3AED" />
                  </linearGradient>
                </defs>
                <circle cx="20" cy="20" r="18" fill="url(#logo-g)" />
                <path
                  d="M14 20a6 6 0 0 1 10-4.24M26 20a6 6 0 0 1-10 4.24"
                  stroke="white"
                  strokeWidth="2.8"
                  strokeLinecap="round"
                  fill="none"
                />
              </BrandLogo>
              <BrandName>ConnectX</BrandName>
            </BrandHeader>

            <TitleContainer>
              <h1>Personalize your profile</h1>
              <p>Choose a designer avatar or upload your own profile picture.</p>
            </TitleContainer>

            {/* Custom Photo Upload Card */}
            <UploadCard
              className={selectedAvatar === "custom" ? "selected" : ""}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleCustomFileUpload}
                accept="image/png,image/jpeg,image/webp,image/gif"
                style={{ display: "none" }}
              />
              {customPhoto ? (
                <CustomPreviewContainer>
                  <img src={customPhoto} alt="Custom profile upload" />
                  <UploadInfo>
                    <UploadTitle>Custom Photo Loaded</UploadTitle>
                    <UploadSubtitle>Click to choose a different image</UploadSubtitle>
                  </UploadInfo>
                  <SelectedCheckmark>✓ Selected</SelectedCheckmark>
                </CustomPreviewContainer>
              ) : (
                <UploadPlaceholder>
                  <UploadIcon viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </UploadIcon>
                  <UploadInfo>
                    <UploadTitle>Upload Custom Photo</UploadTitle>
                    <UploadSubtitle>PNG, JPG, or WebP from your device</UploadSubtitle>
                  </UploadInfo>
                </UploadPlaceholder>
              )}
            </UploadCard>

            <Divider>
              <span>OR CHOOSE A DESIGNER AVATAR</span>
            </Divider>

            <AvatarsGrid>
              {avatars.map((avatar, index) => (
                <AvatarItem
                  key={index}
                  data-testid={`avatar-option-${index}`}
                  className={selectedAvatar === index ? "selected" : ""}
                  onClick={() => setSelectedAvatar(index)}
                  title={MODERN_AVATARS[index]?.label || `Avatar ${index + 1}`}
                >
                  <img src={avatar} alt={`avatar-${index}`} />
                  {selectedAvatar === index && <CheckBadge>✓</CheckBadge>}
                </AvatarItem>
              ))}
            </AvatarsGrid>

            <ButtonGroup>
              <SubmitButton
                onClick={setProfilePicture}
                disabled={isSubmitting}
                data-testid="submit-avatar-btn"
              >
                {isSubmitting ? "Setting Avatar..." : "Set as Profile Picture"}
              </SubmitButton>
              <SkipButton type="button" onClick={() => navigate("/")}>
                Skip for now
              </SkipButton>
            </ButtonGroup>
          </Card>
          <ToastContainer />
        </Container>
      )}
    </>
  );
}

const Container = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  width: 100vw;
  background-color: var(--bg, #F3F1EC);
  background-image: radial-gradient(rgba(0, 0, 0, 0.04) 1px, transparent 1px);
  background-size: 20px 20px;
  padding: 1.5rem;

  .loader {
    max-inline-size: 100%;
  }
`;

const Card = styled.div`
  background: var(--surf, #FFFFFF);
  border: 1px solid var(--line, rgba(0, 0, 0, 0.08));
  border-radius: 20px;
  padding: 2.25rem 2.5rem;
  max-width: 580px;
  width: 100%;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.06), 0 2px 8px rgba(0, 0, 0, 0.03);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
`;

const BrandHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 0.6rem;
`;

const BrandLogo = styled.svg`
  width: 32px;
  height: 32px;
`;

const BrandName = styled.span`
  font-size: 1.15rem;
  font-weight: 700;
  letter-spacing: -0.4px;
  color: var(--ink, #0F172A);
`;

const TitleContainer = styled.div`
  text-align: center;

  h1 {
    font-size: 1.45rem;
    font-weight: 700;
    color: var(--ink, #0F172A);
    margin: 0 0 0.4rem 0;
    letter-spacing: -0.3px;
  }

  p {
    font-size: 0.9rem;
    color: var(--muted, #64748B);
    margin: 0;
  }
`;

const UploadCard = styled.div`
  width: 100%;
  border: 2px dashed var(--line, rgba(0, 0, 0, 0.15));
  border-radius: 14px;
  padding: 1rem 1.25rem;
  cursor: pointer;
  background: var(--s2, #FAF9F6);
  transition: all 0.2s ease-in-out;

  &:hover {
    border-color: var(--acc, #6366F1);
    background: #F8FAFC;
  }

  &.selected {
    border-color: var(--acc, #6366F1);
    border-style: solid;
    background: rgba(99, 102, 241, 0.04);
  }
`;

const UploadPlaceholder = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
`;

const UploadIcon = styled.svg`
  width: 24px;
  height: 24px;
  color: var(--acc, #6366F1);
  flex-shrink: 0;
`;

const UploadInfo = styled.div`
  flex: 1;
  text-align: left;
`;

const UploadTitle = styled.div`
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--ink, #0F172A);
`;

const UploadSubtitle = styled.div`
  font-size: 0.8rem;
  color: var(--muted, #64748B);
`;

const CustomPreviewContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;

  img {
    width: 48px;
    height: 48px;
    border-radius: 12px;
    object-fit: cover;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
  }
`;

const SelectedCheckmark = styled.span`
  background: var(--acc, #6366F1);
  color: white;
  padding: 0.25rem 0.65rem;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 600;
`;

const Divider = styled.div`
  width: 100%;
  display: flex;
  align-items: center;
  text-align: center;
  margin: 0.25rem 0;

  &::before,
  &::after {
    content: "";
    flex: 1;
    border-bottom: 1px solid var(--line, rgba(0, 0, 0, 0.08));
  }

  span {
    padding: 0 0.85rem;
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--muted, #64748B);
    letter-spacing: 0.6px;
  }
`;

const AvatarsGrid = styled.div`
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  justify-content: center;
  width: 100%;
`;

const AvatarItem = styled.div`
  position: relative;
  border: 2px solid transparent;
  padding: 4px;
  border-radius: 16px;
  display: flex;
  justify-content: center;
  align-items: center;
  transition: all 0.2s ease-in-out;
  cursor: pointer;
  background: var(--s2, #FAF9F6);

  img {
    height: 4.5rem;
    width: 4.5rem;
    border-radius: 12px;
    transition: transform 0.2s ease-in-out;
  }

  &:hover {
    transform: translateY(-2px);
    border-color: var(--line, rgba(0, 0, 0, 0.15));
  }

  &.selected {
    border-color: var(--acc, #6366F1);
    box-shadow: 0 4px 14px rgba(99, 102, 241, 0.25);
    background: rgba(99, 102, 241, 0.06);

    img {
      transform: scale(1.04);
    }
  }
`;

const CheckBadge = styled.div`
  position: absolute;
  top: -6px;
  right: -6px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--acc, #6366F1);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: 700;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
`;

const ButtonGroup = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  gap: 0.6rem;
  margin-top: 0.5rem;
`;

const SubmitButton = styled.button`
  background: var(--acc, #6366F1);
  color: white;
  padding: 0.85rem 1.5rem;
  border: none;
  font-weight: 600;
  cursor: pointer;
  border-radius: 10px;
  font-size: 0.95rem;
  width: 100%;
  transition: all 0.2s ease-in-out;
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.28);

  &:hover:not(:disabled) {
    background: var(--acc2, #4F46E5);
    transform: translateY(-1px);
  }

  &:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }
`;

const SkipButton = styled.button`
  background: transparent;
  color: var(--muted, #64748B);
  border: none;
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  padding: 0.4rem;
  transition: color 0.15s ease;

  &:hover {
    color: var(--ink, #0F172A);
  }
`;
