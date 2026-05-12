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
  const { setVisible } = useWalletModal();
  const addr = publicKey ? publicKey.toBase58().slice(0, 3) + "…" + publicKey.toBase58().slice(-3) : "";

  return (
    <nav className="fixed top-0 w-full z-50 backdrop-blur-xl bg-void/90 border-b border-border">
      <div className="max-w-7xl mx-auto px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-7">
          <Link href="/" className="flex items-center gap-2 group">
            <div
              className="w-8 h-8 bg-teal rounded flex items-center justify-center"
              style={{ fontFamily: "var(--font-space-grotesk)", fontWeight: 800 }}
            >
              <span className="text-void text-sm">S</span>
            </div>
            <span
              className="text-xl text-ink"
              style={{ fontFamily: "var(--font-space-grotesk)", fontWeight: 800 }}
            >
              Solvent
            </span>
          </Link>
          <div className="hidden md:flex items-center gap-6 text-sm" style={{ fontFamily: "var(--font-dm-sans)" }}>
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={`relative transition-colors ${
                  pathname === n.href
                    ? "text-teal font-semibold"
                    : "text-muted hover:text-teal"
                }`}
              >
                {n.label}
                {pathname === n.href && (
                  <motion.div
                    layoutId="nav-underline"
                    className="absolute -bottom-1 left-0 right-0 h-[2px] bg-teal"
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
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface border border-teal/20 text-sm font-mono">
              <span className="text-teal">{addr}</span>
              <button
                onClick={disconnect}
                className="text-muted hover:text-frozen ml-1 text-xs"
              >
                {"✕"}
              </button>
            </div>
          ) : (
            <button
              onClick={() => setVisible(true)}
              className="btn-primary text-sm px-5 py-2 rounded-lg"
              style={{ fontFamily: "var(--font-dm-sans)" }}
            >
              Connect Wallet
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
