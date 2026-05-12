"use client";

import { useState, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { AppLayout } from "@/components/AppLayout";
import { TxButton } from "@/components/TxButton";
import { useProtocol } from "@/lib/useProtocol";
import { motion } from "framer-motion";
import { FadeIn } from "@/components/Motion";

export default function StakePage() {
  const { connected } = useWallet();
  const { setVisible } = useWalletModal();
  const { stake, unstake, slvtBalance, sslvtBalance, exchangeRate } = useProtocol();
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<"stake" | "unstake">("stake");

  const amount = parseFloat(input) || 0;
  const isStake = mode === "stake";
  const balance = isStake ? slvtBalance : sslvtBalance;
  const symbol = isStake ? "SLVT" : "sSLVT";
  const outSymbol = isStake ? "sSLVT" : "SLVT";
  const estimate = isStake ? (exchangeRate > 0 ? amount / exchangeRate : amount) : amount * exchangeRate;

  const handleStake = useCallback(async () => {
    if (amount <= 0) throw new Error("Enter a valid amount");
    if (amount > slvtBalance) throw new Error("Insufficient SLVT");
    return stake(slvtBalance > 0 ? amount / slvtBalance : 0);
  }, [stake, amount, slvtBalance]);

  const handleUnstake = useCallback(async () => {
    if (amount <= 0) throw new Error("Enter a valid amount");
    if (amount > sslvtBalance) throw new Error("Insufficient sSLVT");
    return unstake(sslvtBalance > 0 ? amount / sslvtBalance : 0);
  }, [unstake, amount, sslvtBalance]);

  return (
    <AppLayout>
      <div className="space-y-4">
        <FadeIn>
          <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-muted mb-3">
            Stake SLVT → Earn Yield
          </div>
        </FadeIn>

        <FadeIn delay={0.05}>
          <div className="grid grid-cols-2 gap-3">
            <div className="card card-hover p-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-muted mb-1">Your SLVT</div>
              <div className="text-xl font-extrabold text-ink font-mono">{slvtBalance.toFixed(2)}</div>
            </div>
            <div className="card card-hover p-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-muted mb-1">sSLVT Rate</div>
              <div className="text-xl font-extrabold text-teal font-mono">{exchangeRate.toFixed(4)}</div>
            </div>
          </div>
        </FadeIn>

        <FadeIn delay={0.1}>
          <div className="card card-hover p-6 glow-teal">
            <div className="flex gap-1 mb-4">
              <button
                onClick={() => { setMode("stake"); setInput(""); }}
                className={`text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 transition-all duration-200 ${
                  isStake ? "text-teal border border-teal bg-teal/10" : "text-muted border border-border hover:text-ink hover:border-ink/20"
                }`}
              >
                Stake
              </button>
              <button
                onClick={() => { setMode("unstake"); setInput(""); }}
                className={`text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 transition-all duration-200 ${
                  !isStake ? "text-teal border border-teal bg-teal/10" : "text-muted border border-border hover:text-ink hover:border-ink/20"
                }`}
              >
                Unstake
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-[10px] font-bold uppercase tracking-[0.06em] text-muted mb-1.5">
                  <span>Amount</span>
                  <span>Balance: <span className="text-ink font-mono">{balance.toFixed(2)}</span> {symbol}</span>
                </div>
                <div className="input-field p-3 flex items-center gap-2">
                  <input
                    className="bg-transparent w-full text-right text-2xl font-extrabold tracking-tight text-ink placeholder:text-muted/40 font-mono"
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={input}
                    onChange={(e) => setInput(e.target.value.replace(/[^0-9.]/g, ""))}
                  />
                  <span className="text-[11px] font-bold text-muted shrink-0 bg-surface px-2 py-0.5 border border-border">{symbol}</span>
                  <button
                    onClick={() => setInput(balance + "")}
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

              <div className="input-field p-3 flex items-center gap-2 opacity-70">
                <span className="flex-1 text-right text-2xl font-extrabold tracking-tight text-ink font-mono">
                  {estimate > 0 ? estimate.toFixed(2) : "0.00"}
                </span>
                <span className="text-[11px] font-bold text-muted shrink-0 bg-surface px-2 py-0.5 border border-border">{outSymbol}</span>
              </div>

              <div className="text-[10px] font-mono text-muted">
                1 sSLVT = {exchangeRate.toFixed(6)} SLVT · appreciating over time
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
              ) : (
                <TxButton
                  label={isStake ? "Stake SLVT" : "Unstake sSLVT"}
                  onExecute={isStake ? handleStake : handleUnstake}
                  successLabel={isStake ? `${estimate.toFixed(2)} sSLVT received` : `${estimate.toFixed(2)} SLVT returned`}
                  color={isStake ? "acid" : "teal"}
                />
              )}
            </div>
          </div>
        </FadeIn>

        {sslvtBalance > 0 && (
          <FadeIn delay={0.15}>
            <div className="card card-hover p-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-muted">Your sSLVT Position</span>
                <span className="flex items-center gap-1.5 text-acid">
                  <span className="w-1.5 h-1.5 bg-acid rounded-full animate-pulse-dot shadow-[0_0_6px_rgba(170,255,46,0.5)]" />
                  <span className="text-[10px] font-bold uppercase tracking-wider">Yield Accruing</span>
                </span>
              </div>
              <div className="text-xl font-extrabold text-ink font-mono">{sslvtBalance.toFixed(2)}</div>
              <div className="text-[10px] font-mono text-muted">worth {(sslvtBalance * exchangeRate).toFixed(2)} SLVT</div>
            </div>
          </FadeIn>
        )}
      </div>
    </AppLayout>
  );
}
