use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, MintTo, Transfer};
use anchor_spl::associated_token::AssociatedToken;
use crate::state::{VaultConfig, StakingState};
use crate::error::ErrorCode;

#[derive(Accounts)]
pub struct Stake<'info> {
    #[account(
        seeds = [b"vault_config"],
        bump = vault_config.bump,
    )]
    pub vault_config: Account<'info, VaultConfig>,

    #[account(
        mut,
        seeds = [b"staking_state"],
        bump = staking_state.bump,
    )]
    pub staking_state: Account<'info, StakingState>,

    #[account(
        mut,
        constraint = slvt_mint.key() == vault_config.slvt_mint @ ErrorCode::MintMismatch,
    )]
    pub slvt_mint: Account<'info, Mint>,

    #[account(
        mut,
        constraint = sslvt_mint.key() == vault_config.sslvt_mint @ ErrorCode::MintMismatch,
    )]
    pub sslvt_mint: Account<'info, Mint>,

    /// CHECK: PDA ATA that holds staked SLVT
    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = slvt_mint,
        associated_token::authority = staking_state,
    )]
    pub staking_slvt_ata: Account<'info, anchor_spl::token::TokenAccount>,

    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        associated_token::mint = slvt_mint,
        associated_token::authority = user,
    )]
    pub user_slvt_ata: Account<'info, anchor_spl::token::TokenAccount>,

    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = sslvt_mint,
        associated_token::authority = user,
    )]
    pub user_sslvt_ata: Account<'info, anchor_spl::token::TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Stake>, slvt_amount: u64) -> Result<()> {
    require!(!ctx.accounts.vault_config.is_frozen, ErrorCode::ProtocolFrozen);
    require!(slvt_amount > 0, ErrorCode::ZeroAmount);

    anchor_spl::token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            Transfer {
                from: ctx.accounts.user_slvt_ata.to_account_info(),
                to: ctx.accounts.staking_slvt_ata.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        slvt_amount,
    )?;

    let sslvt_amount = (slvt_amount as u128)
        .checked_mul(1_000_000_000_000)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(ctx.accounts.staking_state.sslvt_exchange_rate)
        .ok_or(ErrorCode::MathOverflow)? as u64;

    let bump = ctx.accounts.staking_state.bump;
    anchor_spl::token::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            MintTo {
                mint: ctx.accounts.sslvt_mint.to_account_info(),
                to: ctx.accounts.user_sslvt_ata.to_account_info(),
                authority: ctx.accounts.staking_state.to_account_info(),
            },
            &[&[b"staking_state", &[bump]]],
        ),
        sslvt_amount,
    )?;

    ctx.accounts.staking_state.total_staked_slvt = ctx
        .accounts
        .staking_state
        .total_staked_slvt
        .checked_add(slvt_amount)
        .ok_or(ErrorCode::MathOverflow)?;

    Ok(())
}
