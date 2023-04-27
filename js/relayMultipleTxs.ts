/**
 * Relays multiple txs via Gnosis Safe MultiSend contract
 */

import { GelatoRelay, CallWithSyncFeeRequest } from "@gelatonetwork/relay-sdk";
import Safe from "@safe-global/safe-core-sdk";
import EthersAdapter from "@safe-global/safe-ethers-lib";
import SafeServiceClient from "@safe-global/safe-service-client";
import * as dotenv from 'dotenv';
import { BytesLike, ethers } from "ethers";
import * as ethersMultisend from 'ethers-multisend';
import { MetaTransaction } from 'ethers-multisend';
import GNOSIS_SAFE from "./gnosis_safe.json";
import MULTISEND_ABI from "./multisend_abi.json";

dotenv.config();

// create EthAdapter instance
const ethAdapter = new EthersAdapter({
    ethers,
    signerOrProvider: new ethers.providers.JsonRpcProvider(process.env.RPC_URL),
});

async function main() {
    // Create Safe Service Client instance
    const service = new SafeServiceClient({
        txServiceUrl: String(process.env.SAFE_TX_SERVICE_URL),
        ethAdapter,
    });

    // create safe instance
    const safeContract = new ethers.Contract(String(process.env.SAFE_ADDRESS), GNOSIS_SAFE.abi);

    // get pending txs
    const pendingTxs = await service.getPendingTransactions(String(process.env.SAFE_ADDRESS));
    // if pending txs exist
    if (pendingTxs.results.length > 0) {
        // default meta transactions that should be packed
        let metaTxs: MetaTransaction[] = [];
        // from 1st to latest tx (we get txs in reversed order)
        for (let i = pendingTxs.results.length - 1; i >= 0; i--) {
            // if pending tx is signed by all parties
            if (pendingTxs.results[i].confirmations?.length === pendingTxs.results[i].confirmationsRequired) {
                // prepare tx data
                const execTransactionData = await safeContract.populateTransaction.execTransaction(
                    pendingTxs.results[i].to, // destination address of safe tx, DAI address
                    pendingTxs.results[i].value, // ether value
                    pendingTxs.results[i].data, // data payload of safe tx
                    pendingTxs.results[i].operation, // operation, call or delegatecall
                    pendingTxs.results[i].safeTxGas, // safe tx gas
                    pendingTxs.results[i].baseGas, // base gas
                    pendingTxs.results[i].gasPrice, // gas price
                    pendingTxs.results[i].gasToken, // gas token used for payment (0x0 for ETH)
                    pendingTxs.results[i].refundReceiver, // refund receiver
                    await getCombinedSignature(String(process.env.SAFE_ADDRESS), pendingTxs.results[i].confirmations || [{owner: '', signature: ''}]), // signatures
                );
                // push safe tx to meta txs array            
                metaTxs.push({
                    to: String(execTransactionData.to),
                    value: '0',
                    data: String(execTransactionData.data),
                });
            } else {
                // break loop because safe transactions can only be executed in order
                break;
            }
        }

        // encode array of meta txs for use in MultiSend
        const metaTxsEncoded = ethersMultisend.encodeMulti(metaTxs);

        // init multisend contract
        const multiSendContract = new ethers.Contract(String(process.env.MULTISEND_ADDRESS), MULTISEND_ABI);
        
        // prepare multisend tx data
        const multiSendTxData = await multiSendContract.populateTransaction.multiSend(metaTxsEncoded.data);

        // relay tx
        const relay = new GelatoRelay();
        const request: CallWithSyncFeeRequest = {
            chainId: String(process.env.CHAIN_ID),
            target: String(multiSendTxData.to),
            data: multiSendTxData.data as BytesLike,
            feeToken: String(process.env.DAI_ADDRESS),
        };
        const response = await relay.callWithSyncFee(request);
        console.log(`Check execution status here: https://relay.gelato.digital/tasks/status/${response.taskId}`);
    }
}

main();

//===================
// Helper functions
//===================

/**
 * Returns combined signature for gnosis safe transaction
 * NOTICE: signatures should be placed from last safe owner to the 1st one
 * @param safeAddress safe address
 * @param confirmations confirmations (owner + signature)
 * @return combined signature
 */
async function getCombinedSignature(
    safeAddress: string, 
    confirmations: {
        owner: string,
        signature: string,
    }[],
) {
    let combinedSignature = '0x';
    // get safe instance
    const safe = await Safe.create({
        ethAdapter,
        safeAddress: safeAddress,
    });
    // get safe owners
    const owners = await safe.getOwners();
    // add signature for each owner
    for (let i = owners.length - 1; i >= 0; i--) {
        // find owner's confirmation
        const confirmationsFiltered = confirmations.filter(confirmation => confirmation.owner === owners[i]);
        if (confirmationsFiltered.length === 0) throw Error(`Confirmation for owner ${owners[i]} not found`);
        // add owner's signature
        combinedSignature += confirmationsFiltered[0].signature.replace('0x', '');
    }

    return combinedSignature;
}
