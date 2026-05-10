import { LiteSVM } from "litesvm";
import {
  AccountRole,
  appendTransactionMessageInstruction,
  createTransactionMessage,
  generateKeyPairSigner,
  lamports,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Address,
  type IInstruction,
  type IAccountMeta,
  type ISigner,
} from "@solana/kit";
import { PublicKey } from "@solana/web3.js";
import * as fs from "fs";
import * as crypto from "crypto";
import { describe, it, before, beforeEach } from "mocha";
import { expect } from "chai";

const PROGRAM_ID = "5rzosayUo9e8CmXit4ydqu8uk3tCGFFqUdhHCASFe5ho" as Address;
const SO_PATH = "target/deploy/slvt_core.so";
const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" as Address;
const ASSOCIATED_TOKEN_PROGRAM_ID = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL" as Address;
const SYSTEM_PROGRAM_ID = "11111111111111111111111111111111" as Address;
const RENT_SYSVAR = "SysvarRent111111111111111111111111111111111" as Address;

const SOL_PRICE_CENTS = 15000;
const BUFFER_BPS = 1500;

function sha256(input: string): Uint8Array {
  return new Uint8Array(crypto.createHash("sha256").update(input).digest());
}

function ixDiscriminator(name: string): Uint8Array {
  return sha256(`global:${name}`).slice(0, 8);
}

function encodeU64(val: number | bigint): Uint8Array {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(val));
  return new Uint8Array(buf);
}

function encodeU128(val: bigint): Uint8Array {
  const buf = Buffer.alloc(16);
  buf.writeBigUInt64LE(val & 0xffffffffffffffffn, 0);
  buf.writeBigUInt64LE((val >> 64n) & 0xffffffffffffffffn, 8);
  return new Uint8Array(buf);
}

function encodeU16(val: number): Uint8Array {
  const buf = Buffer.alloc(2);
  buf.writeUInt16LE(val);
  return new Uint8Array(buf);
}

function encodeU32(val: number): Uint8Array {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(val);
  return new Uint8Array(buf);
}

const programPk = new PublicKey(PROGRAM_ID);
const tokenPk = new PublicKey(TOKEN_PROGRAM_ID);
const ataPk = new PublicKey(ASSOCIATED_TOKEN_PROGRAM_ID);

function findPda(seeds: Buffer[]): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(seeds, programPk);
}

function findAta(owner: PublicKey, mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), tokenPk.toBuffer(), mint.toBuffer()],
    ataPk
  )[0];
}

function makeMeta(address: Address, role: AccountRole, signer?: ISigner): IAccountMeta {
  return signer ? { address, role, signer } : { address, role };
}

function decodeVaultConfig(data: Uint8Array) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return {
    adminPubkey: new PublicKey(data.slice(8, 40)),
    slvtMint: new PublicKey(data.slice(40, 72)),
    sslvtMint: new PublicKey(data.slice(72, 104)),
    liquidityBufferBps: view.getUint16(104, true),
    totalEquityUsd: view.getBigUint64(106, true),
    isFrozen: data[114] !== 0,
    solPriceUsd: view.getBigUint64(115, true),
    bump: data[123],
  };
}

function decodeStakingState(data: Uint8Array) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const rateLow = view.getBigUint64(8, true);
  const rateHigh = view.getBigUint64(16, true);
  return {
    sslvtExchangeRate: rateLow | (rateHigh << 64n),
    totalStakedSlvt: view.getBigUint64(24, true),
    lastYieldTimestamp: view.getBigInt64(32, true),
    bump: data[40],
  };
}

function decodeYieldReceipt(data: Uint8Array) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const oldRateLow = view.getBigUint64(40, true);
  const oldRateHigh = view.getBigUint64(48, true);
  const newRateLow = view.getBigUint64(56, true);
  const newRateHigh = view.getBigUint64(64, true);
  return {
    timestamp: view.getBigInt64(8, true),
    jitoYieldUsd: view.getBigUint64(16, true),
    driftFundingUsd: view.getBigUint64(24, true),
    totalYieldUsd: view.getBigUint64(32, true),
    oldExchangeRate: oldRateLow | (oldRateHigh << 64n),
    newExchangeRate: newRateLow | (newRateHigh << 64n),
    receiptIndex: view.getUint32(72, true),
    bump: data[76],
  };
}

