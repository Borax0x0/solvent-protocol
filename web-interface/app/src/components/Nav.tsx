"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { motion } from "framer-motion";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";

const NAV = [
  { label: "Deposit", href: "/deposit" },
  { label: "Stake", href: "/stake" },
  { label: "Redeem", href: "/redeem" },
  { label: "Audit", href: "/audit" },
];

export function Nav() {
  const pathname = usePathname();
  const { connected, publicKey, disconnect } = useWallet();
  const { visible, setVisible } = useWalletModal();
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
          <span className="text-ink font-bold text-sm tracking-tight" style={{ fontFamily: "var(--font-space-grotesk)" }}>Solvent</span>
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
          <div className="flex items-center gap-2 text-[11px] font-mono text-muted bg-surface/50 px-2 py-0.5 border border-border">
            <span className="text-ink">{addr}</span>
            <button onClick={disconnect} className="text-frozen hover:text-frozen/80 text-[10px] font-bold uppercase tracking-wider ml-1">✕</button>
          </div>
        ) : (
          <motion.button
            onClick={() => setVisible(true)}
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
