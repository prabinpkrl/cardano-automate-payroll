const Blockfrost = require("@blockfrost/blockfrost-js");
const Cardano = require("@emurgo/cardano-serialization-lib-nodejs");
const { generateSenderWallet } = require("./generate-senderaddress");

// // --- Blockfrost API ---
// const API = new Blockfrost.BlockFrostAPI({
//   projectId: "preprod0Gf54DbZz2XRrKOkAwLkRCkERyPNZSr5", // preprod project id
//   network: "preprod",
// });

// // --- Sender key (generated with cardano-serialization-lib) ---
// const rootKey = Cardano.Bip32PrivateKey.generate_ed25519_bip32();
// const paymentKey = rootKey.derive(0).derive(0).to_raw_key();
// const paymentKeyHash = paymentKey.to_public().hash();
// const senderAddress = Cardano.BaseAddress.new(
//   0, // network id 0 = testnet preprod
//   Cardano.Credential.from_keyhash(paymentKeyHash),
//   Cardano.Credential.from_keyhash(paymentKeyHash) // using same key for staking
// )
//   .to_address()
//   .to_bech32();

const senderAddress = generateSenderWallet().address;

// --- Receiver (Lace wallet) ---
const receiverAddress =
  "addr_test1qqyzgzrwv3vp5hlqjajrqj06pqsmacd3huw68ku8kdqs7ylyxuq6n9etd9ajlplj8ufr2jcgklgrmleajdh6zcnj8k5sxr5gtp"; // copy from Lace wallet

// --- Amount to send ---
const amountToSend = 2000000n; // in lovelace (1 TADA = 1_000_000 lovelace)

// Function to transfer ADA
async function sendAda() {
  // 1️⃣ Get UTXOs from sender
  const utxos = await API.addressesUtxos(senderAddress);

  // 2️⃣ Build transaction
  const txBuilder = Cardano.TransactionBuilder.new(
    Cardano.TransactionBuilderConfigBuilder.new()
      .fee_algo(
        Cardano.LinearFee.new(
          Cardano.BigNum.from_str("44"),
          Cardano.BigNum.from_str("155381")
        )
      )
      .coins_per_utxo_word(Cardano.BigNum.from_str("34482"))
      .pool_deposit(Cardano.BigNum.from_str("500000000"))
      .key_deposit(Cardano.BigNum.from_str("2000000"))
      .max_value_size(5000)
      .max_tx_size(16384)
      .build()
  );

  // Add inputs (all UTXOs)
  for (const utxo of utxos) {
    const input = Cardano.TransactionInput.new(
      Cardano.TransactionHash.from_bytes(Buffer.from(utxo.tx_hash, "hex")),
      utxo.output_index
    );
    const output = Cardano.TransactionOutput.new(
      Cardano.Address.from_bech32(receiverAddress),
      Cardano.Value.new(Cardano.BigNum.from_str(amountToSend.toString()))
    );
    txBuilder.add_input(
      senderAddress,
      input,
      Cardano.Value.new(Cardano.BigNum.from_str(utxo.amount[0].quantity))
    );
    txBuilder.add_output(output);
  }

  // 3️⃣ Set TTL (time to live)
  const latestBlock = await API.blocksLatest();
  txBuilder.set_ttl(latestBlock.slot + 1000);

  // 4️⃣ Calculate fee & add change back to sender
  txBuilder.add_change_if_needed(Cardano.Address.from_bech32(senderAddress));

  // 5️⃣ Build & sign transaction
  const txBody = txBuilder.build();
  const tx = Cardano.Transaction.new(
    txBody,
    Cardano.TransactionWitnessSet.new()
  );
  const vkeyWitnesses = Cardano.Vkeywitnesses.new();
  const vkeyWitness = Cardano.make_vkey_witness(txBody.hash(), paymentKey);
  vkeyWitnesses.add(vkeyWitness);
  const txWitnessSet = Cardano.TransactionWitnessSet.new();
  txWitnessSet.set_vkeys(vkeyWitnesses);
  const signedTx = Cardano.Transaction.new(txBody, txWitnessSet);

  // 6️⃣ Submit transaction
  const txHex = Buffer.from(signedTx.to_bytes()).toString("hex");
  const txHash = await API.txSubmit(txHex);
  console.log("Transaction submitted:", txHash);
}

sendAda().catch(console.error);
