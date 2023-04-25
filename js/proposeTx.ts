/**
 * This script proposes a new gnosis safe transaction.
 * Proposing a transaction simply means API request to gnosis safe tx service.
 * Example of the proposed transaction: https://app.safe.global/gor:0x839F2406464B98128c67c00dB9408F07bB9D4629/transactions/tx?id=multisig_0x839F2406464B98128c67c00dB9408F07bB9D4629_0x76eda2e634a443df5274b56d67fc2e888c056ff766dffc50c00c3c16c21d68e2
 */

import Safe from "@safe-global/safe-core-sdk";
import { OperationType, SafeTransactionDataPartial } from "@safe-global/safe-core-sdk-types";
import EthersAdapter from "@safe-global/safe-ethers-lib";
import SafeServiceClient from "@safe-global/safe-service-client";
import * as dotenv from 'dotenv';
import { ethers } from "ethers";
import DAI_ABI from "./DAI_abi.json";

const GWEI_AMOUNT_1 = 1000000000;

dotenv.config();

// variables depending on a bounty hunter wallet and reward
const bountyHunterAddress = '0xB52e2e8ED4C4B57ddD41FA5b62e721b90e77A36b';
const bountyHunterRewardEth = '0.0001';

async function main() {
  const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL);
  const signer = new ethers.Wallet(String(process.env.BOT_PRIVATE_KEY), provider);

  // create EthAdapter instance
  const ethAdapter = new EthersAdapter({
    ethers,
    signerOrProvider: signer,
  });

  // create Safe instance
  const safe = await Safe.create({
    ethAdapter,
    safeAddress: String(process.env.SAFE_ADDRESS),
  });

  // Create Safe Service Client instance
  const service = new SafeServiceClient({
    txServiceUrl: String(process.env.SAFE_TX_SERVICE_URL),
    ethAdapter,
  });

  // create DAI contract instance
  const daiContract = new ethers.Contract(String(process.env.DAI_ADDRESS), DAI_ABI);
  const transferData = await daiContract.populateTransaction.transfer(
    bountyHunterAddress,
    ethers.utils.parseEther(bountyHunterRewardEth).toString()
  );

  // get next safe tx nonce (safe nonces are different from EOA nonces)
  // next nonce is the next nonce after the last queued (not yet executed) transaction
  const nextNonce = await service.getNextNonce(String(process.env.SAFE_ADDRESS));

  // create transaction
  const safeTransactionData: SafeTransactionDataPartial = {
    to: String(process.env.DAI_ADDRESS),
    value: "0", // in wei
    data: String(transferData.data),
    operation: OperationType.Call,
    safeTxGas: 50_000,
    baseGas: GWEI_AMOUNT_1, // (constant, don't change)
    gasPrice: 50000000, // 0.05 DAI
    gasToken: process.env.DAI_ADDRESS,
    refundReceiver: process.env.GELATO_REFUND_ADDRESS,
    nonce: nextNonce,
  };
  const safeTransaction = await safe.createTransaction({ safeTransactionData });

  // Propose transaction to the service
  const senderAddress = await signer.getAddress();
  const safeTxHash = await safe.getTransactionHash(safeTransaction);
  const signature = await safe.signTransactionHash(safeTxHash);

  await service.proposeTransaction({
    safeAddress: String(process.env.SAFE_ADDRESS),
    safeTransactionData: safeTransaction.data,
    safeTxHash,
    senderAddress,
    senderSignature: signature.data,
  });

  console.log(
    `Transaction URL: https://app.safe.global/${process.env.CHAIN_ID && +process.env.CHAIN_ID === 1 ? "eth" : "matic"}:${process.env.SAFE_ADDRESS}/transactions/tx?id=multisig_${
      process.env.SAFE_ADDRESS
    }_${safeTxHash}`
  );
}

main();
