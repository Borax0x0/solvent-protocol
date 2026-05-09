"use client";

import { useState, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { AppLayout } from "@/components/AppLayout";
import { TxButton } from "@/components/TxButton";
import { useProtocol } from "@/lib/useProtocol";
import { motion } from "framer-motion";
import { FadeIn, NumberPulse } from "@/components/Motion";

export default function RedeemPage() {
  const { connected } = useWallet();
  const { redeem, slvtBalance, solvencyPct, solPriceUsd } = useProtocol();
  const [slvtInput, setSlvtInput] = useState("");

  const slvtAmount = parseFloat(slvtInput) || 0;
  const solFull = solPriceUsd > 0 ? slvtAmount / (solPriceUsd * 100) : 0;
  const haircutSol = solFull * (solvencyPct / 100);
  const haircutPct = Math.max(0, 100 - solvencyPct);
  const remaining = slvtAmount * (haircutPct / 100);

  const handleRedeem = useCallback(async () => {
    if (slvtAmount <= 0) throw new Error("Enter a valid amount");
    if (slvtAmount > slvtBalance) throw new Error("Insufficient SLVT");
    return redeem(slvtBalance > 0 ? slvtAmount / slvtBalance : 0);
  }, [redeem, slvtAmount, slvtBalance]);

  const solvColor = solvencyPct >= 100 ? "text-teal" : solvencyPct >= 80 ? "text-acid" : "text-frozen";

  return (
    <AppLayout>
      <div className="space-y-4">
        <FadeIn>
          <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-muted mb-3">
            Redeem SLVT → Receive SOL
          </div>
        </FadeIn>

        <FadeIn delay={0.05}>
          <div className="card card-hover p-6 glow-teal">
            <div className="flex justify-between items-baseline mb-3">
              <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-muted">Protocol Solvency</span>
              <span className={`text-4xl font-extrabold tracking-tighter ${solvColor}`}>
                <NumberPulse value={`${solvencyPct}%`} />
              </span>
            </div>
            <div className="w-full bg-void/50 h-2.5 solv-bar rounded-sm overflow-hidden mb-3">
              <motion.div
                className="fill h-full rounded-sm"
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, solvencyPct)}%` }}
                transition={{ duration: 1.2, ease: [0.25, 0.46, 0.45, 0.94] }}
              />
            </div>
            <p className="text-sm text-ink font-bold leading-snug">
              At {solvencyPct}% solvency, you receive {solvencyPct}% of your SLVT&apos;s value in SOL.
            </p>
            <p className="text-xs text-muted mt-1">
              {solvencyPct >= 100
                ? "Fully collateralized. No haircut applies."
                : `Remaining ${haircutPct.toFixed(0)}% stays in your wallet. No hard freeze. No cliff.`}
            </p>
          </div>
        </FadeIn>

        <FadeIn delay={0.1}>
          <div className="card card-hover p-6">
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-[10px] font-bold uppercase tracking-[0.06em] text-muted mb-1.5">
                  <span>Burn</span>
                  <span>Balance: <span className="text-ink font-mono">{slvtBalance.toFixed(2)}</span> SLVT</span>
                </div>
                <div className="input-field p-3 flex items-center gap-2">
                  <input
                    className="bg-transparent w-full text-right text-2xl font-extrabold tracking-tight text-ink placeholder:text-muted/40 font-mono"
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={slvtInput}
                    onChange={(e) => setSlvtInput(e.target.value.replace(/[^0-9.]/g, ""))}
                  />
                  <span className="text-[11px] font-bold text-muted shrink-0 bg-surface px-2 py-0.5 border border-border">SLVT</span>
                  <button
                    onClick={() => setSlvtInput(slvtBalance + "")}
                    className="text-[10px] font-bold text-teal hover:underline shrink-0"
                  >
                    MAX
                  </button>
                </div>
              </div>

              <div className="flex justify-center">
                <motion.div
                  animate={{ y: [0, 4, 0] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                  className="text-muted text-sm"
                >
                  ↓
                </motion.div>
              </div>

              <div className="bg-elevated border border-border p-4 flex justify-between items-center">
                <div>
                  <div className="text-[10px] text-muted mb-1">You Receive</div>
                  <div className="text-3xl font-extrabold tracking-tight text-ink font-mono">{haircutSol.toFixed(4)}</div>
                </div>
                <span className="text-base font-bold text-muted">SOL</span>
              </div>

              {remaining > 0 && (
                <div className="text-[10px] font-mono text-muted">
                  Remaining {remaining.toFixed(2)} SLVT stays in your wallet
                </div>
              )}

              {!connected ? (
                <motion.button
                  onClick={() => (document.querySelector(".wallet-adapter-button") as HTMLButtonElement)?.click()}
                  className="btn-primary w-full py-3 text-xs"
                  whileHover={{ scale: 1.005 }}
                  whileTap={{ scale: 0.995 }}
                >
                  Connect Wallet to continue
                </motion.button>
              ) : (
                <TxButton
                  label="Redeem SLVT"
                  onExecute={handleRedeem}
                  successLabel={`${haircutSol.toFixed(4)} SOL received`}
                  color="frozen"
                />
              )}
            </div>
          </div>
        </FadeIn>

        <FadeIn delay={0.15}>
          <div className="card p-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-muted mb-2">Transaction Details</div>
            <div className="space-y-2 text-[11px] font-mono">
              <div className="flex justify-between"><span className="text-muted">Exchange Rate</span><span className="text-ink">1 SLVT = {(1 / (solPriceUsd * 100)).toFixed(8)} SOL</span></div>
              <div className="stat-divider" />
              {haircutPct > 0 && (
                <>
                  <div className="flex justify-between"><span className="text-muted">Haircut ({haircutPct.toFixed(0)}%)</span><span className="text-frozen">-{(solFull - haircutSol).toFixed(4)} SOL</span></div>
                  <div className="stat-divider" />
                </>
              )}
              <div className="flex justify-between"><span className="text-ink font-bold">Final Receive</span><span className="text-teal font-bold">{haircutSol.toFixed(4)} SOL</span></div>
            </div>
          </div>
        </FadeIn>
      </div>
    </AppLayout>
  );
}
