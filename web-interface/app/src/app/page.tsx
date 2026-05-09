"use client";

import Link from "next/link";
import { useProtocol } from "@/lib/useProtocol";
import { motion } from "framer-motion";
import { FadeIn, Stagger, StaggerItem } from "@/components/Motion";

export default function LandingPage() {
  const { solvencyPct, exchangeRate, vaultBalance, solPriceUsd } = useProtocol();
  const tvl = vaultBalance * solPriceUsd;

  return (
    <main className="min-h-screen flex flex-col bg-void landing-bg">
      <nav className="h-12 flex items-center justify-between px-5 border-b border-border">
        <span className="flex items-center gap-1.5">
          <span className="text-teal font-extrabold text-lg tracking-tighter">[S]</span>
          <span className="text-ink font-extrabold text-sm tracking-tight">Solvent</span>
        </span>
        <Link href="/deposit" className="btn-primary text-[11px] px-4 py-1.5">
          Launch App
        </Link>
      </nav>

      <div className="flex-1 flex flex-col items-center justify-center px-5 text-center max-w-xl mx-auto">
        <FadeIn>
          <h1 className="text-4xl md:text-5xl font-extrabold leading-[1.08] tracking-tight mb-4 text-ink">
            A delta-neutral stablecoin on Solana.
          </h1>
        </FadeIn>
        <FadeIn delay={0.1}>
          <p className="text-base text-muted mb-8">
            Deposit SOL. Get $1-pegged SLVT. Earn real yield.
          </p>
        </FadeIn>

        <Stagger className="grid grid-cols-1 md:grid-cols-3 gap-3 w-full mb-10">
          <StaggerItem>
            <div className="card card-hover p-5 text-left">
              <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-teal mb-2">
                Proportional Redemptions
              </div>
              <div className="text-[12px] text-ink leading-snug">
                90% solvent = redeem 90%. No bank-run cliff.
              </div>
            </div>
          </StaggerItem>
          <StaggerItem>
            <div className="card card-hover p-5 text-left">
              <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-teal mb-2">
                On-chain Yield Receipts
              </div>
              <div className="text-[12px] text-ink leading-snug">
                Jito + Drift breakdown. Every update is a PDA.
              </div>
            </div>
          </StaggerItem>
          <StaggerItem>
            <div className="card card-hover p-5 text-left">
              <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-teal mb-2">
                Real sSLVT Minting
              </div>
              <div className="text-[12px] text-ink leading-snug">
                Appreciating exchange rate. Not cosmetic.
              </div>
            </div>
          </StaggerItem>
        </Stagger>

        <FadeIn delay={0.4}>
          <Link href="/deposit" className="btn-primary text-sm px-8 py-3 mb-8">
            Launch App
          </Link>
        </FadeIn>

        <FadeIn delay={0.5}>
          <div className="flex flex-wrap justify-center gap-5 text-[11px] font-mono text-muted">
            <span>TVL ${tvl >= 1000 ? (tvl / 1000).toFixed(1) + "K" : tvl.toFixed(0)}</span>
            <span>Solvency {solvencyPct}%</span>
            <span>sSLVT {exchangeRate.toFixed(4)}</span>
            <span className="flex items-center gap-1">
              <span className="w-1 h-1 bg-teal rounded-full animate-pulse-dot" />
              Devnet
            </span>
          </div>
        </FadeIn>
      </div>
    </main>
  );
}
