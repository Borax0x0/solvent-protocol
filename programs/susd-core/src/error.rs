use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Protocol is frozen")]
    ProtocolFrozen,
    #[msg("Oracle price not set")]
    OracleNotSet,
    #[msg("Amount cannot be zero")]
    ZeroAmount,
    #[msg("Mint address mismatch")]
    MintMismatch,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Protocol underwater - redemptions frozen")]
    ProtocolUnderwater,
    #[msg("Insufficient liquidity buffer")]
    InsufficientLiquidity,
    #[msg("Cannot withdraw - liquidity buffer would be exceeded")]
    BufferExceeded,
    #[msg("Insufficient SUSD in staking vault")]
    InsufficientStakingLiquidity,
    #[msg("Exchange rate cannot decrease")]
    RateCannotDecrease,
    #[msg("Invalid liquidity buffer basis points")]
    InvalidBufferBps,
}
