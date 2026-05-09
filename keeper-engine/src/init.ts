import { program, adminKeypair, connection, vaultConfigPda, stakingStatePda, vaultEscrowPda, slvtMintPda, sslvtMintPda } from './config.js';
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { SYSVAR_RENT_PUBKEY } from '@solana/web3.js';

const p = program as any;

async function init() {
  console.log('Initializing Solvent Protocol on devnet...');
  console.log(`  Admin: ${adminKeypair.publicKey.toBase58()}`);
  console.log(`  VaultConfig: ${vaultConfigPda.toBase58()}`);
  console.log(`  StakingState: ${stakingStatePda.toBase58()}`);
  console.log(`  VaultEscrow: ${vaultEscrowPda.toBase58()}`);
  console.log(`  SLVT Mint: ${slvtMintPda.toBase58()}`);
  console.log(`  sSLVT Mint: ${sslvtMintPda.toBase58()}`);

  const balance = await connection.getBalance(adminKeypair.publicKey);
  console.log(`  Admin balance: ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);

  if (balance < 0.05 * LAMPORTS_PER_SOL) {
    console.error('Not enough SOL for init — airdrop first: solana airdrop 2 --url devnet');
    process.exit(1);
  }

  try {
    const tx = await p.methods
      .initProtocol(1500)
      .accounts({
        admin: adminKeypair.publicKey,
        vaultConfig: vaultConfigPda,
        stakingState: stakingStatePda,
        vaultEscrow: vaultEscrowPda,
        slvtMint: slvtMintPda,
        sslvtMint: sslvtMintPda,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([adminKeypair])
      .rpc();

    console.log(`\nProtocol initialized!`);
    console.log(`  tx: ${tx}`);
    console.log(`  buffer_bps: 1500 (15%)`);
  } catch (e: any) {
    if (e.message?.includes('already in use') || e.message?.includes('0x1')) {
      console.log('Protocol already initialized — skipping');
    } else {
      console.error('Init failed:', e.message || e);
      throw e;
    }
  }
}

init().catch(console.error);
