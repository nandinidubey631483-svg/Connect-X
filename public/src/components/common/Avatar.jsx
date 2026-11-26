import React, { useState } from "react";
import styled from "styled-components";
import { getAvatarGradient, getInitials } from "../../utils/avatarUtils";

export default function Avatar({
  image,
  name = "User",
  size = "md",
  isOnline = false,
  showStatus = false,
  shape = "rounded", // "rounded" | "circle"
  className,
}) {
  const [hasError, setHasError] = useState(false);

  // Format avatar image source
  let src = null;
  if (image && !hasError) {
    if (image.startsWith("data:") || image.startsWith("http")) {
      src = image;
    } else {
      src = `data:image/svg+xml;base64,${image}`;
    }
  }

  const initials = getInitials(name);
  const gradient = getAvatarGradient(name);

  return (
    <AvatarContainer size={size} shape={shape} className={className}>
      {src ? (
        <AvatarImage
          src={src}
          alt={name}
          shape={shape}
          onError={() => setHasError(true)}
        />
      ) : (
        <AvatarFallback background={gradient} shape={shape} size={size}>
          {initials}
        </AvatarFallback>
      )}
      {showStatus && <StatusIndicator isOnline={isOnline} size={size} />}
    </AvatarContainer>
  );
}

const sizeMap = {
  xs: "1.75rem",
  sm: "2.25rem",
  md: "2.75rem",
  lg: "3.75rem",
  xl: "5rem",
  "2xl": "6.5rem",
};

const dotSizeMap = {
  xs: "0.5rem",
  sm: "0.6rem",
  md: "0.75rem",
  lg: "0.95rem",
  xl: "1.15rem",
  "2xl": "1.35rem",
};

const fontMap = {
  xs: "0.75rem",
  sm: "0.85rem",
  md: "1rem",
  lg: "1.35rem",
  xl: "1.75rem",
  "2xl": "2.25rem",
};

const AvatarContainer = styled.div`
  position: relative;
  width: ${(props) => sizeMap[props.size] || sizeMap.md};
  height: ${(props) => sizeMap[props.size] || sizeMap.md};
  border-radius: ${(props) => (props.shape === "circle" ? "50%" : "14px")};
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
`;

const AvatarImage = styled.img`
  width: 100%;
  height: 100%;
  border-radius: ${(props) => (props.shape === "circle" ? "50%" : "14px")};
  object-fit: cover;
  background-color: var(--s2, #FAF9F6);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.08), 0 2px 6px rgba(0, 0, 0, 0.06);
`;

const AvatarFallback = styled.div`
  width: 100%;
  height: 100%;
  border-radius: ${(props) => (props.shape === "circle" ? "50%" : "14px")};
  background: ${(props) => props.background || "linear-gradient(135deg, #4F46E5, #7C3AED)"};
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: ${(props) => fontMap[props.size] || fontMap.md};
  letter-spacing: -0.02em;
  user-select: none;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.15) inset, 0 2px 8px rgba(0, 0, 0, 0.1);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
`;

const StatusIndicator = styled.span`
  position: absolute;
  bottom: -1px;
  right: -1px;
  width: ${(props) => dotSizeMap[props.size] || dotSizeMap.md};
  height: ${(props) => dotSizeMap[props.size] || dotSizeMap.md};
  background-color: ${(props) => (props.isOnline ? "var(--ok, #22C55E)" : "var(--mut, #9CA3AF)")};
  border: 2px solid var(--surf, #fff);
  border-radius: 50%;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.05);
  z-index: 2;
`;
