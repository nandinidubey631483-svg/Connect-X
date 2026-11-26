import React, { useState } from "react";
import Picker from "emoji-picker-react";
import { FiPaperclip, FiSmile, FiSend, FiX } from "react-icons/fi";

const QUICK_REPLIES = ["Sounds good! 👍", "On my way 🚀", "Let's sync later today."];

export default function ChatInput({ handleSendMsg }) {
  const [msg, setMsg] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const handleEmojiPickerhideShow = () => {
    setShowEmojiPicker(!showEmojiPicker);
  };

  const handleEmojiClick = (event, emojiObject) => {
    let message = msg;
    message += emojiObject.emoji;
    setMsg(message);
  };

  const handleFileSelect = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert("File size exceeds 5MB limit");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setSelectedFile({
        filename: file.name,
        originalName: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        data: reader.result,
      });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const sendChat = (event) => {
    if (event) event.preventDefault();
    if (msg.trim().length > 0 || selectedFile) {
      handleSendMsg(msg, selectedFile);
      setMsg("");
      setSelectedFile(null);
      setShowEmojiPicker(false);
    }
  };

  const handleQuickReply = (text) => {
    handleSendMsg(text, null);
  };

  return (
    <div className="comp" style={{ padding: "6px 20px 18px", position: "relative" }}>
      {/* Quick Reply Chips (.sr) */}
      <div className="sr" style={{ display: "flex", gap: "6px", margin: "0 0 9px", flexWrap: "wrap", alignItems: "center" }}>
        {QUICK_REPLIES.map((reply, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => handleQuickReply(reply)}
            style={{
              padding: "5px 12px",
              borderRadius: "99px",
              border: "1px solid var(--line)",
              background: "var(--surf)",
              fontSize: "12.5px",
              color: "var(--mut)",
              transition: "0.15s",
              cursor: "pointer",
            }}
          >
            {reply}
          </button>
        ))}
      </div>

      {/* Selected file preview pill */}
      {selectedFile && (
        <div
          className="selected-file-preview"
          data-testid="selected-file-preview"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            background: "var(--acc2, #EEEDFD)",
            color: "var(--acc, #4F46E5)",
            padding: "4px 12px",
            borderRadius: "99px",
            fontSize: "12px",
            fontWeight: "500",
            marginBottom: "8px",
          }}
        >
          <span>📎 {selectedFile.filename}</span>
          <button
            type="button"
            onClick={() => setSelectedFile(null)}
            data-testid="remove-file-btn"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--acc)",
              display: "grid",
              placeItems: "center",
            }}
          >
            <FiX size={14} />
          </button>
        </div>
      )}

      {/* Emoji Picker Popover */}
      {showEmojiPicker && (
        <div
          className="pop em"
          style={{
            position: "absolute",
            bottom: "82px",
            left: "20px",
            zIndex: 10,
            boxShadow: "var(--sh)",
            borderRadius: "16px",
            overflow: "hidden",
          }}
        >
          <Picker onEmojiClick={handleEmojiClick} theme="dark" />
        </div>
      )}

      {/* Composer Box (.cb / .input-container) */}
      <form
        className="cb input-container"
        onSubmit={sendChat}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          background: "var(--surf)",
          border: "1px solid var(--line)",
          borderRadius: "20px",
          padding: "7px 10px",
          boxShadow: "0 10px 30px -14px rgba(79,70,229,.3)",
          transition: "0.2s",
        }}
      >
        {/* Attachment button */}
        <label
          title="Attach photo or document"
          style={{
            cursor: "pointer",
            display: "grid",
            placeItems: "center",
            width: "32px",
            height: "32px",
            borderRadius: "8px",
            color: "var(--mut)",
            transition: "0.15s",
          }}
        >
          <input
            type="file"
            onChange={handleFileSelect}
            style={{ display: "none" }}
            data-testid="file-input"
          />
          <FiPaperclip size={18} />
        </label>

        {/* Emoji toggle button */}
        <button
          type="button"
          onClick={handleEmojiPickerhideShow}
          title="Choose emoji"
          style={{
            display: "grid",
            placeItems: "center",
            width: "32px",
            height: "32px",
            borderRadius: "8px",
            color: "var(--mut)",
            background: "none",
            border: "none",
            cursor: "pointer",
          }}
        >
          <FiSmile size={18} />
        </button>

        {/* Input field */}
        <input
          id="ci"
          type="text"
          placeholder="type your message here"
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          style={{
            flex: 1,
            border: "none",
            background: "transparent",
            outline: "none",
            fontSize: "14px",
            color: "var(--ink)",
            padding: "0 8px",
          }}
        />

        {/* Send button (.snd) */}
        <button
          type="submit"
          className="snd"
          disabled={!msg.trim() && !selectedFile}
          style={{
            width: "36px",
            height: "36px",
            borderRadius: "14px",
            background: msg.trim() || selectedFile ? "linear-gradient(135deg,#3B6FF0,#7C3AED)" : "var(--bg)",
            color: "#fff",
            border: "none",
            cursor: msg.trim() || selectedFile ? "pointer" : "default",
            display: "grid",
            placeItems: "center",
            transition: "0.2s",
            boxShadow: msg.trim() || selectedFile ? "0 6px 14px -6px rgba(91,75,232,.7)" : "none",
          }}
        >
          <FiSend size={15} style={{ marginLeft: "2px" }} />
        </button>
      </form>
    </div>
  );
}
