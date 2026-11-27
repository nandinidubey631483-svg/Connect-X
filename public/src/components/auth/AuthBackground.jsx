import React, { useEffect, useRef } from "react";

export default function AuthBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof canvas.getContext !== "function") return;

    let ctx;
    try {
      ctx = canvas.getContext("2d");
    } catch (_) {
      return;
    }
    if (!ctx) return;

    let animId;
    let width = 0;
    let height = 0;
    const dp = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dp;
      canvas.height = height * dp;
      if (ctx.setTransform) ctx.setTransform(dp, 0, 0, dp, 0, 0);
    };

    window.addEventListener("resize", resize);
    resize();

    // Floating warm ambient particles with rich visibility
    const particleCount = Math.min(Math.floor((width * height) / 24000), 55);
    const particles = [];
    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        r: Math.random() * 2.6 + 1.8, // noticeably larger & crisp
        vx: (Math.random() - 0.5) * 0.38,
        vy: -Math.random() * 0.5 - 0.18, // gentle upward drift
        alpha: Math.random() * 0.35 + 0.55,
        baseAlpha: Math.random() * 0.35 + 0.55,
        pulseSpeed: Math.random() * 0.025 + 0.015,
        phase: Math.random() * Math.PI * 2,
      });
    }

    // Dynamic shooting stardust embers
    const shootingStars = [];
    let nextSpawnTime = performance.now() + 1000;

    const spawnShootingStar = (now) => {
      const angle = (Math.PI / 6) + (Math.random() - 0.5) * 0.35; // diagonal drift
      const speed = Math.random() * 5 + 5;
      shootingStars.push({
        x: Math.random() * width * 0.8,
        y: Math.random() * height * 0.45,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        len: Math.random() * 55 + 35,
        alpha: 0.95,
        decay: Math.random() * 0.014 + 0.01,
      });
      nextSpawnTime = now + Math.random() * 2800 + 1600;
    };

    let mouse = { x: width * 0.5, y: height * 0.5, active: false };
    const onMouseMove = (e) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      mouse.active = true;
    };
    const onMouseLeave = () => {
      mouse.active = false;
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseleave", onMouseLeave);

    let startTime = performance.now();

    const loop = (now) => {
      const elapsed = (now - startTime) * 0.001;
      ctx.clearRect(0, 0, width, height);

      // Check current theme
      const isDark = document.documentElement.getAttribute("data-theme") === "dark";
      const terracotta = isDark ? "224, 152, 127" : "217, 139, 112";

      // Spawn shooting stars periodically
      if (now > nextSpawnTime) {
        spawnShootingStar(now);
      }

      // Draw and update shooting stars
      ctx.shadowBlur = 10;
      ctx.shadowColor = `rgba(${terracotta}, 0.8)`;

      for (let s = shootingStars.length - 1; s >= 0; s--) {
        const star = shootingStars[s];
        star.x += star.vx;
        star.y += star.vy;
        star.alpha -= star.decay;

        if (star.alpha <= 0 || star.x > width + 60 || star.y > height + 60) {
          shootingStars.splice(s, 1);
          continue;
        }

        const tailX = star.x - (star.vx / Math.hypot(star.vx, star.vy)) * star.len;
        const tailY = star.y - (star.vy / Math.hypot(star.vx, star.vy)) * star.len;

        const grad = ctx.createLinearGradient(star.x, star.y, tailX, tailY);
        grad.addColorStop(0, `rgba(${terracotta}, ${star.alpha})`);
        grad.addColorStop(1, `rgba(${terracotta}, 0)`);

        ctx.beginPath();
        ctx.strokeStyle = grad;
        ctx.lineWidth = 2.4;
        ctx.moveTo(star.x, star.y);
        ctx.lineTo(tailX, tailY);
        ctx.stroke();

        // Prominent glowing head
        ctx.beginPath();
        ctx.arc(star.x, star.y, 2.4, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${terracotta}, ${Math.min(1, star.alpha * 1.3)})`;
        ctx.fill();
      }

      // Draw connecting constellation strands
      ctx.shadowBlur = 4;
      ctx.shadowColor = `rgba(${terracotta}, 0.5)`;

      for (let i = 0; i < particles.length; i++) {
        const p1 = particles[i];
        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const dx = p1.x - p2.x;
          const dy = p1.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 135) {
            const lineAlpha = (1 - dist / 135) * 0.55 * Math.min(p1.alpha, p2.alpha);
            ctx.beginPath();
            ctx.strokeStyle = `rgba(${terracotta}, ${lineAlpha})`;
            ctx.lineWidth = 1.2;
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
          }
        }

        // Distinct interactive strand to cursor if nearby
        if (mouse.active) {
          const cdx = p1.x - mouse.x;
          const cdy = p1.y - mouse.y;
          const cdist = Math.sqrt(cdx * cdx + cdy * cdy);
          if (cdist < 160) {
            const cursorAlpha = (1 - cdist / 160) * 0.7 * p1.alpha;
            ctx.beginPath();
            ctx.strokeStyle = `rgba(${terracotta}, ${cursorAlpha})`;
            ctx.lineWidth = 1.5;
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(mouse.x, mouse.y);
            ctx.stroke();
          }
        }
      }

      // Draw and update glowing particles
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        // Pulse alpha
        p.alpha = p.baseAlpha + Math.sin(elapsed * 2.4 + p.phase) * 0.2;
        p.alpha = Math.max(0.25, Math.min(0.95, p.alpha));

        // Subtle mouse repulsion
        if (mouse.active) {
          const mdx = p.x - mouse.x;
          const mdy = p.y - mouse.y;
          const mdist = Math.sqrt(mdx * mdx + mdy * mdy);
          if (mdist < 160 && mdist > 0) {
            const force = (1 - mdist / 160) * 0.6;
            p.x += (mdx / mdist) * force;
            p.y += (mdy / mdist) * force;
          }
        }

        // Drift
        p.x += p.vx;
        p.y += p.vy;

        // Wrap around
        if (p.x < -15) p.x = width + 15;
        if (p.x > width + 15) p.x = -15;
        if (p.y < -15) p.y = height + 15;
        if (p.y > height + 15) p.y = -15;

        // Draw particle with luminous glow
        ctx.shadowBlur = 8;
        ctx.shadowColor = `rgba(${terracotta}, 0.75)`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${terracotta}, ${p.alpha})`;
        ctx.fill();
      }

      ctx.shadowBlur = 0; // reset shadow for performance
      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseleave", onMouseLeave);
    };
  }, []);

  return (
    <div className="auth-bg-container" aria-hidden="true">
      {/* Dynamic ambient floating gradient orbs */}
      <div className="auth-orb auth-orb-1" />
      <div className="auth-orb auth-orb-2" />
      <div className="auth-orb auth-orb-3" />
      <div className="auth-orb auth-orb-4" />

      {/* Rotating ambient orbital rings */}
      <div className="auth-ring auth-ring-1" />
      <div className="auth-ring auth-ring-2" />

      {/* Visible horizontal ambient aurora glow */}
      <div className="auth-aurora auth-aurora-top" />
      <div className="auth-aurora auth-aurora-bottom" />

      {/* Subtle modern geometric dot mesh */}
      <div className="auth-bg-grid" />

      {/* Interactive floating particle constellation canvas */}
      <canvas ref={canvasRef} className="auth-bg-canvas" />
    </div>
  );
}
