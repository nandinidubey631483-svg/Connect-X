import React, { useEffect } from "react";
import styled from "styled-components";
import { BiX } from "react-icons/bi";

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = "32rem",
}) {
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <Backdrop onClick={onClose} className="mod">
      <ModalContainer maxWidth={maxWidth} onClick={(e) => e.stopPropagation()}>
        <ModalHeader>
          <ModalTitle className="serif">{title}</ModalTitle>
          <CloseButton onClick={onClose} aria-label="Close modal">
            <BiX size={20} />
          </CloseButton>
        </ModalHeader>
        <ModalBody>{children}</ModalBody>
      </ModalContainer>
    </Backdrop>
  );
}

const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  background-color: rgba(10, 10, 18, 0.55);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 1rem;
`;

const ModalContainer = styled.div`
  background-color: var(--surf, #FFFFFF);
  border: 1px solid var(--line, #E7E5DF);
  border-radius: 20px;
  width: 100%;
  max-width: ${(props) => props.maxWidth};
  box-shadow: 0 20px 40px -15px rgba(20, 20, 40, 0.3);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: popin 0.22s cubic-bezier(0.2, 0.9, 0.3, 1.1);
`;

const ModalHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.15rem 1.4rem;
  border-bottom: 1px solid var(--line, #E7E5DF);
  background-color: var(--surf, #FFFFFF);
`;

const ModalTitle = styled.h3`
  font-size: 1.15rem;
  font-weight: 600;
  letter-spacing: -0.015em;
  color: var(--ink, #16171C);
  margin: 0;
`;

const CloseButton = styled.button`
  background: var(--s2, #FAF9F6);
  border: 1px solid var(--line, #E7E5DF);
  border-radius: 8px;
  color: var(--mut, #6C6E78);
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    color: var(--ink, #16171C);
    border-color: var(--mut, #6C6E78);
  }
`;

const ModalBody = styled.div`
  padding: 1.25rem 1.4rem;
  overflow-y: auto;
  max-height: calc(85vh - 4.5rem);
  color: var(--ink, #16171C);
`;
