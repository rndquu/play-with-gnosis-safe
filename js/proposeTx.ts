/**
 * This script proposes a new gnosis safe transaction.
 * Proposing a transaction simply means API request to gnosis safe tx service.
 * Example of the proposed transaction: https://app.safe.global/gor:0x839F2406464B98128c67c00dB9408F07bB9D4629/transactions/tx?id=multisig_0x839F2406464B98128c67c00dB9408F07bB9D4629_0x76eda2e634a443df5274b56d67fc2e888c056ff766dffc50c00c3c16c21d68e2
 */

import { GelatoRelay } from "@gelatonetwork/relay-sdk";
import Safe from "@safe-global/safe-core-sdk";
import { OperationType, SafeTransactionDataPartial } from "@safe-global/safe-core-sdk-types";
import EthersAdapter from "@safe-global/safe-ethers-lib";
import SafeServiceClient from "@safe-global/safe-service-client";
import * as dotenv from 'dotenv';
import { BigNumber, ethers } from "ethers";
import DAI_ABI from "./DAI_abi.json";

const GWEI_AMOUNT_1 = 1000000000;
// DAI transfer gas estimation: 87517
const DAI_TRANSFER_TX_GAS_LIMIT = 88_000;
// Safe tx execution for DAI transfer: 166712
const SAFE_TX_EXECUTION_GAS_LIMIT = 170_000;

dotenv.config();

// variables depending on a bounty hunter wallet and reward
const bountyHunterAddress = '0xB52e2e8ED4C4B57ddD41FA5b62e721b90e77A36b';
const bountyHunterRewardEth = '0.2';

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

  // get gelato fee in gwei
  const relay = new GelatoRelay();
  const estimatedFeeWei = await relay.getEstimatedFee(
    +String(process.env.CHAIN_ID), 
    String(process.env.DAI_ADDRESS), 
    BigNumber.from(SAFE_TX_EXECUTION_GAS_LIMIT),
    true,
  );
  // add extra rate to fee in case gas fees are volatile
  const estimatedFeeWeiWithExtra = Math.round(+estimatedFeeWei.toString() * ((100 + +String(process.env.SAFE_TX_GAS_BONUS_RATE)) / 100));

  // get bounty hunter reward in wei minus fees
  const bountyHunterRewardWeiAfterFees = ethers.utils.parseEther(bountyHunterRewardEth).sub(BigNumber.from(String(estimatedFeeWeiWithExtra))).toString(); 

  // create DAI contract instance
  const daiContract = new ethers.Contract(String(process.env.DAI_ADDRESS), DAI_ABI, signer);
  const transferData = await daiContract.populateTransaction.transfer(
    bountyHunterAddress,
    bountyHunterRewardWeiAfterFees,
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
    safeTxGas: DAI_TRANSFER_TX_GAS_LIMIT,
    baseGas: GWEI_AMOUNT_1, // (constant, don't change)
    gasPrice: Math.floor(+ethers.utils.formatUnits(String(estimatedFeeWeiWithExtra), 'gwei')), // in gwei
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
