/**
 * Relays execution of a safe transaction via gelato network
 * 
 * Success task: https://relay.gelato.digital/tasks/status/0xfb3aacc673b5dcf1e4a01ba15617b2956e2cbdebc882b080664ae100ddb92cbc
 * Success tx: https://polygonscan.com/tx/0x97590e4e35e6363b3f355f65e2ca606573ad4ce5eac8ddb8ce4d4320982baea4
 */

import { GelatoRelay, CallWithSyncFeeRequest } from "@gelatonetwork/relay-sdk";
import Safe from "@safe-global/safe-core-sdk";
import EthersAdapter from "@safe-global/safe-ethers-lib";
import SafeServiceClient from "@safe-global/safe-service-client";
import * as dotenv from 'dotenv';
import { BytesLike, ethers } from "ethers";
import GNOSIS_SAFE from "./gnosis_safe.json";

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

    // get pending txs
    const pendingTxs = await service.getPendingTransactions(String(process.env.SAFE_ADDRESS));
    if (pendingTxs.results.length > 0) {
        // get latest pending tx
        const latestPendingTx = pendingTxs.results[pendingTxs.results.length - 1];

        // if latest pending tx is signed by all parties
        if (latestPendingTx.confirmations?.length === latestPendingTx.confirmationsRequired) {
            // prepare tx data
            const safeContract = new ethers.Contract(String(process.env.SAFE_ADDRESS), GNOSIS_SAFE.abi);
            const execTransactionData = await safeContract.populateTransaction.execTransaction(
                latestPendingTx.to, // destination address of safe tx, DAI address
                latestPendingTx.value, // ether value
                latestPendingTx.data, // data payload of safe tx
                latestPendingTx.operation, // operation, call or delegatecall
                latestPendingTx.safeTxGas, // safe tx gas
                latestPendingTx.baseGas, // base gas
                latestPendingTx.gasPrice, // gas price
                latestPendingTx.gasToken, // gas token used for payment (0x0 for ETH)
                latestPendingTx.refundReceiver, // refund receiver
                await getCombinedSignature(String(process.env.SAFE_ADDRESS), latestPendingTx.confirmations), // signatures
            );

            // relay tx
            const relay = new GelatoRelay();
            const request: CallWithSyncFeeRequest = {
                chainId: String(process.env.CHAIN_ID),
                target: String(execTransactionData.to),
                data: execTransactionData.data as BytesLike,
                feeToken: latestPendingTx.gasToken,
            };
            const response = await relay.callWithSyncFee(request);
            console.log(`Check execution status here: https://relay.gelato.digital/tasks/status/${response.taskId}`);
        } else {
            console.log("Not enough signatures for latest pending transaction");
        }
    } else {
        console.log("There are no pending transactions");
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
