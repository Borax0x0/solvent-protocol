"use client";

import { useConnection, useWallet, useAnchorWallet } from "@solana/wallet-adapter-react";
import { Program, AnchorProvider, Idl, BN } from "@coral-xyz/anchor";
import { PublicKey, LAMPORTS_PER_SOL, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { useCallback, useEffect, useState } from "react";
import { IDL, PROGRAM_ID, vaultConfigPda, stakingStatePda, vaultEscrowPda, slvtMintPda, sslvtMintPda, yieldReceiptPda } from "./config";

export interface VaultConfigData {
  adminPubkey: PublicKey;
  slvtMint: PublicKey;
  sslvtMint: PublicKey;
  liquidityBufferBps: number;
  totalEquityUsd: BN;
  isFrozen: boolean;
  solPriceUsd: BN;
  bump: number;
}

export interface StakingStateData {
  sslvtExchangeRate: BN;
  totalStakedSlvt: BN;
  lastYieldTimestamp: BN;
  bump: number;
}

export interface YieldReceiptData {
  timestamp: BN;
  jitoYieldUsd: BN;
  driftFundingUsd: BN;
  totalYieldUsd: BN;
  oldExchangeRate: BN;
  newExchangeRate: BN;
  receiptIndex: number;
  bump: number;
}

function getProgram(connection: any, wallet: any): Program {
  const provider = new AnchorProvider(connection, wallet as any, { commitment: "confirmed" });
  return new Program(IDL as any as Idl, provider) as any;
}

export function useProtocol() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const anchorWallet = useAnchorWallet();
  const [vaultConfig, setVaultConfig] = useState<VaultConfigData | null>(null);
  const [stakingState, setStakingState] = useState<StakingStateData | null>(null);
  const [vaultBalance, setVaultBalance] = useState<number>(0);
  const [slvtBalance, setSlvtBalance] = useState<number>(0);
  const [sslvtBalance, setSslvtBalance] = useState<number>(0);
  const [solBalance, setSolBalance] = useState<number>(0);
  const [solvencyPct, setSolvencyPct] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const program = getProgram(connection, { publicKey: vaultConfigPda } as any);
      const vc: any = await (program as any).account.vaultConfig.fetch(vaultConfigPda);
      const ss: any = await (program as any).account.stakingState.fetch(stakingStatePda);
      setVaultConfig(vc);
      setStakingState(ss);

      const vb = await connection.getBalance(vaultEscrowPda);
      setVaultBalance(vb / LAMPORTS_PER_SOL);

      if (vc.totalEquityUsd.toNumber() > 0 && vc.solPriceUsd.toNumber() > 0) {
        const slvtSupply = await connection.getTokenSupply(slvtMintPda);
        const supplyUsd = slvtSupply.value.uiAmount! * 0.01;
        const equityUsd = vc.totalEquityUsd.toNumber() / 100;
        const solv = Math.min(100, supplyUsd > 0 ? (equityUsd / supplyUsd) * 100 : 100);
        setSolvencyPct(Math.round(solv * 10) / 10);
      }

      if (wallet.publicKey) {
        const sol = await connection.getBalance(wallet.publicKey);
        setSolBalance(sol / LAMPORTS_PER_SOL);

        const userSlvtAta = await getAssociatedTokenAddress(slvtMintPda, wallet.publicKey);
        try {
          const bal = await connection.getTokenAccountBalance(userSlvtAta);
          setSlvtBalance(parseFloat(bal.value.uiAmountString ?? "0"));
        } catch {
          setSlvtBalance(0);
        }

        const userSslvtAta = await getAssociatedTokenAddress(sslvtMintPda, wallet.publicKey);
        try {
          const bal = await connection.getTokenAccountBalance(userSslvtAta);
          setSslvtBalance(parseFloat(bal.value.uiAmountString ?? "0"));
        } catch {
          setSslvtBalance(0);
        }
      }
    } catch (e) {
      console.error("refresh error:", e);
    } finally {
      setLoading(false);
    }
  }, [connection, wallet.publicKey?.toBase58()]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 30000);
    return () => clearInterval(interval);
  }, [refresh]);

  const deposit = useCallback(
    async (solAmount: number) => {
      if (!anchorWallet) throw new Error("Wallet not connected");
      const program = getProgram(connection, anchorWallet);
      const lamports = new BN(Math.floor(solAmount * LAMPORTS_PER_SOL));
      const userSlvtAta = await getAssociatedTokenAddress(slvtMintPda, wallet.publicKey!);
      const tx = await (program as any).methods
        .deposit(lamports)
        .accounts({
          vaultConfig: vaultConfigPda,
          vaultEscrow: vaultEscrowPda,
          slvtMint: slvtMintPda,
          user: wallet.publicKey,
          userSlvtAta,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([])
        .rpc();
      await refresh();
      return tx;
    },
    [connection, wallet, anchorWallet, refresh]
  );

  const redeem = useCallback(
    async (slvtAmount: number) => {
      if (!anchorWallet) throw new Error("Wallet not connected");
      const program = getProgram(connection, anchorWallet);
      const userSlvtAta = await getAssociatedTokenAddress(slvtMintPda, wallet.publicKey!);
      const slvtInfo = await connection.getTokenAccountBalance(userSlvtAta);
      const rawAmount = new BN(slvtInfo.value.amount);
      const burnAmount = slvtAmount >= 1 ? rawAmount : rawAmount.muln(slvtAmount).divn(1);
      const tx = await (program as any).methods
        .redeem(burnAmount)
        .accounts({
          vaultConfig: vaultConfigPda,
          vaultEscrow: vaultEscrowPda,
          slvtMint: slvtMintPda,
          user: wallet.publicKey,
          userSlvtAta,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([])
        .rpc();
      await refresh();
      return tx;
    },
    [connection, wallet, anchorWallet, refresh]
  );

  const stake = useCallback(
    async (slvtAmount: number) => {
      if (!anchorWallet) throw new Error("Wallet not connected");
      const program = getProgram(connection, anchorWallet);
      const userSlvtAta = await getAssociatedTokenAddress(slvtMintPda, wallet.publicKey!);
      const userSslvtAta = await getAssociatedTokenAddress(sslvtMintPda, wallet.publicKey!);
      const stakingSlvtAta = await getAssociatedTokenAddress(slvtMintPda, stakingStatePda, true);
      const slvtInfo = await connection.getTokenAccountBalance(userSlvtAta);
      const rawAmount = new BN(slvtInfo.value.amount);
      const stakeAmount = slvtAmount >= 1 ? rawAmount : rawAmount.muln(slvtAmount);
      const tx = await (program as any).methods
        .stake(stakeAmount)
        .accounts({
          vaultConfig: vaultConfigPda,
          stakingState: stakingStatePda,
          slvtMint: slvtMintPda,
          sslvtMint: sslvtMintPda,
          stakingSlvtAta,
          user: wallet.publicKey,
          userSlvtAta,
          userSslvtAta,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([])
        .rpc();
      await refresh();
      return tx;
    },
    [connection, wallet, anchorWallet, refresh]
  );

  const unstake = useCallback(
    async (sslvtAmount: number) => {
      if (!anchorWallet) throw new Error("Wallet not connected");
      const program = getProgram(connection, anchorWallet);
      const userSlvtAta = await getAssociatedTokenAddress(slvtMintPda, wallet.publicKey!);
      const userSslvtAta = await getAssociatedTokenAddress(sslvtMintPda, wallet.publicKey!);
      const stakingSlvtAta = await getAssociatedTokenAddress(slvtMintPda, stakingStatePda, true);
      const sslvtInfo = await connection.getTokenAccountBalance(userSslvtAta);
      const rawAmount = new BN(sslvtInfo.value.amount);
      const unstakeAmount = sslvtAmount >= 1 ? rawAmount : rawAmount.muln(sslvtAmount);
      const tx = await (program as any).methods
        .unstake(unstakeAmount)
        .accounts({
          vaultConfig: vaultConfigPda,
          stakingState: stakingStatePda,
          slvtMint: slvtMintPda,
          sslvtMint: sslvtMintPda,
          stakingSlvtAta,
          user: wallet.publicKey,
          userSlvtAta,
          userSslvtAta,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([])
        .rpc();
      await refresh();
      return tx;
    },
    [connection, wallet, anchorWallet, refresh]
  );

  const fetchYieldReceipts = useCallback(
    async (count: number = 10) => {
      const receipts: YieldReceiptData[] = [];
      for (let i = 0; i < count; i++) {
        try {
          const pda = yieldReceiptPda(i);
          const info = await connection.getAccountInfo(pda);
          if (!info) break;
          const program = getProgram(connection, { publicKey: vaultConfigPda } as any);
          const yr: any = await (program as any).account.yieldReceipt.fetch(pda);
          receipts.push(yr);
        } catch {
          break;
        }
      }
      return receipts;
    },
    [connection]
  );

  const solPriceUsd = vaultConfig?.solPriceUsd ? vaultConfig.solPriceUsd.toNumber() / 100 : 0;
  const exchangeRate = stakingState?.sslvtExchangeRate
    ? Number(stakingState.sslvtExchangeRate.toString()) / 1e12
    : 1;

  return {
    vaultConfig,
    stakingState,
    vaultBalance,
    solBalance,
    slvtBalance,
    sslvtBalance,
    solvencyPct,
    solPriceUsd,
    exchangeRate,
    loading,
    refresh,
    deposit,
    redeem,
    stake,
    unstake,
    fetchYieldReceipts,
  };
}
