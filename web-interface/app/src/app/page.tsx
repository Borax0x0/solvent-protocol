"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence, useScroll, useMotionValueEvent } from "framer-motion";
import { Shield, Activity, Zap, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useProtocol } from "@/lib/useProtocol";

function GithubIcon({ size = 20 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.4 5.4 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65S8.93 17.38 9 18v4" />
      <path d="M9 18c-4.51 2-5-2-7-2" />
    </svg>
  );
}

interface Dot {
  x: number;
  y: number;
  opacity: number;
  targetOpacity: number;
  radius: number;
  targetRadius: number;
}

const GRID_SIZE = 40;

const DotGridBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameId = useRef<number | null>(null);
  const dotsRef = useRef<Dot[]>([]);
  const gridCellRef = useRef<Record<string, number[]>>({});
  const canvasSizeRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });
  const mousePositionRef = useRef<{ x: number | null; y: number | null }>({ x: null, y: null });

  const INTERACTION_RADIUS = 160;
  const INTERACTION_RADIUS_SQ = INTERACTION_RADIUS * INTERACTION_RADIUS;
  const MAX_OPACITY = 0.7;
  const MAX_RADIUS = 2.5;
  const CELL_SIZE = Math.max(50, Math.floor(INTERACTION_RADIUS / 1.5));

  const handleMouseMove = (e: MouseEvent) => {
    mousePositionRef.current = { x: e.clientX, y: e.clientY };
  };

  const createDots = () => {
    const { width, height } = canvasSizeRef.current;
    if (width === 0 || height === 0) return;
    const newDots: Dot[] = [];
    const newGrid: Record<string, number[]> = {};
    const cols = Math.ceil(width / GRID_SIZE) + 1;
    const rows = Math.ceil(height / GRID_SIZE) + 1;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const x = i * GRID_SIZE;
        const y = j * GRID_SIZE;
        const cellX = Math.floor(x / CELL_SIZE);
        const cellY = Math.floor(y / CELL_SIZE);
        const cellKey = `${cellX}_${cellY}`;
        if (!newGrid[cellKey]) newGrid[cellKey] = [];
        newGrid[cellKey].push(newDots.length);
        newDots.push({ x, y, opacity: 0, targetOpacity: 0, radius: 1, targetRadius: 1 });
      }
    }
    dotsRef.current = newDots;
    gridCellRef.current = newGrid;
  };

  const handleResize = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const width = window.innerWidth;
    const height = window.innerHeight;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      canvasSizeRef.current = { width, height };
      createDots();
    }
  };

  const animateDots = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const dots = dotsRef.current;
    const grid = gridCellRef.current;
    const { width, height } = canvasSizeRef.current;
    const { x: mouseX, y: mouseY } = mousePositionRef.current;
    if (!ctx || !dots || !grid || width === 0 || height === 0) {
      animationFrameId.current = requestAnimationFrame(animateDots);
      return;
    }
    ctx.clearRect(0, 0, width, height);

    const activeIndices = new Set<number>();
    if (mouseX !== null && mouseY !== null) {
      const mcx = Math.floor(mouseX / CELL_SIZE);
      const mcy = Math.floor(mouseY / CELL_SIZE);
      const sr = Math.ceil(INTERACTION_RADIUS / CELL_SIZE);
      for (let i = -sr; i <= sr; i++) {
        for (let j = -sr; j <= sr; j++) {
          const key = `${mcx + i}_${mcy + j}`;
          if (grid[key]) grid[key].forEach((idx: number) => activeIndices.add(idx));
        }
      }
    }

    const lerp = 0.12;

    dots.forEach((dot, index) => {
      let interactionFactor = 0;
      if (mouseX !== null && mouseY !== null && activeIndices.has(index)) {
        const dx = dot.x - mouseX;
        const dy = dot.y - mouseY;
        const distSq = dx * dx + dy * dy;
        if (distSq < INTERACTION_RADIUS_SQ) {
          const distance = Math.sqrt(distSq);
          interactionFactor = Math.max(0, 1 - distance / INTERACTION_RADIUS);
          interactionFactor = interactionFactor * interactionFactor;
        }
      }

      dot.targetOpacity = interactionFactor * MAX_OPACITY;
      dot.targetRadius = 1 + interactionFactor * MAX_RADIUS;
      dot.opacity += (dot.targetOpacity - dot.opacity) * lerp;
      dot.radius += (dot.targetRadius - dot.radius) * lerp;

      if (dot.opacity > 0.01) {
        ctx.beginPath();
        ctx.fillStyle = `rgba(0, 255, 178, ${dot.opacity.toFixed(3)})`;
        ctx.arc(dot.x, dot.y, dot.radius, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    animationFrameId.current = requestAnimationFrame(animateDots);
  };

  useEffect(() => {
    handleResize();
    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    window.addEventListener("resize", handleResize);
    document.documentElement.addEventListener("mouseleave", () => {
      mousePositionRef.current = { x: null, y: null };
    });
    animationFrameId.current = requestAnimationFrame(animateDots);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("mousemove", handleMouseMove);
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
    };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 z-0 pointer-events-none" />;
};

const FloatingPaths: React.FC<{ position: number }> = ({ position }) => {
  const paths = Array.from({ length: 24 }, (_, i) => ({
    id: i,
    d: `M-${380 - i * 5 * position} -${189 + i * 6}C-${380 - i * 5 * position} -${189 + i * 6} -${312 - i * 5 * position} ${216 - i * 6} ${152 - i * 5 * position} ${343 - i * 6}C${616 - i * 5 * position} ${470 - i * 6} ${684 - i * 5 * position} ${875 - i * 6} ${684 - i * 5 * position} ${875 - i * 6}`,
    width: 0.5 + i * 0.02,
  }));

  return (
    <div className="absolute inset-0 pointer-events-none opacity-45">
      <svg className="w-full h-full text-[#00FFB2]" viewBox="0 0 696 316" fill="none">
        <title>Background Paths</title>
        {paths.map((path) => (
          <motion.path
            key={path.id}
            d={path.d}
            stroke="currentColor"
            strokeWidth={path.width}
            strokeOpacity={0.15 + path.id * 0.03}
            initial={{ pathLength: 0.3, opacity: 0.5 }}
            animate={{ pathLength: 1, opacity: [0.3, 0.7, 0.3], pathOffset: [0, 1, 0] }}
            transition={{ duration: 20 + Math.random() * 10, repeat: Infinity, ease: "linear" }}
          />
        ))}
      </svg>
    </div>
  );
};

const BGPattern: React.FC<{ variant?: string; mask?: string; size?: number; fill?: string }> = ({
  variant = "grid",
  mask = "fade-edges",
  size = 24,
  fill = "#00FFB2",
}) => {
  const maskClass = mask === "fade-edges"
    ? "[mask-image:radial-gradient(ellipse_at_center,#06100D,transparent)]"
    : mask === "fade-center"
    ? "[mask-image:radial-gradient(ellipse_at_center,transparent,#06100D)]"
    : "";

  const backgroundImage = variant === "dots"
    ? `radial-gradient(${fill} 1px, transparent 1px)`
    : `linear-gradient(to right, ${fill} 1px, transparent 1px), linear-gradient(to bottom, ${fill} 1px, transparent 1px)`;

  return (
    <div
      className={`fixed inset-0 z-[2] pointer-events-none opacity-20 ${maskClass}`}
      style={{ backgroundImage, backgroundSize: `${size}px ${size}px` }}
    />
  );
};

interface YieldUpdate {
  id: number;
  source: string;
  value: string;
  timestamp: string;
  change: number;
}

const ProtocolSidebar: React.FC = () => {
  const [yieldUpdates, setYieldUpdates] = useState<YieldUpdate[]>([
    { id: 1, source: "JitoSOL", value: "4.23%", timestamp: "12:34:56", change: 0.12 },
    { id: 2, source: "Drift Perps", value: "2.87%", timestamp: "12:34:51", change: -0.05 },
    { id: 3, source: "Combined", value: "7.10%", timestamp: "12:34:48", change: 0.07 },
  ]);

  useEffect(() => {
    const interval = setInterval(() => {
      const newUpdate: YieldUpdate = {
        id: Date.now(),
        source: ["JitoSOL", "Drift Perps", "Combined"][Math.floor(Math.random() * 3)],
        value: `${(Math.random() * 5 + 2).toFixed(2)}%`,
        timestamp: new Date().toLocaleTimeString("en-US", { hour12: false }),
        change: (Math.random() - 0.5) * 0.5,
      };
      setYieldUpdates((prev) => [newUpdate, ...prev.slice(0, 4)]);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="h-full p-6 flex flex-col gap-8 overflow-y-auto">
      <div>
        <div className="text-xs text-[#6BA882] mb-2 uppercase tracking-[0.06em]" style={{ fontFamily: "var(--font-dm-sans)" }}>
          Protocol Solvency
        </div>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.5 }}
          className="text-4xl font-bold text-[#00FFB2] mb-3" style={{ fontFamily: "var(--font-jetbrains-mono)" }}
        >
          91.4%
        </motion.div>
        <div className="w-full bg-[#06100D] rounded-full h-2">
          <motion.div
            initial={{ width: "0%" }}
            animate={{ width: "91.4%" }}
            transition={{ duration: 1.5, ease: "easeOut", delay: 0.8 }}
            className="bg-[#00FFB2] h-2 rounded-full"
          />
        </div>
      </div>

      <div>
        <div className="text-xs text-[#6BA882] mb-4 uppercase tracking-[0.06em]" style={{ fontFamily: "var(--font-dm-sans)" }}>
          Protocol Stats
        </div>
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-[#6BA882]" style={{ fontFamily: "var(--font-dm-sans)" }}>TVL</span>
            <span className="text-sm font-bold text-[#E4F5ED]" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>$124,500</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-[#6BA882]" style={{ fontFamily: "var(--font-dm-sans)" }}>sSLVT Rate</span>
            <span className="text-sm font-bold text-[#AAFF2E]" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>1.008300</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-[#6BA882]" style={{ fontFamily: "var(--font-dm-sans)" }}>Keeper Status</span>
            <span className="relative flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#AAFF2E] opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#AAFF2E]" />
              </span>
              <span className="text-sm font-bold text-[#AAFF2E]" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>Active</span>
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1">
        <div className="text-xs text-[#6BA882] mb-4 uppercase tracking-[0.06em]" style={{ fontFamily: "var(--font-dm-sans)" }}>
          Live Yield Feed
        </div>
        <AnimatePresence mode="popLayout">
          {yieldUpdates.map((update) => (
            <motion.div
              key={update.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="flex items-center justify-between p-3 rounded-lg bg-[#06100D] border border-[#00FFB2]/20 mb-2"
            >
              <div className="flex-1">
                <div className="text-sm font-medium text-[#00FFB2]" style={{ fontFamily: "var(--font-dm-sans)" }}>{update.source}</div>
                <div className="text-xs text-[#6BA882]" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>{update.timestamp}</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold text-[#E4F5ED]" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>{update.value}</div>
                <div className={`text-xs ${update.change >= 0 ? "text-[#AAFF2E]" : "text-red-400"}`} style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
                  {update.change >= 0 ? "+" : ""}{update.change.toFixed(2)}%
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default function LandingPage() {
  const [isScrolled, setIsScrolled] = useState(false);
  const { scrollY } = useScroll();
  const { connected, publicKey, disconnect } = useWallet();
  const { setVisible } = useWalletModal();
  const { vaultBalance, solvencyPct, exchangeRate, solPriceUsd, loading } = useProtocol();
  const addr = publicKey ? publicKey.toBase58().slice(0, 4) + "…" + publicKey.toBase58().slice(-4) : "";

  useMotionValueEvent(scrollY, "change", (latest) => {
    setIsScrolled(latest > 20);
  });

  const rotatingWords = ["solvent.", "transparent.", "secure.", "stable."];
  const [rotatingIndex, setRotatingIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setRotatingIndex((i) => (i + 1) % rotatingWords.length);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-[#06100D] text-[#E4F5ED] overflow-x-hidden">
      <DotGridBackground />

      <div className="fixed inset-0 z-[1] pointer-events-none">
        <FloatingPaths position={1} />
        <FloatingPaths position={-1} />
      </div>

      <BGPattern variant="grid" mask="fade-edges" size={40} fill="#00FFB2" />

      <div className="relative z-10 lg:pr-72">
        <motion.nav
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="sticky top-0 z-50 backdrop-blur-md"
          style={{
            backgroundColor: "rgba(6, 16, 13, 0.9)",
            borderBottom: `1px solid ${isScrolled ? "rgba(0, 255, 178, 0.25)" : "rgba(0, 255, 178, 0.1)"}`,
            transition: "border-color 0.3s ease",
          }}
        >
          <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <img src="/logo.png" alt="Solvent" className="w-8 h-8 object-contain" />
              <span className="text-xl" style={{ fontFamily: "var(--font-space-grotesk)", fontWeight: 800 }}>Solvent</span>
            </div>

            <div className="hidden md:flex items-center gap-6 text-sm" style={{ fontFamily: "var(--font-dm-sans)" }}>
              <Link href="/deposit" className="text-[#6BA882] hover:text-[#00FFB2] transition-colors">Deposit</Link>
              <Link href="/stake" className="text-[#6BA882] hover:text-[#00FFB2] transition-colors">Stake</Link>
              <Link href="/redeem" className="text-[#6BA882] hover:text-[#00FFB2] transition-colors">Redeem</Link>
              <Link href="/audit" className="text-[#6BA882] hover:text-[#00FFB2] transition-colors">Audit</Link>
            </div>

            {connected && publicKey ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#0A1A14] border border-[#00FFB2]/20 text-sm" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
                <span className="text-[#00FFB2]">{addr}</span>
                <button onClick={disconnect} className="text-[#6BA882] hover:text-[#FF4855] ml-1 text-xs">✕</button>
              </div>
            ) : (
              <button
                onClick={() => setVisible(true)}
                className="px-5 py-2 bg-[#00FFB2] text-[#06100D] rounded-lg text-sm font-semibold hover:bg-[#AAFF2E] transition-colors"
                style={{ fontFamily: "var(--font-dm-sans)" }}
              >
                Connect Wallet
              </button>
            )}
          </div>
        </motion.nav>

        <section className="max-w-5xl mx-auto px-6 pt-20 md:pt-32 pb-16 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.5 }}
            className="inline-block mb-6 px-4 py-2 rounded-full border border-[#00FFB2]/30 bg-[#00FFB2]/10"
          >
            <span className="text-sm text-[#00FFB2]" style={{ fontFamily: "var(--font-dm-sans)" }}>
              A delta-neutral stablecoin on Solana
            </span>
          </motion.div>

          <h1 style={{ fontFamily: "var(--font-space-grotesk)", fontWeight: 800 }}>
            <span className="block text-5xl md:text-7xl lg:text-8xl leading-none text-[#E4F5ED] whitespace-nowrap">The stablecoin</span>
            <span className="block text-5xl md:text-7xl lg:text-8xl leading-none text-[#E4F5ED] mt-2">that stays</span>
            <AnimatePresence mode="wait">
              <motion.span
                key={rotatingWords[rotatingIndex]}
                initial={{ y: 30, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -30, opacity: 0 }}
                transition={{ duration: 0.4, ease: "easeInOut" }}
                    className="block text-5xl md:text-7xl lg:text-8xl leading-none text-[#00FFB2] mt-2"
                    style={{ fontFamily: "var(--font-playfair)", fontStyle: "italic" }}
              >
                {rotatingWords[rotatingIndex]}
              </motion.span>
            </AnimatePresence>
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8, duration: 0.6 }}
            className="text-lg md:text-xl text-[#6BA882] max-w-3xl mx-auto mb-10 leading-relaxed"
            style={{ fontFamily: "var(--font-dm-sans)" }}
          >
            Deposit SOL. Get <span className="font-medium text-[#E4F5ED]">$1-pegged SLVT</span>. Earn real yield through JitoSOL staking and Drift perpetuals — fully hedged, always redeemable.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1, duration: 0.6 }}
            className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-16"
          >
            <motion.div whileHover={{ scale: 1.03, y: -2 }} whileTap={{ scale: 0.97 }}>
              <Link
                href="/deposit"
                className="group relative px-8 py-4 rounded-full font-bold text-lg overflow-hidden transition-all duration-300 inline-block"
                style={{ fontFamily: "var(--font-space-grotesk)", fontWeight: 800 }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-[#00FFB2] to-[#AAFF2E]" />
                <span className="relative z-10 text-[#06100D]">Launch App</span>
                <div className="absolute inset-0 bg-gradient-to-r from-[#AAFF2E] to-[#00FFB2] opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </Link>
            </motion.div>

            <motion.div whileHover={{ scale: 1.03, y: -2 }} whileTap={{ scale: 0.97 }}>
              <a
                href="https://github.com/Borax0x0/solvent-protocol"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-8 py-4 bg-transparent border-2 border-[#00FFB2]/30 text-[#E4F5ED] rounded-full text-lg hover:border-[#00FFB2] hover:bg-[#00FFB2]/10 transition-all duration-300"
                style={{ fontFamily: "var(--font-space-grotesk)", fontWeight: 800 }}
              >
                <GithubIcon size={20} />
                View on GitHub
                <ExternalLink className="w-4 h-4" />
              </a>
            </motion.div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.2, duration: 0.6 }}
            className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto"
          >
            <div className="bg-white/5 backdrop-blur-sm border border-[#00FFB2]/20 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-[#00FFB2]" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>${loading ? "—" : vaultBalance * solPriceUsd >= 1000 ? `${(vaultBalance * solPriceUsd / 1000).toFixed(1)}K` : (vaultBalance * solPriceUsd).toFixed(0)}</div>
              <div className="text-xs text-[#6BA882] uppercase tracking-[0.06em] mt-1" style={{ fontFamily: "var(--font-dm-sans)" }}>TVL</div>
            </div>
            <div className="bg-white/5 backdrop-blur-sm border border-[#AAFF2E]/20 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-[#AAFF2E]" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>{loading ? "—" : `${solvencyPct}%`}</div>
              <div className="text-xs text-[#6BA882] uppercase tracking-[0.06em] mt-1" style={{ fontFamily: "var(--font-dm-sans)" }}>Solvency</div>
            </div>
            <div className="bg-white/5 backdrop-blur-sm border border-[#00FFB2]/20 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-[#00FFB2]" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>{loading ? "—" : exchangeRate.toFixed(6)}</div>
              <div className="text-xs text-[#6BA882] uppercase tracking-[0.06em] mt-1" style={{ fontFamily: "var(--font-dm-sans)" }}>sSLVT Rate</div>
            </div>
            <div className="bg-white/5 backdrop-blur-sm border border-[#AAFF2E]/20 rounded-lg p-4 text-center">
              <div className="flex items-center justify-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#AAFF2E] opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#AAFF2E]" />
                </span>
                <div className="text-sm font-bold text-[#AAFF2E]" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>Active</div>
              </div>
              <div className="text-xs text-[#6BA882] uppercase tracking-[0.06em] mt-1" style={{ fontFamily: "var(--font-dm-sans)" }}>Keeper</div>
            </div>
          </motion.div>
        </section>

        <section className="max-w-6xl mx-auto px-6 py-20">
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: Shield,
                title: "Proportional Redemptions",
                description: "At 90% solvency, redeem 90%. No hard freeze. No bank-run cliff. Every user gets their fair share.",
              },
              {
                icon: Activity,
                title: "On-Chain Yield Receipts",
                description: "Every yield update is a live PDA. Jito vs Drift breakdown. Timestamped. Auditable. No off-chain trust required.",
              },
              {
                icon: Zap,
                title: "Real sSLVT Minting",
                description: "Stake SLVT for sSLVT — an actual token with appreciating exchange rate. Not cosmetic Token-2022 interest.",
              },
            ].map((feature, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15, duration: 0.5 }}
                className="group bg-[#06100D]/80 backdrop-blur-xl border border-[#00FFB2]/20 rounded-2xl p-8 hover:border-[#00FFB2]/40 hover:-translate-y-1 transition-all duration-300"
              >
                <div className="w-12 h-12 bg-[#00FFB2]/10 rounded-lg flex items-center justify-center mb-6 group-hover:bg-[#00FFB2]/20 transition-colors">
                  <feature.icon className="w-6 h-6 text-[#00FFB2]" />
                </div>
                <h3 className="text-2xl font-bold mb-4" style={{ fontFamily: "var(--font-space-grotesk)", fontWeight: 800 }}>
                  {feature.title}
                </h3>
                <p className="text-white/70 leading-relaxed" style={{ fontFamily: "var(--font-dm-sans)" }}>
                  {feature.description}
                </p>
              </motion.div>
            ))}
          </div>
        </section>

        <footer className="border-t border-[#00FFB2]/20 py-8 px-6">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="text-sm text-[#6BA882]" style={{ fontFamily: "var(--font-dm-sans)" }}>
              &copy; 2026 Solvent Protocol. Lab-Precise Liquidity.
            </div>
            <div className="flex items-center gap-6">
              <a
                href="https://twitter.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#6BA882] hover:text-[#00FFB2] transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 4s-.7 2.1-2 3.4c1.6-10-9.4-10-14-6.6C2 4 2 8.5 2 8.5s3.5 0 5.5-1.5C5.5 10 2 12.5 2 12.5c0 3 1.5 5.5 4 7-2 .5-4.5 0-4.5 0C4 22 8 24 12 24c8 0 14-6 14-14 0-.5 0-1-.1-1.5 1.5-1 2.1-2.5 2.1-2.5z"/></svg>
              </a>
              <a
                href="https://github.com/Borax0x0/solvent-protocol"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#6BA882] hover:text-[#00FFB2] transition-colors"
              >
                <GithubIcon size={20} />
              </a>
            </div>
          </div>
        </footer>
      </div>

      <div className="hidden lg:flex fixed right-0 top-0 bottom-0 w-72 bg-[#0A1A14] border-l border-[#00FFB2]/20 z-20 flex-col">
        <ProtocolSidebar />
      </div>
    </div>
  );
}
