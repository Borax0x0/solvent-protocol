"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { useProtocol } from "@/lib/useProtocol";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";

const NAV = [
  { label: "Deposit", href: "/deposit" },
  { label: "Stake", href: "/stake" },
  { label: "Redeem", href: "/redeem" },
  { label: "Audit", href: "/audit" },
];

export function Nav() {
  const pathname = usePathname();
  const { connected, publicKey, disconnect } = useWallet();
  const { solBalance } = useProtocol();
  const [showDisconnect, setShowDisconnect] = useState(false);
  const addr = publicKey ? publicKey.toBase58().slice(0, 3) + "…" + publicKey.toBase58().slice(-3) : "";

  return (
    <nav className="fixed top-0 w-full z-50 bg-void/80 backdrop-blur-xl h-12 flex items-center justify-between px-5 border-b border-border">
      <div className="flex items-center gap-5">
        <Link href="/" className="flex items-center gap-1.5 group">
          <motion.span
            className="text-teal font-extrabold text-lg tracking-tighter"
            whileHover={{ scale: 1.05 }}
            transition={{ type: "spring", stiffness: 400 }}
          >
            [S]
          </motion.span>
          <span className="text-ink font-extrabold text-sm tracking-tight">Solvent</span>
        </Link>
        <div className="hidden md:flex items-center gap-0.5">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`relative px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.04em] transition-colors duration-200 ${
                pathname === n.href ? "text-teal" : "text-muted hover:text-ink"
              }`}
            >
              {n.label}
              {pathname === n.href && (
                <motion.div
                  layoutId="nav-underline"
                  className="absolute bottom-0 left-0 right-0 h-[2px] bg-teal"
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                />
              )}
            </Link>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="hidden md:flex items-center gap-1.5 text-[10px] font-mono text-muted">
          <span className="w-1 h-1 bg-teal rounded-full animate-pulse-dot" />
          Devnet
        </div>
        {connected && publicKey ? (
          <div
            className="relative"
            onMouseEnter={() => setShowDisconnect(true)}
            onMouseLeave={() => setShowDisconnect(false)}
          >
            <motion.button
              className="flex items-center gap-2 text-[11px] font-mono text-muted hover:text-ink transition-colors bg-surface/50 px-2 py-0.5 border border-border"
              whileHover={{ borderColor: "rgba(0,255,178,0.2)" }}
            >
              <span className="text-ink">◎ {solBalance.toFixed(2)}</span>
              <span>{addr}</span>
            </motion.button>
            <AnimatePresence>
              {showDisconnect && (
                <motion.button
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  onClick={() => { disconnect(); setShowDisconnect(false); }}
                  className="absolute top-full right-0 mt-1 text-[10px] font-bold uppercase tracking-wider text-frozen bg-surface border border-frozen/20 px-3 py-1 hover:bg-frozen/10"
                >
                  Disconnect
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        ) : (
          <motion.button
            onClick={() => (document.querySelector(".wallet-adapter-button") as HTMLButtonElement)?.click()}
            className="btn-primary text-[11px] px-3 py-1"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            Connect Wallet
          </motion.button>
        )}
      </div>
    </nav>
  );
}