function decodeTokenAccount(data: Uint8Array) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return {
    mint: new PublicKey(data.slice(0, 32)),
    owner: new PublicKey(data.slice(32, 64)),
    amount: view.getBigUint64(64, true),
  };
}

function decodeMint(data: Uint8Array) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return {
    supply: view.getBigUint64(36, true),
    decimals: data[44],
  };
}

interface SendResult {
  ok: boolean;
  err: any;
  metaStr: string;
}

async function sendIx(
  svm: LiteSVM,
  payer: ISigner & { address: Address },
  ix: IInstruction
): Promise<SendResult> {
  svm.expireBlockhash();
  const tx = await pipe(
    createTransactionMessage({ version: 0 }),
    (t) => setTransactionMessageFeePayerSigner(payer, t),
    (t) => svm.setTransactionMessageLifetimeUsingLatestBlockhash(t),
    (t) => appendTransactionMessageInstruction(ix, t),
    (t) => signTransactionMessageWithSigners(t)
  );
  const meta = svm.sendTransaction(tx);
  const metaStr = String(meta);
  const isFailed = metaStr.includes("FailedTransactionMetadata");
  if (isFailed) {
    return { ok: false, err: "failed", metaStr };
  }
  return { ok: true, err: null, metaStr };
}

function expectAnchorError(result: SendResult, errorName: string) {
  expect(result.ok, `Expected ${errorName} but tx succeeded`).to.be.false;
  const found = result.metaStr.includes(`Error Code: ${errorName}`);
  expect(found, `Expected ${errorName} in metaStr: ${result.metaStr.slice(0, 500)}`).to.be.true;
}

class TestContext {
  svm: LiteSVM;
  admin!: ISigner & { address: Address };
  user!: ISigner & { address: Address };
  vaultConfig!: Address;
  stakingState!: Address;
  slvtMint!: Address;
  sslvtMint!: Address;
  vaultEscrow!: Address;
  slvtMintPk!: PublicKey;
  sslvtMintPk!: PublicKey;
  vaultEscrowPk!: PublicKey;
  stakingStatePk!: PublicKey;

  constructor() {
    this.svm = new LiteSVM();
    const progData = fs.readFileSync(SO_PATH);
    this.svm.addProgram(PROGRAM_ID, progData);
  }

  async setup() {
    this.admin = await generateKeyPairSigner();
    this.user = await generateKeyPairSigner();
    this.svm.airdrop(this.admin.address, lamports(100_000_000_000n));
    this.svm.airdrop(this.user.address, lamports(100_000_000_000n));

    const [vcPk] = findPda([Buffer.from("vault_config")]);
    const [ssPk] = findPda([Buffer.from("staking_state")]);
    const [smPk] = findPda([Buffer.from("slvt_mint")]);
    const [ssmPk] = findPda([Buffer.from("sslvt_mint")]);
    const [vePk] = findPda([Buffer.from("vault_escrow")]);

    this.vaultConfig = vcPk.toBase58() as Address;
    this.stakingState = ssPk.toBase58() as Address;
    this.slvtMint = smPk.toBase58() as Address;
    this.sslvtMint = ssmPk.toBase58() as Address;
    this.vaultEscrow = vePk.toBase58() as Address;
    this.slvtMintPk = smPk;
    this.sslvtMintPk = ssmPk;
    this.vaultEscrowPk = vePk;
    this.stakingStatePk = ssPk;
  }

  adminPk() { return new PublicKey(String(this.admin.address)); }
  userPk() { return new PublicKey(String(this.user.address)); }

  userSlvtAta() { return findAta(this.userPk(), this.slvtMintPk).toBase58() as Address; }
  adminSlvtAta() { return findAta(this.adminPk(), this.slvtMintPk).toBase58() as Address; }
  userSslvtAta() { return findAta(this.userPk(), this.sslvtMintPk).toBase58() as Address; }
  stakingSlvtAta() { return findAta(this.stakingStatePk, this.slvtMintPk).toBase58() as Address; }

