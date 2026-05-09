import 'dotenv/config';
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { AnchorProvider, Program, Wallet, BN } from '@coral-xyz/anchor';
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { homedir } from 'os';

const PROGRAM_ID = new PublicKey('5rzosayUo9e8CmXit4ydqu8uk3tCGFFqUdhHCASFe5ho');
const RPC = 'https://api.devnet.solana.com';

function loadKeypair(): Keypair {
  const raw = readFileSync(resolve(homedir(), '.config/solana/id.json'), 'utf-8');
  return Keypair.fromSecretKey(new Uint8Array(JSON.parse(raw)));
}

function loadIdl(): any {
  const raw = readFileSync(resolve('/home/shish/Projects/solana_frontier/solvent-protocol/target/idl/slvt_core.json'), 'utf-8');
  return JSON.parse(raw);
}

async function main() {
  const admin = loadKeypair();
  const connection = new Connection(RPC, 'confirmed');
  const wallet = new Wallet(admin);
  const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  const idl = loadIdl();
  const program = new Program(idl as any, provider) as any;

  const [vaultConfig] = PublicKey.findProgramAddressSync([Buffer.from('vault_config')], PROGRAM_ID);
  const [stakingState] = PublicKey.findProgramAddressSync([Buffer.from('staking_state')], PROGRAM_ID);
  const [vaultEscrow] = PublicKey.findProgramAddressSync([Buffer.from('vault_escrow')], PROGRAM_ID);
  const [slvtMint] = PublicKey.findProgramAddressSync([Buffer.from('slvt_mint')], PROGRAM_ID);
  const [sslvtMint] = PublicKey.findProgramAddressSync([Buffer.from('sslvt_mint')], PROGRAM_ID);

  const userSlvtAta = await getAssociatedTokenAddress(slvtMint, admin.publicKey);
  const userSslvtAta = await getAssociatedTokenAddress(sslvtMint, admin.publicKey);
  const stakingSlvtAta = await getAssociatedTokenAddress(slvtMint, stakingState, true);

  const receiptIndex = 0;
  const [yieldReceipt] = PublicKey.findProgramAddressSync(
    [Buffer.from('yield_receipt'), new BN(receiptIndex).toArrayLike(Buffer, 'le', 4)],
    PROGRAM_ID
  );

  console.log('=== E2E Test ===');

  const vcBefore = await program.account.vaultConfig.fetch(vaultConfig);
  const vaultBalBefore = await connection.getBalance(vaultEscrow);
  console.log('[Before] price:', vcBefore.solPriceUsd.toString(), 'cents | equity:', vcBefore.totalEquityUsd.toString(), 'cents | vault:', vaultBalBefore / LAMPORTS_PER_SOL, 'SOL');

  // 1. Update yield (receipt_index=0)
  console.log('\n[1] Updating yield (receipt_index=0)...');
  const ss = await program.account.stakingState.fetch(stakingState);
  const newRate = new BN(ss.sslvtExchangeRate.toString()).add(new BN(1000));
  try {
    const tx = await program.methods.updateYield(newRate, new BN(100), new BN(50), new BN(receiptIndex))
      .accounts({ stakingState, vaultConfig, yieldReceipt, admin: admin.publicKey, systemProgram: PublicKey.default })
      .signers([admin])
      .rpc();
    console.log('  OK:', tx);
  } catch (e: any) {
    console.log('  FAILED:', e.message?.slice(0, 300));
    if (e.logs) console.log('  Last log:', e.logs.slice(-1)[0]);
  }

  // Verify YieldReceipt on-chain
  try {
    const yr = await program.account.yieldReceipt.fetch(yieldReceipt);
    console.log('  YieldReceipt #0: jito=' + yr.jitoYieldUsd.toString() + ' drift=' + yr.driftFundingUsd.toString() + ' total=' + yr.totalYieldUsd.toString());
  } catch (e: any) {
    console.log('  YieldReceipt fetch FAILED:', e.message?.slice(0, 200));
  }

  // 2. Update equity
  console.log('\n[2] Updating equity...');
  try {
    const tx = await program.methods.updateEquity(new BN(200_000), new BN(9500))
      .accounts({ vaultConfig, vaultEscrow, slvtMint, admin: admin.publicKey })
      .signers([admin])
      .rpc();
    console.log('  OK:', tx);
  } catch (e: any) {
    console.log('  FAILED:', e.message?.slice(0, 200));
  }

  const vcAfter = await program.account.vaultConfig.fetch(vaultConfig);
  const vaultBalAfter = await connection.getBalance(vaultEscrow);
  console.log('\n=== Final State ===');
  console.log('  equity:', vcAfter.totalEquityUsd.toString(), 'cents | price:', vcAfter.solPriceUsd.toString(), 'cents | frozen:', vcAfter.isFrozen);
  console.log('  vault:', vaultBalAfter / LAMPORTS_PER_SOL, 'SOL');
  console.log('  Admin SOL:', (await connection.getBalance(admin.publicKey)) / LAMPORTS_PER_SOL);
  console.log('=== Done ===');
}

main().catch(e => { console.error('Fatal:', e.message?.slice(0, 300)); process.exit(1); });
