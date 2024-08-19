use anchor_lang::prelude::*;
use anchor_spl::token::{transfer, Mint, Token, TokenAccount, Transfer};

declare_id!("EEJ9MWyxnVHvq7WL4GQ8NBrqpX3cUUP2tb77cmyQa5ui");

#[program]
pub mod anchor_vault {
    use super::*;

    pub fn initialize_vault(ctx: Context<InitializeVault>) -> Result<()> {
        let vault_bump = ctx.bumps.vault;
        let vault_authority_bump = ctx.bumps.vault_authority;
        let vault_token_account_bump = ctx.bumps.vault_token_account;
        let bumps = VaultBumps {
            vault: vault_bump,
            vault_authority: vault_authority_bump,
            vault_token_account: vault_token_account_bump,
        };
        ctx.accounts.vault.set_inner(Vault {
            deposited_amount: 0,
            withdrawn_amount: 0,
            initialized: true,
            owner: ctx.accounts.owner.key(),
            mint: ctx.accounts.mint.key(),
            bumps,
        });
        Ok(())
    }

    pub fn deposit(ctx: Context<TransfersAccounts>, deposit_amount: u64) -> Result<()> {
        if !ctx.accounts.user_transfers.initialized {
            ctx.accounts.user_transfers.set_inner(UserTransfers {
                deposited_amount: 0,
                withdrawn_amount: 0,
                initialized: true,
                owner: ctx.accounts.user.key(),
                vault: ctx.accounts.vault.key(),
                bump: ctx.bumps.user_transfers,
            })
        }
        // Transfer token from the user to the vault token account
        let context = ctx.accounts.token_program_context(Transfer {
            from: ctx.accounts.user_token_account.to_account_info(),
            to: ctx.accounts.vault_token_account.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        });
        transfer(context, deposit_amount)?;

        let updated_vault_deposit_amount = ctx
            .accounts
            .vault
            .deposited_amount
            .checked_add(deposit_amount)
            .unwrap();
        let updated_user_deposit_amount = ctx
            .accounts
            .user_transfers
            .deposited_amount
            .checked_add(deposit_amount)
            .unwrap();
        ctx.accounts.vault.deposited_amount = updated_vault_deposit_amount;
        ctx.accounts.user_transfers.deposited_amount = updated_user_deposit_amount;
        Ok(())
    }

    pub fn withdraw(ctx: Context<TransfersAccounts>, withdraw_amount: u64) -> Result<()> {
        if !ctx.accounts.user_transfers.initialized {
            return Err(ProgramError::UninitializedAccount.into());
        }
        let available_amount = ctx
            .accounts
            .user_transfers
            .deposited_amount
            .checked_sub(ctx.accounts.user_transfers.withdrawn_amount)
            .unwrap();
        if withdraw_amount > available_amount {
            return err!(ErrorCode::InvalidWithdrawAmount);
        }
        // Transfer token from the vault token account to the user
        let release_to_owner = Transfer {
            from: ctx.accounts.vault_token_account.to_account_info(),
            to: ctx.accounts.user_token_account.to_account_info(),
            authority: ctx.accounts.vault_authority.to_account_info(),
        };
        transfer(
            ctx.accounts
                .token_program_context(release_to_owner)
                .with_signer(&[&[
                    b"authority",
                    ctx.accounts.vault.key().as_ref(),
                    &[ctx.accounts.vault.bumps.vault_authority],
                ]]),
            withdraw_amount,
        )?;

        let updated_vault_withdraw_amount = ctx
            .accounts
            .vault
            .withdrawn_amount
            .checked_add(withdraw_amount)
            .unwrap();
        let updated_user_withdraw_amount = ctx
            .accounts
            .user_transfers
            .withdrawn_amount
            .checked_add(withdraw_amount)
            .unwrap();
        ctx.accounts.vault.withdrawn_amount = updated_vault_withdraw_amount;
        ctx.accounts.user_transfers.withdrawn_amount = updated_user_withdraw_amount;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    // external accounts
    #[account(mut)]
    owner: Signer<'info>,
    #[account(constraint = mint.is_initialized)]
    mint: Account<'info, Mint>,
    // PDAs
    #[account(
        init,
        payer = owner,
        space = Vault::LEN,
        seeds = [b"vault".as_ref(), owner.key().as_ref(), mint.key().as_ref()], bump
    )]
    vault: Account<'info, Vault>,
    #[account(
        seeds = [b"authority".as_ref(), vault.key().as_ref()], bump
    )]
    vault_authority: SystemAccount<'info>,
    #[account(
        init,
        payer = owner,
        token::mint=mint,
        token::authority=vault_authority,
        seeds = [b"tokens".as_ref(), vault.key().as_ref()], bump
    )]
    vault_token_account: Account<'info, TokenAccount>,
    // Programs
    token_program: Program<'info, Token>,
    system_program: Program<'info, System>,
    rent: Sysvar<'info, Rent>,
}

