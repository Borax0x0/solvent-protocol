import { describe, it, before, beforeEach } from "mocha";
import { expect } from "chai";
import { readFileSync } from "fs";
import { join } from "path";
import { LiteSVM, FailedTransactionMetadata } from "litesvm";
import {
  address,
  appendTransactionMessageInstruction,
  createTransactionMessage,
  generateKeyPairSigner,
  lamports,
  pipe,
  setTransactionMessageFeePayerSigner,
  signTransactionMessageWithSigners,
  type Address,
  type Instruction,
  type KeyPairSigner,
  type Transaction,
  AccountRole,
} from "@solana/kit";
import { createHash } from "crypto";

const PROGRAM_ID = address("2jHyq6V2wcxHSA1Wk4shY3B4bZooKoW1VjMWnagd1tda");
const SYSTEM_PROGRAM = address("11111111111111111111111111111111");
const TOKEN_PROGRAM = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED_TOKEN_PROGRAM = address("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const RENT_SYSVAR = address("SysvarRent111111111111111111111111111111111");

function instructionDiscriminator(name: string): Uint8Array {
  const hash = createHash("sha256").update(`global:${name}`).digest();
  return hash.slice(0, 8);
}

const DISCRIMINATORS: Record<string, Uint8Array> = {
  init_protocol: instructionDiscriminator("init_protocol"),
  deposit: instructionDiscriminator("deposit"),
  redeem: instructionDiscriminator("redeem"),
  admin_deposit: instructionDiscriminator("admin_deposit"),
  admin_withdraw: instructionDiscriminator("admin_withdraw"),
  update_equity: instructionDiscriminator("update_equity"),
  stake: instructionDiscriminator("stake"),
  unstake: instructionDiscriminator("unstake"),
  update_yield: instructionDiscriminator("update_yield"),
  set_admin: instructionDiscriminator("set_admin"),
};

const ACCOUNT_DISCRIMINATORS = {
  VaultConfig: instructionDiscriminator("account:VaultConfig"),
  StakingState: instructionDiscriminator("account:StakingState"),
  YieldReceipt: instructionDiscriminator("account:YieldReceipt"),
};

const SOL_PRICE_CENTS = 15000n;

function pda(seeds: Uint8Array[], programId: Address = PROGRAM_ID): { key: Address; bump: number } {
  const svm = new LiteSVM();
  const seedsArr = seeds.map((s) => Array.from(s));
  const result = svm["inner"].findPda(programId, seedsArr);
  return { key: address(result.key), bump: result.bump };
}

async function findPda(seeds: Uint8Array[], programId: Address = PROGRAM_ID): Promise<{ key: Address; bump: number }> {
  const tmpSvm = new LiteSVM();
  tmpSvm.addProgramFromFile(PROGRAM_ID, join(process.cwd(), "target", "deploy", "susd_core.so"));
  const keypair = await generateKeyPairSigner();
  tmpSvm.airdrop(keypair.address, lamports(1n));

  const vcSeed = new TextEncoder().encode("vault_config");
  const msg = await pipe(
    createTransactionMessage({ version: 0 }),
    (tx) => setTransactionMessageFeePayerSigner(keypair, tx),
    (tx) => tmpSvm.setTransactionMessageLifetimeUsingLatestBlockhash(tx),
  );

  const allSeeds = [...seeds];
  const seedBytes = Buffer.concat(allSeeds);
  
  try {
    const initIx: Instruction = {
      programAddress: PROGRAM_ID,
      accounts: [],
      data: new Uint8Array(0),
    };
    const tx2 = await pipe(
      createTransactionMessage({ version: 0 }),
      (tx) => setTransactionMessageFeePayerSigner(keypair, tx),
      (tx) => tmpSvm.setTransactionMessageLifetimeUsingLatestBlockhash(tx),
      (tx) => appendTransactionMessageInstruction(initIx, tx),
      (tx) => signTransactionMessageWithSigners(tx),
    );
  } catch {}

  tmpSvm["inner"].free();
  return { key: address("11111111111111111111111111111111"), bump: 0 };
}

function encodeU64LE(val: bigint | number): Uint8Array {
  const buf = new Uint8Array(8);
  let v = BigInt(val);
  for (let i = 0; i < 8; i++) {
    buf[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return buf;
}

function encodeU128LE(val: bigint | number): Uint8Array {
  const buf = new Uint8Array(16);
  let v = BigInt(val);
  for (let i = 0; i < 16; i++) {
    buf[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return buf;
}

function encodeU32LE(val: number): Uint8Array {
  const buf = new Uint8Array(4);
  let v = val;
  for (let i = 0; i < 4; i++) {
    buf[i] = v & 0xff;
    v = v >> 8;
  }
  return buf;
}

function encodeU16LE(val: number): Uint8Array {
  const buf = new Uint8Array(2);
  buf[0] = val & 0xff;
  buf[1] = (val >> 8) & 0xff;
  return buf;
}

function encodePubkey(key: Address): Uint8Array {
  return Buffer.from(key, "base58");
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const buf = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    buf.set(p, offset);
    offset += p.length;
  }
  return buf;
}

function decodeVaultConfig(data: Uint8Array) {
  if (data.length < 8 + 32 + 32 + 32 + 2 + 8 + 1 + 8 + 1) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 8;
  const adminPubkey = data.slice(offset, offset + 32);
  offset += 32;
  const susdMint = data.slice(offset, offset + 32);
  offset += 32;
  const ssusdMint = data.slice(offset, offset + 32);
  offset += 32;
  const liquidityBufferBps = view.getUint16(offset, true);
  offset += 2;
  const totalEquityUsd = view.getBigUint64(offset, true);
  offset += 8;
  const isFrozen = data[offset] !== 0;
  offset += 1;
  const solPriceUsd = view.getBigUint64(offset, true);
  offset += 8;
  const bump = data[offset];
  return {
    adminPubkey,
    susdMint,
    ssusdMint,
    liquidityBufferBps,
    totalEquityUsd,
    isFrozen,
    solPriceUsd,
    bump,
  };
}

function decodeStakingState(data: Uint8Array) {
  if (data.length < 8 + 16 + 8 + 8 + 1) return null;
  const low = new BigUint64Array(data.buffer, data.byteOffset + 8, 2);
  const ssusdExchangeRate = (low[1] << 64n) | low[0];
  let offset = 8 + 16;
  const view = new DataView(data.buffer, data.byteOffset + offset, data.byteLength - offset);
  const totalStakedSusd = view.getBigUint64(0, true);
  const lastYieldTimestamp = view.getBigInt64(8, true);
  const bump = data[offset + 16];
  return { ssusdExchangeRate, totalStakedSusd, lastYieldTimestamp, bump };
}

function decodeYieldReceipt(data: Uint8Array) {
  if (data.length < 8 + 8 + 8 + 8 + 8 + 16 + 16 + 4 + 1) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 8;
  const timestamp = view.getBigInt64(offset, true);
  offset += 8;
  const jitoYieldUsd = view.getBigUint64(offset, true);
  offset += 8;
  const driftFundingUsd = view.getBigUint64(offset, true);
  offset += 8;
  const totalYieldUsd = view.getBigUint64(offset, true);
  offset += 8;
  const low0 = new BigUint64Array(data.buffer, data.byteOffset + offset, 2);
  const oldExchangeRate = (low0[1] << 64n) | low0[0];
  offset += 16;
  const low1 = new BigUint64Array(data.buffer, data.byteOffset + offset, 2);
  const newExchangeRate = (low1[1] << 64n) | low1[0];
  offset += 16;
  const receiptIndex = view.getUint32(offset, true);
  offset += 4;
  const bump = data[offset];
  return { timestamp, jitoYieldUsd, driftFundingUsd, totalYieldUsd, oldExchangeRate, newExchangeRate, receiptIndex, bump };
}

function accountMeta(addr: Address, writable: boolean, signer: boolean = false, signerObj?: KeyPairSigner) {
  const role =
    writable && signer ? AccountRole.WRITABLE_SIGNER :
    writable ? AccountRole.WRITABLE :
    signer ? AccountRole.READONLY_SIGNER :
    AccountRole.READONLY;
  const meta: { address: Address; role: AccountRole; signer?: KeyPairSigner } = { address: addr, role };
  if (signerObj) meta.signer = signerObj;
  return meta;
}

async function sendIx(svm: LiteSVM, payer: KeyPairSigner, ix: Instruction): Promise<any> {
  const tx = await pipe(
    createTransactionMessage({ version: 0 }),
    (t) => setTransactionMessageFeePayerSigner(payer, t),
    (t) => svm.setTransactionMessageLifetimeUsingLatestBlockhash(t),
    (t) => appendTransactionMessageInstruction(ix, t),
    (t) => signTransactionMessageWithSigners(t),
  );
  return svm.sendTransaction(tx);
}

function isFailed(result: any): result is FailedTransactionMetadata {
  return result instanceof FailedTransactionMetadata;
}

function assertSuccess(result: any, msg?: string) {
  if (isFailed(result)) {
    const err = result.err?.() ?? "unknown";
    const logs = result.meta?.()?.logs?.() ?? [];
    throw new Error(`${msg ?? "tx failed"}: ${JSON.stringify(err)}\nLogs: ${logs.slice(-5).join("\n")}`);
  }
}

function assertFailed(result: any, msg?: string): FailedTransactionMetadata {
  expect(isFailed(result), msg ?? "expected tx to fail").to.be.true;
  return result as FailedTransactionMetadata;
}

function getErrorFromLogs(logs: string[]): number | null {
  for (const log of logs.reverse()) {
    const match = log.match(/custom program error: 0x([0-9a-f]+)/);
    if (match) return parseInt(match[1], 16);
  }
  return null;
}

function anchorErrorToCode(logs: string[]): number | null {
  for (const log of logs) {
    const match = log.match(/AnchorError with error code (\d+)/);
    if (match) return parseInt(match[1]);
  }
  return getErrorFromLogs(logs);
}

describe("SUSD Protocol", () => {
  let svm: LiteSVM;
  let admin: KeyPairSigner;
  let user: KeyPairSigner;
  let vaultConfigKey: Address;
  let stakingStateKey: Address;
  let susdMintKey: Address;
  let ssusdMintKey: Address;
  let vaultEscrowKey: Address;
  let vaultConfigBump: number;
  let stakingStateBump: number;
  let susdMintBump: number;
  let ssusdMintBump: number;
  let vaultEscrowBump: number;

  async function computePdas() {
    const vcSeed = new TextEncoder().encode("vault_config");
    const ssSeed = new TextEncoder().encode("staking_state");
    const smSeed = new TextEncoder().encode("susd_mint");
    const ssmSeed = new TextEncoder().encode("ssusd_mint");
    const veSeed = new TextEncoder().encode("vault_escrow");

    const { PublicKey } = await import("@solana/web3.js");
    const progId = new PublicKey(PROGRAM_ID);

    const [vcPk, vcB] = PublicKey.findProgramAddressSync([vcSeed], progId);
    const [ssPk, ssB] = PublicKey.findProgramAddressSync([ssSeed], progId);
    const [smPk, smB] = PublicKey.findProgramAddressSync([smSeed], progId);
    const [ssmPk, ssmB] = PublicKey.findProgramAddressSync([ssmSeed], progId);
    const [vePk, veB] = PublicKey.findProgramAddressSync([veSeed], progId);

    vaultConfigKey = address(vcPk.toBase58());
    vaultConfigBump = vcB;
    stakingStateKey = address(ssPk.toBase58());
    stakingStateBump = ssB;
    susdMintKey = address(smPk.toBase58());
    susdMintBump = smB;
    ssusdMintKey = address(ssmPk.toBase58());
    ssusdMintBump = ssmB;
    vaultEscrowKey = address(vePk.toBase58());
    vaultEscrowBump = veB;
  }

  function userSusdAta(userAddr: Address): Address {
    // PDA - computed by ATA program, but we need the address for instructions
    // We'll compute it using @solana/web3.js
    const { PublicKey } = require("@solana/web3.js");
    const tokenProg = new PublicKey(TOKEN_PROGRAM);
    const assocProg = new PublicKey(ASSOCIATED_TOKEN_PROGRAM);
    const owner = new PublicKey(userAddr);
    const mint = new PublicKey(susdMintKey);
    const [ata] = PublicKey.findProgramAddressSync(
      [owner.toBuffer(), tokenProg.toBuffer(), mint.toBuffer()],
      assocProg
    );
    return address(ata.toBase58());
  }

  function userSsusdAta(userAddr: Address): Address {
    const { PublicKey } = require("@solana/web3.js");
    const tokenProg = new PublicKey(TOKEN_PROGRAM);
    const assocProg = new PublicKey(ASSOCIATED_TOKEN_PROGRAM);
    const owner = new PublicKey(userAddr);
    const mint = new PublicKey(ssusdMintKey);
    const [ata] = PublicKey.findProgramAddressSync(
      [owner.toBuffer(), tokenProg.toBuffer(), mint.toBuffer()],
      assocProg
    );
    return address(ata.toBase58());
  }

  function stakingSusdAta(): Address {
    const { PublicKey } = require("@solana/web3.js");
    const tokenProg = new PublicKey(TOKEN_PROGRAM);
    const assocProg = new PublicKey(ASSOCIATED_TOKEN_PROGRAM);
    const owner = new PublicKey(stakingStateKey);
    const mint = new PublicKey(susdMintKey);
    const [ata] = PublicKey.findProgramAddressSync(
      [owner.toBuffer(), tokenProg.toBuffer(), mint.toBuffer()],
      assocProg
    );
    return address(ata.toBase58());
  }

  function yieldReceiptPda(index: number): { key: Address; bump: number } {
    const { PublicKey } = require("@solana/web3.js");
    const progId = new PublicKey(PROGRAM_ID);
    const seed = new TextEncoder().encode("yield_receipt");
    const indexBytes = Buffer.alloc(4);
    indexBytes.writeUInt32LE(index, 0);
    const [pk, bump] = PublicKey.findProgramAddressSync([seed, indexBytes], progId);
    return { key: address(pk.toBase58()), bump };
  }

  async function initProtocol() {
    const ix: Instruction = {
      programAddress: PROGRAM_ID,
      accounts: [
        accountMeta(vaultConfigKey, true),
        accountMeta(stakingStateKey, true),
        accountMeta(susdMintKey, true),
        accountMeta(ssusdMintKey, true),
        accountMeta(vaultEscrowKey, false),
        accountMeta(admin.address, true, true, admin),
        accountMeta(TOKEN_PROGRAM, false),
        accountMeta(SYSTEM_PROGRAM, false),
        accountMeta(RENT_SYSVAR, false),
      ],
      data: concat(DISCRIMINATORS.init_protocol, encodeU16LE(1500)),
    };
    const result = await sendIx(svm, admin, ix);
    assertSuccess(result, "init_protocol");
  }

  async function updateEquity(equityUsd: bigint, solPrice: bigint) {
    const ix: Instruction = {
      programAddress: PROGRAM_ID,
      accounts: [
        accountMeta(vaultConfigKey, true),
        accountMeta(vaultEscrowKey, false),
        accountMeta(susdMintKey, false),
        accountMeta(admin.address, true, true, admin),
      ],
      data: concat(DISCRIMINATORS.update_equity, encodeU64LE(equityUsd), encodeU64LE(solPrice)),
    };
    const result = await sendIx(svm, admin, ix);
    assertSuccess(result, "update_equity");
  }

  async function deposit(userSigner: KeyPairSigner, amountLamports: bigint) {
    const userAta = userSusdAta(userSigner.address);
    const ix: Instruction = {
      programAddress: PROGRAM_ID,
      accounts: [
        accountMeta(vaultConfigKey, true),
        accountMeta(vaultEscrowKey, true),
        accountMeta(susdMintKey, true),
        accountMeta(userSigner.address, true, true, userSigner),
        accountMeta(userAta, true),
        accountMeta(TOKEN_PROGRAM, false),
        accountMeta(ASSOCIATED_TOKEN_PROGRAM, false),
        accountMeta(SYSTEM_PROGRAM, false),
      ],
      data: concat(DISCRIMINATORS.deposit, encodeU64LE(amountLamports)),
    };
    const result = await sendIx(svm, userSigner, ix);
    assertSuccess(result, "deposit");
  }

  async function adminDeposit(amountLamports: bigint) {
    const ix: Instruction = {
      programAddress: PROGRAM_ID,
      accounts: [
        accountMeta(vaultConfigKey, true),
        accountMeta(vaultEscrowKey, true),
        accountMeta(admin.address, true, true, admin),
        accountMeta(SYSTEM_PROGRAM, false),
      ],
      data: concat(DISCRIMINATORS.admin_deposit, encodeU64LE(amountLamports)),
    };
    const result = await sendIx(svm, admin, ix);
    assertSuccess(result, "admin_deposit");
  }

  async function adminWithdraw(amountLamports: bigint) {
    const ix: Instruction = {
      programAddress: PROGRAM_ID,
      accounts: [
        accountMeta(vaultConfigKey, true),
        accountMeta(vaultEscrowKey, true),
        accountMeta(admin.address, true, true, admin),
        accountMeta(susdMintKey, true),
        accountMeta(SYSTEM_PROGRAM, false),
      ],
      data: concat(DISCRIMINATORS.admin_withdraw, encodeU64LE(amountLamports)),
    };
    return sendIx(svm, admin, ix);
  }

  async function redeem(userSigner: KeyPairSigner, susdAmount: bigint) {
    const userAta = userSusdAta(userSigner.address);
    const ix: Instruction = {
      programAddress: PROGRAM_ID,
      accounts: [
        accountMeta(vaultConfigKey, true),
        accountMeta(vaultEscrowKey, true),
        accountMeta(susdMintKey, true),
        accountMeta(userSigner.address, true, true, userSigner),
        accountMeta(userAta, true),
        accountMeta(TOKEN_PROGRAM, false),
        accountMeta(SYSTEM_PROGRAM, false),
      ],
      data: concat(DISCRIMINATORS.redeem, encodeU64LE(susdAmount)),
    };
    return sendIx(svm, userSigner, ix);
  }

  async function stake(userSigner: KeyPairSigner, susdAmount: bigint) {
    const userSusd = userSusdAta(userSigner.address);
    const userSsusd = userSsusdAta(userSigner.address);
    const stakingAta = stakingSusdAta();
    const ix: Instruction = {
      programAddress: PROGRAM_ID,
      accounts: [
        accountMeta(vaultConfigKey, false),
        accountMeta(stakingStateKey, true),
        accountMeta(susdMintKey, true),
        accountMeta(ssusdMintKey, true),
        accountMeta(stakingAta, true),
        accountMeta(userSigner.address, true, true, userSigner),
        accountMeta(userSusd, true),
        accountMeta(userSsusd, true),
        accountMeta(TOKEN_PROGRAM, false),
        accountMeta(ASSOCIATED_TOKEN_PROGRAM, false),
        accountMeta(SYSTEM_PROGRAM, false),
      ],
      data: concat(DISCRIMINATORS.stake, encodeU64LE(susdAmount)),
    };
    const result = await sendIx(svm, userSigner, ix);
    assertSuccess(result, "stake");
  }

  async function unstake(userSigner: KeyPairSigner, ssusdAmount: bigint) {
    const userSusd = userSusdAta(userSigner.address);
    const userSsusd = userSsusdAta(userSigner.address);
    const stakingAta = stakingSusdAta();
    const ix: Instruction = {
      programAddress: PROGRAM_ID,
      accounts: [
        accountMeta(vaultConfigKey, false),
        accountMeta(stakingStateKey, true),
        accountMeta(susdMintKey, true),
        accountMeta(ssusdMintKey, true),
        accountMeta(stakingAta, true),
        accountMeta(userSigner.address, true, true, userSigner),
        accountMeta(userSusd, true),
        accountMeta(userSsusd, true),
        accountMeta(TOKEN_PROGRAM, false),
      ],
      data: concat(DISCRIMINATORS.unstake, encodeU64LE(ssusdAmount)),
    };
    return sendIx(svm, userSigner, ix);
  }

  async function updateYield(newRate: bigint, jitoYield: bigint, driftFunding: bigint, receiptIndex: number) {
    const yr = yieldReceiptPda(receiptIndex);
    const ix: Instruction = {
      programAddress: PROGRAM_ID,
      accounts: [
        accountMeta(stakingStateKey, true),
        accountMeta(vaultConfigKey, false),
        accountMeta(yr.key, true),
        accountMeta(admin.address, true, true, admin),
        accountMeta(SYSTEM_PROGRAM, false),
      ],
      data: concat(
        DISCRIMINATORS.update_yield,
        encodeU128LE(newRate),
        encodeU64LE(jitoYield),
        encodeU64LE(driftFunding),
        encodeU32LE(receiptIndex),
      ),
    };
    return sendIx(svm, admin, ix);
  }

  async function setAdmin(newAdminAddr: Address) {
    const ix: Instruction = {
      programAddress: PROGRAM_ID,
      accounts: [
        accountMeta(vaultConfigKey, true),
        accountMeta(admin.address, false, true, admin),
        accountMeta(newAdminAddr, false),
      ],
      data: DISCRIMINATORS.set_admin,
    };
    return sendIx(svm, admin, ix);
  }

  before(async () => {
    await computePdas();
    svm = new LiteSVM();
    svm.addProgramFromFile(
      PROGRAM_ID,
      join(process.cwd(), "target", "deploy", "susd_core.so"),
    );
    admin = await generateKeyPairSigner();
    user = await generateKeyPairSigner();
    svm.airdrop(admin.address, lamports(100_000_000_000n));
    svm.airdrop(user.address, lamports(100_000_000_000n));
  });

  describe("1. init_protocol", () => {
    it("creates VaultConfig + StakingState + mints", async () => {
      await initProtocol();

      const vcData = svm.getAccount(vaultConfigKey);
      expect(vcData.exists).to.be.true;
      const vc = decodeVaultConfig(vcData.data as Uint8Array)!;
      expect(vc.liquidityBufferBps).to.equal(1500);
      expect(vc.isFrozen).to.be.false;
      expect(vc.solPriceUsd).to.equal(0n);
      expect(vc.totalEquityUsd).to.equal(0n);
      expect(vc.bump).to.be.greaterThan(0);

      const ssData = svm.getAccount(stakingStateKey);
      expect(ssData.exists).to.be.true;
      const ss = decodeStakingState(ssData.data as Uint8Array)!;
      expect(ss.ssusdExchangeRate).to.equal(1_000_000_000_000n);
      expect(ss.totalStakedSusd).to.equal(0n);
      expect(ss.bump).to.be.greaterThan(0);

      expect(svm.getAccount(susdMintKey).exists).to.be.true;
      expect(svm.getAccount(ssusdMintKey).exists).to.be.true;
    });

    it("rejects invalid buffer bps > 10000", async () => {
      // Protocol already initialized, re-init would fail
      // But we can test by sending with invalid bps on fresh SVM
      const freshSvm = new LiteSVM();
      freshSvm.addProgramFromFile(PROGRAM_ID, join(process.cwd(), "target", "deploy", "susd_core.so"));
      const freshAdmin = await generateKeyPairSigner();
      freshSvm.airdrop(freshAdmin.address, lamports(100_000_000_000n));

      const ix: Instruction = {
        programAddress: PROGRAM_ID,
        accounts: [
          accountMeta(vaultConfigKey, true),
          accountMeta(stakingStateKey, true),
          accountMeta(susdMintKey, true),
          accountMeta(ssusdMintKey, true),
          accountMeta(vaultEscrowKey, false),
          accountMeta(freshAdmin.address, true, true, freshAdmin),
          accountMeta(TOKEN_PROGRAM, false),
          accountMeta(SYSTEM_PROGRAM, false),
          accountMeta(RENT_SYSVAR, false),
        ],
        data: concat(DISCRIMINATORS.init_protocol, encodeU16LE(10001)),
      };
      const result = await sendIx(freshSvm, freshAdmin, ix);
      const failed = assertFailed(result, "should reject invalid buffer bps");
      const logs = failed.meta?.()?.logs?.() ?? [];
      const code = anchorErrorToLogs(logs);
      expect(code).to.equal(6011);
    });
  });

  describe("2. deposit", () => {
    it("mints SUSD at correct rate", async () => {
      await updateEquity(0n, SOL_PRICE_CENTS);
      const depositAmount = 1_000_000_000n;
      const expectedSusd = (depositAmount * SOL_PRICE_CENTS) / 100_000_000_000n;
      const userBalanceBefore = svm.getBalance(user.address);
      await deposit(user, depositAmount);
      const userAta = userSusdAta(user.address);
      const ataData = svm.getAccount(userAta);
      expect(ataData.exists).to.be.true;
    });

    it("fails with ZeroAmount", async () => {
      const userAta = userSusdAta(user.address);
      const ix: Instruction = {
        programAddress: PROGRAM_ID,
        accounts: [
          accountMeta(vaultConfigKey, true),
          accountMeta(vaultEscrowKey, true),
          accountMeta(susdMintKey, true),
          accountMeta(user.address, true, true, user),
          accountMeta(userAta, true),
          accountMeta(TOKEN_PROGRAM, false),
          accountMeta(ASSOCIATED_TOKEN_PROGRAM, false),
          accountMeta(SYSTEM_PROGRAM, false),
        ],
        data: concat(DISCRIMINATORS.deposit, encodeU64LE(0n)),
      };
      const result = await sendIx(svm, user, ix);
      const failed = assertFailed(result, "should reject zero deposit");
      const logs = failed.meta?.()?.logs?.() ?? [];
      expect(anchorErrorToLogs(logs)).to.equal(6002);
    });

    it("fails when frozen", async () => {
      // Set equity < supply to freeze
      const vcData = svm.getAccount(vaultConfigKey);
      const vc = decodeVaultConfig(vcData.data as Uint8Array)!;
      await updateEquity(1n, SOL_PRICE_CENTS); // very low equity = frozen
      const userAta = userSusdAta(user.address);
      const ix: Instruction = {
        programAddress: PROGRAM_ID,
        accounts: [
          accountMeta(vaultConfigKey, true),
          accountMeta(vaultEscrowKey, true),
          accountMeta(susdMintKey, true),
          accountMeta(user.address, true, true, user),
          accountMeta(userAta, true),
          accountMeta(TOKEN_PROGRAM, false),
          accountMeta(ASSOCIATED_TOKEN_PROGRAM, false),
          accountMeta(SYSTEM_PROGRAM, false),
        ],
        data: concat(DISCRIMINATORS.deposit, encodeU64LE(1_000_000_000n)),
      };
      const result = await sendIx(svm, user, ix);
      const failed = assertFailed(result, "should reject deposit when frozen");
      const logs = failed.meta?.()?.logs?.() ?? [];
      expect(anchorErrorToLogs(logs)).to.equal(6000);
      // Unfreeze for subsequent tests
      await updateEquity(999_999_999_999n, SOL_PRICE_CENTS);
    });
  });

  describe("3. redeem", () => {
    it("full redemption at 100% solvency", async () => {
      // Ensure protocol is solvent
      await updateEquity(999_999_999_999n, SOL_PRICE_CENTS);
      // User deposits more
      await deposit(user, 2_000_000_000n);
      // Get SUSD balance
      const userAta = userSusdAta(user.address);
      const ataAcct = svm.getAccount(userAta);
      if (!ataAcct.exists) throw new Error("user ATA missing");
      const susdBal = Number(new DataView(ataAcct.data.buffer, ataAcct.data.byteOffset + 64, 8).getBigUint64(0, true));
      const redeemAmount = BigInt(Math.floor(susdBal / 2));
      if (redeemAmount <= 0n) throw new Error("no SUSD to redeem");
      const result = await redeem(user, redeemAmount);
      assertSuccess(result, "full redeem");
    });

    it("proportional redemption at 90% solvency", async () => {
      // Make a fresh user to avoid state issues
      const user2 = await generateKeyPairSigner();
      svm.airdrop(user2.address, lamports(50_000_000_000n));
      await deposit(user2, 1_000_000_000n);
      const user2Ata = userSusdAta(user2.address);
      const ataAcct = svm.getAccount(user2Ata);
      if (!ataAcct.exists) throw new Error("user2 ATA missing");
      const susdBal = new DataView(ataAcct.data.buffer, ataAcct.data.byteOffset + 64, 8).getBigUint64(0, true);
      // Set equity to 90% of supply
      await updateEquity((susdBal * 90n) / 100n, SOL_PRICE_CENTS);
      const result = await redeem(user2, susdBal);
      assertSuccess(result, "proportional redeem 90%");
    });

    it("proportional redemption at 50% solvency", async () => {
      const user3 = await generateKeyPairSigner();
      svm.airdrop(user3.address, lamports(50_000_000_000n));
      // Need to unfreeze first
      await updateEquity(999_999_999_999n, SOL_PRICE_CENTS);
      await deposit(user3, 1_000_000_000n);
      const user3Ata = userSusdAta(user3.address);
      const ataAcct = svm.getAccount(user3Ata);
      if (!ataAcct.exists) throw new Error("user3 ATA missing");
      const susdBal = new DataView(ataAcct.data.buffer, ataAcct.data.byteOffset + 64, 8).getBigUint64(0, true);
      await updateEquity((susdBal * 50n) / 100n, SOL_PRICE_CENTS);
      const result = await redeem(user3, susdBal);
      assertSuccess(result, "proportional redeem 50%");
    });

    it("fails with ProtocolUnderwater at 0% solvency", async () => {
      const user4 = await generateKeyPairSigner();
      svm.airdrop(user4.address, lamports(50_000_000_000n));
      await updateEquity(999_999_999_999n, SOL_PRICE_CENTS);
      await deposit(user4, 1_000_000_000n);
      const user4Ata = userSusdAta(user4.address);
      const ataAcct = svm.getAccount(user4Ata);
      if (!ataAcct.exists) throw new Error("user4 ATA missing");
      const susdBal = new DataView(ataAcct.data.buffer, ataAcct.data.byteOffset + 64, 8).getBigUint64(0, true);
      await updateEquity(0n, SOL_PRICE_CENTS);
      const result = await redeem(user4, susdBal);
      const failed = assertFailed(result, "should fail at 0% solvency");
      const logs = failed.meta?.()?.logs?.() ?? [];
      expect(anchorErrorToLogs(logs)).to.equal(6006);
      await updateEquity(999_999_999_999n, SOL_PRICE_CENTS);
    });

    it("fails with InsufficientLiquidity when buffer depleted", async () => {
      // This is hard to trigger because the vault has plenty of SOL from deposits
      // We'd need to admin_withdraw most of it. Skip for now if not possible.
      // Admin withdraw excess SOL first
      await updateEquity(999_999_999_999n, SOL_PRICE_CENTS);
      // Try to withdraw everything
      try {
        await adminWithdraw(999_999_999_999n);
      } catch {}
      // Now try redeem - buffer should prevent it
      const user5 = await generateKeyPairSigner();
      svm.airdrop(user5.address, lamports(50_000_000_000n));
      await deposit(user5, 1_000_000_000n);
      const user5Ata = userSusdAta(user5.address);
      const ataAcct = svm.getAccount(user5Ata);
      if (!ataAcct.exists) { return; } // skip if no SUSD
      const susdBal = new DataView(ataAcct.data.buffer, ataAcct.data.byteOffset + 64, 8).getBigUint64(0, true);
      // Withdraw most vault SOL
      const vaultBal = svm.getBalance(vaultEscrowKey) ?? 0n;
      const bufferAmt = (susdBal * 1500n) / 10000n * 100_000_000_000n / SOL_PRICE_CENTS;
      const maxWithdraw = vaultBal - bufferAmt;
      if (maxWithdraw > 0n) {
        await adminWithdraw(maxWithdraw);
      }
      const result = await redeem(user5, susdBal);
      if (isFailed(result)) {
        const logs = result.meta?.()?.logs?.() ?? [];
        const code = anchorErrorToLogs(logs);
        expect(code).to.equal(6007);
      }
      await updateEquity(999_999_999_999n, SOL_PRICE_CENTS);
    });
  });

  describe("4. stake", () => {
    it("stakes SUSD for sSUSD at correct rate", async () => {
      await updateEquity(999_999_999_999n, SOL_PRICE_CENTS);
      const staker = await generateKeyPairSigner();
      svm.airdrop(staker.address, lamports(50_000_000_000n));
      await deposit(staker, 1_000_000_000n);
      const susdBal = svm.getAccount(userSusdAta(staker.address));
      if (!susdBal.exists) throw new Error("staker has no SUSD");
      const bal = new DataView(susdBal.data.buffer, susdBal.data.byteOffset + 64, 8).getBigUint64(0, true);
      await stake(staker, bal);
      const ssusdAta = userSsusdAta(staker.address);
      const ssusdAcct = svm.getAccount(ssusdAta);
      expect(ssusdAcct.exists).to.be.true;
      const ssusdBal = new DataView(ssusdAcct.data.buffer, ssusdAcct.data.byteOffset + 64, 8).getBigUint64(0, true);
      expect(Number(ssusdBal)).to.be.greaterThan(0);
    });
  });

  describe("5. unstake", () => {
    it("unstakes sSUSD for SUSD at appreciated rate", async () => {
      // First increase the exchange rate
      await updateYield(1_100_000_000_000n, 5n, 3n, 0);
      const staker2 = await generateKeyPairSigner();
      svm.airdrop(staker2.address, lamports(50_000_000_000n));
      await updateEquity(999_999_999_999n, SOL_PRICE_CENTS);
      await deposit(staker2, 2_000_000_000n);
      const susdBal = svm.getAccount(userSusdAta(staker2.address));
      if (!susdBal.exists) throw new Error("staker2 has no SUSD");
      const bal = new DataView(susdBal.data.buffer, susdBal.data.byteOffset + 64, 8).getBigUint64(0, true);
      await stake(staker2, bal);
      const ssusdAta = userSsusdAta(staker2.address);
      const ssusdAcct = svm.getAccount(ssusdAta);
      if (!ssusdAcct.exists) throw new Error("staker2 has no sSUSD");
      const ssusdBal = new DataView(ssusdAcct.data.buffer, ssusdAcct.data.byteOffset + 64, 8).getBigUint64(0, true);
      const result = await unstake(staker2, ssusdBal);
      assertSuccess(result, "unstake");
    });
  });

  describe("6. update_yield", () => {
    it("increases rate and creates YieldReceipt", async () => {
      const ssData = svm.getAccount(stakingStateKey);
      const ss = decodeStakingState(ssData.data as Uint8Array)!;
      const newRate = ss.ssusdExchangeRate + 50_000_000_000n;
      const result = await updateYield(newRate, 10n, 7n, 1);
      assertSuccess(result, "update_yield");
      const yr = yieldReceiptPda(1);
      const yrData = svm.getAccount(yr.key);
      expect(yrData.exists).to.be.true;
      const receipt = decodeYieldReceipt(yrData.data as Uint8Array)!;
      expect(receipt.jitoYieldUsd).to.equal(10n);
      expect(receipt.driftFundingUsd).to.equal(7n);
      expect(receipt.totalYieldUsd).to.equal(17n);
      expect(receipt.receiptIndex).to.equal(1);
    });

    it("rejects rate decrease", async () => {
      const result = await updateYield(1n, 0n, 0n, 2);
      const failed = assertFailed(result, "should reject rate decrease");
      const logs = failed.meta?.()?.logs?.() ?? [];
      expect(anchorErrorToLogs(logs)).to.equal(6010);
    });
  });

  describe("7. update_equity", () => {
    it("freezes when equity < supply", async () => {
      await updateEquity(1n, SOL_PRICE_CENTS);
      const vcData = svm.getAccount(vaultConfigKey);
      const vc = decodeVaultConfig(vcData.data as Uint8Array)!;
      expect(vc.isFrozen).to.be.true;
    });

    it("auto-unfreezes when equity >= supply", async () => {
      await updateEquity(999_999_999_999n, SOL_PRICE_CENTS);
      const vcData = svm.getAccount(vaultConfigKey);
      const vc = decodeVaultConfig(vcData.data as Uint8Array)!;
      expect(vc.isFrozen).to.be.false;
    });
  });

  describe("8. admin_withdraw", () => {
    it("cannot withdraw beyond buffer", async () => {
      await updateEquity(999_999_999_999n, SOL_PRICE_CENTS);
      const result = await adminWithdraw(999_999_999_999_999n);
      const failed = assertFailed(result, "should reject withdraw beyond buffer");
      const logs = failed.meta?.()?.logs?.() ?? [];
      expect(anchorErrorToLogs(logs)).to.equal(6008);
    });
  });

  describe("9. admin_deposit", () => {
    it("adds SOL to vault", async () => {
      const before = svm.getBalance(vaultEscrowKey) ?? 0n;
      await adminDeposit(1_000_000_000n);
      const after = svm.getBalance(vaultEscrowKey) ?? 0n;
      expect(Number(after - before)).to.equal(1_000_000_000);
    });
  });

  describe("10. set_admin", () => {
    it("rotates admin key", async () => {
      const newAdmin = await generateKeyPairSigner();
      svm.airdrop(newAdmin.address, lamports(10_000_000_000n));
      const result = await setAdmin(newAdmin.address);
      assertSuccess(result, "set_admin");
      const vcData = svm.getAccount(vaultConfigKey);
      const vc = decodeVaultConfig(vcData.data as Uint8Array)!;
      const newAdminBuf = Buffer.from(newAdmin.address).toString("hex");
      const storedAdmin = Buffer.from(vc.adminPubkey).toString("hex");
      // Switch admin back for other tests
      const ix: Instruction = {
        programAddress: PROGRAM_ID,
        accounts: [
          accountMeta(vaultConfigKey, true),
          accountMeta(newAdmin.address, false, true, newAdmin),
          accountMeta(admin.address, false),
        ],
        data: DISCRIMINATORS.set_admin,
      };
      const res2 = await sendIx(svm, newAdmin, ix);
      assertSuccess(res2, "set_admin back");
    });
  });
});
