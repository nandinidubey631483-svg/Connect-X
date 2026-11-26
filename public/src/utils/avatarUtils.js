/**
 * ConnectX Modern Avatar Utilities & Presets
 * 
 * Provides:
 * 1. Image resizing and square-cropping to optimized JPEG base64 data URLs
 * 2. Deterministic vibrant background gradients based on user name/id
 * 3. Curated modern designer vector avatars (clean, professional, modern SaaS aesthetic)
 */

// 8 Distinct, modern gradient pairs
export const AVATAR_GRADIENTS = [
  { from: "#4F46E5", to: "#7C3AED", name: "indigo-violet" },
  { from: "#059669", to: "#10B981", name: "emerald" },
  { from: "#2563EB", to: "#06B6D4", name: "royal-cyan" },
  { from: "#E11D48", to: "#FB7185", name: "rose" },
  { from: "#D97706", to: "#F59E0B", name: "amber" },
  { from: "#9333EA", to: "#C084FC", name: "purple" },
  { from: "#0891B2", to: "#3B82F6", name: "ocean" },
  { from: "#EA580C", to: "#F97316", name: "orange" },
];

/**
 * Returns a deterministic gradient based on string input (username, ID, etc.)
 */
export function getAvatarGradient(name = "") {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_GRADIENTS.length;
  const g = AVATAR_GRADIENTS[index];
  return `linear-gradient(135deg, ${g.from}, ${g.to})`;
}

/**
 * Extracts initials from name (e.g. "Aarav Mehta" -> "AM", "Nissu" -> "N")
 */