  yieldReceiptPda(index: number) {
    const buf = Buffer.alloc(4);
    buf.writeUInt32LE(index);
    const [pk] = findPda([Buffer.from("yield_receipt"), buf]);
    return pk.toBase58() as Address;
  }

  async initProtocol(bufferBps: number = BUFFER_BPS) {
    return sendIx(this.svm, this.admin, {
      programAddress: PROGRAM_ID,
      accounts: [
        makeMeta(this.vaultConfig, AccountRole.WRITABLE),
        makeMeta(this.stakingState, AccountRole.WRITABLE),
        makeMeta(this.slvtMint, AccountRole.WRITABLE),
        makeMeta(this.sslvtMint, AccountRole.WRITABLE),
        makeMeta(this.vaultEscrow, AccountRole.READONLY),
        makeMeta(this.admin.address, AccountRole.WRITABLE_SIGNER, this.admin),
        makeMeta(TOKEN_PROGRAM_ID, AccountRole.READONLY),
        makeMeta(SYSTEM_PROGRAM_ID, AccountRole.READONLY),
        makeMeta(RENT_SYSVAR, AccountRole.READONLY),
      ],
      data: new Uint8Array([...ixDiscriminator("init_protocol"), ...encodeU16(bufferBps)]),
    });
  }

  async updateEquity(equityUsd: number | bigint, solPrice: number | bigint) {
    return sendIx(this.svm, this.admin, {
      programAddress: PROGRAM_ID,
      accounts: [
        makeMeta(this.vaultConfig, AccountRole.WRITABLE),
        makeMeta(this.vaultEscrow, AccountRole.READONLY),
        makeMeta(this.slvtMint, AccountRole.READONLY),
        makeMeta(this.admin.address, AccountRole.WRITABLE_SIGNER, this.admin),
      ],
      data: new Uint8Array([
        ...ixDiscriminator("update_equity"),
        ...encodeU64(equityUsd),
        ...encodeU64(solPrice),
      ]),
    });
  }

  async deposit(user: ISigner & { address: Address }, amountLamports: number) {
    const userPk = new PublicKey(String(user.address));
    const ata = findAta(userPk, this.slvtMintPk).toBase58() as Address;
    return sendIx(this.svm, user, {
      programAddress: PROGRAM_ID,
      accounts: [
        makeMeta(this.vaultConfig, AccountRole.WRITABLE),
        makeMeta(this.vaultEscrow, AccountRole.WRITABLE),
        makeMeta(this.slvtMint, AccountRole.WRITABLE),
        makeMeta(user.address, AccountRole.WRITABLE_SIGNER, user),
        makeMeta(ata, AccountRole.WRITABLE),
        makeMeta(TOKEN_PROGRAM_ID, AccountRole.READONLY),
        makeMeta(ASSOCIATED_TOKEN_PROGRAM_ID, AccountRole.READONLY),
        makeMeta(SYSTEM_PROGRAM_ID, AccountRole.READONLY),
      ],
      data: new Uint8Array([...ixDiscriminator("deposit"), ...encodeU64(amountLamports)]),
    });
  }

  async redeem(user: ISigner & { address: Address }, slvtAmount: number) {
    const userPk = new PublicKey(String(user.address));
    const ata = findAta(userPk, this.slvtMintPk).toBase58() as Address;
    return sendIx(this.svm, user, {
      programAddress: PROGRAM_ID,
      accounts: [
        makeMeta(this.vaultConfig, AccountRole.WRITABLE),
        makeMeta(this.vaultEscrow, AccountRole.WRITABLE),
        makeMeta(this.slvtMint, AccountRole.WRITABLE),
        makeMeta(user.address, AccountRole.WRITABLE_SIGNER, user),
        makeMeta(ata, AccountRole.WRITABLE),
        makeMeta(TOKEN_PROGRAM_ID, AccountRole.READONLY),
        makeMeta(SYSTEM_PROGRAM_ID, AccountRole.READONLY),
      ],
      data: new Uint8Array([...ixDiscriminator("redeem"), ...encodeU64(slvtAmount)]),
    });
  }

