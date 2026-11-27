import React, { useEffect, useRef } from "react";
import LogoImg from "../../assets/connectx-logo.png";

export default function AuthHero() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof canvas.getContext !== "function") return;

    const parent = canvas.parentNode;
    if (!parent) return;

    let ctx;
    try {
      ctx = canvas.getContext("2d");
    } catch (_) {
      return;
    }
    if (!ctx) return;

    const dp = Math.min(window.devicePixelRatio || 1, 2);
    let animId;
    let ro;
    let width = 0;
    let height = 0;

    // Organic warm ambient glows (Charcoal #252321 backdrop + Terracotta #D98B70 & Warm Ivory #F5F2ED warmth)
    // Completely devoid of blue/purple gradients, stars, or floating particles.
    const warmGlows = [
      {
        x: 0.32,
        y: 0.28,
        rBase: 340,
        color: "rgba(217, 139, 112, ", // Terracotta
        maxAlpha: 0.14,
        speedX: 0.0004,
        speedY: 0.0006,
        phase: 0.2,
      },
      {
        x: 0.75,
        y: 0.72,
        rBase: 380,
        color: "rgba(217, 139, 112, ", // Terracotta
        maxAlpha: 0.11,
        speedX: -0.0005,
        speedY: -0.0004,
        phase: 2.8,
      },
      {
        x: 0.55,
        y: 0.48,
        rBase: 290,
        color: "rgba(245, 242, 237, ", // Warm Ivory ambient core
        maxAlpha: 0.04,
        speedX: 0.0003,
        speedY: -0.0005,
        phase: 1.4,
      },
    ];

    const fit = () => {
      width = parent.clientWidth || 440;
      height = parent.clientHeight || 700;
      canvas.width = width * dp;
      canvas.height = height * dp;
      if (ctx.setTransform) ctx.setTransform(dp, 0, 0, dp, 0, 0);
    };

    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(fit);
      ro.observe(parent);
    }
    fit();

    let targetMouse = { x: width * 0.5, y: height * 0.45 };
    let currentMouse = { x: width * 0.5, y: height * 0.45 };

    const handleMouseMove = (e) => {
      const rect = parent.getBoundingClientRect();
      targetMouse.x = e.clientX - rect.left;
      targetMouse.y = e.clientY - rect.top;
    };

    const handleMouseLeave = () => {
      targetMouse.x = width * 0.5;
      targetMouse.y = height * 0.45;
    };

    parent.addEventListener("mousemove", handleMouseMove);
    parent.addEventListener("mouseleave", handleMouseLeave);

    let startTime = performance.now();

    const loop = (now) => {
      const t = (now - startTime) * 0.001;
      ctx.clearRect(0, 0, width, height);

      // Smooth mouse easing for quiet, luxurious parallax
      currentMouse.x += (targetMouse.x - currentMouse.x) * 0.02;
      currentMouse.y += (targetMouse.y - currentMouse.y) * 0.02;

      // Render warm ambient terracotta & ivory glows
      for (const glow of warmGlows) {
        const driftX = Math.sin(t * 0.45 + glow.phase) * (width * 0.06);
        const driftY = Math.cos(t * 0.4 + glow.phase) * (height * 0.06);

        const mouseLeanX = (currentMouse.x - width * 0.5) * 0.04;
        const mouseLeanY = (currentMouse.y - height * 0.5) * 0.04;

        const cx = glow.x * width + driftX + mouseLeanX;
        const cy = glow.y * height + driftY + mouseLeanY;
        const r = glow.rBase * (width / 500);

        try {
          const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
          grad.addColorStop(0, `${glow.color}${glow.maxAlpha})`);
          grad.addColorStop(0.55, `${glow.color}${glow.maxAlpha * 0.35})`);
          grad.addColorStop(1, `${glow.color}0)`);

          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.fill();
        } catch (_) {}
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animId);
      if (ro) ro.disconnect();
      parent.removeEventListener("mousemove", handleMouseMove);
      parent.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, []);

  return (
    <div className="hero" role="region" aria-label="Brand Overview">
      {/* Subtle organic warm terracotta ambient canvas */}
      <canvas ref={canvasRef} className="net" aria-hidden="true" />

      {/* Brand Header */}
      <div className="brand">
        <img
          src={LogoImg}
          alt="ConnectX"
          className="lg2"
          style={{ height: "34px", width: "auto" }}
        />
        <span className="wm" style={{ fontSize: "22px", fontWeight: "700", letterSpacing: "-0.03em" }}>
          Connect<i>X</i>
        </span>
        <div className="hero-tag">
          <span className="hero-tag-dot"></span>
          <span>Private Studio</span>
        </div>
      </div>

      {/* Hero Headline & Editorial Subtitle */}
      <div className="hero-lead">
        <h1 className="serif">
          Crafted for clarity. <em>Designed for depth.</em>
        </h1>
        <p>
          A quiet, intentional environment for high-signal communication. Encrypted, instant,
          and stripped of distraction.
        </p>
      </div>

      {/* Architectural Studio Slate */}
      <div className="slate">
        {/* Slate Header */}
        <div className="slate-header">
          <div className="slate-av">
            <span>CX</span>
          </div>
          <div>
            <b style={{ color: "#F5F2ED", fontSize: "13.5px", fontWeight: 600 }}>Aarav Mehta</b>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "2px" }}>
              <span className="hero-tag-dot" style={{ width: "6px", height: "6px" }}></span>
              <span style={{ fontSize: "11.5px", color: "#A39B92" }}>Design Lead</span>
            </div>
          </div>
          <div className="slate-badge">
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <span>Verified Peer</span>
          </div>
        </div>

        {/* Incoming Bubble */}
        <div className="slate-bubble in">
          The new palette feels grounded and focused. Charcoal with warm terracotta accents creates an unmistakable presence.
        </div>

        {/* Audio / Waveform Transmission Bar */}
        <div className="slate-audio">
          <div
            style={{
              width: "28px",
              height: "28px",
              borderRadius: "7px",
              background: "rgba(217, 139, 112, 0.16)",
              color: "#D98B70",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <polygon points="6 3 20 12 6 21 6 3"></polygon>
            </svg>
          </div>
          <div className="slate-wave" aria-hidden="true">
            <span style={{ height: "45%", animationDelay: "0.1s" }}></span>
            <span style={{ height: "75%", animationDelay: "0.3s" }}></span>
            <span style={{ height: "100%", animationDelay: "0.2s" }}></span>
            <span style={{ height: "60%", animationDelay: "0.4s" }}></span>
            <span style={{ height: "85%", animationDelay: "0.15s" }}></span>
            <span style={{ height: "40%", animationDelay: "0.35s" }}></span>
            <span style={{ height: "90%", animationDelay: "0.25s" }}></span>
            <span style={{ height: "50%", animationDelay: "0.05s" }}></span>
          </div>
          <span style={{ fontSize: "11px", color: "#C2BBB2", fontWeight: 500 }}>
            0:38
          </span>
        </div>

        {/* Outgoing Bubble */}
        <div className="slate-bubble out">
          <span>Agreed. It feels like an instrument rather than a template.</span>
          <span
            style={{
              fontSize: "11px",
              marginLeft: "8px",
              opacity: 0.85,
              fontWeight: 600,
            }}
            title="Delivered and Read"
          >
            ✓✓
          </span>
        </div>

        {/* Slate Metrics Footer */}
        <div className="slate-footer">
          <span>Signal: Lossless</span>
          <span>•</span>
          <span>Keys: Ephemeral</span>
          <span>•</span>
          <span>Latency: 11ms</span>
        </div>
      </div>

      {/* 3-Column Editorial Pillars */}
      <div className="hero-pillars">
        <div className="pillar">
          <span className="pillar-num">01</span>
          <h4>High Signal</h4>
          <p>Pure chronological stream with zero algorithmic clutter.</p>
        </div>
        <div className="pillar">
          <span className="pillar-num">02</span>
          <h4>Verified Privacy</h4>
          <p>Ephemeral keys, hardware encryption, and zero tracking.</p>
        </div>
        <div className="pillar">
          <span className="pillar-num">03</span>
          <h4>Quiet Restraint</h4>
          <p>Tactile typography built to respect your attention.</p>
        </div>
      </div>
    </div>
  );
}
