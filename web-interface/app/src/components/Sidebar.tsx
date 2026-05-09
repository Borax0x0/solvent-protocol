"use client";

import Link from "next/link";
import { useProtocol } from "@/lib/useProtocol";
import { yieldReceiptPda } from "@/lib/config";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { FadeIn, NumberPulse } from "./Motion";

export function Sidebar() {
  const { solvencyPct, exchangeRate, solPriceUsd, vaultBalance, stakingState, fetchYieldReceipts, loading } = useProtocol();
  const [receipts, setReceipts] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetchYieldReceipts(3);
        setReceipts(r.reverse());
      } catch {}
    })();
  }, [fetchYieldReceipts]);

  const tvl = vaultBalance * solPriceUsd;
  const nextYieldMin = stakingState?.lastYieldTimestamp
    ? Math.max(0, 300 - (Date.now() / 1000 - stakingState.lastYieldTimestamp.toNumber()))
    : 0;

  const solvColor = solvencyPct >= 100 ? "text-teal" : solvencyPct >= 80 ? "text-acid" : "text-frozen";

  return (
    <aside className="w-full lg:w-[260px] shrink-0 flex flex-col gap-3 text-[11px]">
      <FadeIn delay={0.1}>
        <div className="card card-hover p-4 glow-teal">
          <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-muted mb-2">Solvency</div>
          <div className={`text-[36px] font-extrabold leading-none tracking-tighter ${solvColor}`}>
            <NumberPulse value={loading ? "—" : `${solvencyPct}%`} />
          </div>
          <div className="mt-3 h-2 solv-bar rounded-sm overflow-hidden">
            <motion.div
              className="fill h-full rounded-sm"
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, solvencyPct)}%` }}
              transition={{ duration: 1.2, ease: [0.25, 0.46, 0.45, 0.94] }}
            />
          </div>
          <div className="mt-2 text-muted">
            {solvencyPct >= 100 ? "Fully solvent" : `${solvencyPct}% solvent = redeem ${solvencyPct}%.`}
          </div>
          <div className="text-acid text-[10px] font-bold uppercase tracking-wider mt-0.5">No bank-run cliff.</div>
        </div>
      </FadeIn>

      <FadeIn delay={0.2}>
        <div className="card p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-muted mb-3">Protocol Stats</div>
          <div className="space-y-2 font-mono">
            <div className="flex justify-between"><span className="text-muted">sSLVT Rate</span><span className="text-teal"><NumberPulse value={exchangeRate.toFixed(4)} /></span></div>
            <div className="stat-divider" />
            <div className="flex justify-between"><span className="text-muted">TVL</span><span className="text-ink">${tvl >= 1000 ? (tvl / 1000).toFixed(1) + "K" : tvl.toFixed(0)}</span></div>
            <div className="stat-divider" />
            <div className="flex justify-between"><span className="text-muted">SOL Price</span><span className="text-ink"><NumberPulse value={"$" + solPriceUsd.toFixed(2)} /></span></div>
            <div className="stat-divider" />
            <div className="flex justify-between"><span className="text-muted">Keeper</span><span className="flex items-center gap-1 text-teal"><span className="w-1 h-1 bg-teal rounded-full animate-pulse-dot" />Active</span></div>
            {nextYieldMin > 0 && (
              <>
                <div className="stat-divider" />
                <div className="flex justify-between"><span className="text-muted">Next yield</span><span className="text-ink">~{Math.ceil(nextYieldMin / 60)} min</span></div>
              </>
            )}
          </div>
        </div>
      </FadeIn>

      {receipts.length > 0 && (
        <FadeIn delay={0.3}>
          <div className="card p-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-muted mb-2">Recent Yields</div>
            <div className="space-y-1.5 font-mono">
              {receipts.map((r: any, i: number) => {
                const rate = Number(r.newExchangeRate.toString()) / 1e12;
                const age = Math.round((Date.now() / 1000 - r.timestamp.toNumber()) / 60);
                return (
                  <motion.div
                    key={r.receiptIndex}
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className="flex justify-between text-[10px]"
                  >
                    <span className="text-muted">#{r.receiptIndex}</span>
                    <span className="text-teal">{rate.toFixed(6)}</span>
                    <span className="text-acid">+${(r.totalYieldUsd.toNumber() / 100).toFixed(2)}</span>
                    <span className="text-muted">{age}m</span>
                  </motion.div>
                );
              })}
            </div>
            <Link href="/audit" className="block mt-3 text-teal text-[10px] font-bold uppercase tracking-wider hover:underline">
              View all →
            </Link>
          </div>
        </FadeIn>
      )}
    </aside>
  );
}