  async stake(user: ISigner & { address: Address }, slvtAmount: number) {
    const userPk = new PublicKey(String(user.address));
    const uSlvt = findAta(userPk, this.slvtMintPk).toBase58() as Address;
    const uSslvt = findAta(userPk, this.sslvtMintPk).toBase58() as Address;
    const sAta = this.stakingSlvtAta();
    return sendIx(this.svm, user, {
      programAddress: PROGRAM_ID,
      accounts: [
        makeMeta(this.vaultConfig, AccountRole.READONLY),
        makeMeta(this.stakingState, AccountRole.WRITABLE),
        makeMeta(this.slvtMint, AccountRole.WRITABLE),
        makeMeta(this.sslvtMint, AccountRole.WRITABLE),
        makeMeta(sAta, AccountRole.WRITABLE),
        makeMeta(user.address, AccountRole.WRITABLE_SIGNER, user),
        makeMeta(uSlvt, AccountRole.WRITABLE),
        makeMeta(uSslvt, AccountRole.WRITABLE),
        makeMeta(TOKEN_PROGRAM_ID, AccountRole.READONLY),
        makeMeta(ASSOCIATED_TOKEN_PROGRAM_ID, AccountRole.READONLY),
        makeMeta(SYSTEM_PROGRAM_ID, AccountRole.READONLY),
      ],
      data: new Uint8Array([...ixDiscriminator("stake"), ...encodeU64(slvtAmount)]),
    });
  }

  async unstake(user: ISigner & { address: Address }, sslvtAmount: number) {
    const userPk = new PublicKey(String(user.address));
    const uSlvt = findAta(userPk, this.slvtMintPk).toBase58() as Address;
    const uSslvt = findAta(userPk, this.sslvtMintPk).toBase58() as Address;
    const sAta = this.stakingSlvtAta();
    return sendIx(this.svm, user, {
      programAddress: PROGRAM_ID,
      accounts: [
        makeMeta(this.vaultConfig, AccountRole.READONLY),
        makeMeta(this.stakingState, AccountRole.WRITABLE),
        makeMeta(this.slvtMint, AccountRole.WRITABLE),
        makeMeta(this.sslvtMint, AccountRole.WRITABLE),
        makeMeta(sAta, AccountRole.WRITABLE),
        makeMeta(user.address, AccountRole.WRITABLE_SIGNER, user),
        makeMeta(uSlvt, AccountRole.WRITABLE),
        makeMeta(uSslvt, AccountRole.WRITABLE),
        makeMeta(TOKEN_PROGRAM_ID, AccountRole.READONLY),
      ],
      data: new Uint8Array([...ixDiscriminator("unstake"), ...encodeU64(sslvtAmount)]),
    });
  }

  async updateYield(newRate: bigint, jitoYield: number, driftFunding: number, receiptIndex: number) {
    return sendIx(this.svm, this.admin, {
      programAddress: PROGRAM_ID,
      accounts: [
        makeMeta(this.stakingState, AccountRole.WRITABLE),
        makeMeta(this.vaultConfig, AccountRole.READONLY),
        makeMeta(this.yieldReceiptPda(receiptIndex), AccountRole.WRITABLE),
        makeMeta(this.admin.address, AccountRole.WRITABLE_SIGNER, this.admin),
        makeMeta(SYSTEM_PROGRAM_ID, AccountRole.READONLY),
      ],
      data: new Uint8Array([
        ...ixDiscriminator("update_yield"),
        ...encodeU128(newRate),
        ...encodeU64(jitoYield),
        ...encodeU64(driftFunding),
        ...encodeU32(receiptIndex),
      ]),
    });
  }

