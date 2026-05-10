"use client";

import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { useProtocol, YieldReceiptData } from "@/lib/useProtocol";
import { yieldReceiptPda, PROGRAM_ID } from "@/lib/config";
import { motion } from "framer-motion";
import { FadeIn, Stagger, StaggerItem } from "@/components/Motion";

export default function AuditPage() {
  const { fetchYieldReceipts } = useProtocol();
  const [receipts, setReceipts] = useState<YieldReceiptData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetchYieldReceipts(20);
        setReceipts(r.reverse());
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [fetchYieldReceipts]);

  const jitoTotal = receipts.reduce((s, r) => s + r.jitoYieldUsd.toNumber(), 0);
  const driftTotal = receipts.reduce((s, r) => s + r.driftFundingUsd.toNumber(), 0);

  return (
    <AppLayout>
      <div className="space-y-4">
        <FadeIn>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-extrabold text-teal">On-chain yield receipts</h1>
              <p className="text-[10px] text-muted mt-0.5">Real-time audit of protocol yield generation</p>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-1 h-1 bg-teal rounded-full animate-pulse-dot" />
              <span className="text-[10px] font-bold text-teal uppercase tracking-wider">Keeper Active</span>
            </div>
          </div>
        </FadeIn>

        <Stagger className="grid grid-cols-3 gap-3">
          <StaggerItem>
            <div className="card card-hover p-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-muted mb-1">Jito Yield</div>
              <div className="text-xl font-extrabold text-teal font-mono">${(jitoTotal / 100).toFixed(2)}</div>
            </div>
          </StaggerItem>
          <StaggerItem>
            <div className="card card-hover p-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-muted mb-1">Drift Funding</div>
              <div className="text-xl font-extrabold text-acid font-mono">${(driftTotal / 100).toFixed(2)}</div>
            </div>
          </StaggerItem>
          <StaggerItem>
            <div className="card card-hover p-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-muted mb-1">Total Yield</div>
              <div className="text-xl font-extrabold text-ink font-mono">${((jitoTotal + driftTotal) / 100).toFixed(2)}</div>
            </div>
          </StaggerItem>
        </Stagger>

        <FadeIn delay={0.2}>
          <div className="card">
            <div className="p-4 border-b border-border flex justify-between items-center">
              <h2 className="text-xs font-bold text-ink">Yield Receipts</h2>
              <a
                href={`https://solscan.io/address/${PROGRAM_ID.toBase58()}?cluster=devnet`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] font-mono text-teal hover:underline"
              >
                {receipts.length} PDAs · Solscan ↗
              </a>
            </div>

            {loading ? (
              <div className="p-8 text-center text-xs text-muted">Loading receipts…</div>
            ) : receipts.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted">No yield receipts yet. Keeper updates every 5 min.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="text-[10px] font-bold uppercase tracking-[0.06em] text-muted">
                      <th className="p-3 border-b border-border">#</th>
                      <th className="p-3 border-b border-border">Time</th>
                      <th className="p-3 border-b border-border text-teal">Rate</th>
                      <th className="p-3 border-b border-border text-right">Jito</th>
                      <th className="p-3 border-b border-border text-right">Drift</th>
                      <th className="p-3 border-b border-border text-right">Total</th>
                      <th className="p-3 border-b border-border text-right">Tx</th>
                    </tr>
                  </thead>
                  <tbody className="text-[11px] font-mono text-ink">
                    {receipts.map((r, i) => {
                      const ts = new Date(r.timestamp.toNumber() * 1000);
                      const rate = Number(r.newExchangeRate.toString()) / 1e12;
                      const pda = yieldReceiptPda(r.receiptIndex);
                      return (
                        <motion.tr
                          key={i}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.04 }}
                          className={`border-b border-border/30 hover:bg-white/[0.02] ${i % 2 ? "bg-white/[0.012]" : ""}`}
                        >
                          <td className="p-3 text-muted">#{r.receiptIndex}</td>
                          <td className="p-3 text-muted">{ts.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} {ts.toLocaleTimeString("en-GB", { hour12: false, hour: "2-digit", minute: "2-digit" })}</td>
                          <td className="p-3 text-teal">{rate.toFixed(6)}</td>
                          <td className="p-3 text-right text-teal">${(r.jitoYieldUsd.toNumber() / 100).toFixed(2)}</td>
                          <td className="p-3 text-right text-acid">${(r.driftFundingUsd.toNumber() / 100).toFixed(2)}</td>
                          <td className="p-3 text-right">${(r.totalYieldUsd.toNumber() / 100).toFixed(2)}</td>
                          <td className="p-3 text-right">
                            <a
                              href={`https://solscan.io/address/${pda.toBase58()}?cluster=devnet`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-teal hover:underline"
                            >
                              #{r.receiptIndex} ↗
                            </a>
                          </td>
                        </motion.tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="p-3 border-t border-border text-[10px] text-muted">
              Every row is a live on-chain PDA. Keeper updates every 5 min.
            </div>
          </div>
        </FadeIn>
      </div>
    </AppLayout>
  );
}
