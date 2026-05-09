import { PublicKey, SystemProgram } from '@solana/web3.js';
import { Program, BN } from '@coral-xyz/anchor';
import {
  connection, wallet, program, adminKeypair,
  vaultConfigPda, stakingStatePda, vaultEscrowPda, slvtMintPda,
} from './config.js';

const p = program;

export interface VaultConfigData {
  adminPubkey: PublicKey;
  slvtMint: PublicKey;
  sslvtMint: PublicKey;
  liquidityBufferBps: number;
  totalEquityUsd: bigint;
  isFrozen: boolean;
  solPriceUsd: bigint;
  bump: number;
}

export interface StakingStateData {
  sslvtExchangeRate: bigint;
  totalStakedSlvt: bigint;
  lastYieldTimestamp: bigint;
  bump: number;
}

export async function fetchVaultConfig(): Promise<VaultConfigData | null> {
  try {
    const acct = await p.account.vaultConfig.fetch(vaultConfigPda);
    return {
      adminPubkey: acct.adminPubkey as PublicKey,
      slvtMint: acct.slvtMint as PublicKey,
      sslvtMint: acct.sslvtMint as PublicKey,
      liquidityBufferBps: acct.liquidityBufferBps as number,
      totalEquityUsd: acct.totalEquityUsd as bigint,
      isFrozen: acct.isFrozen as boolean,
      solPriceUsd: acct.solPriceUsd as bigint,
      bump: acct.bump as number,
    };
  } catch {
    return null;
  }
}

export async function fetchStakingState(): Promise<StakingStateData | null> {
  try {
    const acct = await p.account.stakingState.fetch(stakingStatePda);
    return {
      sslvtExchangeRate: acct.sslvtExchangeRate as bigint,
      totalStakedSlvt: acct.totalStakedSlvt as bigint,
      lastYieldTimestamp: acct.lastYieldTimestamp as bigint,
      bump: acct.bump as number,
    };
  } catch {
    return null;
  }
}

export async function fetchVaultEscrowBalance(): Promise<number> {
  const acct = await connection.getAccountInfo(vaultEscrowPda);
  return acct ? acct.lamports : 0;
}

export async function fetchSlvtSupply(): Promise<number> {
  const mintAcct = await connection.getAccountInfo(slvtMintPda);
  if (!mintAcct) return 0;
  const supply = new DataView(mintAcct.data.buffer).getBigUint64(0, true);
  return Number(supply);
}

export async function updateEquity(totalEquityUsd: bigint, solPriceUsd: bigint): Promise<string> {
  const txSig = await p.methods
    .updateEquity(new BN(totalEquityUsd.toString()), new BN(solPriceUsd.toString()))
    .accounts({
      vaultConfig: vaultConfigPda,
      vaultEscrow: vaultEscrowPda,
      slvtMint: slvtMintPda,
      admin: adminKeypair.publicKey,
    })
    .signers([adminKeypair])
    .rpc();
  return txSig;
}

export async function updateYield(
  newExchangeRate: bigint,
  jitoYieldUsd: bigint,
  driftFundingUsd: bigint,
  receiptIndex: number
): Promise<string> {
  const receiptIndexBuf = Buffer.alloc(4);
  receiptIndexBuf.writeUInt32LE(receiptIndex, 0);
  const [yieldReceiptPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('yield_receipt'), receiptIndexBuf],
    program.programId
  );

  const txSig = await p.methods
    .updateYield(
      new BN(newExchangeRate.toString()),
      new BN(jitoYieldUsd.toString()),
      new BN(driftFundingUsd.toString()),
      receiptIndex
    )
    .accounts({
      stakingState: stakingStatePda,
      vaultConfig: vaultConfigPda,
      yieldReceipt: yieldReceiptPda,
      admin: adminKeypair.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .signers([adminKeypair])
    .rpc();
  return txSig;
}

export async function adminWithdraw(amountLamports: bigint): Promise<string> {
  const txSig = await p.methods
    .adminWithdraw(new BN(amountLamports.toString()))
    .accounts({
      vaultConfig: vaultConfigPda,
      vaultEscrow: vaultEscrowPda,
      admin: adminKeypair.publicKey,
      slvtMint: slvtMintPda,
      systemProgram: SystemProgram.programId,
    })
    .signers([adminKeypair])
    .rpc();
  return txSig;
}

export async function adminDeposit(amountLamports: bigint): Promise<string> {
  const txSig = await p.methods
    .adminDeposit(new BN(amountLamports.toString()))
    .accounts({
      vaultConfig: vaultConfigPda,
      vaultEscrow: vaultEscrowPda,
      admin: adminKeypair.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .signers([adminKeypair])
    .rpc();
  return txSig;
}