  async adminDeposit(amountLamports: number) {
    return sendIx(this.svm, this.admin, {
      programAddress: PROGRAM_ID,
      accounts: [
        makeMeta(this.vaultConfig, AccountRole.WRITABLE),
        makeMeta(this.vaultEscrow, AccountRole.WRITABLE),
        makeMeta(this.admin.address, AccountRole.WRITABLE_SIGNER, this.admin),
        makeMeta(SYSTEM_PROGRAM_ID, AccountRole.READONLY),
      ],
      data: new Uint8Array([...ixDiscriminator("admin_deposit"), ...encodeU64(amountLamports)]),
    });
  }

  async adminWithdraw(amountLamports: number) {
    return sendIx(this.svm, this.admin, {
      programAddress: PROGRAM_ID,
      accounts: [
        makeMeta(this.vaultConfig, AccountRole.WRITABLE),
        makeMeta(this.vaultEscrow, AccountRole.WRITABLE),
        makeMeta(this.admin.address, AccountRole.WRITABLE_SIGNER, this.admin),
        makeMeta(this.slvtMint, AccountRole.WRITABLE),
        makeMeta(SYSTEM_PROGRAM_ID, AccountRole.READONLY),
      ],
      data: new Uint8Array([...ixDiscriminator("admin_withdraw"), ...encodeU64(amountLamports)]),
    });
  }

  async setAdmin(currentAdmin: ISigner & { address: Address }, newAdmin: Address) {
    return sendIx(this.svm, currentAdmin, {
      programAddress: PROGRAM_ID,
      accounts: [
        makeMeta(this.vaultConfig, AccountRole.WRITABLE),
        makeMeta(currentAdmin.address, AccountRole.READONLY_SIGNER, currentAdmin),
        makeMeta(newAdmin, AccountRole.READONLY),
      ],
      data: new Uint8Array([...ixDiscriminator("set_admin")]),
    });
  }

  getVaultConfig() {
    const acct = this.svm.getAccount(this.vaultConfig);
    if (!acct) throw new Error("vault_config not found");
    return decodeVaultConfig(acct.data);
  }

  getStakingState() {
    const acct = this.svm.getAccount(this.stakingState);
    if (!acct) throw new Error("staking_state not found");
    return decodeStakingState(acct.data);
  }

  getYieldReceipt(index: number) {
    const pda = this.yieldReceiptPda(index);
    const acct = this.svm.getAccount(pda);
    if (!acct) throw new Error(`yield_receipt ${index} not found`);
    return decodeYieldReceipt(acct.data);
  }

  getSlvtBalance(owner: PublicKey): bigint {
    const ata = findAta(owner, this.slvtMintPk).toBase58() as Address;
    const acct = this.svm.getAccount(ata);
    if (!acct) return 0n;
    return decodeTokenAccount(acct.data).amount;
  }

  getSslvtBalance(owner: PublicKey): bigint {
    const ata = findAta(owner, this.sslvtMintPk).toBase58() as Address;
    const acct = this.svm.getAccount(ata);
    if (!acct) return 0n;
    return decodeTokenAccount(acct.data).amount;
  }

  getSlvtSupply(): bigint {
    const acct = this.svm.getAccount(this.slvtMint);
    if (!acct) return 0n;
    return decodeMint(acct.data).supply;
  }

  getVaultSol(): bigint {
    return this.svm.getBalance(this.vaultEscrow) ?? 0n;
  }
}

