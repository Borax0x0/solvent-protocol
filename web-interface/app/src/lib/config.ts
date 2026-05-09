import { PublicKey } from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey("5rzosayUo9e8CmXit4ydqu8uk3tCGFFqUdhHCASFe5ho");

export const [vaultConfigPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("vault_config")],
  PROGRAM_ID
);
export const [stakingStatePda] = PublicKey.findProgramAddressSync(
  [Buffer.from("staking_state")],
  PROGRAM_ID
);
export const [vaultEscrowPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("vault_escrow")],
  PROGRAM_ID
);
export const [slvtMintPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("slvt_mint")],
  PROGRAM_ID
);
export const [sslvtMintPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("sslvt_mint")],
  PROGRAM_ID
);

export function yieldReceiptPda(index: number): PublicKey {
  const indexBuf = Buffer.alloc(4);
  indexBuf.writeUInt32LE(index);
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("yield_receipt"), indexBuf],
    PROGRAM_ID
  );
  return pda;
}

export const IDL = {
  address: "5rzosayUo9e8CmXit4ydqu8uk3tCGFFqUdhHCASFe5ho",
  metadata: {
    name: "slvt_core",
    version: "0.1.0",
    spec: "0.1.0",
    description: "Solvent Protocol - Delta-neutral stablecoin vault with yield staking",
  },
  instructions: [
    {
      name: "init_protocol",
      discriminator: [3, 188, 141, 237, 225, 226, 232, 210],
      accounts: [
        { name: "vault_config", writable: true, pda: { seeds: [{ kind: "const", value: [118, 97, 117, 108, 116, 95, 99, 111, 110, 102, 105, 103] }] } },
        { name: "staking_state", writable: true, pda: { seeds: [{ kind: "const", value: [115, 116, 97, 107, 105, 110, 103, 95, 115, 116, 97, 116, 101] }] } },
        { name: "slvt_mint", writable: true, pda: { seeds: [{ kind: "const", value: [115, 108, 118, 116, 95, 109, 105, 110, 116] }] } },
        { name: "sslvt_mint", writable: true, pda: { seeds: [{ kind: "const", value: [115, 115, 108, 118, 116, 95, 109, 105, 110, 116] }] } },
        { name: "vault_escrow", pda: { seeds: [{ kind: "const", value: [118, 97, 117, 108, 116, 95, 101, 115, 99, 114, 111, 119] }] } },
        { name: "admin", writable: true, signer: true },
        { name: "token_program", address: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" },
        { name: "system_program", address: "11111111111111111111111111111111" },
        { name: "rent", address: "SysvarRent111111111111111111111111111111111" },
      ],
      args: [{ name: "liquidity_buffer_bps", type: "u16" }],
    },
    {
      name: "deposit",
      discriminator: [242, 35, 198, 137, 82, 225, 242, 182],
      accounts: [
        { name: "vault_config", writable: true, pda: { seeds: [{ kind: "const", value: [118, 97, 117, 108, 116, 95, 99, 111, 110, 102, 105, 103] }] } },
        { name: "vault_escrow", writable: true, pda: { seeds: [{ kind: "const", value: [118, 97, 117, 108, 116, 95, 101, 115, 99, 114, 111, 119] }] } },
        { name: "slvt_mint", writable: true },
        { name: "user", writable: true, signer: true },
        { name: "user_slvt_ata", writable: true },
        { name: "token_program", address: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" },
        { name: "associated_token_program", address: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL" },
        { name: "system_program", address: "11111111111111111111111111" },
      ],
      args: [{ name: "amount_lamports", type: "u64" }],
    },
    {
      name: "redeem",
      discriminator: [184, 12, 86, 149, 70, 196, 97, 225],
      accounts: [
        { name: "vault_config", writable: true, pda: { seeds: [{ kind: "const", value: [118, 97, 117, 108, 116, 95, 99, 111, 110, 102, 105, 103] }] } },
        { name: "vault_escrow", writable: true, pda: { seeds: [{ kind: "const", value: [118, 97, 117, 108, 116, 95, 101, 115, 99, 114, 111, 119] }] } },
        { name: "slvt_mint", writable: true },
        { name: "user", writable: true, signer: true },
        { name: "user_slvt_ata", writable: true },
        { name: "token_program", address: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" },
        { name: "system_program", address: "11111111111111111111111111" },
      ],
      args: [{ name: "slvt_amount", type: "u64" }],
    },
    {
      name: "stake",
      discriminator: [206, 176, 202, 18, 200, 209, 179, 108],
      accounts: [
        { name: "vault_config", pda: { seeds: [{ kind: "const", value: [118, 97, 117, 108, 116, 95, 99, 111, 110, 102, 105, 103] }] } },
        { name: "staking_state", writable: true, pda: { seeds: [{ kind: "const", value: [115, 116, 97, 107, 105, 110, 103, 95, 115, 116, 97, 116, 101] }] } },
        { name: "slvt_mint", writable: true },
        { name: "sslvt_mint", writable: true },
        { name: "staking_slvt_ata", writable: true },
        { name: "user", writable: true, signer: true },
        { name: "user_slvt_ata", writable: true },
        { name: "user_sslvt_ata", writable: true },
        { name: "token_program", address: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" },
        { name: "associated_token_program", address: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL" },
        { name: "system_program", address: "11111111111111111111111111" },
      ],
      args: [{ name: "slvt_amount", type: "u64" }],
    },
    {
      name: "unstake",
      discriminator: [90, 95, 107, 42, 205, 124, 50, 225],
      accounts: [
        { name: "vault_config", pda: { seeds: [{ kind: "const", value: [118, 97, 117, 108, 116, 95, 99, 111, 110, 102, 105, 103] }] } },
        { name: "staking_state", writable: true, pda: { seeds: [{ kind: "const", value: [115, 116, 97, 107, 105, 110, 103, 95, 115, 116, 97, 116, 101] }] } },
        { name: "slvt_mint", writable: true },
        { name: "sslvt_mint", writable: true },
        { name: "staking_slvt_ata", writable: true },
        { name: "user", writable: true, signer: true },
        { name: "user_slvt_ata", writable: true },
        { name: "user_sslvt_ata", writable: true },
        { name: "token_program", address: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" },
      ],
      args: [{ name: "sslvt_amount", type: "u64" }],
    },
    {
      name: "update_equity",
      discriminator: [237, 12, 220, 89, 90, 210, 221, 80],
      accounts: [
        { name: "vault_config", writable: true, pda: { seeds: [{ kind: "const", value: [118, 97, 117, 108, 116, 95, 99, 111, 110, 102, 105, 103] }] } },
        { name: "vault_escrow", pda: { seeds: [{ kind: "const", value: [118, 97, 117, 108, 116, 95, 101, 115, 99, 114, 111, 119] }] } },
        { name: "slvt_mint" },
        { name: "admin", writable: true, signer: true },
      ],
      args: [{ name: "total_equity_usd", type: "u64" }, { name: "sol_price_usd", type: "u64" }],
    },
    {
      name: "update_yield",
      discriminator: [151, 190, 102, 136, 127, 77, 231, 0],
      accounts: [
        { name: "staking_state", writable: true, pda: { seeds: [{ kind: "const", value: [115, 116, 97, 107, 105, 110, 103, 95, 115, 116, 97, 116, 101] }] } },
        { name: "vault_config", pda: { seeds: [{ kind: "const", value: [118, 97, 117, 108, 116, 95, 99, 111, 110, 102, 105, 103] }] } },
        { name: "yield_receipt", writable: true, pda: { seeds: [{ kind: "const", value: [121, 105, 101, 108, 100, 95, 114, 101, 99, 101, 105, 112, 116] }, { kind: "arg", path: "receipt_index" }] } },
        { name: "admin", writable: true, signer: true },
        { name: "system_program", address: "11111111111111111111111111" },
      ],
      args: [{ name: "new_exchange_rate", type: "u128" }, { name: "jito_yield_usd", type: "u64" }, { name: "drift_funding_usd", type: "u64" }, { name: "receipt_index", type: "u32" }],
    },
    {
      name: "admin_deposit",
      discriminator: [210, 66, 65, 182, 102, 214, 176, 30],
      accounts: [
        { name: "vault_config", writable: true, pda: { seeds: [{ kind: "const", value: [118, 97, 117, 108, 116, 95, 99, 111, 110, 102, 105, 103] }] } },
        { name: "vault_escrow", writable: true, pda: { seeds: [{ kind: "const", value: [118, 97, 117, 108, 116, 95, 101, 115, 99, 114, 111, 119] }] } },
        { name: "admin", writable: true, signer: true },
        { name: "system_program", address: "11111111111111111111111111" },
      ],
      args: [{ name: "amount_lamports", type: "u64" }],
    },
    {
      name: "admin_withdraw",
      discriminator: [160, 166, 147, 222, 46, 220, 75, 224],
      accounts: [
        { name: "vault_config", writable: true, pda: { seeds: [{ kind: "const", value: [118, 97, 117, 108, 116, 95, 99, 111, 110, 102, 105, 103] }] } },
        { name: "vault_escrow", writable: true, pda: { seeds: [{ kind: "const", value: [118, 97, 117, 108, 116, 95, 101, 115, 99, 114, 111, 119] }] } },
        { name: "admin", writable: true, signer: true },
        { name: "slvt_mint", writable: true },
        { name: "system_program", address: "11111111111111111111111111" },
      ],
      args: [{ name: "amount_lamports", type: "u64" }],
    },
    {
      name: "set_admin",
      discriminator: [251, 163, 0, 52, 91, 194, 187, 92],
      accounts: [
        { name: "vault_config", writable: true, pda: { seeds: [{ kind: "const", value: [118, 97, 117, 108, 116, 95, 99, 111, 110, 102, 105, 103] }] } },
        { name: "current_admin", signer: true },
        { name: "new_admin" },
      ],
      args: [],
    },
  ],
  accounts: [
    { name: "VaultConfig", discriminator: [99, 86, 43, 216, 184, 102, 119, 77] },
    { name: "StakingState", discriminator: [152, 226, 234, 201, 202, 8, 155, 60] },
    { name: "YieldReceipt", discriminator: [236, 215, 175, 167, 118, 57, 76, 247] },
  ],
  events: [
    { name: "RedemptionEvent", discriminator: [72, 165, 70, 6, 179, 67, 82, 183] },
  ],
  errors: [
    { code: 6000, name: "ProtocolFrozen", msg: "Protocol is frozen" },
    { code: 6001, name: "OracleNotSet", msg: "Oracle price not set" },
    { code: 6002, name: "ZeroAmount", msg: "Amount cannot be zero" },
    { code: 6003, name: "MintMismatch", msg: "Mint address mismatch" },
    { code: 6004, name: "MathOverflow", msg: "Math overflow" },
    { code: 6005, name: "Unauthorized", msg: "Unauthorized" },
    { code: 6006, name: "ProtocolUnderwater", msg: "Protocol underwater - redemptions frozen" },
    { code: 6007, name: "InsufficientLiquidity", msg: "Insufficient liquidity buffer" },
    { code: 6008, name: "BufferExceeded", msg: "Cannot withdraw - liquidity buffer would be exceeded" },
    { code: 6009, name: "InsufficientStakingLiquidity", msg: "Insufficient SLVT in staking vault" },
    { code: 6010, name: "RateCannotDecrease", msg: "Exchange rate cannot decrease" },
    { code: 6011, name: "InvalidBufferBps", msg: "Invalid liquidity buffer basis points" },
  ],
  types: [
    {
      name: "VaultConfig",
      type: {
        kind: "struct",
        fields: [
          { name: "admin_pubkey", type: "pubkey" },
          { name: "slvt_mint", type: "pubkey" },
          { name: "sslvt_mint", type: "pubkey" },
          { name: "liquidity_buffer_bps", type: "u16" },
          { name: "total_equity_usd", type: "u64" },
          { name: "is_frozen", type: "bool" },
          { name: "sol_price_usd", type: "u64" },
          { name: "bump", type: "u8" },
        ],
      },
    },
    {
      name: "StakingState",
      type: {
        kind: "struct",
        fields: [
          { name: "sslvt_exchange_rate", type: "u128" },
          { name: "total_staked_slvt", type: "u64" },
          { name: "last_yield_timestamp", type: "i64" },
          { name: "bump", type: "u8" },
        ],
      },
    },
    {
      name: "YieldReceipt",
      type: {
        kind: "struct",
        fields: [
          { name: "timestamp", type: "i64" },
          { name: "jito_yield_usd", type: "u64" },
          { name: "drift_funding_usd", type: "u64" },
          { name: "total_yield_usd", type: "u64" },
          { name: "old_exchange_rate", type: "u128" },
          { name: "new_exchange_rate", type: "u128" },
          { name: "receipt_index", type: "u32" },
          { name: "bump", type: "u8" },
        ],
      },
    },
    {
      name: "RedemptionEvent",
      type: {
        kind: "struct",
        fields: [
          { name: "user", type: "pubkey" },
          { name: "slvt_requested", type: "u64" },
          { name: "slvt_burned", type: "u64" },
          { name: "sol_returned", type: "u64" },
          { name: "redeemable_ratio", type: "u8" },
        ],
      },
    },
  ],
} as const;
