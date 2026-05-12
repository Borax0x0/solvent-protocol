"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

type TxState = "idle" | "loading" | "success" | "error";

const ERROR_MAP: Record<string, string> = {
  ProtocolFrozen: "Protocol is frozen — deposits are temporarily disabled.",
  OracleNotSet: "Oracle price not set. Contact the team.",
  ZeroAmount: "Amount cannot be zero.",
  MintMismatch: "Mint address mismatch. Try again.",
  MathOverflow: "Calculation error. Try a smaller amount.",
  Unauthorized: "Unauthorized — only the admin can do this.",
  ProtocolUnderwater: "Protocol has zero solvency. Redemptions disabled.",
  InsufficientLiquidity: "Insufficient liquidity in vault. Try a smaller amount or wait.",
  BufferExceeded: "Withdrawal would breach liquidity buffer.",
  InsufficientStakingLiquidity: "Not enough SLVT in staking vault.",
  RateCannotDecrease: "Exchange rate cannot decrease.",
  InvalidBufferBps: "Invalid buffer configuration.",
  "InsufficientFunds": "Insufficient SOL balance for this transaction.",
  "User rejected": "Transaction was cancelled.",
};

function translateError(msg: string): string {
  for (const [key, val] of Object.entries(ERROR_MAP)) {
    if (msg.includes(key)) return val;
  }
  if (msg.includes("custom program error")) {
    const match = msg.match(/0x([0-9a-f]+)/i);
    if (match) return `Transaction failed (error code ${match[1]}). Try again or use a smaller amount.`;
  }
  if (msg.length > 80) return msg.slice(0, 80) + "…";
  return msg || "Transaction failed. Please try again.";
}

export function TxButton({
  label,
  onExecute,
  successLabel,
  color = "teal",
}: {
  label: string;
  onExecute: () => Promise<string>;
  successLabel?: string;
  color?: "teal" | "acid" | "frozen";
}) {
  const [state, setState] = useState<TxState>("idle");
  const [txSig, setTxSig] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const handleClick = useCallback(async () => {
    setState("loading");
    setErrorMsg("");
    try {
      const sig = await onExecute();
      setTxSig(sig);
      setState("success");
    } catch (e: any) {
      setErrorMsg(translateError(e?.message || "Transaction failed"));
      setState("error");
    }
  }, [onExecute]);

  const explorerUrl = `https://explorer.solana.com/tx/${txSig}?cluster=devnet`;
  const btnClass = color === "frozen" ? "btn-frozen" : "btn-primary";

  return (
    <AnimatePresence mode="wait">
      {state === "loading" ? (
        <motion.div
          key="loading"
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          className="w-full card p-4 text-center"
        >
          <div className="flex items-center justify-center gap-2 text-teal">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              className="w-4 h-4 border-2 border-teal border-t-transparent rounded-full"
            />
            <span className="text-xs font-bold uppercase tracking-wider">{"Confirming…"}</span>
          </div>
          <div className="text-[10px] text-muted mt-1">Approve in Phantom</div>
        </motion.div>
      ) : state === "success" ? (
        <motion.div
          key="success"
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          className="w-full card p-4 border-acid/20"
        >
          <div className="flex items-center gap-2 text-acid mb-1.5">
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 500 }}
              className="text-base"
            >
              {"✓"}
            </motion.span>
            <span className="text-xs font-bold">{successLabel || "Transaction confirmed"}</span>
          </div>
          <a href={explorerUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] font-mono text-teal hover:underline">
            {"View on Explorer ↗"}
          </a>
          <button onClick={() => setState("idle")} className="block mt-2 text-[10px] text-muted hover:text-ink underline">
            Done
          </button>
        </motion.div>
      ) : state === "error" ? (
        <motion.div
          key="error"
          initial={{ opacity: 0, x: -4 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0 }}
          className="w-full card p-4 border-frozen/20"
        >
          <div className="flex items-center gap-2 text-frozen mb-1">
            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring" }}>{"X"}</motion.span>
            <span className="text-xs font-bold">Transaction failed</span>
          </div>
          <div className="text-[10px] text-muted font-mono mb-2">{errorMsg}</div>
          <motion.button
            onClick={handleClick}
            className={`w-full ${btnClass} py-2 text-xs`}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
          >
            Try again
          </motion.button>
        </motion.div>
      ) : (
        <motion.button
          key="idle"
          onClick={handleClick}
          className={`w-full ${btnClass} py-3 text-xs`}
          whileHover={{ scale: 1.005 }}
          whileTap={{ scale: 0.995 }}
        >
          {label}
        </motion.button>
      )}
    </AnimatePresence>
  );
}
