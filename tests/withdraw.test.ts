import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { AnchorVault } from "../target/types/anchor_vault";
import web3, { Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  COMMITMENT,
  createMint,
  createTokenAccount,
  getPDAs,
  ParsedTokenTransfer,
} from "./utils";
import * as spl from "@solana/spl-token";
import { expect } from "chai";

describe("anchor-vault", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const { connection } = provider;
  const program = anchor.workspace.AnchorVault as Program<AnchorVault>;

  it("Withdraw", async () => {
    try {
      const vaultOwner = provider.wallet.publicKey;
      const vaultUser = new Keypair();
      const mint = await createMint(provider);
      const vaultUserTokenAccount = await createTokenAccount(
        provider,
        vaultUser.publicKey,
        mint,
        100_000 * LAMPORTS_PER_SOL
      );
      // Airdrop SOL to the buyer for the purchase
      await connection.requestAirdrop(
        vaultUser.publicKey,
        10 * LAMPORTS_PER_SOL
      );
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const { vault, vaultTokenAccount, vaultAuthority, userTransfers } =
        await getPDAs({
          vaultOwner,
          vaultUser: vaultUser.publicKey,
          programId: program.programId,
          mint,
        });
      const initializeTransaction = await program.methods
        .initializeVault()
        .accounts({
          owner: vaultOwner,
          mint,
          vault,
          vaultAuthority,
          vaultTokenAccount,
        })
        .rpc(COMMITMENT);
      console.log(`[Initialize] ${initializeTransaction}`);

      console.log({
        user: vaultUser.publicKey,
        userTokenAccount: vaultUserTokenAccount,
        mint,
        vault,
        userTransfers,
        vaultAuthority,
        vaultTokenAccount,
      });
      const depositTransaction = await program.methods
        .deposit(new anchor.BN(10))
        .accounts({
          user: vaultUser.publicKey,
          userTokenAccount: vaultUserTokenAccount,
          mint,
          vault,
          userTransfers,
          vaultAuthority,
          vaultTokenAccount,
        })
        .signers([vaultUser])
        .rpc(COMMITMENT);

      const withdrawTransaction = await program.methods
        .withdraw(new anchor.BN(5))
        .accounts({
          user: vaultUser.publicKey,
          userTokenAccount: vaultUserTokenAccount,
          mint,
          vault,
          userTransfers,
          vaultAuthority,
          vaultTokenAccount,
        })
        .signers([vaultUser])
        .rpc(COMMITMENT);
      console.log(`[withdraw] ${withdrawTransaction}`);

      const tx = await connection.getParsedTransaction(
        withdrawTransaction,
        COMMITMENT
      );
      // Ensure that inner transfer succeded.
      const transferIx: any = tx.meta.innerInstructions[0].instructions.find(
        (ix) =>
          (ix as any).parsed.type === "transfer" &&
          ix.programId.toBase58() == spl.TOKEN_PROGRAM_ID.toBase58()
      );

      const parsedInfo: ParsedTokenTransfer = transferIx.parsed.info;

      expect(parsedInfo).eql({
        amount: "5",
        authority: vaultAuthority.toBase58(),
        destination: vaultUserTokenAccount.toBase58(),
        source: vaultTokenAccount.toBase58(),
      });
      // Check data
      const vaultData = await program.account.vault.fetch(vault);
      console.log(vaultData);
      expect(vaultData.owner.toBase58()).to.eq(vaultOwner.toBase58());
      expect(vaultData.initialized).to.eq(true);
      expect(vaultData.depositedAmount.toNumber()).to.eq(10);
      expect(vaultData.withdrawnAmount.toNumber()).to.eq(5);
      expect(vaultData.mint.toBase58()).to.eql(mint.toBase58());
      expect(vaultData.bumps.vault).to.not.eql(0);
      expect(vaultData.bumps.vaultAuthority).to.not.eql(0);
      expect(vaultData.bumps.vaultTokenAccount).to.not.eql(0);

      // check user transfers data
      const userTransfersData = await program.account.userTransfers.fetch(
        userTransfers
      );
      console.log(userTransfersData);
      expect(userTransfersData.owner.toBase58()).to.eq(
        vaultUser.publicKey.toBase58()
      );
      expect(userTransfersData.initialized).to.eq(true);
      expect(userTransfersData.depositedAmount.toNumber()).to.eq(10);
      expect(userTransfersData.withdrawnAmount.toNumber()).to.eq(5);
      expect(userTransfersData.vault.toBase58()).to.eql(vault.toBase58());
      expect(userTransfersData.bump).to.not.eql(0);
    } catch (error) {
      console.error(error);
      throw error;
    }
  });
});