export function getInitials(name = "") {
  if (!name) return "U";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

/**
 * Resizes and crops any uploaded File (PNG, JPG, WebP) to a square base64 JPEG data URL
 * Output size: 256x256, quality: 0.9, typically 25-45KB
 */
export function resizeImageToSquare(file, targetSize = 256, quality = 0.9) {
  return new Promise((resolve, reject) => {
    if (!file) {
      return reject(new Error("No file provided"));
    }

    if (!file.type.startsWith("image/")) {
      return reject(new Error("Selected file must be an image (PNG, JPEG, WebP, GIF)"));
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read image file"));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error("Failed to load image"));
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = targetSize;
        canvas.height = targetSize;
        const ctx = canvas.getContext("2d");

        if (!ctx) {
          return reject(new Error("Failed to initialize canvas context"));
        }

        // Center crop calculation (cover mode)
        const sourceWidth = img.width;
        const sourceHeight = img.height;
        let sx = 0;
        let sy = 0;
        let sWidth = sourceWidth;
        let sHeight = sourceHeight;

        if (sourceWidth > sourceHeight) {
          sWidth = sourceHeight;
          sx = (sourceWidth - sourceHeight) / 2;
        } else if (sourceHeight > sourceWidth) {
          sHeight = sourceWidth;
          sy = (sourceHeight - sourceWidth) / 2;
        }

        // Draw cropped and scaled image
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, targetSize, targetSize);

        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        resolve(dataUrl);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * 6 Curated Modern Designer Vector Avatars
 * Clean, professional, aesthetically balanced SVGs encoded as data URLs
 */
export const MODERN_AVATARS = [
  // 1. Sleek Indigo Tech Leader (Modern dark indigo theme)
  {
    id: "modern-1",
    label: "Indigo Horizon",
    data: "data:image/svg+xml;utf8," + encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
        <defs>
          <linearGradient id="bg1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#4F46E5"/>
            <stop offset="100%" stop-color="#7C3AED"/>
          </linearGradient>
          <linearGradient id="skin1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#FFDFBA"/>
            <stop offset="100%" stop-color="#F3C397"/>
          </linearGradient>
        </defs>
        <rect width="128" height="128" rx="36" fill="url(#bg1)"/>
        <!-- Soft ambient lighting circle -->
        <circle cx="64" cy="48" r="44" fill="white" opacity="0.12"/>
        <!-- Body / Hoodie -->
        <path d="M26 128 C26 94 40 82 64 82 C88 82 102 94 102 128 Z" fill="#1E1B4B"/>
        <path d="M46 96 C46 88 54 84 64 84 C74 84 82 88 82 96 Z" fill="#312E81"/>
        <!-- Neck -->
        <rect x="56" y="70" width="16" height="18" rx="6" fill="#F3C397"/>
        <!-- Head -->
        <circle cx="64" cy="54" r="26" fill="url(#skin1)"/>
        <!-- Sleek Modern Hair -->
        <path d="M38 52 C38 34 50 28 64 28 C78 28 90 34 90 52 C82 46 76 46 64 46 C52 46 46 48 38 52 Z" fill="#0F172A"/>
        <!-- Eyes -->
        <circle cx="54" cy="54" r="3.2" fill="#0F172A"/>
        <circle cx="74" cy="54" r="3.2" fill="#0F172A"/>
        <circle cx="55" cy="53" r="1" fill="#FFFFFF"/>
        <circle cx="75" cy="53" r="1" fill="#FFFFFF"/>
        <!-- Smile -->
        <path d="M57 65 Q64 71 71 65" stroke="#9A3412" stroke-width="2.4" stroke-linecap="round" fill="none"/>
        <!-- Sleek Wire Glasses -->
        <rect x="46" y="48" width="15" height="12" rx="4" fill="none" stroke="#6366F1" stroke-width="2"/>
        <rect x="67" y="48" width="15" height="12" rx="4" fill="none" stroke="#6366F1" stroke-width="2"/>
        <line x1="61" y1="53" x2="67" y2="53" stroke="#6366F1" stroke-width="2"/>
      </svg>
    `),
  },

  // 2. Emerald Creative (Vibrant emerald with curly hair)
  {
    id: "modern-2",
    label: "Emerald Spark",
    data: "data:image/svg+xml;utf8," + encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
        <defs>
          <linearGradient id="bg2" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#059669"/>
            <stop offset="100%" stop-color="#10B981"/>
          </linearGradient>
          <linearGradient id="skin2" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#8D5B4C"/>
            <stop offset="100%" stop-color="#6F4336"/>
          </linearGradient>
        </defs>
        <rect width="128" height="128" rx="36" fill="url(#bg2)"/>
        <circle cx="64" cy="52" r="46" fill="white" opacity="0.12"/>
        <!-- Body / Jacket -->
        <path d="M24 128 C24 96 42 84 64 84 C86 84 104 96 104 128 Z" fill="#064E3B"/>
        <path d="M48 94 C48 86 55 82 64 82 C73 82 80 86 80 94 Z" fill="#FBBF24"/>
        <!-- Neck -->
        <rect x="56" y="70" width="16" height="18" rx="6" fill="#6F4336"/>
        <!-- Head -->
        <circle cx="64" cy="54" r="26" fill="url(#skin2)"/>
        <!-- Hair Volume (Modern curls) -->
        <circle cx="44" cy="42" r="14" fill="#1C1917"/>
        <circle cx="64" cy="34" r="16" fill="#1C1917"/>
        <circle cx="84" cy="42" r="14" fill="#1C1917"/>
        <circle cx="40" cy="56" r="11" fill="#1C1917"/>
        <circle cx="88" cy="56" r="11" fill="#1C1917"/>
        <!-- Eyes -->
        <circle cx="53" cy="55" r="3" fill="#FFFFFF"/>
        <circle cx="75" cy="55" r="3" fill="#FFFFFF"/>
        <circle cx="54" cy="55" r="1.8" fill="#1C1917"/>
        <circle cx="76" cy="55" r="1.8" fill="#1C1917"/>
        <!-- Smile -->
        <path d="M56 66 Q64 72 72 66" stroke="#FEF3C7" stroke-width="2.5" stroke-linecap="round" fill="none"/>
        <!-- Small Gold Stud -->
        <circle cx="37" cy="60" r="2" fill="#FBBF24"/>
      </svg>
    `),
  },

  // 3. Sunset Rose Explorer (Warm coral gradient with modern undercut)
  {
    id: "modern-3",
    label: "Sunset Rose",
    data: "data:image/svg+xml;utf8," + encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
        <defs>
          <linearGradient id="bg3" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#E11D48"/>
            <stop offset="100%" stop-color="#FB923C"/>
          </linearGradient>
          <linearGradient id="skin3" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#FCD34D"/>
            <stop offset="100%" stop-color="#F59E0B"/>
          </linearGradient>
        </defs>
        <rect width="128" height="128" rx="36" fill="url(#bg3)"/>
        <circle cx="64" cy="50" r="45" fill="white" opacity="0.14"/>
        <!-- Body -->
        <path d="M26 128 C26 95 40 82 64 82 C88 82 102 95 102 128 Z" fill="#881337"/>
        <!-- Neck -->
        <rect x="56" y="70" width="16" height="18" rx="6" fill="#F59E0B"/>
        <!-- Head -->
        <circle cx="64" cy="54" r="25" fill="#FDE68A"/>
        <!-- Sleek High Bun / Fade -->
        <circle cx="64" cy="24" r="13" fill="#312E81"/>
        <path d="M40 50 C40 34 50 30 64 30 C78 30 88 34 88 50 C80 44 74 42 64 42 C54 42 48 44 40 50 Z" fill="#312E81"/>
        <!-- Eyes with soft lashes -->
        <circle cx="54" cy="54" r="3" fill="#1E1B4B"/>
        <circle cx="74" cy="54" r="3" fill="#1E1B4B"/>
        <!-- Smile -->
        <path d="M57 65 Q64 71 71 65" stroke="#9F1239" stroke-width="2.5" stroke-linecap="round" fill="none"/>
      </svg>
    `),
  },

  // 4. Electric Cyan Developer (Cyan background with sleek headphones)
  {
    id: "modern-4",
    label: "Cyan Beat",
    data: "data:image/svg+xml;utf8," + encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
        <defs>
          <linearGradient id="bg4" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#0284C7"/>
            <stop offset="100%" stop-color="#06B6D4"/>
          </linearGradient>
        </defs>
        <rect width="128" height="128" rx="36" fill="url(#bg4)"/>
        <circle cx="64" cy="50" r="44" fill="white" opacity="0.12"/>
        <!-- Body -->
        <path d="M26 128 C26 94 40 82 64 82 C88 82 102 94 102 128 Z" fill="#0C4A6E"/>
        <!-- Neck -->
        <rect x="56" y="70" width="16" height="18" rx="6" fill="#FBD5B5"/>
        <!-- Head -->
        <circle cx="64" cy="54" r="26" fill="#FCE7D0"/>
        <!-- Hair -->
        <path d="M40 48 C40 32 50 26 64 26 C78 26 88 32 88 48 C80 42 74 42 64 42 C54 42 48 42 40 48 Z" fill="#1E293B"/>
        <!-- Eyes -->
        <circle cx="54" cy="54" r="3.2" fill="#0F172A"/>
        <circle cx="74" cy="54" r="3.2" fill="#0F172A"/>
        <!-- Smile -->
        <path d="M58 65 Q64 70 70 65" stroke="#0F172A" stroke-width="2.4" stroke-linecap="round" fill="none"/>
        <!-- Modern DJ Headphones -->
        <path d="M36 54 C36 32 46 22 64 22 C82 22 92 32 92 54" stroke="#F8FAFC" stroke-width="4.5" fill="none" stroke-linecap="round"/>
        <rect x="30" y="46" width="10" height="18" rx="5" fill="#38BDF8"/>
        <rect x="88" y="46" width="10" height="18" rx="5" fill="#38BDF8"/>
      </svg>
    `),
  },

  // 5. Amethyst Minimalist (Deep violet aesthetic with cap)
  {
    id: "modern-5",
    label: "Amethyst Street",
    data: "data:image/svg+xml;utf8," + encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
        <defs>
          <linearGradient id="bg5" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#7C3AED"/>
            <stop offset="100%" stop-color="#C084FC"/>
          </linearGradient>
        </defs>
        <rect width="128" height="128" rx="36" fill="url(#bg5)"/>
        <circle cx="64" cy="48" r="44" fill="white" opacity="0.12"/>
        <!-- Body -->
        <path d="M26 128 C26 94 40 82 64 82 C88 82 102 94 102 128 Z" fill="#2E1065"/>
        <rect x="56" y="70" width="16" height="18" rx="6" fill="#D4A373"/>
        <circle cx="64" cy="54" r="26" fill="#E8B588"/>
        <!-- Baseball Cap (Turned slightly) -->
        <path d="M38 42 C38 30 50 26 64 26 C78 26 90 30 90 42 Z" fill="#F43F5E"/>
        <path d="M34 42 Q64 36 98 40" stroke="#E11D48" stroke-width="4.5" stroke-linecap="round" fill="none"/>
        <!-- Eyes -->
        <circle cx="54" cy="53" r="3" fill="#1E1B4B"/>
        <circle cx="74" cy="53" r="3" fill="#1E1B4B"/>
        <path d="M57 65 Q64 70 71 65" stroke="#4C1D95" stroke-width="2.5" stroke-linecap="round" fill="none"/>
      </svg>
    `),
  },

  // 6. Amber Executive (Rich gold with silver frame glasses)
  {
    id: "modern-6",
    label: "Amber Gold",
    data: "data:image/svg+xml;utf8," + encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
        <defs>
          <linearGradient id="bg6" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#D97706"/>
            <stop offset="100%" stop-color="#FBBF24"/>
          </linearGradient>
        </defs>
        <rect width="128" height="128" rx="36" fill="url(#bg6)"/>
        <circle cx="64" cy="50" r="44" fill="white" opacity="0.15"/>
        <!-- Body / Blazer -->
        <path d="M24 128 C24 94 40 82 64 82 C88 82 104 94 104 128 Z" fill="#1C1917"/>
        <path d="M52 90 L64 128 L76 90 Z" fill="#FFFFFF"/>
        <rect x="56" y="68" width="16" height="20" rx="6" fill="#F5D0C5"/>
        <circle cx="64" cy="52" r="26" fill="#FCE0D8"/>
        <!-- Silver Hair / Modern style -->
        <path d="M38 48 C38 30 50 24 64 24 C78 24 90 30 90 48 C82 42 76 40 64 40 C52 40 46 42 38 48 Z" fill="#94A3B8"/>
        <!-- Eyes -->
        <circle cx="54" cy="53" r="3.2" fill="#0F172A"/>
        <circle cx="74" cy="53" r="3.2" fill="#0F172A"/>
        <!-- Sleek glasses -->
        <circle cx="54" cy="53" r="8" fill="none" stroke="#E2E8F0" stroke-width="2"/>
        <circle cx="74" cy="53" r="8" fill="none" stroke="#E2E8F0" stroke-width="2"/>
        <line x1="62" y1="53" x2="66" y2="53" stroke="#E2E8F0" stroke-width="2"/>
        <!-- Smile -->
        <path d="M57 66 Q64 72 71 66" stroke="#9A3412" stroke-width="2.4" stroke-linecap="round" fill="none"/>
      </svg>
    `),
  },
];
