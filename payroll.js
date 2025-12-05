const fs = require("fs");
const Blockfrost = require("@blockfrost/blockfrost-js");
const blake = require("blake2b");
const CardanoWasm = require("@emurgo/cardano-serialization-lib-nodejs");
const Cardano = CardanoWasm.default || CardanoWasm;
require("dotenv").config();

const senderWalletData = JSON.parse(fs.readFileSync("./senderWallet.json"));
const senderAddress = senderWalletData.address;
const paymentKey = Cardano.PrivateKey.from_normal_bytes(
  Buffer.from(senderWalletData.privateKeyHex, "hex")
);

const API = new Blockfrost.BlockFrostAPI({
  projectId: process.env.BLOCKFROST_PROJECT_ID,
  network: "preprod",
});

async function runPayroll(payrollList) {
  try {
    console.log("🚀 Running payroll...");

    const utxos = await API.addressesUtxos(senderAddress);
    if (!utxos.length) {
      throw new Error("No UTXOs found");
    }

    const protocolParams = await API.epochsLatestParameters();
    const txConfig = Cardano.TransactionBuilderConfigBuilder.new()
      .fee_algo(
        Cardano.LinearFee.new(
          Cardano.BigNum.from_str(protocolParams.min_fee_a.toString()),
          Cardano.BigNum.from_str(protocolParams.min_fee_b.toString())
        )
      )
      .pool_deposit(
        Cardano.BigNum.from_str(protocolParams.pool_deposit.toString())
      )
      .key_deposit(
        Cardano.BigNum.from_str(protocolParams.key_deposit.toString())
      )
      .max_tx_size(protocolParams.max_tx_size)
      .max_value_size(protocolParams.max_val_size)
      .coins_per_utxo_byte(
        Cardano.BigNum.from_str(protocolParams.coins_per_utxo_size.toString())
      )
      .build();

    const txBuilder = Cardano.TransactionBuilder.new(txConfig);
    const txUnspentOutputs = Cardano.TransactionUnspentOutputs.new();
    for (const utxo of utxos) {
      const input = Cardano.TransactionInput.new(
        Cardano.TransactionHash.from_bytes(Buffer.from(utxo.tx_hash, "hex")),
        utxo.output_index
      );
      const output = Cardano.TransactionOutput.new(
        Cardano.Address.from_bech32(senderAddress),
        Cardano.Value.new(
          Cardano.BigNum.from_str(utxo.amount[0].quantity.toString())
        )
      );
      txUnspentOutputs.add(Cardano.TransactionUnspentOutput.new(input, output));
    }
    txBuilder.add_inputs_from(txUnspentOutputs, 2);

    for (const { address, amount } of payrollList) {
      txBuilder.add_output(
        Cardano.TransactionOutput.new(
          Cardano.Address.from_bech32(address),
          Cardano.Value.new(Cardano.BigNum.from_str(amount.toString()))
        )
      );
    }

    const latestBlock = await API.blocksLatest();
    txBuilder.set_ttl(latestBlock.slot + 1000);
    txBuilder.add_change_if_needed(Cardano.Address.from_bech32(senderAddress));

    const txBody = txBuilder.build();
    const txBodyBytes = txBody.to_bytes();

    const hasher = blake(32);
    hasher.update(Buffer.from(txBodyBytes));
    const txId = Cardano.TransactionHash.from_bytes(
      new Uint8Array(hasher.digest())
    );

    const witness = Cardano.make_vkey_witness(txId, paymentKey);
    const witnessSet = Cardano.TransactionWitnessSet.new();
    const vkeys = Cardano.Vkeywitnesses.new();
    vkeys.add(witness);
    witnessSet.set_vkeys(vkeys);

    const signedTx = Cardano.Transaction.new(txBody, witnessSet);
    const txHex = Buffer.from(signedTx.to_bytes()).toString("hex");
    const txHash = await API.txSubmit(txHex);

    console.log("Payroll submitted!");
    console.log("TX:", txHash);

    return txHash;
  } catch (err) {
    console.error("Error running payroll:", err);
    throw err;
  }
}

module.exports = { runPayroll };
