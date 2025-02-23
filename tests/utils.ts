import * as anchor from "@coral-xyz/anchor";
import {
  PublicKey,
  Keypair,
  Connection,
  LAMPORTS_PER_SOL,
  Finality,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  MintLayout,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  createInitializeMintInstruction,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

export interface Params {
  cliffSeconds: anchor.BN;
  durationSeconds: anchor.BN;
  secondsPerSlice: anchor.BN;
  startUnix: anchor.BN;
  grantTokenAmount: anchor.BN;
}

export interface ParsedTokenTransfer {
  amount: string;
  authority: string;
  destination: string;
  source: string;
}

export interface ParsedSolTransfer {
  destination: string;
  lamports: number;
  source: string;
}

export interface PDAAccounts {
  vault: PublicKey;
  vaultAuthority: PublicKey;
  vaultTokenAccount: PublicKey;
  userTransfers: PublicKey;
}

export const COMMITMENT: { commitment: Finality } = { commitment: "confirmed" };

export const createTokenAccount = async (
  provider: anchor.AnchorProvider,
  user: anchor.web3.PublicKey,
  mint: anchor.web3.PublicKey,
  fundingAmount?: number
): Promise<anchor.web3.PublicKey> => {
  const userAssociatedTokenAccount = await getAssociatedTokenAddress(
    mint,
    user
  );

  // Fund user with some SOL
  let txFund = new anchor.web3.Transaction();
  if (user.toBase58() !== provider.wallet.publicKey.toBase58()) {
    txFund.add(
      anchor.web3.SystemProgram.transfer({
        fromPubkey: provider.wallet.publicKey,
        toPubkey: user,
        lamports: 5 * anchor.web3.LAMPORTS_PER_SOL,
      })
    );
  }
  txFund.add(
    createAssociatedTokenAccountInstruction(
      provider.wallet.publicKey,
      userAssociatedTokenAccount,
      user,
      mint
    )
  );
  if (fundingAmount !== undefined) {
    txFund.add(
      createMintToInstruction(
        mint,
        userAssociatedTokenAccount,
        provider.wallet.publicKey,
        fundingAmount
      )
    );
  }

  const txFundTokenSig = await provider.sendAndConfirm(txFund, [], COMMITMENT);
  console.log(
    `[${userAssociatedTokenAccount.toBase58()}] New associated account for mint ${mint.toBase58()}: ${txFundTokenSig}`
  );
  return userAssociatedTokenAccount;
};

export const createMint = async (
  provider: anchor.AnchorProvider
): Promise<anchor.web3.PublicKey> => {
  const wallet = provider.wallet;
  const tokenMint = new anchor.web3.Keypair();
  const lamportsForMint =
    await provider.connection.getMinimumBalanceForRentExemption(
      MintLayout.span
    );
  let tx = new anchor.web3.Transaction();

  // Allocate mint
  tx.add(
    anchor.web3.SystemProgram.createAccount({
      programId: TOKEN_PROGRAM_ID,
      space: MintLayout.span,
      fromPubkey: wallet.publicKey,
      newAccountPubkey: tokenMint.publicKey,
      lamports: lamportsForMint,
    })
  );
  // Allocate wallet account
  tx.add(
    createInitializeMintInstruction(
      tokenMint.publicKey,
      9,
      wallet.publicKey,
      wallet.publicKey
    )
  );
  const signature = await provider.sendAndConfirm(tx, [tokenMint], COMMITMENT);

  console.log(
    `[${tokenMint.publicKey}] Created new mint account at ${signature}`
  );
  return tokenMint.publicKey;
};

export const getPDAs = async (params: {
  programId: PublicKey;
  vaultOwner: PublicKey;
  vaultUser: PublicKey;
  mint: PublicKey;
}): Promise<PDAAccounts> => {
  const [vault] = await PublicKey.findProgramAddress(
    [
      Buffer.from("vault"),
      params.vaultOwner.toBuffer(),
      params.mint.toBuffer(),
    ],
    params.programId
  );
  const [vaultAuthority] = await PublicKey.findProgramAddress(
    [Buffer.from("authority"), vault.toBuffer()],
    params.programId
  );
  const [vaultTokenAccount] = await PublicKey.findProgramAddress(
    [Buffer.from("tokens"), vault.toBuffer()],
    params.programId
  );

  const [userTransfers] = await PublicKey.findProgramAddress(
    [
      Buffer.from("user_transfers"),
      vault.toBuffer(),
      params.vaultUser.toBuffer(),
    ],
    params.programId
  );

  return {
    vault,
    vaultAuthority,
    vaultTokenAccount,
    userTransfers,
  };
};
