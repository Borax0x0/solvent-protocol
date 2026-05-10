import 'dotenv/config';
import { Connection, PublicKey, Keypair, LAMPORTS_PER_SOL, SystemProgram } from '@solana/web3.js';
import { AnchorProvider, Program, Wallet, BN } from '@coral-xyz/anchor';
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { homedir } from 'os';

const PID = new PublicKey('5rzosayUo9e8CmXit4ydqu8uk3tCGFFqUdhHCASFe5ho');
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

  const [vc] = PublicKey.findProgramAddressSync([Buffer.from('vault_config')], PID);
  const [ve] = PublicKey.findProgramAddressSync([Buffer.from('vault_escrow')], PID);
  const [sm] = PublicKey.findProgramAddressSync([Buffer.from('slvt_mint')], PID);

  const vaultBal = await connection.getBalance(ve);
  console.log('Vault SOL:', vaultBal / LAMPORTS_PER_SOL);

  const equityCents = Math.floor(vaultBal * 9500 / LAMPORTS_PER_SOL / 100);
  console.log('Setting equity to:', equityCents, 'cents ($' + (equityCents / 100).toFixed(2) + ')');

  const tx1 = await program.methods.updateEquity(new BN(equityCents), new BN(9500))
    .accounts({ vaultConfig: vc, vaultEscrow: ve, slvtMint: sm, admin: admin.publicKey })
    .signers([admin])
    .rpc();
  console.log('Update equity tx:', tx1);

  const userSlvtAta = await getAssociatedTokenAddress(sm, admin.publicKey);

  const depositAmount = 0.05 * LAMPORTS_PER_SOL;
  console.log('Depositing 0.05 SOL...');
  const tx2 = await program.methods.deposit(new BN(depositAmount))
    .accounts({
      vaultConfig: vc,
      vaultEscrow: ve,
      slvtMint: sm,
      user: admin.publicKey,
      userSlvtAta,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .signers([admin])
    .rpc();
  console.log('Deposit tx:', tx2);

  const bal = await connection.getTokenAccountBalance(userSlvtAta);
  console.log('SLVT balance:', bal.value.uiAmountString, 'raw:', bal.value.amount, 'decimals:', bal.value.decimals);
}

main().catch(e => { console.error('Fatal:', e.message?.slice(0, 300)); process.exit(1); });