describe("Solvent Protocol - slvt-core", () => {
  let ctx: TestContext;

  before(async () => {
    ctx = new TestContext();
    await ctx.setup();
  });

  describe("1. init_protocol", () => {
    it("creates VaultConfig + StakingState + mints", async () => {
      const r = await ctx.initProtocol();
      expect(r.ok, `init_protocol failed: ${r.metaStr.slice(0, 300)}`).to.be.true;

      const vc = ctx.getVaultConfig();
      expect(vc.adminPubkey.toBase58()).to.equal(ctx.adminPk().toBase58());
      expect(vc.liquidityBufferBps).to.equal(BUFFER_BPS);
      expect(vc.isFrozen).to.be.false;
      expect(vc.solPriceUsd).to.equal(0n);
      expect(vc.totalEquityUsd).to.equal(0n);

      const ss = ctx.getStakingState();
      expect(ss.sslvtExchangeRate).to.equal(1_000_000_000_000n);
      expect(ss.totalStakedSlvt).to.equal(0n);
    });

    it("rejects invalid buffer bps > 10000", async () => {
      const freshCtx = new TestContext();
      await freshCtx.setup();
      const r = await freshCtx.initProtocol(10001);
      expectAnchorError(r, "InvalidBufferBps");
    });
  });

  describe("2. deposit", () => {
    it("mints SLVT at correct rate", async () => {
      await ctx.updateEquity(0, SOL_PRICE_CENTS);
      const depositAmt = 1_000_000_000;
      const r = await ctx.deposit(ctx.user, depositAmt);
      expect(r.ok, `deposit failed: ${r.metaStr.slice(0, 300)}`).to.be.true;

      const expected = BigInt(depositAmt) * BigInt(SOL_PRICE_CENTS) * 1_000_000n / 100_000_000_000n;
      const bal = ctx.getSlvtBalance(ctx.userPk());
      expect(bal).to.equal(expected);
    });

    it("fails with ZeroAmount", async () => {
      const r = await ctx.deposit(ctx.user, 0);
      expectAnchorError(r, "ZeroAmount");
    });

    it("fails when frozen", async () => {
      await ctx.updateEquity(1, SOL_PRICE_CENTS);
      const r = await ctx.deposit(ctx.user, 1_000_000_000);
      expectAnchorError(r, "ProtocolFrozen");
      await ctx.updateEquity(999_999_999_999, SOL_PRICE_CENTS);
    });
  });

  describe("3. redeem", () => {
    it("full redemption at 100% solvency", async () => {
      const user2 = await generateKeyPairSigner();
      ctx.svm.airdrop(user2.address, lamports(50_000_000_000n));
      await ctx.updateEquity(999_999_999_999, SOL_PRICE_CENTS);
      await ctx.deposit(user2, 2_000_000_000);

      const user2Pk = new PublicKey(String(user2.address));
      const slvtBal = ctx.getSlvtBalance(user2Pk);

      const vaultSolBefore = ctx.getVaultSol();
      const redeemAmt = Number(slvtBal / 2n);
      const r = await ctx.redeem(user2, redeemAmt);
      expect(r.ok, `redeem failed: ${r.metaStr.slice(0, 300)}`).to.be.true;

      const vaultSolAfter = ctx.getVaultSol();
      expect(Number(vaultSolBefore - vaultSolAfter)).to.be.greaterThan(0);
    });

    it("proportional redemption at 90% solvency", async () => {
      const user2 = await generateKeyPairSigner();
      ctx.svm.airdrop(user2.address, lamports(50_000_000_000n));
      await ctx.updateEquity(999_999_999_999, SOL_PRICE_CENTS);
      await ctx.deposit(user2, 1_000_000_000);

      const user2Pk = new PublicKey(String(user2.address));
      const slvtBal = ctx.getSlvtBalance(user2Pk);
      const equity90 = Number(slvtBal) * 90 / 100;
      await ctx.updateEquity(equity90, SOL_PRICE_CENTS);

      const vaultSolBefore = ctx.getVaultSol();
      const r = await ctx.redeem(user2, Number(slvtBal));
      expect(r.ok, `redeem 90% failed: ${r.metaStr.slice(0, 300)}`).to.be.true;

      const vaultSolAfter = ctx.getVaultSol();
      expect(Number(vaultSolBefore - vaultSolAfter)).to.be.greaterThan(0);
      await ctx.updateEquity(999_999_999_999, SOL_PRICE_CENTS);
    });

    it("proportional redemption at 50% solvency", async () => {
      const user3 = await generateKeyPairSigner();
      ctx.svm.airdrop(user3.address, lamports(50_000_000_000n));
      await ctx.updateEquity(999_999_999_999, SOL_PRICE_CENTS);
      await ctx.deposit(user3, 1_000_000_000);

      const user3Pk = new PublicKey(String(user3.address));
      const slvtBal = ctx.getSlvtBalance(user3Pk);
      const equity50 = Number(slvtBal) * 50 / 100;
      await ctx.updateEquity(equity50, SOL_PRICE_CENTS);

      const vaultSolBefore = ctx.getVaultSol();
      const r = await ctx.redeem(user3, Number(slvtBal));
      expect(r.ok, `redeem 50% failed: ${r.metaStr.slice(0, 300)}`).to.be.true;

      const vaultSolAfter = ctx.getVaultSol();
      expect(Number(vaultSolBefore - vaultSolAfter)).to.be.greaterThan(0);
      await ctx.updateEquity(999_999_999_999, SOL_PRICE_CENTS);
    });

    it("fails with ProtocolUnderwater at 0% solvency", async () => {
      const user4 = await generateKeyPairSigner();
      ctx.svm.airdrop(user4.address, lamports(50_000_000_000n));
      await ctx.updateEquity(999_999_999_999, SOL_PRICE_CENTS);
      await ctx.deposit(user4, 1_000_000_000);

      await ctx.updateEquity(0, SOL_PRICE_CENTS);

      const user4Pk = new PublicKey(String(user4.address));
      const slvtBal = ctx.getSlvtBalance(user4Pk);
      const r = await ctx.redeem(user4, Number(slvtBal));
      expectAnchorError(r, "ProtocolUnderwater");
      await ctx.updateEquity(999_999_999_999, SOL_PRICE_CENTS);
    });

    it("fails with InsufficientLiquidity when buffer depleted", async () => {
      const user5 = await generateKeyPairSigner();
      ctx.svm.airdrop(user5.address, lamports(50_000_000_000n));
      await ctx.updateEquity(999_999_999_999, SOL_PRICE_CENTS);
      await ctx.deposit(user5, 1_000_000_000);

      const vaultSol = ctx.getVaultSol();
      const supply = ctx.getSlvtSupply() / 1_000_000n;
      const minBuffer = supply * BigInt(BUFFER_BPS) / 10000n * 100_000_000_000n / BigInt(SOL_PRICE_CENTS);
      const maxAdminWithdraw = vaultSol - minBuffer;
      if (maxAdminWithdraw > 0n) {
        await ctx.adminWithdraw(Number(maxAdminWithdraw));
      }

      const user5Pk = new PublicKey(String(user5.address));
      const slvtBal = ctx.getSlvtBalance(user5Pk);
      const r = await ctx.redeem(user5, Number(slvtBal));
      expect(r.ok, "expected redeem to fail").to.be.false;
      const isExpected = r.metaStr.includes("InsufficientLiquidity") || r.metaStr.includes("ProtocolUnderwater");
      expect(isExpected, `Expected InsufficientLiquidity or ProtocolUnderwater, got: ${r.metaStr.slice(0, 500)}`).to.be.true;
      await ctx.updateEquity(999_999_999_999, SOL_PRICE_CENTS);
    });
  });

  describe("4. stake", () => {
    it("stakes SLVT for sSLVT at correct rate", async () => {
      const staker = await generateKeyPairSigner();
      ctx.svm.airdrop(staker.address, lamports(50_000_000_000n));
      await ctx.updateEquity(999_999_999_999, SOL_PRICE_CENTS);
      await ctx.deposit(staker, 1_000_000_000);

      const stakerPk = new PublicKey(String(staker.address));
      const slvtBal = ctx.getSlvtBalance(stakerPk);

      const r = await ctx.stake(staker, Number(slvtBal));
      expect(r.ok, `stake failed: ${r.metaStr.slice(0, 300)}`).to.be.true;

      const sslvtBal = ctx.getSslvtBalance(stakerPk);
      expect(Number(sslvtBal)).to.be.greaterThan(0);
    });
  });

  describe("5. unstake", () => {
    it("unstakes sSLVT for SLVT at appreciated rate", async () => {
      await ctx.updateYield(1_100_000_000_000n, 5, 3, 0);

      const staker2 = await generateKeyPairSigner();
      ctx.svm.airdrop(staker2.address, lamports(50_000_000_000n));
      await ctx.updateEquity(999_999_999_999, SOL_PRICE_CENTS);
      await ctx.deposit(staker2, 2_000_000_000);

      const staker2Pk = new PublicKey(String(staker2.address));
      const slvtBal = ctx.getSlvtBalance(staker2Pk);
      await ctx.stake(staker2, Number(slvtBal));

      const sslvtBal = ctx.getSslvtBalance(staker2Pk);
      const slvtBefore = ctx.getSlvtBalance(staker2Pk);

      const r = await ctx.unstake(staker2, Number(sslvtBal));
      expect(r.ok, `unstake failed: ${r.metaStr.slice(0, 300)}`).to.be.true;

      const slvtAfter = ctx.getSlvtBalance(staker2Pk);
      expect(Number(slvtAfter)).to.be.greaterThan(Number(slvtBefore));
    });
  });

  describe("6. update_yield", () => {
    it("increases rate and creates YieldReceipt", async () => {
      const ss = ctx.getStakingState();
      const newRate = ss.sslvtExchangeRate + 50_000_000_000n;
      const r = await ctx.updateYield(newRate, 10, 7, 1);
      expect(r.ok, `update_yield failed: ${r.metaStr.slice(0, 300)}`).to.be.true;

      const yr = ctx.getYieldReceipt(1);
      expect(yr.jitoYieldUsd).to.equal(10n);
      expect(yr.driftFundingUsd).to.equal(7n);
      expect(yr.totalYieldUsd).to.equal(17n);
      expect(yr.receiptIndex).to.equal(1);
    });

    it("rejects rate decrease", async () => {
      const r = await ctx.updateYield(1n, 0, 0, 2);
      expectAnchorError(r, "RateCannotDecrease");
    });
  });

  describe("7. update_equity", () => {
    it("freezes when equity < supply", async () => {
      await ctx.updateEquity(1, SOL_PRICE_CENTS);
      const vc = ctx.getVaultConfig();
      expect(vc.isFrozen).to.be.true;
    });

    it("auto-unfreezes when equity >= supply", async () => {
      await ctx.updateEquity(999_999_999_999, SOL_PRICE_CENTS);
      const vc = ctx.getVaultConfig();
      expect(vc.isFrozen).to.be.false;
    });
  });

  describe("8. admin_withdraw", () => {
    it("cannot withdraw beyond buffer", async () => {
      await ctx.updateEquity(999_999_999_999, SOL_PRICE_CENTS);
      const vaultSol = ctx.getVaultSol();
      const supply = ctx.getSlvtSupply() / 1_000_000n;
      const minBuffer = supply * BigInt(BUFFER_BPS) / 10000n * 100_000_000_000n / BigInt(SOL_PRICE_CENTS);
      const maxAdminWithdraw = vaultSol - minBuffer;
      if (maxAdminWithdraw > 0n) {
        await ctx.adminWithdraw(Number(maxAdminWithdraw));
      }
      const r = await ctx.adminWithdraw(1);
      expectAnchorError(r, "BufferExceeded");
    });
  });

  describe("9. admin_deposit", () => {
    it("adds SOL to vault", async () => {
      const before = ctx.getVaultSol();
      const r = await ctx.adminDeposit(1_000_000_000);
      expect(r.ok, `admin_deposit failed: ${r.metaStr.slice(0, 300)}`).to.be.true;
      const after = ctx.getVaultSol();
      expect(Number(after - before)).to.equal(1_000_000_000);
    });
  });

  describe("10. set_admin", () => {
    it("rotates admin key", async () => {
      const newAdmin = await generateKeyPairSigner();
      ctx.svm.airdrop(newAdmin.address, lamports(10_000_000_000n));

      const r = await ctx.setAdmin(ctx.admin, newAdmin.address);
      expect(r.ok, `set_admin failed: ${r.metaStr.slice(0, 300)}`).to.be.true;

      const vc = ctx.getVaultConfig();
      expect(vc.adminPubkey.toBase58()).to.equal(new PublicKey(String(newAdmin.address)).toBase58());

      await ctx.setAdmin(newAdmin, ctx.admin.address);
    });
  });
});
