import 'dotenv/config';
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { AnchorProvider, Program, Wallet, BN } from '@coral-xyz/anchor';
import { getAssociatedTokenAddress, getAccount, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
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

async function getTokenBalance(connection: Connection, mint: PublicKey, owner: PublicKey): Promise<number> {
  try {
    const ata = await getAssociatedTokenAddress(mint, owner);
    const acct = await getAccount(connection, ata);
    return Number(acct.amount);
  } catch {
    return 0;
  }
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

  let passed = 0;
  let failed = 0;

  async function runStep(name: string, fn: () => Promise<string | null>) {
    try {
      const result = await fn();
      if (result) {
        console.log(`  ✅ ${name} — tx: ${result.slice(0, 20)}…`);
        passed++;
      } else {
        console.log(`  ✅ ${name} — OK (no tx)`);
        passed++;
      }
    } catch (e: any) {
      console.log(`  ❌ ${name} — ${e.message?.slice(0, 150)}`);
      failed++;
    }
  }

  console.log('\n========================================');
  console.log('  SOLVENT PROTOCOL — FULL E2E TEST');
  console.log('========================================\n');

  const vc = await program.account.vaultConfig.fetch(vaultConfig);
  const ss = await program.account.stakingState.fetch(stakingState);
  const vaultBal = await connection.getBalance(vaultEscrow);
  const adminSol = await connection.getBalance(admin.publicKey);

  console.log('--- Initial State ---');
  console.log(`  Admin: ${admin.publicKey.toBase58()}`);
  console.log(`  Admin SOL: ${(adminSol / LAMPORTS_PER_SOL).toFixed(4)}`);
  console.log(`  Vault SOL: ${(vaultBal / LAMPORTS_PER_SOL).toFixed(4)}`);
  console.log(`  SOL Price: ${vc.solPriceUsd.toString()} cents ($${(Number(vc.solPriceUsd) / 100).toFixed(2)})`);
  console.log(`  Equity: ${vc.totalEquityUsd.toString()} cents ($${(Number(vc.totalEquityUsd) / 100).toFixed(2)})`);
  console.log(`  Frozen: ${vc.isFrozen}`);
  console.log(`  Buffer BPS: ${vc.bufferBps}`);
  console.log(`  sSLVT Rate: ${ss.sslvtExchangeRate.toString()}`);

  const slvtBalBefore = await getTokenBalance(connection, slvtMint, admin.publicKey);
  const sslvtBalBefore = await getTokenBalance(connection, sslvtMint, admin.publicKey);
  console.log(`  SLVT balance: ${slvtBalBefore}`);
  console.log(`  sSLVT balance: ${sslvtBalBefore}\n`);

  // Step 1: Admin deposit (add SOL to vault for liquidity)
  console.log('--- Step 1: Admin Deposit ---');
  await runStep('admin_deposit 0.5 SOL', async () => {
    return await program.methods.adminDeposit(new BN(0.5 * LAMPORTS_PER_SOL))
      .accounts({
        vaultConfig,
        vaultEscrow,
        admin: admin.publicKey,
        systemProgram: PublicKey.default,
      })
      .signers([admin])
      .rpc();
  });

  // Step 2: Update equity (ensure protocol is solvent)
  console.log('\n--- Step 2: Update Equity ---');
  const currentVaultBal = await connection.getBalance(vaultEscrow);
  const equityUsd = Math.floor(currentVaultBal * Number(vc.solPriceUsd) / LAMPORTS_PER_SOL / 100);
  console.log(`  Calculated equity: ${equityUsd} cents (vault=${currentVaultBal / LAMPORTS_PER_SOL} SOL × price=${vc.solPriceUsd})`);
  await runStep('update_equity', async () => {
    return await program.methods.updateEquity(new BN(equityUsd), vc.solPriceUsd)
      .accounts({
        vaultConfig,
        vaultEscrow,
        slvtMint,
        admin: admin.publicKey,
      })
      .signers([admin])
      .rpc();
  });

  // Step 3: Deposit SOL → SLVT
  console.log('\n--- Step 3: Deposit SOL → SLVT ---');
  const depositAmount = 0.1 * LAMPORTS_PER_SOL;
  const expectedSlvt = Math.floor(depositAmount * Number(vc.solPriceUsd) / 1e11);
  console.log(`  Depositing: 0.1 SOL, expected ~${expectedSlvt} SLVT`);
  await runStep('deposit 0.1 SOL', async () => {
    return await program.methods.deposit(new BN(depositAmount))
      .accounts({
        vaultConfig,
        vaultEscrow,
        slvtMint,
        userSlvtAta,
        user: admin.publicKey,
        systemProgram: PublicKey.default,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .signers([admin])
      .rpc();
  });

  const slvtAfterDeposit = await getTokenBalance(connection, slvtMint, admin.publicKey);
  console.log(`  SLVT balance after deposit: ${slvtAfterDeposit}`);

  // Step 4: Stake SLVT → sSLVT
  console.log('\n--- Step 4: Stake SLVT → sSLVT ---');
  const stakeAmount = Math.floor(slvtAfterDeposit / 2);
  console.log(`  Staking: ${stakeAmount} SLVT`);
  if (stakeAmount > 0) {
    await runStep('stake SLVT→sSLVT', async () => {
      return await program.methods.stake(new BN(stakeAmount))
        .accounts({
          stakingState,
          slvtMint,
          sslvtMint,
          userSlvtAta,
          userSslvtAta,
          stakingSlvtAta,
          user: admin.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: PublicKey.default,
        })
        .signers([admin])
        .rpc();
    });

    const sslvtAfterStake = await getTokenBalance(connection, sslvtMint, admin.publicKey);
    const slvtAfterStake = await getTokenBalance(connection, slvtMint, admin.publicKey);
    console.log(`  SLVT: ${slvtAfterStake}, sSLVT: ${sslvtAfterStake}`);

    // Step 5: Unstake sSLVT → SLVT
    console.log('\n--- Step 5: Unstake sSLVT → SLVT ---');
    await runStep('unstake sSLVT→SLVT', async () => {
      return await program.methods.unstake(new BN(sslvtAfterStake))
        .accounts({
          stakingState,
          slvtMint,
          sslvtMint,
          userSlvtAta,
          userSslvtAta,
          stakingSlvtAta,
          user: admin.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([admin])
        .rpc();
    });

    const slvtAfterUnstake = await getTokenBalance(connection, slvtMint, admin.publicKey);
    console.log(`  SLVT after unstake: ${slvtAfterUnstake}`);
  } else {
    console.log('  SKIPPED — no SLVT to stake');
  }

  // Step 6: Redeem SLVT → SOL
  console.log('\n--- Step 6: Redeem SLVT → SOL ---');
  const slvtBeforeRedeem = await getTokenBalance(connection, slvtMint, admin.publicKey);
  if (slvtBeforeRedeem > 0) {
    const redeemAmount = Math.floor(slvtBeforeRedeem / 2);
    console.log(`  Redeeming: ${redeemAmount} SLVT`);
    await runStep('redeem SLVT→SOL', async () => {
      return await program.methods.redeem(new BN(redeemAmount))
        .accounts({
          vaultConfig,
          vaultEscrow,
          slvtMint,
          userSlvtAta,
          user: admin.publicKey,
          systemProgram: PublicKey.default,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([admin])
        .rpc();
    });

    const slvtAfterRedeem = await getTokenBalance(connection, slvtMint, admin.publicKey);
    console.log(`  SLVT after redeem: ${slvtAfterRedeem}`);
  } else {
    console.log('  SKIPPED — no SLVT to redeem');
  }

  // Step 7: Verify final state
  console.log('\n--- Final State ---');
  const vcFinal = await program.account.vaultConfig.fetch(vaultConfig);
  const vaultBalFinal = await connection.getBalance(vaultEscrow);
  const adminSolFinal = await connection.getBalance(admin.publicKey);
  const slvtFinal = await getTokenBalance(connection, slvtMint, admin.publicKey);
  const sslvtFinal = await getTokenBalance(connection, sslvtMint, admin.publicKey);

  console.log(`  Admin SOL: ${(adminSolFinal / LAMPORTS_PER_SOL).toFixed(4)}`);
  console.log(`  Vault SOL: ${(vaultBalFinal / LAMPORTS_PER_SOL).toFixed(4)}`);
  console.log(`  Frozen: ${vcFinal.isFrozen}`);
  console.log(`  SLVT: ${slvtFinal}`);
  console.log(`  sSLVT: ${sslvtFinal}`);

  // Summary
  console.log('\n========================================');
  console.log(`  PASSED: ${passed}  |  FAILED: ${failed}`);
  console.log('========================================\n');

  if (failed > 0) process.exit(1);
}

main().catch(e => { console.error('Fatal:', e.message?.slice(0, 300)); process.exit(1); });
