import 'dotenv/config';
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { resolve } from 'path';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { AnchorProvider, Program, Wallet, Idl } from '@coral-xyz/anchor';

const PROGRAM_ID = new PublicKey(process.env.PROGRAM_ID || '5rzosayUo9e8CmXit4ydqu8uk3tCGFFqUdhHCASFe5ho');
const RPC_ENDPOINT = process.env.RPC_ENDPOINT || 'https://api.devnet.solana.com';
const DRIFT_ENV = (process.env.DRIFT_ENV || 'devnet') as 'devnet' | 'mainnet';
const MOCK_DRIFT = process.env.MOCK_DRIFT === 'true';
const MOCK_JITO = process.env.MOCK_JITO === 'true';
const EQUITY_INTERVAL_MS = parseInt(process.env.EQUITY_INTERVAL_MS || '60000', 10);
const YIELD_INTERVAL_MS = parseInt(process.env.YIELD_INTERVAL_MS || '300000', 10);

const JITO_STAKE_POOL = new PublicKey(process.env.JITO_STAKE_POOL || 'JitoY5pcAxWX6iyP2QdFwTznGb8A99PRCUCVVxB46WZ');
const JITO_SOL_MINT = new PublicKey(process.env.JITO_SOL_MINT || 'J1tos8mqbhdGcF3pgj4PCKyVjzWSURcpLZU7pPGHxSYi');

function loadAdminKeypair(): Keypair {
  const keypairPath = (process.env.ADMIN_KEYPAIR_PATH || '~/.config/solana/id.json')
    .replace('~', homedir());
  const raw = readFileSync(resolve(keypairPath), 'utf-8');
  return Keypair.fromSecretKey(new Uint8Array(JSON.parse(raw)));
}

function loadIdl(): Idl {
  const idlPath = resolve(import.meta.dirname, '../../target/idl/slvt_core.json');
  const raw = readFileSync(idlPath, 'utf-8');
  return JSON.parse(raw) as Idl;
}

const adminKeypair = loadAdminKeypair();
const connection = new Connection(RPC_ENDPOINT, 'confirmed');
const wallet = new Wallet(adminKeypair);
const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
const idl = loadIdl();
const program: any = new Program(idl as any, provider);

const [vaultConfigPda] = PublicKey.findProgramAddressSync([Buffer.from('vault_config')], PROGRAM_ID);
const [stakingStatePda] = PublicKey.findProgramAddressSync([Buffer.from('staking_state')], PROGRAM_ID);
const [vaultEscrowPda] = PublicKey.findProgramAddressSync([Buffer.from('vault_escrow')], PROGRAM_ID);
const [slvtMintPda] = PublicKey.findProgramAddressSync([Buffer.from('slvt_mint')], PROGRAM_ID);
const [sslvtMintPda] = PublicKey.findProgramAddressSync([Buffer.from('sslvt_mint')], PROGRAM_ID);

export {
  PROGRAM_ID,
  RPC_ENDPOINT,
  DRIFT_ENV,
  MOCK_DRIFT,
  MOCK_JITO,
  EQUITY_INTERVAL_MS,
  YIELD_INTERVAL_MS,
  JITO_STAKE_POOL,
  JITO_SOL_MINT,
  adminKeypair,
  connection,
  wallet,
  provider,
  program,
  idl,
  vaultConfigPda,
  stakingStatePda,
  vaultEscrowPda,
  slvtMintPda,
  sslvtMintPda,
};
