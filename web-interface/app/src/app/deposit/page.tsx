"use client";

import { useState, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { AppLayout } from "@/components/AppLayout";
import { TxButton } from "@/components/TxButton";
import { useProtocol } from "@/lib/useProtocol";
import { motion } from "framer-motion";
import { FadeIn } from "@/components/Motion";

export default function DepositPage() {
  const { connected } = useWallet();
  const { setVisible } = useWalletModal();
  const { deposit, solBalance, solPriceUsd, slvtBalance, vaultConfig } = useProtocol();
  const [solInput, setSolInput] = useState("");

  const solAmount = parseFloat(solInput) || 0;
  const slvtEstimate = solPriceUsd > 0 ? solAmount * solPriceUsd : 0;
  const isFrozen = vaultConfig?.isFrozen ?? false;

  const handleDeposit = useCallback(async () => {
    if (solAmount <= 0) throw new Error("Enter a valid amount");
    if (solAmount > solBalance) throw new Error("Insufficient SOL balance");
    return deposit(solAmount);
  }, [deposit, solAmount, solBalance]);

  return (
    <AppLayout>
      <div className="space-y-4">
        <FadeIn>
          <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-muted mb-3">
            Deposit SOL → Receive SLVT
          </div>
        </FadeIn>

        {isFrozen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="bg-frozen/10 border border-frozen/30 p-3 text-frozen text-xs font-bold uppercase tracking-wider"
          >
            Protocol Frozen — deposits disabled
          </motion.div>
        )}

        <FadeIn delay={0.1}>
          <div className="card card-hover p-6 glow-teal">
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-[10px] font-bold uppercase tracking-[0.06em] text-muted mb-1.5">
                  <span>You Deposit</span>
                  <span>Balance: <span className="text-ink font-mono">{solBalance.toFixed(4)}</span> SOL</span>
                </div>
                <div className="input-field p-3 flex items-center gap-2">
                  <input
                    className="bg-transparent w-full text-right text-2xl font-extrabold tracking-tight text-ink placeholder:text-muted/40 font-mono"
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={solInput}
                    onChange={(e) => setSolInput(e.target.value.replace(/[^0-9.]/g, ""))}
                    disabled={isFrozen}
                  />
                  <span className="text-[11px] font-bold text-muted shrink-0 bg-surface px-2 py-0.5 border border-border">SOL</span>
                  <button
                    onClick={() => setSolInput((Math.floor(solBalance * 1000) / 1000) + "")}
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

              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-muted mb-1.5">You Receive</div>
                <div className="input-field p-3 flex items-center gap-2 opacity-70">
                  <span className="flex-1 text-right text-2xl font-extrabold tracking-tight text-ink font-mono">
                    {slvtEstimate > 0 ? slvtEstimate.toFixed(2) : "0.00"}
                  </span>
                  <span className="text-[11px] font-bold text-muted shrink-0 bg-surface px-2 py-0.5 border border-border">SLVT</span>
                </div>
              </div>

              <div className="flex justify-end text-[10px] font-mono text-muted">
                SOL price: ${solPriceUsd.toFixed(2)} · Pyth Hermes
              </div>

              {!connected ? (
                <motion.button
                  onClick={() => setVisible(true)}
                  className="btn-primary w-full py-3 text-xs"
                  whileHover={{ scale: 1.005 }}
                  whileTap={{ scale: 0.995 }}
                >
                  Connect Wallet to continue
                </motion.button>
              ) : isFrozen ? (
                <div className="w-full bg-frozen/20 text-frozen font-bold py-3 text-xs text-center uppercase tracking-wider">
                  Deposits disabled
                </div>
              ) : (
                <TxButton
                  label="Deposit SOL"
                  onExecute={handleDeposit}
                  successLabel={`${slvtEstimate.toFixed(2)} SLVT received`}
                />
              )}
            </div>
          </div>
        </FadeIn>

        {slvtBalance > 0 && (
          <FadeIn delay={0.2}>
            <div className="card card-hover p-3 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-muted">Your SLVT </span>
                <span className="text-sm font-extrabold text-ink font-mono">{slvtBalance.toFixed(2)}</span>
              </div>
              <a href="/stake" className="text-[10px] font-bold text-teal uppercase tracking-wider hover:underline">
                Stake to earn yield →
              </a>
            </div>
          </FadeIn>
        )}
      </div>
    </AppLayout>
  );
}
