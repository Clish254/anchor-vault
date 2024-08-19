# Anchor Vault Program

This Solana program, built using the Anchor framework, implements an asset manager's vault. It allows customers to deposit SPL tokens into a secure vault, where the deposited funds are managed but cannot be withdrawn by the vault manager. The program enforces strict controls to ensure that only the original depositor can withdraw their funds.

## Features

- **Vault Initialization:** Set up a vault tied to a specific token mint and vault manager.
- **Token Deposit:** Customers can securely deposit SPL tokens into the vault.
- **Token Withdrawal:** Only the depositor can withdraw their tokens from the vault, with safeguards to prevent the vault manager from withdrawing funds.

## Instructions

### 1. Initialize Vault

Sets up a new vault with the specified owner (vault manager) and token mint. The vault is configured so that only the original depositor can withdraw their tokens.

```rust
pub fn initialize_vault(ctx: Context<InitializeVault>) -> Result<()>;
```

### 2. Deposit Tokens

Allows customers to deposit a specified amount of SPL tokens into the vault. The deposit is tracked per user.

```rust
pub fn deposit(ctx: Context<TransfersAccounts>, deposit_amount: u64) -> Result<()>;
```

### 3. Withdraw Tokens

Allows customers to withdraw a specified amount of tokens they previously deposited. The vault manager is prevented from accessing or withdrawing these funds.

```rust
pub fn withdraw(ctx: Context<TransfersAccounts>, withdraw_amount: u64) -> Result<()>;
```

## Accounts

### Vault

- **Owner:** The vault manager who can manage but not withdraw funds.
- **Deposited Amount:** Tracks the total tokens deposited in the vault.
- **Withdrawn Amount:** Tracks the total tokens withdrawn from the vault.
- **Mint:** The token type (mint) the vault is associated with.

### UserTransfers

- **Owner:** The customer who deposited tokens.
- **Deposited Amount:** The amount of tokens the customer has deposited.
- **Withdrawn Amount:** The amount of tokens the customer has withdrawn.
- **Vault:** The vault in which the tokens are deposited.

## Error Codes

- **InvalidWithdrawAmount:** Thrown when the user tries to withdraw more than their available balance.

## Security

- **Vault Manager Restrictions:** The vault manager cannot withdraw any tokens from the vault, ensuring customer funds are secure.
- **Deposit/Withdrawal Tracking:** The program tracks each user's deposits and withdrawals to prevent unauthorized access to funds.