impl<'info> InitializeVault<'info> {
    pub fn token_program_context<T: ToAccountMetas + ToAccountInfos<'info>>(
        &self,
        data: T,
    ) -> CpiContext<'_, '_, '_, 'info, T> {
        CpiContext::new(self.token_program.to_account_info(), data)
    }
}

#[derive(AnchorDeserialize, AnchorSerialize, Debug, Clone)]
pub struct VaultBumps {
    pub vault: u8,
    pub vault_authority: u8,
    pub vault_token_account: u8,
}

#[account]
#[derive(Debug)]
pub struct Vault {
    pub deposited_amount: u64,
    pub withdrawn_amount: u64,
    pub initialized: bool,
    pub owner: Pubkey,
    pub mint: Pubkey,
    pub bumps: VaultBumps,
}

impl Vault {
    pub const LEN: usize = {
        let discriminator = 8;
        let amounts = 2 * 8;
        let initialized = 1;
        let pubkeys = 2 * 32;
        let vault_bumps = 3;
        discriminator + amounts + initialized + pubkeys + vault_bumps
    };
}

#[derive(Accounts)]
pub struct TransfersAccounts<'info> {
    // External accounts
    #[account(mut,
        constraint = user.key() != vault.owner.key(),
    )]
    user: Signer<'info>,
    #[account(mut, token::mint=vault.mint, token::authority=user)]
    user_token_account: Account<'info, TokenAccount>,
    #[account(constraint = mint.is_initialized)]
    mint: Account<'info, Mint>,
    // PDAs
    #[account(
        mut,
        seeds = [b"vault".as_ref(), vault.owner.key().as_ref(), mint.key().as_ref()],
        bump = vault.bumps.vault,
        constraint = vault.initialized,
    )]
    vault: Account<'info, Vault>,

    #[account(
        init_if_needed,
        payer = user,
        space = UserTransfers::LEN,
        seeds = [b"user_transfers".as_ref(), vault.key().as_ref(), user.key().as_ref()], bump,
    )]
    user_transfers: Account<'info, UserTransfers>,
    #[account(
        seeds = [b"authority".as_ref(), vault.key().as_ref()],
        bump = vault.bumps.vault_authority
    )]
    vault_authority: SystemAccount<'info>,
    #[account(
        mut,
        token::mint=vault.mint,
        token::authority=vault_authority,
        seeds = [b"tokens".as_ref(), vault.key().as_ref()],
        bump = vault.bumps.vault_token_account
    )]
    vault_token_account: Account<'info, TokenAccount>,

    // Programs section
    token_program: Program<'info, Token>,
    system_program: Program<'info, System>,
    rent: Sysvar<'info, Rent>,
}

impl<'info> TransfersAccounts<'info> {
    pub fn token_program_context<T: ToAccountMetas + ToAccountInfos<'info>>(
        &self,
        data: T,
    ) -> CpiContext<'_, '_, '_, 'info, T> {
        CpiContext::new(self.token_program.to_account_info(), data)
    }
}

#[account]
#[derive(Debug)]
pub struct UserTransfers {
    pub deposited_amount: u64,
    pub withdrawn_amount: u64,
    pub initialized: bool,
    pub owner: Pubkey,
    pub vault: Pubkey,
    pub bump: u8,
}

impl UserTransfers {
    pub const LEN: usize = {
        let discriminator = 8;
        let amounts = 2 * 8;
        let initialized = 1;
        let pubkeys = 2 * 32;
        let bump = 1;
        discriminator + amounts + initialized + pubkeys + bump
    };
}
#[error_code]
pub enum ErrorCode {
    #[msg("Withdraw amount must be an amount available in the vault")]
    InvalidWithdrawAmount,
}
